/**
 * Gap history: every weekend, what each stock token traded at on Robinhood Chain just before the Monday open, against
 * Friday's close, and whether Monday's official open then moved the same way (closed the gap).
 *
 * Recorded as it happens by the weekend gap sweep (api/gap), which already runs every 10 minutes:
 *  - from Friday's close to Monday's open (New York time: 16:00 and 9:30, so 20:00/13:30 UTC in summer and
 *    21:00/14:30 UTC in winter) each sweep stores the latest chain price, so the
 *    last one stored is the price just before the bell;
 *  - after the open, Monday's official open is read once and the row is settled.
 * "Closed" means the open moved in the same direction as the chain and covered at least half of the chain's gap.
 * Weekends before the sweep ran are rebuilt from the chain once (lib/gapBackfill) and marked "rebuilt"; a live row
 * always wins over a rebuilt one.
 */
import { store } from "./store";

export type GapWeek = { week: string; symbol: string; token: string; close: number; chain: number; chainAt: number; open: number | null; gap: number; move: number | null; closed: number | null; src: "live" | "rebuilt" };

let migrated = false;
const db = () => {
  const d = store(
    "gaphist",
    `CREATE TABLE IF NOT EXISTS gaps (week TEXT NOT NULL, symbol TEXT NOT NULL, token TEXT NOT NULL, close REAL NOT NULL, chain REAL NOT NULL, chain_at INTEGER NOT NULL,
       open REAL, gap REAL NOT NULL, move REAL, closed INTEGER, PRIMARY KEY (week, symbol));
     CREATE TABLE IF NOT EXISTS gapstate (k TEXT PRIMARY KEY, v TEXT NOT NULL);`,
  );
  // the src column came with the rebuilt weekends: an older row was recorded live
  if (d && !migrated) {
    migrated = true;
    const cols = d.prepare("PRAGMA table_info(gaps)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "src")) d.exec("ALTER TABLE gaps ADD COLUMN src TEXT NOT NULL DEFAULT 'live'");
  }
  return d;
};

/** Rebuilt weekends: stored only where no row exists, never over a live one. */
export function storeRebuilt(rows: { week: string; symbol: string; token: string; close: number; chain: number; chainAt: number; open: number; gap: number; move: number; closed: number }[]): number {
  const d = db();
  if (!d) return 0;
  const put = d.prepare("INSERT OR IGNORE INTO gaps (week, symbol, token, close, chain, chain_at, open, gap, move, closed, src) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rebuilt')");
  let n = 0;
  for (const r of rows) n += Number(put.run(r.week, r.symbol, r.token, r.close, r.chain, r.chainAt, r.open, r.gap, r.move, r.closed).changes);
  return n;
}
/** The weeks a symbol already has, live or rebuilt. */
export const weeksOf = (symbol: string) => new Set(((db()?.prepare("SELECT week FROM gaps WHERE symbol = ?").all(symbol) ?? []) as { week: string }[]).map((r) => r.week));
/** A small key-value note for the rebuild (which symbols are done). */
export const gapNote = { get: (k: string) => (db()?.prepare("SELECT v FROM gapstate WHERE k = ?").get(k) as { v: string } | undefined)?.v ?? null, set: (k: string, v: string) => void db()?.prepare("INSERT INTO gapstate (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, v) };

const DAY = 86_400_000;

/** Whether New York is on daylight time at `t`: from the second Sunday of March 07:00 UTC to the first Sunday of November 06:00 UTC. */
export function nyDaylight(t: number): boolean {
  const y = new Date(t).getUTCFullYear();
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return Date.UTC(y, month, 1 + ((7 - first) % 7) + 7 * (n - 1));
  };
  return t >= nthSunday(2, 2) + 7 * 3_600_000 && t < nthSunday(10, 1) + 6 * 3_600_000;
}
/** The regular session's open and close in UTC minutes for the day of `t`. */
export const sessionUtc = (t: number) => (nyDaylight(t) ? { open: 13 * 60 + 30, close: 20 * 60 } : { open: 14 * 60 + 30, close: 21 * 60 });

/** The Friday (YYYY-MM-DD, UTC) a moment belongs to, when it falls between Friday's close and Monday's open; else null. */
export function weekendOf(t: number): string | null {
  const d = new Date(t);
  const dow = d.getUTCDay(); // 0 Sunday … 6 Saturday
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  const s = sessionUtc(t);
  let back: number | null = null;
  if (dow === 5 && mins >= s.close) back = 0;
  else if (dow === 6) back = 1;
  else if (dow === 0) back = 2;
  else if (dow === 1 && mins < s.open) back = 3;
  if (back === null) return null;
  return new Date(t - back * DAY).toISOString().slice(0, 10);
}

/** During a weekend: keep the latest chain price of each token against Friday's close. */
export function recordWeekend(t: number, rows: { symbol: string; token: string; chain: number; close: number | null; closeAt: number | null }[]): number {
  const week = weekendOf(t);
  const d = db();
  if (!week || !d) return 0;
  const friday = Date.parse(`${week}T00:00:00Z`);
  let n = 0;
  const put = d.prepare(
    "INSERT INTO gaps (week, symbol, token, close, chain, chain_at, gap) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(week, symbol) DO UPDATE SET chain = excluded.chain, chain_at = excluded.chain_at, gap = excluded.gap, close = excluded.close WHERE open IS NULL",
  );
  for (const r of rows) {
    // only Friday's own close counts: a stale close from an earlier day would make a false gap
    if (!(r.close && r.close > 0 && r.chain > 0 && r.closeAt)) continue;
    const closeDay = r.closeAt * 1000;
    if (closeDay < friday || closeDay >= friday + DAY) continue;
    put.run(week, r.symbol, r.token.toLowerCase(), r.close, r.chain, t, r.chain / r.close - 1);
    n++;
  }
  return n;
}

/** Rows of past weekends still waiting for Monday's open (half an hour after the bell). */
export function waitingForOpen(t: number): { week: string; symbol: string }[] {
  const d = db();
  if (!d) return [];
  const rows = d.prepare("SELECT week, symbol FROM gaps WHERE open IS NULL").all() as { week: string; symbol: string }[];
  return rows.filter((r) => {
    const monday = Date.parse(`${r.week}T00:00:00Z`) + 3 * DAY;
    return t >= monday + (sessionUtc(monday).open + 30) * 60_000;
  });
}

/** Settles a row with Monday's official open. */
export function settle(week: string, symbol: string, open: number): void {
  const d = db();
  const r = d?.prepare("SELECT close, gap FROM gaps WHERE week = ? AND symbol = ?").get(week, symbol) as { close: number; gap: number } | undefined;
  if (!d || !r || !(open > 0)) return;
  const move = open / r.close - 1;
  const closed = Math.sign(move) === Math.sign(r.gap) && Math.abs(move) >= Math.abs(r.gap) / 2 ? 1 : 0;
  d.prepare("UPDATE gaps SET open = ?, move = ?, closed = ? WHERE week = ? AND symbol = ?").run(open, move, closed, week, symbol);
}

/** Every recorded weekend, newest first, and per token how often Monday closed the gap. */
export function gapHistory(limitWeeks = 26): { weeks: { week: string; rows: GapWeek[] }[]; bySymbol: { symbol: string; weekends: number; closed: number }[] } {
  const d = db();
  if (!d) return { weeks: [], bySymbol: [] };
  const rows = (d.prepare("SELECT week, symbol, token, close, chain, chain_at AS chainAt, open, gap, move, closed, src FROM gaps ORDER BY week DESC, ABS(gap) DESC").all() as GapWeek[]);
  const weeks: { week: string; rows: GapWeek[] }[] = [];
  for (const r of rows) {
    const w = weeks.at(-1);
    if (w && w.week === r.week) w.rows.push(r);
    else if (weeks.length < limitWeeks) weeks.push({ week: r.week, rows: [r] });
  }
  const by = new Map<string, { symbol: string; weekends: number; closed: number }>();
  for (const r of rows) {
    if (r.closed === null) continue;
    const s = by.get(r.symbol) ?? { symbol: r.symbol, weekends: 0, closed: 0 };
    s.weekends++;
    s.closed += r.closed;
    by.set(r.symbol, s);
  }
  return { weeks, bySymbol: [...by.values()].sort((a, b) => b.weekends - a.weekends || a.symbol.localeCompare(b.symbol)) };
}
