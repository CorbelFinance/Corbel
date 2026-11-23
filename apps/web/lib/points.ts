/**
 * Reward season points. A signed-in wallet earns points for real use of Corbel's tools, each action with a daily cap so
 * clicking cannot farm it; actions that cost money (a swap made through Corbel) earn the most. Holders earn more by
 * tier. Wallets the linker ties to one person share one score. A week's score decides the share of that week's pool
 * (lib/season); to be paid a wallet must be a live one (a few transactions on Robinhood Chain), not one made for this.
 */
import { createHash } from "node:crypto";
import { AI_ACCESS, HELD, type RoadBlockId } from "@corbel/config";
import { getClient } from "@corbel/data/chain";
import { session } from "./auth";
import { limitKey, sybilDb } from "./sybil";
import { store } from "./store";
import { tierOf } from "./tiers";

/**
 * Points per action and how many times a day each counts. One place: the rewards page shows this same table, coloured
 * by the action's roadmap block. `soon` marks a tool that is not running yet: listed with its points, counted once it runs.
 * `onchain` actions are counted only after the transaction is read back from the chain; `holders` actions need a tier.
 */
export const ACTIONS = {
  // owner, 2026-11-23: points follow effort. A click or a read earns 1 to 3, a deeper tool 5, a one-time setup 10 to 15,
  // an on-chain action that costs gas or money 15 to 50. Easy actions also get low daily caps, so clicking all day can
  // never beat one real swap.
  check: { block: "check", label: "Check a token", pts: 2, cap: 10 },
  radar: { block: "check", label: "Scan new pools in Radar", pts: 1, cap: 5 },
  creator: { block: "check", label: "Look up a creator", pts: 3, cap: 5 },
  retention: { block: "check", label: "See who kept a token after buying", pts: 3, cap: 5 },
  launches: { block: "check", label: "Read launch analytics", pts: 1, cap: 5 },
  address: { block: "check", label: "Check any address", pts: 3, cap: 5 },
  quote: { block: "trade", label: "Quote a swap", pts: 2, cap: 10 },
  market: { block: "trade", label: "Open a chart in the terminal", pts: 1, cap: 10 },
  swap: { block: "trade", label: "Swap through Corbel", pts: 25, cap: 10, onchain: true },
  xray: { block: "wallet", label: "X-ray a wallet", pts: 5, cap: 5 },
  preview: { block: "wallet", label: "Preview a transaction before signing", pts: 5, cap: 5 },
  revoke: { block: "wallet", label: "Revoke a risky approval", pts: 20, cap: 5, onchain: true },
  watch: { block: "wallet", label: "Follow a token or wallet", pts: 3, cap: 5 },
  paper: { block: "wallet", label: "Trade on the paper account", pts: 1, cap: 10 },
  fees: { block: "earn", label: "Read a pool's fee history", pts: 3, cap: 5 },
  health: { block: "earn", label: "Read who holds a pool's liquidity", pts: 3, cap: 5 },
  agents: { block: "agents", label: "Run an agent test on the real contract", pts: 5, cap: 5 },
  chat: { block: "compute", label: "Ask the AI", pts: 1, cap: 10 },
  gpu: { block: "compute", label: "Start a free GPU", pts: 10, cap: 1 },
  telegram: { block: "data", label: "Link Telegram alerts", pts: 15, cap: 1 },
  webhook: { block: "data", label: "Connect a webhook for alerts", pts: 15, cap: 1, holders: true },
  data: { block: "data", label: "Download open data", pts: 2, cap: 3 },
  vote: { block: "token", label: "Vote on what ships first", pts: 15, cap: 1, holders: true },
} as const satisfies Record<string, { block: RoadBlockId; label: string; pts: number; cap: number; soon?: boolean; onchain?: boolean; holders?: boolean }>;
export type Action = keyof typeof ACTIONS;

/**
 * Reports that earn points, added by hand by an admin after checking them (lib/points grant): a bug or a broken thing
 * found on Corbel, or an idea we put on the roadmap. Sent by DM on X or Telegram with the wallet to credit; the first
 * report of a problem earns. Flat points (no tier multiplier), at most 3 of each kind a week per person; a security or
 * money bug has no cap. Every grant is stored with the admin, the reason and the time.
 */
