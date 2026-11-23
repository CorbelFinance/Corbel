/**
 * Holders vote on what ships first. Each week a holder signs one message (EIP-712, no gas, nothing moves) naming one
 * roadmap item still to build. Weight = the square root of the coins that set the tier (lowest balance of the last week
 * plus coins locked on HoodLock), capped at the square root of CAP_COINS, so a big holder counts more but cannot outvote
 * everyone. Wallets the linker found to belong to one person vote once together; a new vote in the same week replaces
 * the old one. The tally is public. Results guide the order; the team says up front which items are binding.
 */
import { recoverTypedDataAddress, type Hex } from "viem";
import { ROAD_ITEMS } from "@corbel/config";
import { limitKey } from "./sybil";
import { store } from "./store";
import { heldCoins, lockedCoins } from "./tiers";

export const CAP_COINS = 10_000_000;
export const DOMAIN = { name: "Corbel vote", version: "1", chainId: 4663 } as const;
export const TYPES = { Vote: [{ name: "week", type: "string" }, { name: "item", type: "string" }] } as const;

const db = () => store("votes", "CREATE TABLE IF NOT EXISTS votes (week TEXT NOT NULL, voter_key TEXT NOT NULL, voter TEXT NOT NULL, item TEXT NOT NULL, weight REAL NOT NULL, sig TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (week, voter_key));");

/** ISO week of a time, e.g. 2026-W48 (weeks start Monday, UTC). */
export function weekOf(t = Date.now()): string {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const first = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4));
  const n = 1 + Math.round(((thu.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${thu.getUTCFullYear()}-W${String(n).padStart(2, "0")}`;
}

/** What can be voted on: every roadmap item still being built or planned. */
export const options = () => ROAD_ITEMS.filter((i) => i.stage === "next" || i.stage === "later").map((i) => ({ title: i.title, block: i.block, stage: i.stage }));

export const weightOf = (coins: number) => Math.sqrt(Math.max(0, Math.min(coins, CAP_COINS)));

export async function castVote(voter: Hex, item: string, signature: Hex): Promise<{ weight: number } | { error: string }> {
  if (!options().some((o) => o.title === item)) return { error: "That item is not on the ballot." };
  const week = weekOf();
  const signer = await recoverTypedDataAddress({ domain: DOMAIN, types: TYPES, primaryType: "Vote", message: { week, item }, signature }).catch(() => null);
  if (!signer || signer.toLowerCase() !== voter.toLowerCase()) return { error: "The signature is not from this wallet, or it is for another week." };
  const a = voter.toLowerCase();
  const w = weightOf(heldCoins(a) + lockedCoins(a));
  if (w <= 0) return { error: "Votes are weighted by $CORBEL held through the last week; this wallet held none." };
  const key = limitKey(a).gid ?? a;
  db()?.prepare("INSERT INTO votes (week, voter_key, voter, item, weight, sig, at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(week, voter_key) DO UPDATE SET voter = excluded.voter, item = excluded.item, weight = excluded.weight, sig = excluded.sig, at = excluded.at").run(week, key, a, item, w, signature, Date.now());
  return { weight: w };
}

export function tally(week = weekOf()): { week: string; items: { item: string; weight: number; voters: number }[]; voters: number } {
  const rows = (db()?.prepare("SELECT item, SUM(weight) AS weight, COUNT(*) AS voters FROM votes WHERE week = ? GROUP BY item ORDER BY weight DESC").all(week) as { item: string; weight: number; voters: number }[] | undefined) ?? [];
  return { week, items: rows, voters: rows.reduce((a, r) => a + r.voters, 0) };
}

export const myVote = (voter: string, week = weekOf()) => (db()?.prepare("SELECT item, weight FROM votes WHERE week = ? AND voter_key = ?").get(week, limitKey(voter.toLowerCase()).gid ?? voter.toLowerCase()) as { item: string; weight: number } | undefined) ?? null;
