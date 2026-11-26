/**
 * Read-only portfolio for one address. Holdings are discovered from ERC-20 Transfer logs that credited the
 * address inside a block window (the local index window), then confirmed with balanceOf at one block.
 * Valuation is spot only, on the token's deepest pool (v4 slot0 via extsload, or V2 reserves), USDG converted through
 * the deepest WETH/USDG V2 pair. Spot is not what a sell pays; the UI offers an exit quote for that.
 */
import { encodeAbiParameters, keccak256, pad, type Address, type Hex, type PublicClient } from "viem";
import { LOG_WINDOW, RH } from "./trust/addresses.ts";
import { cleanText } from "./text.ts";
import { again, heldOf } from "./held.ts";
import { rankV4ByDepth } from "./market.ts";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;
const PAIR = [
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const FACTORY = [{ type: "function", name: "getPair", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] }] as const;
const EXTSLOAD = [{ type: "function", name: "extsload", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bytes32" }] }] as const;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export interface PortfolioIndex {
  v4PoolsBetween?(a: string, b: string): { id: string; key: { currency0: string; currency1: string }; live: boolean | null }[] | undefined;
  /** every token in the index: holdings older than the scanned window are found by asking each for the balance */
  allTokens?(): { address: string }[];
  /** every v4 pool of a token, to price it on the deepest one */
  v4For?(token: string): { id: string; key: { currency0: string; currency1: string }; block: number }[];
  /** looks for pools the index does not hold, then v4For shows them */
  findPools?(token: string): Promise<void>;
  tokenMeta?(address: string): { symbol: string | null; name: string | null; decimals: number | null } | null;
  /** a transfer index: every token that credited `who` over the range; null when it cannot answer, and the logs are read */
  received?(who: string, from: bigint, to: bigint): Promise<string[] | null>;
}
export interface Holding {
  token: Address;
  symbol: string | null;
  name: string | null;
  decimals: number;
  raw: string;
  /** spot value in ETH (null when no ETH/WETH/USDG pool was found) */
  ethSpot: number | null;
  priceSource: string | null;
}
export interface Portfolio {
  address: Address;
  block: string;
  /** index: how many indexed tokens were asked for a balance (0: that read failed); the window covers tokens outside
   *  the index; unread: tokens whose balance could not be read, left out rather than shown as zero */
  scanned: { from: string; to: string; windows: number; complete: boolean; index: number; unread: number };
  eth: string;
  weth: string;
  usdg: string;
  /** USDG per ETH from the deepest WETH/USDG V2 pair (spot) */
  usdgPerEth: number | null;
  holdings: Holding[];
  ms: number;
}

/** A token that takes a base asset's ticker at another address. */
export function isBaseCopy(symbol: string | null, token: string): boolean {
  const real: Record<string, string> = { USDG: RH.USDG, WETH: RH.WETH, ETH: "" };
  const s = (symbol ?? "").trim().toUpperCase();
  return Object.hasOwn(real, s) && real[s] !== token.toLowerCase();
}

async function each<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]!);
    }
  }));
  return out;
}

/** Tokens that credited `who` between from..to (inclusive), newest windows first, at most `maxWindows`. */
async function receivedTokens(client: PublicClient, who: Address, from: bigint, to: bigint, maxWindows: number) {
  const windows: [bigint, bigint][] = [];
  for (let hi = to; hi >= from && windows.length < maxWindows; hi -= BigInt(LOG_WINDOW)) {
    const lo = hi - BigInt(LOG_WINDOW) + 1n;
    windows.push([lo < from ? from : lo, hi]);
  }
  const topic = pad(who.toLowerCase() as Hex, { size: 32 });
  const found = new Set<string>();
  let failed = 0;
  await each(windows, 6, async ([lo, hi]) => {
    // one window the node refuses leaves a hole in the scan, marked incomplete, instead of failing the whole read
    type L = { address: string; topics: string[] };
    const ask = () => client.request({ method: "eth_getLogs", params: [{ topics: [TRANSFER, null, topic], fromBlock: `0x${lo.toString(16)}`, toBlock: `0x${hi.toString(16)}` }] } as never) as Promise<L[]>;
    const logs: L[] = await again(ask).catch(() => {
      failed++;
      return [] as L[];
    });
    // ERC-721 Transfer has the same signature with 4 topics: skip NFTs
    for (const l of logs) if (l.topics.length === 3) found.add(l.address.toLowerCase());
  });
  const complete = failed === 0 && windows.length > 0 && windows.at(-1)![0] <= from;
  return { tokens: [...found] as Address[], windows: windows.length, complete, lowest: windows.at(-1)?.[0] ?? from };
}

