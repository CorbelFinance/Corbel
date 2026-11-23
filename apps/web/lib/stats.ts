import { createHash, randomBytes } from "node:crypto";
import { store } from "./store";

/**
 * Site statistics for the owner, kept so visitors stay unlinkable:
 * - a visit is a random id that lives in one browser tab (sessionStorage) and dies with it: the same person on two
 *   days is two visits, never one profile;
 * - no IP, no user agent, no cookie, no wallet is written next to an event; times are kept to the minute;
 * - paths lose their query and any 0x address; a click keeps only the label of the link or button, never what was typed;
 * - sign-ins are counted apart: a salted hash of the wallet and the day it first signed in, nothing else;
 * - once per visit: its time zone (e.g. Europe/Berlin), phone or computer, and the host it came from, kept with the
 *   visit only, so the owner can tell visits apart without knowing who anyone is;
 * - token checks are counted per day by contract (and its symbol): which tokens people check, never who checked them;
 * - the first result of each token's check per day is kept (pass / warn / fail per check) so the check's accuracy can be
 *   measured against what later happened to the token: token-level only, nothing about who asked;
 * - raw events are deleted after 30 days; only day counts are read from them.
 */
const db = () =>
  store(
    "stats",
    `CREATE TABLE IF NOT EXISTS ev (day TEXT NOT NULL, sid TEXT NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, label TEXT, ms INTEGER, minute INTEGER NOT NULL);
     CREATE INDEX IF NOT EXISTS ev_day ON ev (day);
     CREATE INDEX IF NOT EXISTS ev_sid ON ev (sid, seq);
     CREATE TABLE IF NOT EXISTS wallets (h TEXT PRIMARY KEY, first TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS seen (h TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (h, day));
     CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS visit (sid TEXT PRIMARY KEY, day TEXT NOT NULL, tz TEXT, dev TEXT, ref TEXT, minute INTEGER NOT NULL);
     CREATE TABLE IF NOT EXISTS checks (day TEXT NOT NULL, token TEXT NOT NULL, symbol TEXT, n INTEGER NOT NULL, PRIMARY KEY (day, token));
     CREATE TABLE IF NOT EXISTS verdicts (day TEXT NOT NULL, token TEXT NOT NULL, block TEXT, results TEXT NOT NULL, PRIMARY KEY (day, token));`,
  );

/** The stats file with its schema, for modules that read the saved verdicts (lib/ledger). */
export const statsStore = () => db();

const today = () => new Date().toISOString().slice(0, 10);

/** The salt for wallet hashes: made once, kept only in this database, so a hash cannot be matched to an address elsewhere. */
function salt() {
  const d = db();
  const row = d?.prepare("SELECT v FROM meta WHERE k = 'salt'").get() as { v: string } | undefined;
  if (row) return row.v;
  const s = randomBytes(24).toString("hex");
  d?.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('salt', ?)").run(s);
  return s;
}

