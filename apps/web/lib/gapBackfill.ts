/**
 * Gap history, rebuilt for the weekends before the live sweep ran. For each stock token and each past weekend:
 *  - Friday's official close and the next trading day's official open come from the same public daily chart data the
 *    live sweep reads (a Monday holiday moves the open to the first trading day after Friday);
 *  - the chain price just before that open is the token's V2 pair at that moment: the reserves of its last Sync event
 *    before the opening block (pairs against WETH are turned into dollars with the WETH/USDG pair at the same block).
 * A weekend with no trade in the pair after Friday's close is skipped: its "chain price" would be Friday's own, a gap
 * of nothing that never happened. Rows written live are never touched; rebuilt rows are marked as such.
 */
import { RH, findV2 } from "@corbel/data/chain";
import { decodeAbiParameters, keccak256, toHex, type Address, type PublicClient } from "viem";
import { sessionUtc } from "./gapHistory";

export type Bar = { day: string; open: number | null; close: number | null };
export type Weekend = { week: string; close: number; openDay: string; open: number };

const DAY = 86_400_000;
const SYNC = keccak256(toHex("Sync(uint112,uint112)"));
/** The WETH/USDG pair that turns WETH amounts into dollars (the same one the market reader uses). */
const WETH_USDG = "0x8803c117ccae7b5146297876c2a25df135141c4d" as Address;

/** Every Friday with its own close and the next trading day's open, from daily bars (oldest first, no gaps assumed). */
export function weekendsFromBars(bars: Bar[], before: number): Weekend[] {
  const out: Weekend[] = [];
  const sorted = [...bars].filter((b) => b.day).sort((a, b) => a.day.localeCompare(b.day));
  for (let i = 0; i < sorted.length - 1; i++) {
    const f = sorted[i]!, n = sorted[i + 1]!;
    if (new Date(`${f.day}T00:00:00Z`).getUTCDay() !== 5) continue; // a Friday that traded (a Friday holiday has no bar)
    if (!(f.close && f.close > 0 && n.open && n.open > 0)) continue;
    if (Date.parse(`${n.day}T00:00:00Z`) - Date.parse(`${f.day}T00:00:00Z`) > 5 * DAY) continue; // a hole in the data, not a weekend
    if (Date.parse(`${n.day}T00:00:00Z`) >= before) continue;
    out.push({ week: f.day, close: f.close, openDay: n.day, open: n.open });
  }
  return out;
}

/** The same rule the live sweep settles with: Monday closed the gap when it moved the chain's way by at least half of it. */
export function judge(close: number, chain: number, open: number) {
  const gap = chain / close - 1, move = open / close - 1;
  return { gap, move, closed: Math.sign(move) === Math.sign(gap) && Math.abs(move) >= Math.abs(gap) / 2 ? 1 : 0 };
}

/** The UTC moment a day's regular session opens / closes. */
export const openAt = (day: string) => Date.parse(`${day}T00:00:00Z`) + sessionUtc(Date.parse(`${day}T12:00:00Z`)).open * 60_000;
export const closeAt = (day: string) => Date.parse(`${day}T00:00:00Z`) + sessionUtc(Date.parse(`${day}T12:00:00Z`)).close * 60_000;

// ------------------------------------------------------------------------------------------------ chain reads
const blockTimes = new Map<bigint, number>();
async function timeOf(c: PublicClient, n: bigint): Promise<number> {
  const hit = blockTimes.get(n);
  if (hit !== undefined) return hit;
  const t = Number((await c.getBlock({ blockNumber: n })).timestamp) * 1000;
  blockTimes.set(n, t);
  return t;
}

