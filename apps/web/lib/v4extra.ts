import { decodeAbiParameters, type PublicClient } from "viem";
import { v4PoolsBetween as idxBetween, v4PoolsFor as idxFor } from "@corbel/indexer";
import { dsTokens } from "./pairs";
import { keepSnap, loadSnap } from "./snapshot";

/**
 * v4 pools the local index does not hold (made before the index window starts). the pairs index names the pool id and
 * when it was made; the pool's key (currencies, fee, tick spacing, hooks) is then read from its Initialize event on
 * the PoolManager, searched in a few log windows around the estimated block. Found keys are kept in memory and on disk.
 */
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951" as const;
const INIT = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";
const WINDOW = 25_000;
const BASES = new Set(["0x0000000000000000000000000000000000000000", "0x0bd7d308f8e1639fab988df18a8011f41eacad73", "0x5fc5360d0400a0fd4f2af552add042d716f1d168"]);

type Ref = { id: `0x${string}`; key: { currency0: `0x${string}`; currency1: `0x${string}`; fee: number; tickSpacing: number; hooks: `0x${string}` }; block: number };
type Snap = { at: number; pools: Ref[]; missed: string[] };
const G = globalThis as unknown as { __corbelV4x?: { pools: Map<string, Ref>; missed: Set<string>; tried: Map<string, number>; inflight: Map<string, Promise<void>> } };
const box = (G.__corbelV4x ??= (() => {
  const s = loadSnap<Snap>("v4extra");
  return { pools: new Map((s?.pools ?? []).map((p) => [p.id.toLowerCase(), p])), missed: new Set(s?.missed ?? []), tried: new Map(), inflight: new Map() };
})());
const save = () => {
  const snap: Snap = { at: Date.now(), pools: [...box.pools.values()], missed: [...box.missed] };
  keepSnap("v4extra", snap);
};

async function keyOf(client: PublicClient, id: string, createdMs: number | undefined): Promise<Ref | null> {
  const head = await client.getBlock();
  // the block at the pool's creation time, by binary search on timestamps (blocks here are not evenly spaced)
  let lo = 0n;
  let hi = head.number;
  const target = BigInt(Math.floor((createdMs ?? Number(head.timestamp) * 1000) / 1000));
  while (hi - lo > BigInt(WINDOW / 4)) {
    const mid = (lo + hi) / 2n;
    const b = await client.getBlock({ blockNumber: mid });
    if (b.timestamp < target) lo = mid;
    else hi = mid;
  }
  const guess = Number(hi);
  // the creation time from a listing can be the first trade, so look back further than forward
  const starts: number[] = [];
  for (let k = 0; k < 8; k++) starts.push(guess - (k + 1) * WINDOW + WINDOW / 2);
  for (let k = 0; k < 2; k++) starts.push(guess + k * WINDOW + WINDOW / 2);
  for (const from of starts) {
    if (from < 0 || from > Number(head.number)) continue;
    const logs = (await client.request({ method: "eth_getLogs", params: [{ address: PM, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${Math.min(Number(head.number), from + WINDOW - 1).toString(16)}`, topics: [INIT, id as `0x${string}`] }] } as never)) as { topics: `0x${string}`[]; data: `0x${string}`; blockNumber: `0x${string}` }[];
    const l = logs[0];
    if (!l) continue;
    const [fee, tickSpacing, hooks] = decodeAbiParameters([{ type: "uint24" }, { type: "int24" }, { type: "address" }, { type: "uint160" }, { type: "int24" }], l.data);
    const addr = (t: `0x${string}`) => `0x${t.slice(26)}` as `0x${string}`;
    return { id: id.toLowerCase() as `0x${string}`, key: { currency0: addr(l.topics[2]!), currency1: addr(l.topics[3]!), fee: Number(fee), tickSpacing: Number(tickSpacing), hooks: (hooks as string).toLowerCase() as `0x${string}` }, block: Number(l.blockNumber) };
  }
  return null;
}

/** Finds and keeps the v4 pools of `token` against ETH, WETH or USDG that the index does not hold (the pairs index's three
 * deepest). Bounded and cached: a token is looked up at most once in 30 minutes. */
export function ensureV4(client: PublicClient, token: string): Promise<void> {
  const t = token.toLowerCase();
  const last = box.tried.get(t) ?? 0;
  if (Date.now() - last < 30 * 60_000) return Promise.resolve();
  const running = box.inflight.get(t);
  if (running) return running;
  const p = (async () => {
    box.tried.set(t, Date.now());
    const pairs = (await dsTokens([t])).filter((x) => (x.labels ?? []).includes("v4") && /^0x[0-9a-f]{64}$/i.test(x.pairAddress));
    const mine = pairs.filter((x) => (x.baseToken.address.toLowerCase() === t && BASES.has(x.quoteToken.address.toLowerCase())) || (x.quoteToken.address.toLowerCase() === t && BASES.has(x.baseToken.address.toLowerCase())));
    let changed = false;
    for (const x of mine.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)).slice(0, 3)) {
      const id = x.pairAddress.toLowerCase();
      if (box.pools.has(id) || box.missed.has(id) || (idxFor(t) ?? []).some((i) => i.id.toLowerCase() === id)) continue;
      const ref = await keyOf(client, id, x.pairCreatedAt).catch(() => null);
      if (ref) box.pools.set(id, ref);
      else box.missed.add(id);
      changed = true;
    }
    if (changed) save();
  })()
    .catch(() => undefined)
    .finally(() => box.inflight.delete(t));
  box.inflight.set(t, p);
  return p;
}

/** The index's v4 pools for a token, plus the ones found here. */
export function v4PoolsFor(token: string) {
  const t = token.toLowerCase();
  const extra = [...box.pools.values()].filter((p) => p.key.currency0 === t || p.key.currency1 === t).map((p) => ({ kind: "v4" as const, id: p.id, key: p.key, block: p.block, tx: "0x" as `0x${string}` }));
  const idx = idxFor(t) ?? [];
  return [...idx, ...extra.filter((e) => !idx.some((i) => i.id.toLowerCase() === e.id))];
}

/** The index's v4 pools between two currencies, plus the ones found here. */
export function v4PoolsBetween(a: string, b: string) {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  const idx = idxBetween(x, y) ?? [];
  const extra = [...box.pools.values()].filter((p) => (p.key.currency0 === x && p.key.currency1 === y) || (p.key.currency0 === y && p.key.currency1 === x)).map((p) => ({ id: p.id, key: p.key, live: true as boolean | null }));
  return [...idx, ...extra.filter((e) => !idx.some((i) => i.id.toLowerCase() === e.id))];
}