async function v2Spot(client: PublicClient, a: Address, b: Address): Promise<{ ra: bigint; rb: bigint; pair: Address } | null> {
  const pair = await client.readContract({ address: RH.V2_FACTORY as Address, abi: FACTORY, functionName: "getPair", args: [a, b] }).catch(() => ZERO as Address);
  if (pair.toLowerCase() === ZERO) return null;
  const [[r0, r1], t0] = await Promise.all([
    client.readContract({ address: pair, abi: PAIR, functionName: "getReserves" }),
    client.readContract({ address: pair, abi: PAIR, functionName: "token0" }),
  ]);
  const aIs0 = t0.toLowerCase() === a.toLowerCase();
  return { ra: aIs0 ? r0 : r1, rb: aIs0 ? r1 : r0, pair };
}

/** sqrtPriceX96 of a v4 pool: low 160 bits of slot0 (pools mapping at slot 6 in the PoolManager). */
async function v4Sqrt(client: PublicClient, id: Hex): Promise<bigint | null> {
  const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [id, 6n]));
  const w = await client.readContract({ address: RH.V4_POOL_MANAGER as Address, abi: EXTSLOAD, functionName: "extsload", args: [slot] }).catch(() => null);
  if (!w) return null;
  const s = BigInt(w) & ((1n << 160n) - 1n);
  return s > 0n ? s : null;
}

