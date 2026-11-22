"use client";

/**
 * Agents · Learn. Your agent learns from how you practise. From your practice trades it drafts the rules a
 * mandate contract would enforce (the assets you trade, a size per trade, a daily budget, the slippage you accepted,
 * the hours you trade, weekdays or not, and whether to skip tokens the check flagged), then replays your own trades
 * against that draft: which it would have let through, which it would have refused and why, and what your results were
 * on each side. Teach, check, then deploy: the draft becomes a real mandate in the Mandate tab.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument, Led, Verdict } from "./kit";
import { TAGS, TEACH_AT, loadBook, syncBook, type Book, type Trade } from "@/lib/practice";
import { readHabits } from "@/lib/habits";
import { AgentBacktest } from "./AgentBacktest";
import { AgentTriggers } from "./AgentTriggers";

/** The habits the record shows, each with a rule against it and who enforces that rule. */
function Habits({ trades }: { trades: Trade[] }) {
  const hs = readHabits(trades);
  const seen = hs.filter((h) => h.count > 0);
  return (
    <Instrument code="G-62" title="Your habits, from the record" status={<Led tone={seen.length ? "bad" : "on"} label={seen.length ? `${seen.length} found` : "none found yet"} />} foot={<span>Read from your practice trades only. A contract rule is refused on chain; an agent rule is one your agent follows.</span>}>
      <ul className="divide-y divide-line">
        {hs.map((h) => (
          <li key={h.id} className="grid gap-2 px-4 py-3 text-[13.5px] sm:grid-cols-[9rem_6rem_minmax(0,1fr)]">
            <span className={cx("font-semibold", h.count ? "text-text" : "text-muted")}>{h.label}</span>
            <span className="font-mono text-[12.5px]">
              <span className={h.count ? "text-flesh" : "text-muted"}>{h.count ? `${h.count}×` : "not seen"}</span>
              {h.result != null && h.count > 0 && <span className={cx("block", h.result >= 0 ? "text-leaf" : "text-flesh")}>{`${h.result >= 0 ? "+" : "−"}${usd(Math.abs(h.result))}`}</span>}
            </span>
            <span className="text-muted">
              {h.count ? h.rule : "Nothing to fix here yet."}
              {h.count > 0 && <span className={cx("ml-2 rounded-md border px-1.5 py-0.5 font-mono text-[11.5px]", h.enforcedBy === "contract" ? "border-leaf/40 text-leaf" : "border-line text-muted")}>{h.enforcedBy === "contract" ? "contract rule" : "agent rule"}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Instrument>
  );
}

type Draft = {
  assets: { token: string; symbol: string; n: number }[];
  perTrade: number;
  perDay: number;
  slippageBps: number;
  hours: [number, number] | null;
  weekdaysOnly: boolean;
  skipFlags: boolean;
  style: { label: string; share: number }[];
  why: { flagsLost: number | null; cleanLost: number | null };
};
type Verdict = { t: Trade; ok: boolean; rule: string | null };

const nice = (n: number) => {
  if (n <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / (p / 2)) * (p / 2);
};
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const quant = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]!;
};
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** What the trades say, as rules a mandate can enforce. */
function draft(trades: Trade[]): Draft {
  const buys = trades.filter((t) => t.side === "buy");
  const by = new Map<string, { symbol: string; n: number }>();
  for (const t of buys) by.set(t.token, { symbol: t.symbol, n: (by.get(t.token)?.n ?? 0) + 1 });
  const assets = [...by.entries()].map(([token, v]) => ({ token, ...v })).sort((a, b) => b.n - a.n).slice(0, 8);
  const perTrade = nice(quant(buys.map((t) => t.usd), 0.9));
  const days = new Map<string, number>();
  for (const t of buys) days.set(dayOf(t.at), (days.get(dayOf(t.at)) ?? 0) + t.usd);
  const perDay = nice(Math.max(perTrade, ...days.values()) * 1.2);
  const imp = trades.map((t) => t.impact).filter((x): x is number => x != null);
  const slippageBps = Math.max(50, Math.min(1000, Math.ceil((quant(imp, 0.9) * 1.25 * 10_000) / 25) * 25));
  const hrs = trades.map((t) => new Date(t.at).getUTCHours());
  const lo = quant(hrs, 0.05), hi = quant(hrs, 0.95);
  const hours: [number, number] | null = hi - lo >= 16 ? null : [lo, Math.min(24, hi + 1)];
  const weekdaysOnly = trades.length >= 10 && !trades.some((t) => [0, 6].includes(new Date(t.at).getUTCDay()));
  // a lesson from the user's own record: did buys of flagged tokens end worse than clean ones?
  const closed = trades.filter((t) => t.side === "sell" && t.pnl != null);
  const flagged = new Set(buys.filter((t) => t.fails?.length).map((t) => t.token));
  const lossShare = (xs: Trade[]) => (xs.length ? xs.filter((t) => (t.pnl ?? 0) < 0).length / xs.length : null);
  const flagsLost = lossShare(closed.filter((t) => flagged.has(t.token)));
  const cleanLost = lossShare(closed.filter((t) => !flagged.has(t.token)));
  const skipFlags = flagsLost == null || cleanLost == null ? true : flagsLost >= cleanLost;
  const tags = new Map<string, number>();
  for (const t of trades) tags.set(t.tag, (tags.get(t.tag) ?? 0) + 1);
  const style = [...tags.entries()].map(([id, n]) => ({ label: TAGS.find((x) => x.id === id)?.label ?? id, share: n / trades.length })).sort((a, b) => b.share - a.share);
  return { assets, perTrade, perDay, slippageBps, hours, weekdaysOnly, skipFlags, style, why: { flagsLost, cleanLost } };
}

/** The user's own trades, in order, through the draft: what the agent would have let through. */
function replay(trades: Trade[], d: Draft): Verdict[] {
  const listed = new Set(d.assets.map((a) => a.token));
  const spent = new Map<string, number>();
  return [...trades].reverse().map((t) => {
    if (t.side === "sell") return { t, ok: true, rule: null };
    const h = new Date(t.at).getUTCHours(), dow = new Date(t.at).getUTCDay();
    const today = spent.get(dayOf(t.at)) ?? 0;
    let rule: string | null = null;
    if (!listed.has(t.token)) rule = "Assets: not on the list";
    else if (d.skipFlags && t.fails?.length) rule = "Check: red flags";
    else if (t.usd > d.perTrade) rule = `Size: over ${usd(d.perTrade)}`;
    else if (today + t.usd > d.perDay) rule = `Budget: over ${usd(d.perDay)} a day`;
    else if (t.impact != null && t.impact * 10_000 > d.slippageBps) rule = `Price: impact over ${(d.slippageBps / 100).toFixed(2)}%`;
    else if (d.hours && (h < d.hours[0] || h >= d.hours[1])) rule = "Window: outside your hours";
    else if (d.weekdaysOnly && (dow === 0 || dow === 6)) rule = "Window: weekend";
    if (!rule) spent.set(dayOf(t.at), today + t.usd);
    return { t, ok: !rule, rule };
  });
}

export function AgentLearn() {
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => {
    const b = loadBook();
    void Promise.resolve().then(() => setBook(b));
    void syncBook(b).then((s) => s !== b && setBook(s));
  }, []);
  const trades = useMemo(() => book?.trades ?? [], [book]);
  const d = useMemo(() => (trades.length ? draft(trades) : null), [trades]);
  const rep = useMemo(() => (d ? replay(trades, d) : []), [trades, d]);

  if (!book) return <p className="caret p-5 font-mono text-[13px] text-muted">Reading your practice trades</p>;
  const ready = trades.length >= TEACH_AT;
  const buys = rep.filter((v) => v.t.side === "buy");
  const refused = buys.filter((v) => !v.ok);
  // result on closed trades of tokens whose first buy the agent would have allowed, against all closed trades
  const allowedTokens = new Set(buys.filter((v) => v.ok).map((v) => v.t.token));
  const closed = trades.filter((t) => t.side === "sell");
  const resAll = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const resAgent = closed.filter((t) => allowedTokens.has(t.token)).reduce((s, t) => s + (t.pnl ?? 0), 0);
  const rules: [string, string, string][] = d
    ? [
        ["01", "Assets", d.assets.length ? `${d.assets.map((a) => `$${a.symbol}`).join(", ")} and USDG` : "none yet"],
        ["02", "Size", `${usd(d.perTrade)} per trade: 9 in 10 of your buys were this size or smaller`],
        ["03", "Budget", `${usd(d.perDay)} a day: your busiest day, plus a fifth`],
        ["04", "Price", `${(d.slippageBps / 100).toFixed(2)}% from the pool: above what you usually accepted`],
        ["05", "Window", `${d.hours ? `${String(d.hours[0]).padStart(2, "0")}:00–${String(d.hours[1]).padStart(2, "0")}:00 UTC` : "all day"}${d.weekdaysOnly ? ", weekdays only" : ""}`],
        ["06", "Check first", d.skipFlags ? "skip tokens the check flags red" : "flags are shown, not blocking: your flagged buys did as well as clean ones"],
      ]
    : [];

  return (
    <div className="space-y-4">
      <Verdict
        kicker={ready ? "Your agent has a draft" : "Your agent is learning"}
        tone={ready ? "good" : "info"}
        value={`${Math.min(trades.length, TEACH_AT)}/${TEACH_AT}`}
        valueLabel="practice trades taught"
        facts={[
          ["Buys", String(trades.filter((t) => t.side === "buy").length)],
          ["Sells", String(closed.length)],
          ["Refused by the draft", d ? String(refused.length) : "—"],
          ["Your style", d?.style[0] ? `${d.style[0].label} · ${Math.round(d.style[0].share * 100)}%` : "—"],
        ]}
      >
        {ready
          ? "These are the rules your trades describe. The agent replays your own trades through them below: what it would have let through, what it would have stopped, and what that did to your results."
          : trades.length
            ? `${TEACH_AT - trades.length} more practice trades and the draft is ready. The rules below already move with every trade you make.`
            : "Trade on paper in Practice: every buy and sell, with why you made it, teaches your agent how you trade."}
      </Verdict>

      {!trades.length ? (
        <Link href="/app/trade/practice" className="ibtn inline-flex h-11 items-center px-6">Start practising →</Link>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Instrument code="G-60" title="The draft mandate" status={<Led tone={ready ? "on" : "off"} label={ready ? "Ready to deploy" : "Still learning"} />} foot={<span>Each rule is one a mandate contract enforces. A trade that breaks one is refused on chain and the agent&apos;s bond pays you.</span>}>
            <ol className="divide-y divide-line">
              {rules.map(([n, k, v]) => (
                <li key={k} className="grid grid-cols-[2.5rem_6.5rem_minmax(0,1fr)] gap-2 px-4 py-3 text-[13.5px]">
                  <span className="font-mono text-[12px] text-muted">{n}</span>
                  <span className="font-semibold text-text">{k}</span>
                  <span className="text-muted">{v}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
              <Link href={ready ? "/app/agents/strategies" : "/app/trade/practice"} className={cx("h-11 px-5", ready ? "ibtn" : "ibtn-ghost", "inline-flex items-center")}>{ready ? "Deploy as a mandate →" : "Keep practising →"}</Link>
              {d && (
                <button type="button" onClick={() => void navigator.clipboard?.writeText(JSON.stringify({ assets: d.assets.map((a) => a.token), maxPerTradeUsd: d.perTrade, maxPerDayUsd: d.perDay, maxSlippageBps: d.slippageBps, hours: d.hours, weekdaysOnly: d.weekdaysOnly }, null, 2))} className="text-[12.5px] text-muted underline underline-offset-4 hover:text-text">
                  Copy the rules
                </button>
              )}
            </div>
          </Instrument>

          <Instrument code="G-61" title="Replay: your trades through the draft" status={<Led tone={refused.length ? "bad" : "on"} label={`${buys.length - refused.length} let through · ${refused.length} refused`} />} foot={<span>Results are your realized paper results: on tokens the agent would have bought, against all your closed trades.</span>}>
            <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
              <div className="bg-bg p-4">
                <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">You, all trades</p>
                <p className={cx("mt-1 font-mono text-[20px]", resAll >= 0 ? "text-leaf" : "text-flesh")}>{`${resAll >= 0 ? "+" : ""}${usd(resAll)}`}</p>
              </div>
              <div className="bg-bg p-4">
                <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Your agent&apos;s share</p>
                <p className={cx("mt-1 font-mono text-[20px]", resAgent >= 0 ? "text-leaf" : "text-flesh")}>{`${resAgent >= 0 ? "+" : ""}${usd(resAgent)}`}</p>
              </div>
            </div>
            <div className="max-h-[22rem] overflow-auto">
              <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
                <tbody>
                  {[...buys].reverse().map((v) => (
                    <tr key={v.t.id} className="border-b border-line/50">
                      <td className="px-4 py-2 font-mono text-text">{v.t.symbol}</td>
                      <td className="px-4 py-2 font-mono text-muted">{usd(v.t.usd)}</td>
                      <td className={cx("px-4 py-2 text-[12.5px]", v.ok ? "text-leaf" : "text-flesh")}>{v.ok ? "Let through" : `Refused · ${v.rule}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Instrument>
        </div>
      )}

      {trades.length > 0 && <Habits trades={trades} />}
      {trades.length > 0 && <AgentTriggers book={book} />}
      <AgentBacktest tokens={[...new Map(trades.map((t) => [t.token, t.symbol])).entries()].map(([token, symbol]) => ({ token, symbol }))} />

      {d && (d.why.flagsLost != null || d.why.cleanLost != null) && (
        <p className="rounded-2xl border border-line px-5 py-4 text-[13.5px] text-muted">
          {`What your record says about the check: ${d.why.flagsLost == null ? "no closed trade in a flagged token yet" : `${Math.round(d.why.flagsLost * 100)}% of your closed trades in tokens the check flagged lost money`}${d.why.cleanLost == null ? "" : `, against ${Math.round(d.why.cleanLost * 100)}% in clean ones`}.`}
        </p>
      )}
    </div>
  );
}
