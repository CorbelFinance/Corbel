/**
 * Owner's panel · Sign-ins: who has signed in, newest first. Each row is a wallet address (public on chain) or a
 * Google sign-in, which is only a keyed hash: no e-mail, no name, no IP. "seen" is written on every sign-in and paid use,
 * so `first` is the first sign-in and `last` the latest activity.
 */
import { aiTier } from "@corbel/config";
import { heldCoins } from "./tiers";
import { sybilDb } from "./sybil";

export type Signup = { who: string; kind: "wallet" | "google"; first: number; last: number; coins: number | null; tier: string | null };

const DAY = 86_400_000;

export function listSignups(limit = 300): { total: number; today: number; week: number; rows: Signup[] } {
  const d = sybilDb();
  if (!d) return { total: 0, today: 0, week: 0, rows: [] };
  const start = new Date().setUTCHours(0, 0, 0, 0);
  const n = (sql: string, ...a: number[]) => (d.prepare(sql).get(...a) as { n: number }).n;
  const raw = d.prepare("SELECT addr, first, last FROM seen ORDER BY first DESC LIMIT ?").all(limit) as { addr: string; first: number; last: number }[];
  const token = !!process.env.CORBEL_TOKEN;
  const rows = raw.map((r) => {
    const wallet = /^0x[0-9a-f]{40}$/.test(r.addr);
    const coins = wallet && token ? Math.round(heldCoins(r.addr)) : null;
    return { who: wallet ? r.addr : r.addr.replace(/^google:/, "").slice(0, 10), kind: wallet ? ("wallet" as const) : ("google" as const), first: r.first, last: r.last, coins, tier: coins == null ? null : (aiTier(coins)?.name ?? null) };
  });
  return {
    total: n("SELECT COUNT(*) AS n FROM seen"),
    today: n("SELECT COUNT(*) AS n FROM seen WHERE first >= ?", start),
    week: n("SELECT COUNT(*) AS n FROM seen WHERE first >= ?", Date.now() - 7 * DAY),
    rows,
  };
}