export async function readPortfolio(client: PublicClient, who: Address, window: { from: bigint; to: bigint }, index?: PortfolioIndex, maxWindows = 120): Promise<Portfolio> {
  const t0 = Date.now();
  const block = await client.getBlockNumber();
  const to = window.to < block ? window.to : block;
  const all = index?.allTokens?.().map((t) => t.address) ?? [];
  const [eth, weth, usdg, scan, ethUsdg, held] = await Promise.all([
    again(() => client.getBalance({ address: who })),
    again(() => client.readContract({ address: RH.WETH as Address, abi: ERC20, functionName: "balanceOf", args: [who] })),
    again(() => client.readContract({ address: RH.USDG as Address, abi: ERC20, functionName: "balanceOf", args: [who] })),
    // the transfer index answers the whole window in a few requests; without it, the logs window by window
    (async () => {
      const fast = index?.received ? await index.received(who, window.from, to).catch(() => null) : null;
      return fast ? { tokens: fast as Address[], windows: 0, complete: true, lowest: window.from } : receivedTokens(client, who, window.from, to, all.length ? Math.min(maxWindows, 40) : maxWindows);
    })(),
    again(() => v2Spot(client, RH.WETH as Address, RH.USDG as Address)),
    // if the node refuses the whole-index read, the recent window is what is left, and `scanned.index` says 0
    all.length ? heldOf(client, who, all).catch(() => null) : null,
  ]);
  let unread = 0;
  const usdgPerEth = ethUsdg && ethUsdg.ra > 0n ? Number(ethUsdg.rb) / 1e6 / (Number(ethUsdg.ra) / 1e18) : null;
  const skip = new Set([RH.WETH, RH.USDG]);
  const cand = [...new Set([...scan.tokens.map((t) => t.toLowerCase()), ...(held?.keys() ?? [])])].filter((t) => !skip.has(t as never)) as Address[];

  const deepest = async (token: Address): Promise<{ ethPerRaw: number; src: string; usd: number } | null> => {
    const found: { ethPerRaw: number; src: string; usd: number }[] = [];
    const bases = new Set<string>([ZERO, RH.WETH, RH.USDG]);
    const pools = (index?.v4For?.(token) ?? []).filter((p) => bases.has(p.key.currency0.toLowerCase()) || bases.has(p.key.currency1.toLowerCase()));
    const top = pools.length ? (await rankV4ByDepth(client, token, pools, 60).catch(() => []))[0] : undefined;
    if (top && top.usd > 0) {
      const q = await v4Sqrt(client, top.pool.id as Hex);
      const baseIs0 = top.pool.key.currency1.toLowerCase() === token.toLowerCase();
      const base = (baseIs0 ? top.pool.key.currency0 : top.pool.key.currency1).toLowerCase();
      if (q) {
        const raw = (Number(q) / 2 ** 96) ** 2; // raw currency1 per raw currency0
        const basePerRaw = baseIs0 ? 1 / raw : raw;
        const ethPerRaw = base === RH.USDG ? (usdgPerEth ? basePerRaw / 1e6 / usdgPerEth : null) : basePerRaw / 1e18;
        if (ethPerRaw !== null && Number.isFinite(ethPerRaw) && ethPerRaw > 0) found.push({ ethPerRaw, src: `v4 ${top.pool.id.slice(0, 8)}`, usd: top.usd });
      }
    }
    const [w, u] = await Promise.all([v2Spot(client, token, RH.WETH as Address).catch(() => null), usdgPerEth ? v2Spot(client, token, RH.USDG as Address).catch(() => null) : null]);
    if (w && w.ra > 0n && w.rb > 0n) found.push({ ethPerRaw: Number(w.rb) / 1e18 / Number(w.ra), src: `V2 ${w.pair.slice(0, 8)}`, usd: (Number(w.rb) / 1e18) * (usdgPerEth ?? 0) });
    if (u && u.ra > 0n && u.rb > 0n && usdgPerEth) found.push({ ethPerRaw: Number(u.rb) / 1e6 / Number(u.ra) / usdgPerEth, src: `V2 ${u.pair.slice(0, 8)} via USDG`, usd: Number(u.rb) / 1e6 });
    return found.sort((a, b) => b.usd - a.usd)[0] ?? null;
  };

  const holdings = (
    await each(cand, 8, async (token): Promise<Holding | null> => {
      const known = held?.get(token.toLowerCase());
      const bal = known ?? (await again(() => client.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [who] })).catch(() => null));
      if (bal === null) unread++;
      if (!bal) return null;
      const m = index?.tokenMeta?.(token);
      const decimals = m?.decimals ?? Number(await client.readContract({ address: token, abi: ERC20, functionName: "decimals" }).catch(() => 18));
      const symbol = cleanText(m?.symbol ?? (await client.readContract({ address: token, abi: ERC20, functionName: "symbol" }).catch(() => null)), 32);

      // a token wearing a base asset's ticker is bait sent to wallets: it is listed, never valued
      if (isBaseCopy(symbol, token)) return { token, symbol, name: cleanText(m?.name), decimals, raw: bal.toString(), ethSpot: null, priceSource: null };
      // spot in ETH, from the deepest pool of any kind: a token can have dozens of look-alike pools with any price in them
      let best = await deepest(token);
      if (!best && index?.findPools) {
        await Promise.race([index.findPools(token).catch(() => undefined), new Promise((r) => setTimeout(r, 10_000))]);
        best = await deepest(token);
      }
      const ethPerRaw = best?.ethPerRaw ?? null, src = best?.src ?? null;
      return { token, symbol, name: cleanText(m?.name), decimals, raw: bal.toString(), ethSpot: ethPerRaw === null ? null : Number(bal) * ethPerRaw, priceSource: src };
    })
  ).filter((h): h is Holding => h !== null);

  holdings.sort((a, b) => (b.ethSpot ?? -1) - (a.ethSpot ?? -1));
  return {
    address: who,
    block: (await client.getBlockNumber().catch(() => block)).toString(),
    scanned: { from: scan.lowest.toString(), to: to.toString(), windows: scan.windows, complete: scan.complete, index: held ? all.length : 0, unread },
    eth: eth.toString(),
    weth: weth.toString(),
    usdg: usdg.toString(),
    usdgPerEth,
    holdings,
    ms: Date.now() - t0,
  };
}
