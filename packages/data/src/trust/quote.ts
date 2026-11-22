/**
 * Swap quotes by simulation. Every candidate route is executed inside an eth_call with the simulator
 * injected by state override, so the figure includes pool fees, price impact, hook behaviour and transfer
 * taxes, exactly as the chain would apply them at this block. Nothing is signed or sent.
 *
 * Routes: direct (V2 pair, v4 pools) and two hops through ETH/WETH or USDG. Two hops in different pools
 * are independent, so chaining two separate calls is exact.
 */
import { decodeFunctionResult, encodeFunctionData, formatUnits, parseEther, parseUnits, type Address, type Hex, type PublicClient } from "viem";
import { TRUST_SIM_ABI, TRUST_SIM_RUNTIME } from "../trustSimBytecode.ts";
import { RH, SIM_ADDRESS, SIM_FROM } from "./addresses.ts";
import { balanceSlot, type PoolKey } from "./sim.ts";
import { redact } from "../redact.ts";
import { cleanText } from "../text.ts";

export const NATIVE = "0x0000000000000000000000000000000000000000" as Address;
const FUND = `0x${(10n ** 30n).toString(16).padStart(64, "0")}` as Hex;
const DYNAMIC_FEE = 0x800000;
const WRAPPED_ERROR = "0x90bfb865"; // v4 CustomRevert.WrappedError: a hook (or token) call inside the swap reverted
const refused = (why: Hex | string) => (why && why.startsWith(WRAPPED_ERROR) ? "The pool's hook refused the swap." : `Pool refused the swap${why && why !== "0x" ? ` (${why.slice(0, 10)})` : ""}.`);
const EMPTY_SIDE = "No liquidity on this side of the price: the pool would pay nothing.";
const UNWRAP: Hop = { venue: "unwrap", pool: "WETH", from: RH.WETH as Address, to: NATIVE, fee: 0, hooked: false };

const ERC20 = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
const FACTORY = [{ type: "function", name: "getPair", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] }] as const;

export interface V4Candidate {
  id: string;
  key: PoolKey;
  /** liquidity at the current price known to be zero (null = not read) */
  live: boolean | null;
}
export interface QuoteIndex {
  v4PoolsBetween?(a: string, b: string): V4Candidate[] | undefined;
}

export interface Hop {
  /** "unwrap": WETH → ETH, exactly 1:1, no pool */
  venue: "v2" | "v4" | "unwrap";
  pool: string;
  from: Address;
  to: Address;
  /** fee in hundredths of a basis point (v4 style); null when the pool sets it per swap */
  fee: number | null;
  hooked: boolean;
}
export interface RouteResult {
  hops: Hop[];
  amountOut: string | null;
  gas: number | null;
  ok: boolean;
  reason: string | null;
}
export interface Asset {
  address: Address;
  symbol: string;
  decimals: number;
}
export interface QuoteResult {
  from: Asset;
  to: Asset;
  amountIn: string;
  block: string;
  routes: RouteResult[];
  best: number | null;
  /** 0..1, output lost to size versus a 1/1000-size trade on the same route */
  impact: number | null;
  gasPriceWei: string;
  ms: number;
}

const low = (a: string) => a.toLowerCase();
const isEth = (a: string) => low(a) === NATIVE;
const isWeth = (a: string) => low(a) === RH.WETH;

const metaCache = new Map<string, Asset>();
export async function assetMeta(client: PublicClient, a: Address): Promise<Asset> {
  if (isEth(a)) return { address: NATIVE, symbol: "ETH", decimals: 18 };
  const k = low(a);
  const hit = metaCache.get(k);
  if (hit) return hit;
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: a, abi: ERC20, functionName: "symbol" }).catch(() => "?"),
    client.readContract({ address: a, abi: ERC20, functionName: "decimals" }),
  ]);
  const m = { address: a, symbol: cleanText(symbol, 24) ?? "?", decimals: Number(decimals) };
  metaCache.set(k, m);
  return m;
}

const decode = (e: unknown) => redact((e as { shortMessage?: string }).shortMessage ?? "call failed");

