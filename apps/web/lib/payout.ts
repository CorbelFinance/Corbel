/**
 * Freezing a finished week's payout. The draw seed is the hash of the first block at or after the week's end (Monday
 * 00:00 UTC), found by searching block timestamps; nobody knew it while the week ran. The list built from it (lib/
 * dropList) is saved once and never rebuilt, so what the project multisig posts on chain and what everyone can read
 * are the same. The on-chain round number is the ISO week as YYYYWW (2026-W48 → 202648).
 */
import { getClient } from "@corbel/data/chain";
import type { Hex } from "viem";
import { weekList } from "./dropList";
import { store } from "./store";

const db = () => store("payouts", "CREATE TABLE IF NOT EXISTS weeks (week TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL);");

/** Monday 00:00 UTC that ends an ISO week like 2026-W48, in unix seconds. */
export function weekEnd(week: string): number {
  const [y, w] = week.split("-W").map(Number) as [number, number];
  const jan4 = Date.UTC(y, 0, 4);
  const mondayW1 = jan4 - (((new Date(jan4).getUTCDay() + 6) % 7) * 86_400_000);
  return (mondayW1 + w * 7 * 86_400_000) / 1000;
}
export const roundOf = (week: string) => Number(week.replace("-W", ""));

/** The first block whose timestamp is at or after `ts`: a binary search over block numbers (headers only). */
export async function firstBlockAfter(ts: number): Promise<{ number: bigint; hash: Hex; timestamp: number } | null> {
  const c = getClient(process.env.RPC_URL);
  if (!c) return null;
  const head = await c.getBlock();
  if (Number(head.timestamp) < ts) return null;
  let lo = 0n, hi = head.number;
  // start near the answer: the chain runs about 9 blocks a second
  const guess = head.number - BigInt(Math.max(0, Math.floor((Number(head.timestamp) - ts) * 9)));
  lo = guess > 200_000n ? guess - 200_000n : 0n;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const b = await c.getBlock({ blockNumber: mid });
    if (Number(b.timestamp) >= ts) hi = mid;
    else lo = mid + 1n;
  }
  const b = await c.getBlock({ blockNumber: lo });
  if (lo > 0n && Number((await c.getBlock({ blockNumber: lo - 1n })).timestamp) >= ts) return null; // the guess undershot; refuse rather than guess
  return { number: b.number, hash: b.hash, timestamp: Number(b.timestamp) };
}

export type Frozen = Awaited<ReturnType<typeof weekList>> & { round: number; seedBlock: string; endsAt: number; frozenAt: number };

/** The frozen list of a finished week: built once from its seed block, then always read back unchanged. */
export async function frozenWeek(week: string): Promise<Frozen | { pending: string }> {
  const saved = db()?.prepare("SELECT json FROM weeks WHERE week = ?").get(week) as { json: string } | undefined;
  if (saved) return JSON.parse(saved.json) as Frozen;
  const end = weekEnd(week);
  if (Date.now() / 1000 < end + 120) return { pending: `The week ends ${new Date(end * 1000).toISOString().replace(".000Z", "Z")}; the list is drawn from the first block after it.` };
  const seed = await firstBlockAfter(end);
  if (!seed) return { pending: "The seed block could not be read yet. Try again in a minute." };
  const l = await weekList(week, seed.hash);
  const out: Frozen = { ...l, round: roundOf(week), seedBlock: seed.number.toString(), endsAt: end, frozenAt: Date.now() };
  db()?.prepare("INSERT OR IGNORE INTO weeks (week, json, at) VALUES (?, ?, ?)").run(week, JSON.stringify(out), Date.now());
  return out;
}
