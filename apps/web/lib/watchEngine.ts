/**
 * Watchlist re-checks and alerts. Every SWEEP_MS the tokens on anyone's watchlist are checked again with the same
 * report the token check runs, and compared with the last snapshot. What changed for the worse becomes an event:
 *   check     a check got worse (pass → caution or fail, caution → fail), with the new finding
 *   liquidity the pool's depth fell by half or more since the last look
 *   ticker    another contract started using the same ticker (a lookalike)
 *   drain     a watched wallet lost half or more of its ETH, WETH or USDG since the last look (the drain alarm)
 * Events are kept on disk (the last EVENTS_KEPT); a wallet's feed is the events of the tokens it watches. Nothing about
 * the wallet is sent anywhere; Telegram delivery, when configured, goes through lib/telegram.
 */
import { holderOk } from "./holderGate";
import { asBackground, buildReport, getClient, readMid, readWallet, redact } from "@corbel/data/chain";
import { creatorRecord, launchCreator, launchTx, launcherHistory, poolLauncher, sameTicker, v4PoolsFor } from "@corbel/indexer";
import { store } from "./store";
import { walletsWatchedBy, watchedAddresses, watchedBy, watchedTokens } from "./watchlist";
import { HELD, drainFor } from "@corbel/config";
import { tierOf } from "./tiers";

export const SWEEP_MS = 15 * 60_000;
const MAX_TOKENS = 40;
const EVENTS_KEPT = 2000;
const RANK: Record<string, number> = { pass: 0, unknown: 1, warn: 1, fail: 2 };

export type WatchEvent = { id: number; token: string; symbol: string; kind: "check" | "liquidity" | "ticker" | "drain"; text: string; at: number };
type Snap = { symbol: string; checks: Record<string, { result: string; name: string }>; liquidity: number | null; twins: number | null };

const db = () =>
  store(
    "watchengine",
    `CREATE TABLE IF NOT EXISTS snap (token TEXT PRIMARY KEY, at INTEGER NOT NULL, data TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL, symbol TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);
     CREATE INDEX IF NOT EXISTS events_token ON events(token, at);`,
  );

const G = globalThis as unknown as { __corbelWatch?: { timer: ReturnType<typeof setInterval> | null; busy: boolean; last: number; listeners: ((e: WatchEvent) => void)[] } };
const st = (G.__corbelWatch ??= { timer: null, busy: false, last: 0, listeners: [] });

/** Called with every new event (lib/telegram subscribes to send them). */
export function onWatchEvent(fn: (e: WatchEvent) => void) {
  st.listeners.push(fn);
}

/** What changed for the worse between two snapshots. Pure, for tests. */
export function diffSnaps(prev: Snap, next: Snap): { kind: WatchEvent["kind"]; text: string }[] {
  const out: { kind: WatchEvent["kind"]; text: string }[] = [];
  for (const [id, c] of Object.entries(next.checks)) {
    const was = prev.checks[id];
    if (was && (RANK[c.result] ?? 1) > (RANK[was.result] ?? 1)) out.push({ kind: "check", text: `${c.name} went from ${was.result === "warn" ? "caution" : was.result} to ${c.result === "warn" ? "caution" : c.result}.` });
  }
  if (prev.liquidity && next.liquidity !== null && next.liquidity <= prev.liquidity / 2)
    out.push({ kind: "liquidity", text: `Pool depth fell from $${Math.round(prev.liquidity).toLocaleString("en-US")} to $${Math.round(next.liquidity).toLocaleString("en-US")}.` });
  if (prev.twins !== null && next.twins !== null && next.twins > prev.twins) out.push({ kind: "ticker", text: `${next.twins - prev.twins} new contract${next.twins - prev.twins === 1 ? "" : "s"} now use${next.twins - prev.twins === 1 ? "s" : ""} the ticker ${next.symbol}.` });
  return out;
}

async function look(token: string, label: string): Promise<Snap | null> {
  const client = getClient(process.env.RPC_URL);
  if (!client) return null;
  const r = await buildReport(client, token as `0x${string}`, token, { v4PoolsFor, launcherHistory, sameTicker, poolLauncher, launchCreator, creatorRecord, launchTx });
  const mid = await readMid(client, token as `0x${string}`).catch(() => null);
  const symbol = r.meta?.symbol ?? label ?? token.slice(0, 8);
  return {
    symbol,
    checks: Object.fromEntries(r.checks.map((c) => [c.id, { result: c.result, name: c.name }])),
    liquidity: mid?.liquidity ?? null,
    twins: r.meta?.symbol ? sameTicker(r.meta.symbol, token) : null,
  };
}

