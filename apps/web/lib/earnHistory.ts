/**
 * Earn · thirty days of every listed V2 pool, day by day, from its own Swap and Sync events: base volume, swaps, and
 * the reserves at the day's last Sync (so liquidity and price are the day's real ones, not today's). Backfilled once
 * in the background (about 400 log windows per pool), then topped up to the head on every refresh. Kept on disk.
 */
import type { PublicClient } from "viem";
import { asBackground } from "@corbel/data/chain";
import { store } from "./store";

const SWAP = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const SYNC = "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1";
const WINDOW = 100_000n;
const DAYS = 30;

export type PoolKey = { pair: string; baseIs0: boolean; baseDec: number; tokenDec: number };
export type Day = { day: number; vol: number; swaps: number; rb: number; rt: number };

const db = () =>
  store(
    // v2: the first record used a fixed 4 blocks a second; the chain runs near 9.5, so days were misplaced
    "earnhist2",
    `CREATE TABLE IF NOT EXISTS days (pair TEXT NOT NULL, day INTEGER NOT NULL, vol REAL NOT NULL DEFAULT 0, swaps INTEGER NOT NULL DEFAULT 0, rb REAL, rt REAL, last INTEGER, PRIMARY KEY (pair, day));
     CREATE TABLE IF NOT EXISTS prog (pair TEXT PRIMARY KEY, low INTEGER NOT NULL, high INTEGER NOT NULL);`,
  );

const G = globalThis as unknown as { __corbelEarnHist?: { busy: boolean } };
const G2 = G as unknown as { __corbelEarnHist: { busy: boolean; bps?: number } };
const hs = (G2.__corbelEarnHist ??= { busy: false });
/** Blocks a second, measured over the last million blocks on every sync (the chain's rate has changed before). */
const bps = () => hs.bps ?? 9.5;

const word = (data: string, i: number) => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64)}`);

/** Reads one window of a pair's events and adds them to the day buckets. */
async function readWindow(client: PublicClient, k: PoolKey, from: bigint, to: bigint, headBlock: bigint, headTs: number) {
  const logs = (await client.request({
    method: "eth_getLogs",
    params: [{ address: k.pair, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [[SWAP, SYNC]] }],
  } as never)) as { topics: string[]; data: string; blockNumber: string; logIndex: string }[];
  const d = db();
  if (!d) return;
  const bucket = new Map<number, { vol: number; swaps: number; rb?: number; rt?: number; last?: number }>();
  const rate = bps();
  const dayOf = (b: number) => Math.floor((headTs - (Number(headBlock) - b) / rate) / 86_400);
  for (const l of logs) {
    const b = Number(l.blockNumber);
    const day = dayOf(b);
    const x = bucket.get(day) ?? { vol: 0, swaps: 0 };
    if (l.topics[0] === SWAP) {
      // amount0In, amount1In, amount0Out, amount1Out: the base side's in plus out is the trade's size in base
      const base = k.baseIs0 ? word(l.data, 0) + word(l.data, 2) : word(l.data, 1) + word(l.data, 3);
      x.vol += Number(base) / 10 ** k.baseDec;
      x.swaps++;
    } else {
      const pos = b * 100_000 + Number(l.logIndex);
      if (x.last === undefined || pos > x.last) {
        const r0 = word(l.data, 0), r1 = word(l.data, 1);
        x.rb = Number(k.baseIs0 ? r0 : r1) / 10 ** k.baseDec;
        x.rt = Number(k.baseIs0 ? r1 : r0) / 10 ** k.tokenDec;
        x.last = pos;
      }
    }
    bucket.set(day, x);
  }
  const up = d.prepare(
    `INSERT INTO days (pair, day, vol, swaps, rb, rt, last) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pair, day) DO UPDATE SET vol = vol + excluded.vol, swaps = swaps + excluded.swaps,
       rb = CASE WHEN excluded.last IS NOT NULL AND (last IS NULL OR excluded.last > last) THEN excluded.rb ELSE rb END,
       rt = CASE WHEN excluded.last IS NOT NULL AND (last IS NULL OR excluded.last > last) THEN excluded.rt ELSE rt END,
       last = CASE WHEN excluded.last IS NOT NULL AND (last IS NULL OR excluded.last > last) THEN excluded.last ELSE last END`,
  );
  d.exec("BEGIN");
  for (const [day, x] of bucket) up.run(k.pair, day, x.vol, x.swaps, x.rb ?? null, x.rt ?? null, x.last ?? null);
  d.exec("COMMIT");
}

/** Brings every pool up to the head and backfills toward thirty days, in the background. Never runs twice at once. */
export function syncHistory(client: PublicClient, pools: PoolKey[]) {
  if (hs.busy || !pools.length) return;
  const d = db();
  if (!d) return;
  hs.busy = true;
  void asBackground(async () => {
    const head = await client.getBlockNumber();
    const headTs = Number((await client.getBlock({ blockNumber: head })).timestamp);
    const back = 1_000_000n;
    const then = await client.getBlock({ blockNumber: head - back }).catch(() => null);
    const dt = then ? headTs - Number(then.timestamp) : 0;
    if (dt > 0) hs.bps = Number(back) / dt;
    const floor = head - BigInt(Math.round(DAYS * 86_400 * bps()));
    const getP = d.prepare(`SELECT low, high FROM prog WHERE pair = ?`);
    const setP = d.prepare(`INSERT INTO prog (pair, low, high) VALUES (?, ?, ?) ON CONFLICT(pair) DO UPDATE SET low = excluded.low, high = excluded.high`);
    for (const k of pools) {
      const p = getP.get(k.pair) as { low: number; high: number } | undefined;
      let low = BigInt(p?.low ?? Number(head)), high = BigInt(p?.high ?? Number(head));
      // forward to the head first (cheap: minutes of blocks), then backward toward the floor
      while (high < head) {
        const to = high + WINDOW > head ? head : high + WINDOW;
        await readWindow(client, k, high + 1n, to, head, headTs);
        high = to;
        setP.run(k.pair, Number(low), Number(high));
      }
      let windows = 0;
      while (low > floor && windows < 60) {
        const from = low - WINDOW < floor ? floor : low - WINDOW;
        await readWindow(client, k, from, low - 1n, head, headTs);
        low = from;
        windows++;
        setP.run(k.pair, Number(low), Number(high));
      }
    }
  })
    .catch((e) => console.error("[earn history]", (e as Error).message))
    .finally(() => (hs.busy = false));
}

/** The pool's days, oldest first, the last thirty. */
export function history(pair: string): Day[] {
  const d = db();
  if (!d) return [];
  const today = Math.floor(Date.now() / 86_400_000);
  return d.prepare(`SELECT day, vol, swaps, rb, rt FROM days WHERE pair = ? AND day > ? ORDER BY day ASC`).all(pair.toLowerCase(), today - DAYS) as Day[];
}

/** How far back the record goes for a pool, in days. */
export function covered(pair: string) {
  const d = db();
  const p = d?.prepare(`SELECT low, high FROM prog WHERE pair = ?`).get(pair.toLowerCase()) as { low: number; high: number } | undefined;
  return p ? Math.min(DAYS, Math.floor((p.high - p.low) / bps() / 86_400)) : 0;
}
