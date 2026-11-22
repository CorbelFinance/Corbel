/**
 * Habits read from the user's own practice record, not from a questionnaire. Four patterns, each with the trades that
 * show it, what those trades did, and a rule against it. A rule is marked by who enforces it: the mandate contract
 * (refused on chain, the bond pays) or the agent itself (it follows the rule; the contract does not know it).
 *
 *   panic sell    a sell at a loss within PANIC_H hours of the buy it closes
 *   revenge trade a buy within REVENGE_MIN minutes after a sell at a loss
 *   oversizing    a buy larger than OVERSIZE times the median buy
 *   red flags     a buy of a token the check flagged at the time
 */
import type { Trade } from "./practice";

export const PANIC_H = 2;
export const REVENGE_MIN = 30;
export const OVERSIZE = 2;

export type HabitId = "panic" | "revenge" | "oversize" | "flags";
export type Habit = {
  id: HabitId;
  label: string;
  count: number;
  /** share of the trades it could apply to */
  share: number;
  trades: Trade[];
  /** realized paper result of those trades (sells) or of the sells that closed them (buys), when known */
  result: number | null;
  rule: string;
  enforcedBy: "contract" | "agent";
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** The sells that closed a buy: the next sells of the same token after it. */
function closingSells(buy: Trade, inOrder: Trade[]) {
  return inOrder.filter((t) => t.side === "sell" && t.token === buy.token && t.at > buy.at);
}

export function readHabits(newestFirst: Trade[]): Habit[] {
  const inOrder = [...newestFirst].sort((a, b) => a.at - b.at);
  const buys = inOrder.filter((t) => t.side === "buy");
  const sells = inOrder.filter((t) => t.side === "sell");
  const out: Habit[] = [];
  const sum = (xs: Trade[]) => (xs.some((t) => t.pnl != null) ? xs.reduce((s, t) => s + (t.pnl ?? 0), 0) : null);

  // panic: a losing sell soon after the last buy of that token
  const panic = sells.filter((s) => {
    if ((s.pnl ?? 0) >= 0) return false;
    const last = [...buys].reverse().find((b) => b.token === s.token && b.at < s.at);
    return !!last && s.at - last.at <= PANIC_H * 3600_000;
  });
  out.push({ id: "panic", label: "Panic sell", count: panic.length, share: sells.length ? panic.length / sells.length : 0, trades: panic, result: sum(panic), rule: `Hold at least ${PANIC_H} h unless the token check turns red`, enforcedBy: "agent" });

  // revenge: a buy right after a losing sell
  const losses = sells.filter((s) => (s.pnl ?? 0) < 0);
  const revenge = buys.filter((b) => losses.some((l) => b.at > l.at && b.at - l.at <= REVENGE_MIN * 60_000));
  const revengeClosed = revenge.flatMap((b) => closingSells(b, inOrder).slice(0, 1));
  out.push({ id: "revenge", label: "Revenge trade", count: revenge.length, share: buys.length ? revenge.length / buys.length : 0, trades: revenge, result: sum(revengeClosed), rule: `Wait ${REVENGE_MIN} min between trades`, enforcedBy: "contract" });

  // oversizing: well above the usual size
  const med = median(buys.map((b) => b.usd));
  const big = med > 0 ? buys.filter((b) => b.usd > OVERSIZE * med) : [];
  const bigClosed = big.flatMap((b) => closingSells(b, inOrder).slice(0, 1));
  out.push({ id: "oversize", label: "Oversizing", count: big.length, share: buys.length ? big.length / buys.length : 0, trades: big, result: sum(bigClosed), rule: `Cap a trade at $${Math.ceil(med * 1.5).toLocaleString("en-US")} (one and a half times your usual buy)`, enforcedBy: "contract" });

  // red flags: bought what the check flagged
  const flagged = buys.filter((b) => b.fails?.length);
  const flaggedClosed = flagged.flatMap((b) => closingSells(b, inOrder).slice(0, 1));
  out.push({ id: "flags", label: "Buying red flags", count: flagged.length, share: buys.length ? flagged.length / buys.length : 0, trades: flagged, result: sum(flaggedClosed), rule: "Skip a token while the check shows a red flag", enforcedBy: "agent" });

  return out;
}
