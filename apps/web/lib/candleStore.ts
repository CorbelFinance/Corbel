/**
 * Price history beyond the terminal's live read. Every market read of a token keeps its swaps as 5-minute candles
 * (price in the pool's base, volume in base), so a chart can scroll back to the pool's first day: the live reads keep
 * the newest candles and lib/candleBackfill reads the older ones from the chain. Nothing is invented. Kept 400 days.
 */
import { store } from "./store";

const B = 300;
const KEEP = 400 * 86_400;
const db = () =>
  store(
    "candles",
    `CREATE TABLE IF NOT EXISTS candles (token TEXT NOT NULL, t INTEGER NOT NULL, o REAL NOT NULL, h REAL NOT NULL, l REAL NOT NULL, c REAL NOT NULL, v REAL NOT NULL, vb REAL NOT NULL, PRIMARY KEY (token, t));`,
  );

type T = { t: number; price: number; base: number; side: "buy" | "sell" };
export type StoredBar = { t: number; o: number; h: number; l: number; c: number; v: number; vb: number };

/** Keeps the 5-minute buckets the read covers in full (a bucket cut by the read's start is left as it was). */
export function keepCandles(token: string, trades: T[], since: number, opts: { skipNewest?: boolean } = {}) {
  const d = db();
  if (!d || !trades.length) return;
  const start = Math.ceil(since / B) * B;
  const m = new Map<number, StoredBar>();
  for (const x of [...trades].sort((a, b) => a.t - b.t)) {
    if (!(x.price > 0) || x.t < start) continue;
    const t = Math.floor(x.t / B) * B;
    const b = m.get(t);
    if (!b) m.set(t, { t, o: x.price, h: x.price, l: x.price, c: x.price, v: x.base, vb: x.side === "buy" ? x.base : 0 });
    else {
      b.h = Math.max(b.h, x.price);
      b.l = Math.min(b.l, x.price);
      b.c = x.price;
      b.v += x.base;
      if (x.side === "buy") b.vb += x.base;
    }
  }
  if (opts.skipNewest && m.size) m.delete(Math.max(...m.keys()));
  if (!m.size) return;
  const k = token.toLowerCase();
  const put = d.prepare("INSERT OR REPLACE INTO candles (token, t, o, h, l, c, v, vb) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  d.exec("BEGIN");
  try {
    for (const b of m.values()) put.run(k, b.t, b.o, b.h, b.l, b.c, b.v, b.vb);
    d.exec("COMMIT");
  } catch {
    d.exec("ROLLBACK");
  }
  // trim now and then
  if (Math.random() < 0.01) d.prepare("DELETE FROM candles WHERE t < ?").run(Math.floor(Date.now() / 1000) - KEEP);
}

/** Candles of `tf` seconds before `before`, back `days` days, empty intervals carried at the last close. */
export function candlesOf(token: string, tf: number, before: number, days: number): StoredBar[] {
  const d = db();
  if (!d) return [];
  const from = before - days * 86_400;
  const rows = d.prepare("SELECT t, o, h, l, c, v, vb FROM candles WHERE token = ? AND t >= ? AND t < ? ORDER BY t").all(token.toLowerCase(), from, before) as StoredBar[];
  const out: StoredBar[] = [];
  for (const r of rows) {
    const t = Math.floor(r.t / tf) * tf;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, r.h);
      last.l = Math.min(last.l, r.l);
      last.c = r.c;
      last.v += r.v;
      last.vb += r.vb;
    } else {
      // a gap between kept candles: flat at the last close, so time stays to scale
      if (last) for (let g = last.t + tf; g < t && out.length < 5000; g += tf) out.push({ t: g, o: last.c, h: last.c, l: last.c, c: last.c, v: 0, vb: 0 });
      out.push({ ...r, t });
    }
  }
  return out.slice(-6000);
}