async function overridesFor(client: PublicClient, tokenIn: Address, amountIn: bigint, wrap: boolean) {
  const o: { address: Address; code?: Hex; balance?: bigint; stateDiff?: { slot: Hex; value: Hex }[] }[] = [
    { address: SIM_ADDRESS, code: TRUST_SIM_RUNTIME, balance: amountIn + parseEther("10") },
  ];
  if (!isEth(tokenIn) && !wrap) {
    const s = await balanceSlot(client, tokenIn);
    if (!s) return null;
    o.push({ address: s.address, stateDiff: [{ slot: s.slot, value: FUND }] });
  }
  return o;
}

/** One hop, exact in. Returns raw units out (what actually arrived), or a reason. */
export async function runHop(client: PublicClient, hop: Hop & { key?: PoolKey }, amountIn: bigint): Promise<{ out: bigint | null; gas: number | null; reason: string | null }> {
  try {
    if (hop.venue === "v2") {
      const wrap = isEth(hop.from); // ETH in → wrap into WETH first
      const tokenIn = wrap ? (RH.WETH as Address) : hop.from;
      const ov = await overridesFor(client, tokenIn, amountIn, wrap);
      if (!ov) return { out: null, gas: null, reason: "Could not fund the input token for a simulation." };
      const data = encodeFunctionData({ abi: TRUST_SIM_ABI, functionName: "quoteV2", args: [hop.pool as Address, tokenIn, amountIn, wrap] } as never);
      const res = await client.call({ account: SIM_FROM, to: SIM_ADDRESS, data, gas: 30_000_000n, stateOverride: ov });
      const [out, gas, st, why] = decodeFunctionResult({ abi: TRUST_SIM_ABI, functionName: "quoteV2", data: res.data! } as never) as unknown as [bigint, bigint, number, Hex];
      if (st === 0 && out === 0n) return { out: null, gas: null, reason: EMPTY_SIDE };
      return st === 0 ? { out, gas: Number(gas), reason: null } : { out: null, gas: null, reason: st === 1 ? "Input token refused the transfer." : `Swap reverted${why && why !== "0x" ? ` (${why.slice(0, 10)})` : ""}.` };
    }
    const key = hop.key!;
    const zeroForOne = low(key.currency0) === low(hop.from);
    const ov = await overridesFor(client, hop.from, amountIn, false);
    if (!ov) return { out: null, gas: null, reason: "Could not fund the input token for a simulation." };
    const data = encodeFunctionData({ abi: TRUST_SIM_ABI, functionName: "quoteV4", args: [RH.V4_POOL_MANAGER, key, zeroForOne, amountIn] } as never);
    const res = await client.call({ account: SIM_FROM, to: SIM_ADDRESS, data, gas: 30_000_000n, stateOverride: ov });
    const [out, gas, st, why] = decodeFunctionResult({ abi: TRUST_SIM_ABI, functionName: "quoteV4", data: res.data! } as never) as unknown as [bigint, bigint, number, Hex];
    if (st === 0 && out === 0n) return { out: null, gas: null, reason: EMPTY_SIDE };
    return st === 0 ? { out, gas: Number(gas), reason: null } : { out: null, gas: null, reason: refused(why) };
  } catch (e) {
    return { out: null, gas: null, reason: decode(e) };
  }
}

/** Direct venues between two assets: the V2 pair (ETH maps to WETH) and indexed v4 pools (ETH and WETH both tried). */
async function directHops(client: PublicClient, a: Address, b: Address, index?: QuoteIndex): Promise<(Hop & { key?: PoolKey })[]> {
  const hops: (Hop & { key?: PoolKey })[] = [];
  const v2a = isEth(a) ? (RH.WETH as Address) : a;
  const v2b = isEth(b) ? (RH.WETH as Address) : b;
  if (low(v2a) !== low(v2b)) {
    const pair = await client.readContract({ address: RH.V2_FACTORY as Address, abi: FACTORY, functionName: "getPair", args: [v2a, v2b] }).catch(() => NATIVE);
    // V2 never returns native ETH: an ETH output arrives as WETH, which the UI says
    if (low(pair) !== NATIVE) hops.push({ venue: "v2", pool: pair, from: a, to: isEth(b) ? (RH.WETH as Address) : b, fee: 3000, hooked: false });
  }
  const pools = index?.v4PoolsBetween?.(a, b) ?? [];
  for (const p of pools.filter((x) => x.live !== false).slice(0, 4))
    hops.push({ venue: "v4", pool: p.id, from: a, to: b, fee: p.key.fee & DYNAMIC_FEE ? null : p.key.fee, hooked: low(p.key.hooks) !== NATIVE, key: p.key });
  return hops;
}