/** Funds that left a wallet: each of ETH, WETH and USDG that fell by half or more. Pure, for tests. */
export function diffWallet(prev: Record<string, number>, next: Record<string, number>): string[] {
  return Object.entries(prev)
    .filter(([k, v]) => v > 0 && (next[k] ?? 0) <= v / 2)
    .map(([k, v]) => `Funds left: ${k} ${v.toLocaleString("en-US", { maximumFractionDigits: 4 })} → ${(next[k] ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}.`);
}

function emit(token: string, symbol: string, kind: WatchEvent["kind"], text: string): number {
  const d = db()!;
  const now = Date.now();
  const res = d.prepare("INSERT INTO events (token, symbol, kind, text, at) VALUES (?, ?, ?, ?, ?)").run(token, symbol, kind, text, now);
  const ev: WatchEvent = { id: Number(res.lastInsertRowid), token, symbol, kind, text, at: now };
  for (const fn of st.listeners) {
    try {
      fn(ev);
    } catch {
      /* a listener never stops the sweep */
    }
  }
  return 1;
}

/** One pass over the watched tokens. Never runs twice at once. */
export async function sweepWatch(): Promise<number> {
  if (st.busy) return 0;
  const d = db();
  if (!d) return 0;
  st.busy = true;
  let made = 0;
  try {
    for (const w of watchedTokens(MAX_TOKENS)) {
      const token = w.token.toLowerCase();
      const next = await look(token, w.label).catch((e) => (console.error("[watch]", redact(e)), null));
      if (!next) continue;
      const row = d.prepare("SELECT data FROM snap WHERE token = ?").get(token) as { data: string } | undefined;
      const now = Date.now();
      if (row) {
        for (const e of diffSnaps(JSON.parse(row.data) as Snap, next)) made += emit(token, next.symbol, e.kind, e.text);
      }
      d.prepare("INSERT INTO snap (token, at, data) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET at = excluded.at, data = excluded.data").run(token, now, JSON.stringify(next));
    }
    // watched wallets: the drain alarm compares the base balances with the last look
    const client = getClient(process.env.RPC_URL);
    for (const w of client && !HELD.drain ? watchedAddresses(MAX_TOKENS, (owner) => (holderOk(owner, "drain") ? drainFor(tierOf(owner)) : false)) : []) {
      const r = await readWallet(client!, w as `0x${string}`).catch(() => null);
      if (!r) continue;
      const next = Object.fromEntries(r.balances.map((b) => [b.symbol, Number(b.value)]));
      const row = d.prepare("SELECT data FROM snap WHERE token = ?").get(`w:${w}`) as { data: string } | undefined;
      if (row) for (const text of diffWallet(JSON.parse(row.data) as Record<string, number>, next)) made += emit(w, `${w.slice(0, 6)}…${w.slice(-4)}`, "drain", text);
      d.prepare("INSERT INTO snap (token, at, data) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET at = excluded.at, data = excluded.data").run(`w:${w}`, Date.now(), JSON.stringify(next));
    }
    d.exec(`DELETE FROM events WHERE id <= (SELECT MAX(id) - ${EVENTS_KEPT} FROM events)`);
    st.last = Date.now();
  } finally {
    st.busy = false;
  }
  return made;
}

/** Starts the sweep timer once per process; the first pass runs in the background right away. */
export function startWatchSweep() {
  if (st.timer || !process.env.CHAIN_READS) return;
  st.timer = setInterval(() => void asBackground(sweepWatch), SWEEP_MS);
  st.timer.unref?.();
  void asBackground(sweepWatch);
}

/** A wallet's alert feed: events of the tokens it watches, newest first, and when the tokens were last checked. */
export function feedOf(owner: string, limit = 50): { events: WatchEvent[]; checkedAt: number | null; watching: number } {
  const d = db();
  const tokens = [...watchedBy(owner), ...walletsWatchedBy(owner)];
  if (!d || !tokens.length) return { events: [], checkedAt: null, watching: tokens.length };
  const q = tokens.map(() => "?").join(",");
  const events = d.prepare(`SELECT id, token, symbol, kind, text, at FROM events WHERE token IN (${q}) ORDER BY at DESC LIMIT ?`).all(...tokens, limit) as WatchEvent[];
  const c = d.prepare(`SELECT MAX(at) AS at FROM snap WHERE token IN (${q}) OR token IN (${q.split(",").map(() => "?").join(",")})`).get(...tokens, ...tokens.map((t) => `w:${t}`)) as { at: number | null };
  return { events, checkedAt: c.at, watching: tokens.length };
}
