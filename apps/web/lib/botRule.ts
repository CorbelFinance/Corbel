/**
 * Which wallets trade like bots, by one stated rule shared by Human vs bot volume (/api/bots) and the reward points:
 * more than BOT_SWAPS swaps in the last day, or a median gap under BOT_GAP_S seconds between its swaps once it has made
 * at least 5. Read from the swaps the whales snapshot already holds (signed swaps only); the set is kept 5 minutes.
 */
import { loadSnap } from "./snapshot";

export const BOT_SWAPS = 50;
export const BOT_GAP_S = 60;

type Swap = { t: number; from?: string };
let cached: { at: number; set: Set<string> } | null = null;

/** The wallets the rule marks as bots today. Empty when the snapshot is missing: nobody is marked without data. */
export function botWallets(): Set<string> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.set;
  const s = loadSnap<{ at: number; rows: Swap[] }>("whales");
  const by = new Map<string, number[]>();
  for (const r of s?.rows ?? []) {
    if (!r.from) continue;
    const w = r.from.toLowerCase();
    (by.get(w) ?? by.set(w, []).get(w)!).push(r.t);
  }
  const set = new Set<string>();
  for (const [w, ts] of by) {
    ts.sort((a, b) => a - b);
    const gaps = ts.slice(1).map((t, i) => t - ts[i]!).sort((a, b) => a - b);
    const median = gaps.length ? gaps[Math.floor(gaps.length / 2)]! : Infinity;
    if (ts.length > BOT_SWAPS || (ts.length >= 5 && median < BOT_GAP_S)) set.add(w);
  }
  cached = { at: Date.now(), set };
  return set;
}

export const isBotWallet = (w: string) => botWallets().has(w.toLowerCase());