/** The last block at or before `t` (ms), by bisection over block times. */
export async function blockAt(c: PublicClient, t: number, head?: bigint): Promise<bigint> {
  let hi = head ?? (await c.getBlockNumber());
  if ((await timeOf(c, hi)) <= t) return hi;
  // a first guess from the chain's pace narrows the search before bisecting
  const ht = await timeOf(c, hi);
  let lo = hi - BigInt(Math.ceil(((ht - t) / 1000) * 12)) - 10_000n;
  if (lo < 0n) lo = 0n;
  while ((await timeOf(c, lo)) > t && lo > 0n) lo = lo > 2_000_000n ? lo - 2_000_000n : 0n;
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if ((await timeOf(c, mid)) <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** A V2 pair's reserves after its last Sync at or before `block`, with that Sync's block; null when it never traded. */
async function lastSync(c: PublicClient, pair: Address, block: bigint, span = 3_000_000n): Promise<{ r0: bigint; r1: bigint; block: bigint } | null> {
  const from = block > span ? block - span : 0n;
  const logs = (await c.request({ method: "eth_getLogs", params: [{ address: pair, topics: [SYNC], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${block.toString(16)}` }] } as never)) as { data: `0x${string}`; blockNumber: `0x${string}` }[];
  const l = logs.at(-1);
  if (!l) return null;
  const [r0, r1] = decodeAbiParameters([{ type: "uint112" }, { type: "uint112" }], l.data) as [bigint, bigint];
  return { r0, r1, block: BigInt(l.blockNumber) };
}

/** Dollars per ETH at `block`, from the WETH/USDG pair. */
async function ethUsdAt(c: PublicClient, block: bigint): Promise<number | null> {
  const s = await lastSync(c, WETH_USDG, block);
  if (!s) return null;
  const t0 = ((await c.readContract({ address: WETH_USDG, abi: [{ type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }], functionName: "token0" })) as string).toLowerCase();
  const [weth, usdg] = t0 === RH.WETH.toLowerCase() ? [s.r0, s.r1] : [s.r1, s.r0];
  return weth > 0n ? Number(usdg) / 1e6 / (Number(weth) / 1e18) : null;
}

export type Rebuilt = { week: string; symbol: string; token: string; close: number; chain: number; chainAt: number; open: number; gap: number; move: number; closed: number };

/**
 * One token's past weekends. `bars` are its daily bars; `skip` the weeks already in the table. Returns the rows to
 * store; a weekend the pair did not trade through is left out.
 */
export async function rebuildToken(c: PublicClient, s: { address: string; symbol: string; decimals: number | null }, bars: Bar[], skip: Set<string>, before: number, head: bigint): Promise<Rebuilt[]> {
  const pairs = await findV2(c, s.address as Address);
  if (!pairs.length) return [];
  // the deepest pair now: the one the live sweep reads too
  const best = [...pairs].sort((a, b) => (b.base === "USDG" ? Number(b.baseReserve) / 1e6 : Number(b.baseReserve) / 1e18 * 3000) - (a.base === "USDG" ? Number(a.baseReserve) / 1e6 : Number(a.baseReserve) / 1e18 * 3000))[0]!;
  const t0 = ((await c.readContract({ address: best.pair, abi: [{ type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }], functionName: "token0" })) as string).toLowerCase();
  const is0 = t0 === s.address.toLowerCase();
  const dec = s.decimals ?? 18, baseDec = best.base === "USDG" ? 6 : 18;
  const out: Rebuilt[] = [];
  for (const w of weekendsFromBars(bars, before)) {
    if (skip.has(w.week)) continue;
    const at = openAt(w.openDay);
    const block = await blockAt(c, at - 60_000, head);
    const sync = await lastSync(c, best.pair, block);
    if (!sync) continue;
    const syncAt = await timeOf(c, sync.block);
    if (syncAt <= closeAt(w.week)) continue; // no trade after Friday's close: no weekend price to speak of
    const rt = Number(is0 ? sync.r0 : sync.r1) / 10 ** dec, rb = Number(is0 ? sync.r1 : sync.r0) / 10 ** baseDec;
    if (!(rt > 0 && rb > 0)) continue;
    const k = best.base === "USDG" ? 1 : await ethUsdAt(c, sync.block);
    if (!k) continue;
    const chain = (rb / rt) * k;
    out.push({ week: w.week, symbol: s.symbol, token: s.address.toLowerCase(), close: w.close, chain, chainAt: syncAt, open: w.open, ...judge(w.close, chain, w.open) });
  }
  return out;
}