export function cleanPath(p: unknown) {
  const s = typeof p === "string" ? p : "";
  return (s.split(/[?#]/)[0] ?? "/").replace(/0x[0-9a-fA-F]{40,64}/g, ":addr").replace(/[^\w\-/:.]/g, "").slice(0, 120) || "/";
}
const cleanLabel = (l: unknown) => (typeof l === "string" ? l.replace(/0x[0-9a-fA-F]{6,}/g, ":addr").replace(/\s+/g, " ").trim().slice(0, 60) : null);

let lastPrune = 0;
export function record(sid: string, events: { k: string; p: string; t?: string; ms?: number; q: number }[], v?: { tz?: unknown; dev?: unknown; ref?: unknown }) {
  const d = db();
  if (!d || !/^[a-z0-9]{12,32}$/.test(sid)) return;
  const day = today();
  const minute = Math.floor(Date.now() / 60_000);
  const ins = d.prepare("INSERT INTO ev (day, sid, seq, kind, path, label, ms, minute) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  d.exec("BEGIN");
  for (const e of events.slice(0, 40)) {
    if (!["view", "click", "leave"].includes(e.k)) continue;
    ins.run(day, sid, Math.max(0, Math.min(100_000, Math.floor(Number(e.q) || 0))), e.k, cleanPath(e.p), e.k === "click" ? cleanLabel(e.t) : null, e.k === "leave" ? Math.max(0, Math.min(86_400_000, Math.floor(Number(e.ms) || 0))) : null, minute);
  }
  d.exec("COMMIT");
  if (v && typeof v === "object") {
    const tz = typeof v.tz === "string" && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(v.tz) ? v.tz.slice(0, 40) : null;
    const dev = ["phone", "tablet", "computer"].includes(String(v.dev)) ? String(v.dev) : null;
    const ref = typeof v.ref === "string" && /^[a-z0-9.-]{1,60}(:\d{1,5})?$/i.test(v.ref) ? v.ref.toLowerCase() : null;
    d.prepare("INSERT OR IGNORE INTO visit (sid, day, tz, dev, ref, minute) VALUES (?, ?, ?, ?, ?, ?)").run(sid, day, tz, dev, ref, minute);
  }
  if (Date.now() - lastPrune > 3_600_000) {
    lastPrune = Date.now();
    d.prepare("DELETE FROM ev WHERE day < ?").run(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
    d.prepare("DELETE FROM seen WHERE day < ?").run(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
    d.prepare("DELETE FROM visit WHERE day < ?").run(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
    d.prepare("DELETE FROM checks WHERE day < ?").run(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
    // verdicts are the study's record: kept a year
    d.prepare("DELETE FROM verdicts WHERE day < ?").run(new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10));
  }
}

/** One token check: counted by day, contract and symbol. Nothing about who asked is passed in or kept. */
export function countCheck(token: string, symbol?: string | null) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return;
  const sym = typeof symbol === "string" ? symbol.replace(/[^\p{L}\p{N}$._-]/gu, "").slice(0, 20) || null : null;
  db()?.prepare("INSERT INTO checks (day, token, symbol, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, token) DO UPDATE SET n = n + 1, symbol = COALESCE(excluded.symbol, symbol)").run(today(), token.toLowerCase(), sym);
}

/** A wallet signed in: counted as new on the first day it does, and as active on each day it does. */
export function signedIn(address: string) {
  const d = db();
  if (!d) return;
  const h = createHash("sha256").update(salt() + address.toLowerCase()).digest("hex").slice(0, 32);
  d.prepare("INSERT OR IGNORE INTO wallets (h, first) VALUES (?, ?)").run(h, today());
  d.prepare("INSERT OR IGNORE INTO seen (h, day) VALUES (?, ?)").run(h, today());
}

/** Everything the panel shows, for the last `days` days. */
export function report(days = 14) {
  const d = db();
  if (!d) return null;
  const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const q = <T>(sql: string, ...a: (string | number)[]) => d.prepare(sql).all(...a) as T[];
  const perDay = q<{ day: string; visits: number; views: number; clicks: number }>(
    `SELECT day, COUNT(DISTINCT sid) AS visits, SUM(kind = 'view') AS views, SUM(kind = 'click') AS clicks FROM ev WHERE day >= ? GROUP BY day ORDER BY day`,
    from,
  );
  const regs = q<{ day: string; n: number }>(`SELECT first AS day, COUNT(*) AS n FROM wallets WHERE first >= ? GROUP BY first ORDER BY first`, from);
  const active = q<{ day: string; n: number }>(`SELECT day, COUNT(*) AS n FROM seen WHERE day >= ? GROUP BY day ORDER BY day`, from);
  const totalWallets = (d.prepare("SELECT COUNT(*) AS n FROM wallets").get() as { n: number }).n;
  // pages: views, visits that ended there (the last view of a visit), and the median time on it
  const pages = q<{ path: string; views: number; visits: number; exits: number }>(
    `WITH last AS (SELECT sid, MAX(seq) AS m FROM ev WHERE day >= ? AND kind = 'view' GROUP BY sid)
     SELECT e.path, COUNT(*) AS views, COUNT(DISTINCT e.sid) AS visits, SUM(e.seq = l.m) AS exits
     FROM ev e JOIN last l ON l.sid = e.sid WHERE e.day >= ? AND e.kind = 'view' GROUP BY e.path ORDER BY views DESC LIMIT 30`,
    from,
    from,
  );
  const clicks = q<{ path: string; label: string; n: number; visits: number }>(
    `SELECT path, label, COUNT(*) AS n, COUNT(DISTINCT sid) AS visits FROM ev WHERE day >= ? AND kind = 'click' AND label IS NOT NULL AND label != '' GROUP BY path, label ORDER BY n DESC LIMIT 40`,
    from,
  );
  // the way in: landed, opened the app, used a tool (a click inside the app), signed in (counted apart)
  const f = d
    .prepare(
      `SELECT COUNT(DISTINCT sid) AS visits,
              COUNT(DISTINCT CASE WHEN kind = 'view' AND path LIKE '/app%' THEN sid END) AS app,
              COUNT(DISTINCT CASE WHEN kind = 'click' AND path LIKE '/app%' THEN sid END) AS used
       FROM ev WHERE day >= ?`,
    )
    .get(from) as { visits: number; app: number; used: number };
  const signed = (d.prepare("SELECT COUNT(DISTINCT h) AS n FROM seen WHERE day >= ?").get(from) as { n: number }).n;
  const depth = q<{ views: number; n: number }>(
    `SELECT MIN(v, 10) AS views, COUNT(*) AS n FROM (SELECT sid, SUM(kind = 'view') AS v FROM ev WHERE day >= ? GROUP BY sid) GROUP BY MIN(v, 10) ORDER BY views`,
    from,
  );
  const time = q<{ ms: number }>(`SELECT ms FROM ev WHERE day >= ? AND kind = 'leave' AND ms > 0 ORDER BY ms`, from);
  const medianMs = time.length ? time[Math.floor(time.length / 2)]!.ms : null;
  return { days, perDay, regs, active, totalWallets, pages, clicks, funnel: { ...f, signed }, depth, medianMs };
}

/** The tokens checked most today, for the landing tape: contract, symbol and count only. */
export function topChecksToday(limit = 6): { token: string; symbol: string | null; n: number }[] {
  try {
    return (db()?.prepare("SELECT token, symbol, n FROM checks WHERE day = ? ORDER BY n DESC LIMIT ?").all(today(), limit) as { token: string; symbol: string | null; n: number }[]) ?? [];
  } catch {
    return [];
  }
}

/** The day's first result of a token's check: per check id its result, with the block it was read at. Token-level only. */
export function saveVerdict(token: string, block: string | null | undefined, checks: { id: string; result: string }[]) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(token) || !checks.length) return;
  const r = Object.fromEntries(checks.map((c) => [c.id, c.result]));
  try {
    db()?.prepare("INSERT OR IGNORE INTO verdicts (day, token, block, results) VALUES (?, ?, ?, ?)").run(today(), token.toLowerCase(), block ?? null, JSON.stringify(r));
  } catch {
    // a missed record only shortens the study
  }
}

/** How many token verdicts are on record, and since when: for the accuracy page. */
export function verdictStats(): { n: number; tokens: number; since: string | null } {
  try {
    const r = db()?.prepare("SELECT COUNT(*) AS n, COUNT(DISTINCT token) AS tokens, MIN(day) AS since FROM verdicts").get() as { n: number; tokens: number; since: string | null } | undefined;
    return r ?? { n: 0, tokens: 0, since: null };
  } catch {
    return { n: 0, tokens: 0, since: null };
  }
}