type Run = { h: Hop & { key?: PoolKey }; pre: Hop[]; r: { out: bigint | null; gas: number | null; reason: string | null } };

/** All direct venues a→b. When a is WETH, pools on native ETH are reachable through a 1:1 unwrap. */
async function bestHop(client: PublicClient, a: Address, b: Address, amount: bigint, index?: QuoteIndex): Promise<Run[]> {
  const hops = await directHops(client, a, b, index);
  const runs: Run[] = await Promise.all(hops.map(async (h) => ({ h, pre: [], r: await runHop(client, h, amount) })));
  if (isWeth(a) && !isEth(b)) {
    const viaEth = (await directHops(client, NATIVE, b, index)).filter((h) => h.venue === "v4");
    runs.push(...(await Promise.all(viaEth.map(async (h) => ({ h, pre: [UNWRAP], r: await runHop(client, h, amount) })))));
  }
  return runs;
}
const top = (runs: Run[]) => runs.filter((x) => x.r.out !== null).sort((x, y) => (y.r.out! > x.r.out! ? 1 : y.r.out! < x.r.out! ? -1 : 0))[0];

export async function quote(client: PublicClient, fromAddr: Address, toAddr: Address, amountIn: bigint, index?: QuoteIndex): Promise<QuoteResult> {
  const t0 = Date.now();
  const [from, to, block, gasPrice] = await Promise.all([assetMeta(client, fromAddr), assetMeta(client, toAddr), client.getBlockNumber(), client.getGasPrice()]);
  const routes: RouteResult[] = [];
  const strip = (h: Hop & { key?: PoolKey }): Hop => ({ venue: h.venue, pool: h.pool, from: h.from, to: h.to, fee: h.fee, hooked: h.hooked });

  // direct
  for (const { h, pre, r } of await bestHop(client, from.address, to.address, amountIn, index))
    routes.push({ hops: [...pre, strip(h)], amountOut: r.out?.toString() ?? null, gas: r.gas, ok: r.out !== null, reason: r.reason });

  // two hops through a hub (skip hubs equal to either side; ETH and WETH count as one hub)
  const hubs = [NATIVE, RH.USDG as Address].filter((h) => {
    const same = (x: string) => low(x) === low(h) || (isEth(h) && isWeth(x));
    return !same(from.address) && !same(to.address);
  });
  for (const hub of hubs) {
    const first = top(await bestHop(client, from.address, hub, amountIn, index));
    if (!first) continue;
    // a V2 first hop pays out WETH: continue from WETH (bestHop adds the unwrap to native pools)
    const second = top(await bestHop(client, first.h.to, to.address, first.r.out!, index));
    if (!second) continue;
    routes.push({ hops: [...first.pre, strip(first.h), ...second.pre, strip(second.h)], amountOut: second.r.out!.toString(), gas: (first.r.gas ?? 0) + (second.r.gas ?? 0), ok: true, reason: null });
  }

  let best: number | null = null;
  routes.forEach((r, i) => {
    if (r.ok && (best === null || BigInt(r.amountOut!) > BigInt(routes[best]!.amountOut!))) best = i;
  });

  // price impact: the same route at 1/1000 size
  let impact: number | null = null;
  if (best !== null) {
    const r = routes[best]!;
    const tiny = amountIn / 1000n > 0n ? amountIn / 1000n : 1n;
    let amt: bigint | null = tiny;
    for (const h of r.hops) {
      if (amt === null) break;
      if (h.venue === "unwrap") continue;
      const full = (await directHops(client, h.from, h.to, index)).find((x) => x.pool === h.pool);
      amt = full ? (await runHop(client, full, amt)).out : null;
    }
    if (amt && amt > 0n) {
      const big = Number(formatUnits(BigInt(r.amountOut!), to.decimals)) / Number(formatUnits(amountIn, from.decimals));
      const small = Number(formatUnits(amt, to.decimals)) / Number(formatUnits(tiny, from.decimals));
      impact = small > 0 ? Math.max(0, 1 - big / small) : null;
    }
  }

  return { from, to, amountIn: amountIn.toString(), block: block.toString(), routes, best, impact, gasPriceWei: gasPrice.toString(), ms: Date.now() - t0 };
}

/** Human amount ("1.5") to raw units for an asset. */
export const toRaw = (amount: string, decimals: number) => parseUnits(amount, decimals);
