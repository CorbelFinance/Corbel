/**
 * Read-only portfolio for one address. Holdings are discovered from ERC-20 Transfer logs that credited the
 * address inside a block window (the local index window), then confirmed with balanceOf at one block.
 * Valuation is spot only: v4 slot0 (via extsload) or V2 reserves against ETH/WETH, USDG converted through
 * the deepest WETH/USDG V2 pair. Spot is not what a sell pays; the UI offers an exit quote for that.
 */
import { encodeAbiParameters, keccak256, pad, type Address, type Hex, type PublicClient } from "viem";
import { LOG_WINDOW, RH } from "./trust/addresses.ts";
import { cleanText } from "./text.ts";

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
const Q192 = 2n ** 192n;

export interface PortfolioIndex {
  v4PoolsBetween?(a: string, b: string): { id: string; key: { currency0: string; currency1: string }; live: boolean | null }[] | undefined;
  tokenMeta?(address: string): { symbol: string | null; name: string | null; decimals: number | null } | null;
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
  scanned: { from: string; to: string; windows: number; complete: boolean };
  eth: string;
  weth: string;
  usdg: string;
  /** USDG per ETH from the deepest WETH/USDG V2 pair (spot) */
  usdgPerEth: number | null;
  holdings: Holding[];
  ms: number;
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
  await each(windows, 6, async ([lo, hi]) => {
    const logs = (await client.request({
      method: "eth_getLogs",
      params: [{ topics: [TRANSFER, null, topic], fromBlock: `0x${lo.toString(16)}`, toBlock: `0x${hi.toString(16)}` }],
    } as never)) as { address: string; topics: string[] }[];
    // ERC-721 Transfer has the same signature with 4 topics: skip NFTs
    for (const l of logs) if (l.topics.length === 3) found.add(l.address.toLowerCase());
  });
  const complete = windows.length > 0 && windows.at(-1)![0] <= from;
  return { tokens: [...found] as Address[], windows: windows.length, complete, lowest: windows.at(-1)?.[0] ?? from };
}

async function v2Spot(client: PublicClient, a: Address, b: Address, blockNumber: bigint): Promise<{ ra: bigint; rb: bigint; pair: Address } | null> {
  const pair = await client.readContract({ address: RH.V2_FACTORY as Address, abi: FACTORY, functionName: "getPair", args: [a, b], blockNumber }).catch(() => ZERO);
  if (pair.toLowerCase() === ZERO) return null;
  const [[r0, r1], t0] = await Promise.all([
    client.readContract({ address: pair, abi: PAIR, functionName: "getReserves", blockNumber }),
    client.readContract({ address: pair, abi: PAIR, functionName: "token0", blockNumber }),
  ]);
  const aIs0 = t0.toLowerCase() === a.toLowerCase();
  return { ra: aIs0 ? r0 : r1, rb: aIs0 ? r1 : r0, pair };
}

/** sqrtPriceX96 of a v4 pool: low 160 bits of slot0 (pools mapping at slot 6 in the PoolManager). */
async function v4Sqrt(client: PublicClient, id: Hex, blockNumber: bigint): Promise<bigint | null> {
  const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [id, 6n]));
  const w = await client.readContract({ address: RH.V4_POOL_MANAGER as Address, abi: EXTSLOAD, functionName: "extsload", args: [slot], blockNumber }).catch(() => null);
  if (!w) return null;
  const s = BigInt(w) & ((1n << 160n) - 1n);
  return s > 0n ? s : null;
}

export async function readPortfolio(client: PublicClient, who: Address, window: { from: bigint; to: bigint }, index?: PortfolioIndex, maxWindows = 120): Promise<Portfolio> {
  const t0 = Date.now();
  const block = await client.getBlockNumber();
  const to = window.to < block ? window.to : block;
  const [eth, weth, usdg, scan, ethUsdg] = await Promise.all([
    client.getBalance({ address: who, blockNumber: block }),
    client.readContract({ address: RH.WETH as Address, abi: ERC20, functionName: "balanceOf", args: [who], blockNumber: block }),
    client.readContract({ address: RH.USDG as Address, abi: ERC20, functionName: "balanceOf", args: [who], blockNumber: block }),
    receivedTokens(client, who, window.from, to, maxWindows),
    v2Spot(client, RH.WETH as Address, RH.USDG as Address, block),
  ]);
  const usdgPerEth = ethUsdg && ethUsdg.ra > 0n ? Number(ethUsdg.rb) / 1e6 / (Number(ethUsdg.ra) / 1e18) : null;
  const skip = new Set([RH.WETH, RH.USDG]);
  const cand = scan.tokens.filter((t) => !skip.has(t.toLowerCase() as never));

  const holdings = (
    await each(cand, 8, async (token): Promise<Holding | null> => {
      const bal = await client.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [who], blockNumber: block }).catch(() => 0n);
      if (bal === 0n) return null;
      const m = index?.tokenMeta?.(token);
      const decimals = m?.decimals ?? Number(await client.readContract({ address: token, abi: ERC20, functionName: "decimals" }).catch(() => 18));
      const symbol = cleanText(m?.symbol ?? (await client.readContract({ address: token, abi: ERC20, functionName: "symbol" }).catch(() => null)), 32);

      // spot in ETH: v4 against native ETH (pool with liquidity in range first), else V2 against WETH, else V2 USDG
      let ethPerRaw: number | null = null;
      let src: string | null = null;
      const v4 = (index?.v4PoolsBetween?.(ZERO, token) ?? []).sort((a, b) => Number(b.live === true) - Number(a.live === true))[0];
      if (v4) {
        const s = await v4Sqrt(client, v4.id as Hex, block);
        if (s) {
          // price = raw currency1 per raw currency0; ETH is currency0
          const p = Number((s * s * 10n ** 18n) / Q192) / 1e18;
          if (p > 0) {
            ethPerRaw = 1 / p / 1e18;
            src = `v4 ${v4.id.slice(0, 8)}`;
          }
        }
      }
      if (ethPerRaw === null) {
        const w = await v2Spot(client, token, RH.WETH as Address, block);
        if (w && w.ra > 0n) {
          ethPerRaw = Number(w.rb) / 1e18 / Number(w.ra);
          src = `V2 ${w.pair.slice(0, 8)}`;
        }
      }
      if (ethPerRaw === null && usdgPerEth) {
        const u = await v2Spot(client, token, RH.USDG as Address, block);
        if (u && u.ra > 0n) {
          ethPerRaw = Number(u.rb) / 1e6 / Number(u.ra) / usdgPerEth;
          src = `V2 ${u.pair.slice(0, 8)} via USDG`;
        }
      }
      return { token, symbol, name: cleanText(m?.name), decimals, raw: bal.toString(), ethSpot: ethPerRaw === null ? null : Number(bal) * ethPerRaw, priceSource: src };
    })
  ).filter((h): h is Holding => h !== null);

  holdings.sort((a, b) => (b.ethSpot ?? -1) - (a.ethSpot ?? -1));
  return {
    address: who,
    block: block.toString(),
    scanned: { from: scan.lowest.toString(), to: to.toString(), windows: scan.windows, complete: scan.complete },
    eth: eth.toString(),
    weth: weth.toString(),
    usdg: usdg.toString(),
    usdgPerEth,
    holdings,
    ms: Date.now() - t0,
  };
}
