/**
 * Reads a token's price history back from the chain into the candle store, a day at a time, so the chart can show the
 * token since its pool opened ("All"). Started when someone opens the token; one token and one day-long span at a
 * time, in the background slot (visitors always go first), a pause between spans. Where it stopped is kept, so a
 * restart carries on. A span with no swaps after the pool's first block, or two empty spans in a row, ends it.
 */
import { getClient, readMarket, asBackground } from "@corbel/data/chain";
import { indexStart, tokenPools } from "@corbel/indexer";
import { v4PoolsFor } from "./v4extra";
import { keepCandles } from "./candleStore";
import { store } from "./store";

const LOG_WINDOW = 25_000; // blocks per log window, as the market reader uses
const SPAN = 14; // windows per read: about a day
const LIVE = 36; // the live read already covers this many windows back from the head
const PAUSE = 4_000;
const MAX_SPANS = 400; // a year and more of history at most

const db = () =>
  store("candlefill", `CREATE TABLE IF NOT EXISTS backfill (token TEXT PRIMARY KEY, next_head INTEGER NOT NULL, empty INTEGER NOT NULL DEFAULT 0, spans INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0);`);

const G = globalThis as unknown as { __corbelBackfill?: { queue: string[]; running: boolean } };
const st = (G.__corbelBackfill ??= { queue: [], running: false });

/** How far the history of a token has been read: done, or still going. */
export function historyState(token: string): { done: boolean; spans: number } | null {
  const r = db()?.prepare("SELECT done, spans FROM backfill WHERE token = ?").get(token.toLowerCase()) as { done: number; spans: number } | undefined;
  return r ? { done: !!r.done, spans: r.spans } : null;
}

/** Asks for a token's history; cheap to call on every market read. */
export function wantHistory(token: string, head: number) {
  const d = db();
  if (!d) return;
  const k = token.toLowerCase();
  const row = d.prepare("SELECT done FROM backfill WHERE token = ?").get(k) as { done: number } | undefined;
  if (row?.done) return;
  if (!row) d.prepare("INSERT OR IGNORE INTO backfill (token, next_head) VALUES (?, ?)").run(k, head - (LIVE - 1) * LOG_WINDOW);
  if (!st.queue.includes(k)) st.queue.push(k);
  if (st.queue.length > 50) st.queue.splice(0, st.queue.length - 50);
  void run();
}

async function run() {
  if (st.running) return;
  st.running = true;
  try {
    const client = getClient(process.env.RPC_URL);
    if (!client) return;
    while (st.queue.length) {
      // the newest wish first: the token someone is looking at now
      const k = st.queue.pop()!;
      const d = db();
      if (!d) return;
      const row = d.prepare("SELECT next_head, empty, spans, done FROM backfill WHERE token = ?").get(k) as { next_head: number; empty: number; spans: number; done: number } | undefined;
      if (!row || row.done) continue;
      // a pool older than the index shows its first block as the index's own start: then the chain itself, two empty
      // spans in a row, says where the history ends
      const seen = tokenPools(k)?.firstBlock ?? null, start = indexStart();
      const first = seen !== null && start !== null && seen <= start + 200_000 ? null : seen;
      let { next_head: head, empty, spans } = row;
      // a few spans per turn, then the token goes back in the line behind the others
      for (let turn = 0; turn < 6; turn++) {
        if (head <= 0 || spans >= MAX_SPANS || (first !== null && head < first) || empty >= 2) {
          d.prepare("UPDATE backfill SET done = 1 WHERE token = ?").run(k);
          break;
        }
        let m: Awaited<ReturnType<typeof readMarket>> = null;
        try {
          m = await asBackground(() => readMarket(client, k as `0x${string}`, v4PoolsFor(k), SPAN, { head, maxTrades: 50_000, signers: false }));
        } catch {
          // the node said no: try this span again on the next turn
          break;
        }
        if (!m) {
          d.prepare("UPDATE backfill SET done = 1 WHERE token = ?").run(k);
          break;
        }
        // the span's newest 5-minute candle may be cut by the span's end: the newer span already kept it whole
        keepCandles(k, m.trades, m.since, { skipNewest: true });
        empty = m.trades.length ? 0 : empty + 1;
        spans++;
        // the next span ends one window into this one, so no candle falls between two spans
        head = m.from + LOG_WINDOW - 1;
        d.prepare("UPDATE backfill SET next_head = ?, empty = ?, spans = ? WHERE token = ?").run(head, empty, spans, k);
        await new Promise((r) => setTimeout(r, PAUSE));
      }
      const left = d.prepare("SELECT done FROM backfill WHERE token = ?").get(k) as { done: number } | undefined;
      if (left && !left.done && !st.queue.includes(k)) st.queue.unshift(k);
      await new Promise((r) => setTimeout(r, PAUSE));
    }
  } finally {
    st.running = false;
  }
}