export const REPORTS = {
  broken: { label: "Something broken: a wrong number, a dead link, a layout fault", pts: 15, week: 3 },
  idea: { label: "An idea we put on the roadmap", pts: 20, week: 3 },
  bug: { label: "A bug that stops a tool from working", pts: 40, week: 3 },
  critical: { label: "A security or money bug", pts: 100, week: 0 },
} as const;
export type ReportKind = keyof typeof REPORTS;

/** Team wallets (TEAM_WALLETS, ADMIN_WALLETS on the server) never earn points and never appear on the board. */
const team = () => new Set(`${process.env.TEAM_WALLETS ?? ""},${process.env.ADMIN_WALLETS ?? ""}`.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
export const isTeam = (w: string) => team().has(w.toLowerCase());

/** Points multiplier by tier: holders earn more, everyone earns. */
export const MULT: Record<string, number> = { none: 1, light: 1.5, plus: 2, full: 3, core: 4 };
/** A wallet with fewer transactions than this can see its points but is not paid: made for the giveaway, not for use. */
export const MIN_TXS = 3;

const db = () =>
  store(
    "points",
    `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, who TEXT NOT NULL, wallet TEXT NOT NULL, action TEXT NOT NULL, pts REAL NOT NULL, day TEXT NOT NULL, week TEXT NOT NULL, ref TEXT, at INTEGER NOT NULL);
     CREATE INDEX IF NOT EXISTS events_who ON events(who, day, action);
     CREATE INDEX IF NOT EXISTS events_week ON events(week);
     CREATE UNIQUE INDEX IF NOT EXISTS events_ref ON events(action, ref) WHERE ref IS NOT NULL;
     CREATE TABLE IF NOT EXISTS profiles (wallet TEXT PRIMARY KEY, nick TEXT UNIQUE COLLATE NOCASE, at INTEGER NOT NULL);
     CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT NOT NULL, action TEXT NOT NULL, outcome TEXT NOT NULL, week TEXT NOT NULL, at INTEGER NOT NULL);
     CREATE INDEX IF NOT EXISTS attempts_week ON attempts(week, outcome);`,
  );

const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export function weekOf(t = Date.now()): string {
  const d = new Date(t);
  const dow = (d.getUTCDay() + 6) % 7;
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow + 3));
  const first = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4));
  const n = 1 + Math.round(((thu.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${thu.getUTCFullYear()}-W${String(n).padStart(2, "0")}`;
}

/**
 * The public points log. Every points row is sealed into a hash chain: hash = sha256(prev | n | id | action | pts |
 * at | tx), where `id` is the participant's public number (a hash of the person, not the wallet), `tx` the transaction
 * hash for on-chain actions (else empty). Change, add or drop one row and every hash after it changes, so anyone who
 * kept a head hash can tell. The log, the head and a script to recompute the board are public on /rewards.
 */
const GENESIS = "corbel-points-genesis";
export const publicId = (who: string) => createHash("sha256").update(`corbel-points-id:${who.toLowerCase()}`).digest("hex").slice(0, 12);
const txOf = (ref: string | null) => (ref && /^0x[0-9a-f]{64}$/i.test(ref) ? ref.toLowerCase() : "");
export const sealHash = (prev: string, n: number, id: string, action: string, pts: number, at: number, tx: string) =>
  createHash("sha256").update([prev, n, id, action, pts, at, tx].join("|")).digest("hex");

/** Seals every row not yet in the chain, in order. Called after each write and before each read. */
function seal() {
  const d = db();
  if (!d) return;
  d.exec("CREATE TABLE IF NOT EXISTS chain (event INTEGER PRIMARY KEY, prev TEXT NOT NULL, hash TEXT NOT NULL)");
  const last = d.prepare("SELECT hash FROM chain ORDER BY event DESC LIMIT 1").get() as { hash: string } | undefined;
  let prev = last?.hash ?? GENESIS;
  const rows = d.prepare("SELECT id, who, action, pts, at, ref FROM events WHERE id > COALESCE((SELECT MAX(event) FROM chain), 0) ORDER BY id").all() as { id: number; who: string; action: string; pts: number; at: number; ref: string | null }[];
  const put = d.prepare("INSERT INTO chain (event, prev, hash) VALUES (?, ?, ?)");
  for (const r of rows) {
    const h = sealHash(prev, r.id, publicId(r.who), r.action, r.pts, r.at, txOf(r.ref));
    put.run(r.id, prev, h);
    prev = h;
  }
}

/** A week's public log: every row in order with its seal, the hash before the first row, and the head. */
export function weekLog(week = weekOf()) {
  seal();
  const d = db();
  if (!d) return null;
  const rows = d.prepare("SELECT e.id AS n, e.who, e.action, e.pts, e.at, e.ref, c.prev, c.hash FROM events e JOIN chain c ON c.event = e.id WHERE e.week = ? ORDER BY e.id").all(week) as { n: number; who: string; action: string; pts: number; at: number; ref: string | null; prev: string; hash: string }[];
  const head = (d.prepare("SELECT hash, event FROM chain ORDER BY event DESC LIMIT 1").get() as { hash: string; event: number } | undefined) ?? null;
  return {
    week,
    start: rows[0]?.prev ?? null,
    count: rows.length,
    head: head?.hash ?? GENESIS,
    headAt: head?.event ?? 0,
    events: rows.map((r) => ({ n: r.n, id: publicId(r.who), action: r.action, pts: r.pts, at: r.at, tx: txOf(r.ref) || null, hash: r.hash })),
  };
}
/** Monday (YYYY-MM-DD) that starts an ISO week like 2026-W48. */
export function weekStart(week: string): string {
  const [y, w] = week.split("-W").map(Number) as [number, number];
  const jan4 = Date.UTC(y, 0, 4);
  const mon1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86_400_000;
  return new Date(mon1 + (w - 1) * 7 * 86_400_000).toISOString().slice(0, 10);
}
/** One person, one score: the linker's group, else the wallet. */
export const personOf = (wallet: string) => limitKey(wallet.toLowerCase()).gid ?? wallet.toLowerCase();
export const multOf = (wallet: string) => MULT[tierOf(wallet)?.id ?? "none"] ?? 1;

/**
 * Gives the signed-in wallet the points for one action, within the action's daily cap. `ref` makes an action count
 * once (a swap's transaction hash). Never throws: points are a side effect of using a tool, they never break it.
 */
export function award(req: Request, action: Action, ref?: string): number {
  let w = "";
  // every attempt by a signed-in wallet is logged with its outcome, so a missing point can always be traced
  const log = (outcome: string) => {
    try {
      if (w) db()?.prepare("INSERT INTO attempts (wallet, action, outcome, week, at) VALUES (?, ?, ?, ?, ?)").run(w, action, outcome, weekOf(), Date.now());
    } catch {
      // the log never breaks the tool
    }
  };
  try {
    const s = session(req);
    if (!s) return 0;
    w = s.address.toLowerCase();
    const d = db();
    if (!d) return 0;
    const who = personOf(w), a = ACTIONS[action];
    if (isTeam(w)) return (log("team"), 0);
    if (("soon" in a && a.soon) || (action === "xray" && HELD.xray) || (action === "preview" && HELD.preview)) return (log("soon"), 0);
    const used = (d.prepare("SELECT COUNT(*) AS n FROM events WHERE who = ? AND day = ? AND action = ?").get(who, day(), action) as { n: number }).n;
    if (used >= a.cap) return (log("cap"), 0);
    const pts = a.pts * multOf(w);
    const r = d.prepare("INSERT OR IGNORE INTO events (who, wallet, action, pts, day, week, ref, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(who, w, action, pts, day(), weekOf(), ref ?? null, Date.now());
    const ok = Number(r.changes) > 0;
    if (ok) seal();
    log(ok ? "ok" : "repeat");
    return ok ? pts : 0;
  } catch {
    log("error");
    return 0;
  }
}

/**
 * The week's reconciliation for the admin page: every wallet that signed in or earned, its points, whether it is on
 * the board and eligible, and every refused attempt by reason. A wallet with an "ok" attempt but no points, or with
 * points but missing from the board, is listed under problems: those are the cases that must never happen.
 */
export function audit(week = weekOf()) {
  const d = db();
  if (!d) return null;
  const ev = d.prepare("SELECT wallet, who, SUM(pts) AS pts, COUNT(*) AS n FROM events WHERE week = ? GROUP BY wallet").all(week) as { wallet: string; who: string; pts: number; n: number }[];
  const att = d.prepare("SELECT wallet, outcome, COUNT(*) AS n FROM attempts WHERE week = ? GROUP BY wallet, outcome").all(week) as { wallet: string; outcome: string; n: number }[];
  const onBoard = new Set(board(week, Number.MAX_SAFE_INTEGER).map((b) => b.wallet));
  const people = new Set(board(week, Number.MAX_SAFE_INTEGER).map((b) => personOf(b.wallet)));
  const okBy = new Map<string, number>();
  for (const a of att) if (a.outcome === "ok") okBy.set(a.wallet, (okBy.get(a.wallet) ?? 0) + a.n);
  const evBy = new Map(ev.map((e) => [e.wallet, e]));
  const problems: { wallet: string; issue: string }[] = [];
  for (const [wallet, n] of okBy) {
    const e = evBy.get(wallet);
    if (!e) problems.push({ wallet, issue: `${n} counted attempts but no points stored` });
    else if (e.n < n) problems.push({ wallet, issue: `${n} counted attempts, ${e.n} points rows` });
  }
  for (const e of ev) if (!onBoard.has(e.wallet) && !people.has(e.who)) problems.push({ wallet: e.wallet, issue: `${e.pts} points but not on the board` });
  const refused: Record<string, number> = {};
  for (const a of att) if (a.outcome !== "ok") refused[a.outcome] = (refused[a.outcome] ?? 0) + a.n;
  // everyone who signed in this week (the sign-in register keeps every wallet and Google id, never pruned)
  const since = Date.parse(`${weekStart(week)}T00:00:00Z`);
  const sd = sybilDb();
  const seen = (sd?.prepare("SELECT addr FROM seen WHERE last >= ?").all(since) as { addr: string }[] | undefined) ?? [];
  const earned = new Set(ev.map((e) => e.wallet));
  const noPoints = seen.filter((r) => /^0x[0-9a-f]{40}$/.test(r.addr) && !earned.has(r.addr)).length;
  return { week, signedIn: seen.length, signedInNoPoints: noPoints, wallets: ev.length, people: people.size, refused, problems };
}

/** An admin grants a checked report. Returns an error text, or null when the points were added. */
export function grant(admin: string, wallet: string, kind: ReportKind, note: string): string | null {
  const d = db();
  if (!d) return "The points store is not open.";
  const r = REPORTS[kind];
  if (!r) return "Unknown kind.";
  const w = wallet.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(w)) return "Give the wallet address.";
  if (isTeam(w)) return "Team wallets earn no points.";
  const n = note.trim().slice(0, 300);
  if (n.length < 5) return "Say what was reported.";
  const who = personOf(w), week = weekOf();
  if (r.week) {
    const used = (d.prepare("SELECT COUNT(*) AS n FROM events WHERE who = ? AND week = ? AND action = ?").get(who, week, `report:${kind}`) as { n: number }).n;
    if (used >= r.week) return `This person already has ${r.week} ${kind} reports this week.`;
  }
  d.exec("CREATE TABLE IF NOT EXISTS grants (id INTEGER PRIMARY KEY AUTOINCREMENT, admin TEXT NOT NULL, wallet TEXT NOT NULL, kind TEXT NOT NULL, pts REAL NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL)");
  const at = Date.now();
  d.prepare("INSERT INTO events (who, wallet, action, pts, day, week, ref, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(who, w, `report:${kind}`, r.pts, day(), week, `grant:${at}:${w}`, at);
  d.prepare("INSERT INTO grants (admin, wallet, kind, pts, note, at) VALUES (?, ?, ?, ?, ?, ?)").run(admin.toLowerCase(), w, kind, r.pts, n, at);
  seal();
  return null;
}
export const grants = (limit = 50) => {
  const d = db();
  try {
    return (d?.prepare("SELECT wallet, kind, pts, note, at FROM grants ORDER BY at DESC LIMIT ?").all(limit) as { wallet: string; kind: string; pts: number; note: string; at: number }[] | undefined) ?? [];
  } catch {
    return [];
  }
};

export function setNick(wallet: string, nick: string): string | null {
  const n = nick.trim();
  if (n === "") {
    db()?.prepare("UPDATE profiles SET nick = NULL, at = ? WHERE wallet = ?").run(Date.now(), wallet.toLowerCase());
    return null;
  }
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(n)) return "A nickname is 3 to 20 letters, digits, dots, dashes or underscores.";
  if (/corbel|admin|official|support|team|mod(erator)?/i.test(n)) return "That nickname could be mistaken for the team. Pick another.";
  const d = db();
  const last = d?.prepare("SELECT at FROM profiles WHERE wallet = ?").get(wallet.toLowerCase()) as { at: number } | undefined;
  if (last && Date.now() - last.at < 86_400_000) return "A nickname can change once a day.";
  const taken = d?.prepare("SELECT wallet FROM profiles WHERE nick = ? AND wallet != ?").get(n, wallet.toLowerCase());
  if (taken) return "That nickname is taken.";
  d?.prepare("INSERT INTO profiles (wallet, nick, at) VALUES (?, ?, ?) ON CONFLICT(wallet) DO UPDATE SET nick = excluded.nick, at = excluded.at").run(wallet.toLowerCase(), n, Date.now());
  return null;
}
export const nickOf = (wallet: string) => (db()?.prepare("SELECT nick FROM profiles WHERE wallet = ?").get(wallet.toLowerCase()) as { nick: string | null } | undefined)?.nick ?? null;

/** A live wallet: enough transactions on Robinhood Chain to have been used before (cached per process for an hour). */
const live = new Map<string, { at: number; ok: boolean }>();
export async function isLive(wallet: string): Promise<boolean> {
  const k = wallet.toLowerCase(), hit = live.get(k);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.ok;
  const c = getClient(process.env.RPC_URL);
  const n = c ? await c.getTransactionCount({ address: k as `0x${string}` }).catch(() => 0) : 0;
  const ok = n >= MIN_TXS;
  live.set(k, { at: Date.now(), ok });
  return ok;
}

/**
 * This week's board: one row per person, their best-known wallet, nickname, tier and points. Equal points rank by who
 * reached them first (the earlier last action wins), then by id, so the order, and the podium, never depends on chance.
 */
export function board(week = weekOf(), limit = 100) {
  const d = db();
  if (!d) return [];
  const rows = d.prepare("SELECT who, MAX(wallet) AS wallet, SUM(pts) AS pts, COUNT(*) AS actions, MAX(at) AS last FROM events WHERE week = ? GROUP BY who ORDER BY pts DESC, last ASC, who ASC LIMIT ?").all(week, limit) as { who: string; wallet: string; pts: number; actions: number }[];
  return rows.map((r, i) => ({ rank: i + 1, id: publicId(r.who), wallet: r.wallet, nick: nickOf(r.wallet), tier: tierOf(r.wallet)?.name ?? null, pts: Math.round(r.pts * 10) / 10, actions: r.actions }));
}
export function mine(wallet: string, week = weekOf()) {
  const d = db();
  if (!d) return null;
  const who = personOf(wallet);
  const r = d.prepare("SELECT COALESCE(SUM(pts),0) AS pts FROM events WHERE week = ? AND who = ?").get(week, who) as { pts: number };
  const above = (d.prepare("SELECT COUNT(*) AS n FROM (SELECT who, SUM(pts) AS p FROM events WHERE week = ? GROUP BY who) WHERE p > ?").get(week, r.pts) as { n: number }).n;
  const today = d.prepare("SELECT action, COUNT(*) AS n FROM events WHERE who = ? AND day = ? GROUP BY action").all(who, day()) as { action: string; n: number }[];
  return { id: publicId(who), pts: Math.round(r.pts * 10) / 10, rank: r.pts > 0 ? above + 1 : null, mult: multOf(wallet), nick: nickOf(wallet), today: Object.fromEntries(today.map((t) => [t.action, t.n])) };
}
export const holdDays = AI_ACCESS.holdDays;
