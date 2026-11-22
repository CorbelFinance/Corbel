/**
 * The prop desk's evaluation: a paper account traded against a tier's rules. Equity counts closed results only (each
 * sell's profit or loss against its average cost; open positions sit at what they cost), so a pass can't rest on a
 * paper gain nobody took. A breach of the drawdown floor or the day's loss limit ends the run at once; a pass needs
 * the profit target and the minimum number of trading days, with no breach.
 */
import type { Book } from "./practice";

export type PropTier = { id: string; label: string; target: number; maxDrawdown: number; dailyLoss: number; minDays: number; maxPosition: number };

export const PROP_TIERS: PropTier[] = [
  { id: "starter", label: "Starter", target: 0.08, maxDrawdown: 0.06, dailyLoss: 0.03, minDays: 5, maxPosition: 0.25 },
  { id: "pro", label: "Pro", target: 0.1, maxDrawdown: 0.05, dailyLoss: 0.025, minDays: 10, maxPosition: 0.2 },
];

export type PropRun = {
  status: "empty" | "running" | "passed" | "failed";
  why: string | null;
  equity: number;
  peak: number;
  profit: number;
  drawdown: number;
  worstDay: { day: string; loss: number } | null;
  days: number;
  oversized: number;
  curve: { at: number; equity: number }[];
};

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

export function evaluate(book: Book, tier: PropTier): PropRun {
  const start = book.start;
  const trades = [...book.trades].sort((a, b) => a.at - b.at);
  if (!trades.length) return { status: "empty", why: null, equity: start, peak: start, profit: 0, drawdown: 0, worstDay: null, days: 0, oversized: 0, curve: [] };
  let equity = start, peak = start, maxDd = 0, breach: string | null = null;
  const byDay = new Map<string, number>();
  const days = new Set<string>();
  const curve: { at: number; equity: number }[] = [{ at: trades[0]!.at, equity: start }];
  let oversized = 0;
  for (const t of trades) {
    days.add(dayOf(t.at));
    if (t.side === "buy" && t.usd > tier.maxPosition * start) oversized++;
    if (t.side !== "sell" || t.pnl == null) continue;
    equity += t.pnl;
    peak = Math.max(peak, equity);
    const dd = (peak - equity) / start;
    maxDd = Math.max(maxDd, dd);
    const d = dayOf(t.at);
    byDay.set(d, (byDay.get(d) ?? 0) + t.pnl);
    curve.push({ at: t.at, equity });
    if (!breach && dd >= tier.maxDrawdown) breach = `Fell ${(dd * 100).toFixed(1)}% below the peak, past the ${(tier.maxDrawdown * 100).toFixed(0)}% floor`;
    if (!breach && (byDay.get(d) ?? 0) <= -tier.dailyLoss * start) breach = `Lost ${(((-(byDay.get(d) ?? 0)) / start) * 100).toFixed(1)}% on ${d}, past the ${(tier.dailyLoss * 100).toFixed(1)}% day limit`;
  }
  const worst = [...byDay.entries()].sort((a, b) => a[1] - b[1])[0];
  const worstDay = worst && worst[1] < 0 ? { day: worst[0], loss: -worst[1] } : null;
  const profit = (equity - start) / start;
  const base = { equity, peak, profit, drawdown: maxDd, worstDay, days: days.size, oversized, curve };
  if (breach) return { status: "failed", why: breach, ...base };
  if (profit >= tier.target && days.size >= tier.minDays) return { status: "passed", why: null, ...base };
  return { status: "running", why: null, ...base };
}
