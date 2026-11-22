/**
 * Backtest of an exit rule on one pool's own swaps (as /api/market returns them: price per token in the pool's base,
 * time in seconds, newest first). The agent enters at the first swap of every `everyH` hours while it holds nothing,
 * and leaves at the first swap that reaches the take-profit or the stop, or when `holdH` hours have passed; a trade
 * still open at the end is marked at the last price. Each round trip pays `costPct` (pool fees on both sides).
 * Results compound one position at a time. This is the pool's real record, not a model of it.
 */
export type Swap = { t: number; price: number; side?: string };
export type Rule = { tpPct: number; slPct: number; holdH: number; everyH: number; costPct?: number };
export type BtTrade = { inT: number; outT: number; inPrice: number; outPrice: number; ret: number; why: "take profit" | "stop" | "time" | "open" };
export type BtResult = { trades: BtTrade[]; totalRet: number; winRate: number | null; maxDrawdown: number; spanH: number; swaps: number };

export function backtest(newestFirst: Swap[], r: Rule): BtResult {
  const s = newestFirst.filter((x) => x.price > 0 && Number.isFinite(x.price)).sort((a, b) => a.t - b.t);
  const cost = (r.costPct ?? 0.6) / 100;
  const trades: BtTrade[] = [];
  if (s.length < 2) return { trades, totalRet: 0, winRate: null, maxDrawdown: 0, spanH: 0, swaps: s.length };
  const t0 = s[0]!.t, step = Math.max(0.25, r.everyH) * 3600;
  let i = 0;
  let nextSlot = t0;
  while (i < s.length) {
    // the first swap at or after the next entry slot
    while (i < s.length && s[i]!.t < nextSlot) i++;
    if (i >= s.length) break;
    const inS = s[i]!;
    const tp = inS.price * (1 + r.tpPct / 100), sl = inS.price * (1 - r.slPct / 100), until = inS.t + r.holdH * 3600;
    let j = i + 1;
    let why: BtTrade["why"] = "open";
    for (; j < s.length; j++) {
      const p = s[j]!.price;
      if (p >= tp) { why = "take profit"; break; }
      if (p <= sl) { why = "stop"; break; }
      if (s[j]!.t >= until) { why = "time"; break; }
    }
    const outS = s[Math.min(j, s.length - 1)]!;
    trades.push({ inT: inS.t, outT: outS.t, inPrice: inS.price, outPrice: outS.price, ret: outS.price / inS.price - 1 - cost, why });
    if (why === "open") break;
    i = j + 1;
    // the next entry: the next slot after this exit
    nextSlot = t0 + Math.ceil((outS.t - t0 + 1) / step) * step;
  }
  let eq = 1, peak = 1, maxDd = 0;
  for (const t of trades) {
    eq *= 1 + t.ret;
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, 1 - eq / peak);
  }
  const closed = trades.filter((t) => t.why !== "open");
  return { trades, totalRet: eq - 1, winRate: closed.length ? closed.filter((t) => t.ret > 0).length / closed.length : null, maxDrawdown: maxDd, spanH: (s[s.length - 1]!.t - t0) / 3600, swaps: s.length };
}
