/**
 * Which AI tier a wallet has. Top holders (AI_ACCESS "full") open every model on offer.
 * - Wallets in ADMIN_WALLETS or TOP_WALLETS (server env, comma separated) are top holders by hand.
 * - With CORBEL_TOKEN set, the tier comes from the coins held: the lowest balance of the last AI_ACCESS.holdDays days
 *   (heldCoins). Without it every other wallet keeps the open beta limits.
 */
import { AI_ACCESS, TOKEN, aiTier, type AiTier, hasFull } from "@corbel/config";
import { sybilDb } from "./sybil";

const list = (v: string | undefined) => new Set((v ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
const FULL = AI_ACCESS.tiers.find((t) => t.id === "full")!;
const LOCKER = TOKEN.locker.toLowerCase();

export function tierOf(address: string | null | undefined): AiTier | null {
  if (!address) return null;
  const a = address.toLowerCase();
  if (list(process.env.ADMIN_WALLETS).has(a) || list(process.env.TOP_WALLETS).has(a)) return FULL;
  return process.env.CORBEL_TOKEN ? aiTier(heldCoins(a) + lockedCoins(a)) : null;
}

/**
 * The lowest balance this wallet had over the last AI_ACCESS.holdDays days, from the token's transfers indexed by the
 * linker (every transfer since CORBEL_TOKEN_FROM). Walks back from today's balance, undoing each transfer in the
 * window. A wallet that held nothing at some moment of the window holds 0 for this purpose.
 */
export function heldCoins(address: string): number {
  const db = sybilDb();
  if (!db) return 0;
  const a = address.toLowerCase();
  const sum = (col: "src" | "dst") => (db.prepare(`SELECT COALESCE(SUM(val),0) AS v FROM xfer WHERE ${col} = ?`).get(a) as { v: number }).v;
  let bal = sum("dst") - sum("src");
  let low = bal;
  const since = Date.now() - AI_ACCESS.holdDays * 86_400_000;
  const moves = db.prepare("SELECT src, dst, val FROM xfer WHERE (src = ? OR dst = ?) AND at >= ? ORDER BY block DESC, li DESC").all(a, a, since) as { src: string; dst: string; val: number }[];
  for (const m of moves) {
    if (m.dst === a) bal -= m.val;
    if (m.src === a) bal += m.val;
    low = Math.min(low, bal);
  }
  // the window reaches back before the token existed: the balance then was zero
  const first = db.prepare("SELECT MIN(at) AS t FROM xfer").get() as { t: number | null };
  if (first.t == null || first.t > since) low = Math.min(low, 0);
  return Math.max(0, low);
}

/**
 * $CORBEL this wallet has locked on HoodLock and not taken back: what it sent to the locker minus what the locker sent
 * it, from the same indexed transfers. Locked coins cannot move, so they count toward the tier in full; the free
 * balance still counts by its lowest point of the window (heldCoins).
 */
export function lockedCoins(address: string): number {
  const db = sybilDb();
  if (!db) return 0;
  const a = address.toLowerCase();
  const v = (src: string, dst: string) => (db.prepare("SELECT COALESCE(SUM(val),0) AS v FROM xfer WHERE src = ? AND dst = ?").get(src, dst) as { v: number }).v;
  return Math.max(0, v(a, LOCKER) - v(LOCKER, a));
}

export const isTop = (address: string | null | undefined) => hasFull(tierOf(address));

/** Admin wallets test models for the owner: no per-wallet counts or credit cap (the site's daily budget still holds). */
export const isAdmin = (address: string | null | undefined) => !!address && list(process.env.ADMIN_WALLETS).has(address.toLowerCase());
