"use client";

/**
 * Prop desk · the evaluation. Your paper account, read against a tier's rules: profit target, drawdown floor, the
 * day's loss limit and a minimum of trading days. Passed, failed or still running, with each rule's progress and the
 * closed-results equity line. Funded seats come after the desk opens; this part is live today.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument } from "./kit";
import { loadBook, type Book } from "@/lib/practice";
import { evaluate, PROP_TIERS } from "@/lib/prop";

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

function Rule({ label, now, limit, good, note }: { label: string; now: number; limit: number; good: boolean; note: string }) {
  const k = Math.max(0, Math.min(1, limit ? now / limit : 0));
  return (
    <li className="px-4 py-3">
      <p className="flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] text-text">{label}</span>
        <span className={cx("font-mono text-[12.5px]", good ? "text-leaf" : "text-muted")}>{note}</span>
      </p>
      <span className="mt-2 block h-1.5 overflow-hidden bg-[#242424]">
        <span className={cx("block h-full", good ? "bg-leaf" : "bg-[#5c6b63]")} style={{ width: `${k * 100}%` }} />
      </span>
    </li>
  );
}

export function PropChallenge() {
  const [book, setBook] = useState<Book | null>(null);
  const [tierId, setTierId] = useState(PROP_TIERS[0]!.id);
  // the paper account lives in this browser (and, signed in, on the server): read after mount
  useEffect(() => {
    void Promise.resolve().then(() => setBook(loadBook()));
  }, []);
  const tier = PROP_TIERS.find((t) => t.id === tierId)!;
  const r = book ? evaluate(book, tier) : null;
  const start = book?.start ?? 10_000;
  const lo = r ? Math.min(...r.curve.map((c) => c.equity), start * (1 - tier.maxDrawdown)) : 0;
  const hi = r ? Math.max(...r.curve.map((c) => c.equity), start * (1 + tier.target)) : 1;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo || 1)) * 100;

  return (
    <Instrument
      code="G-30"
      title="The evaluation"
      foot={<span>Closed results only: a sell&apos;s profit or loss against its cost. Open positions count at what they cost, so a pass never rests on a gain nobody took.</span>}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        {PROP_TIERS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tierId === t.id} onClick={() => setTierId(t.id)} className={cx("rounded-full border px-3 py-1 font-mono text-[12px]", tierId === t.id ? "border-leaf/60 text-text" : "border-line text-muted hover:text-text")}>
            {t.label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[12px] text-muted">{`target +${pct(tier.target, 0)} · floor −${pct(tier.maxDrawdown, 0)} · day −${pct(tier.dailyLoss)} · ${tier.minDays} days`}</span>
      </div>
      {!r && <p className="caret px-4 py-6 font-mono text-xs text-muted">Reading your paper account</p>}
      {r && r.status === "empty" && (
        <div className="px-4 py-6">
          <p className="text-[15px] text-text">No trades on your paper account yet.</p>
          <p className="mt-1 text-[13px] text-muted">Trade it like the desk&apos;s money: every sell counts toward the rules above.</p>
          <Link href="/app/wallet/paper" className="mt-4 inline-block rounded-full border border-leaf/60 px-4 py-1.5 text-[13px] text-text hover:bg-leaf/10">
            Open the paper account
          </Link>
        </div>
      )}
      {r && r.status !== "empty" && (
        <div className="grid gap-px bg-line lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="bg-bg">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
              <p className={cx("font-display text-3xl tracking-tight", r.status === "passed" ? "text-leaf" : r.status === "failed" ? "text-flesh" : "text-text")}>
                {r.status === "passed" ? "Passed" : r.status === "failed" ? "Failed" : "Running"}
              </p>
              <p className="font-mono text-[13px] text-muted">{`${r.profit >= 0 ? "+" : ""}${pct(r.profit)} · $${r.equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</p>
            </div>
            {r.why && <p className="px-4 pt-1 text-[13px] text-flesh">{r.why}</p>}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-3 h-40 w-full" role="img" aria-label="Equity from closed results">
              <line x1="0" x2="100" y1={y(start * (1 + tier.target))} y2={y(start * (1 + tier.target))} stroke="var(--leaf)" strokeOpacity="0.5" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
              <line x1="0" x2="100" y1={y(r.peak - start * tier.maxDrawdown)} y2={y(r.peak - start * tier.maxDrawdown)} stroke="#e0637c" strokeOpacity="0.5" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
              <polyline fill="none" stroke="var(--text)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" points={r.curve.map((c, i) => `${(i / Math.max(1, r.curve.length - 1)) * 100},${y(c.equity)}`).join(" ")} />
            </svg>
            <p className="flex justify-between px-4 pb-3 font-mono text-[11.5px] text-muted">
              <span className="text-leaf">dashed green: target</span>
              <span className="text-[#e0637c]">dashed red: floor under the peak</span>
            </p>
          </div>
          <ul className="divide-y divide-line bg-bg">
            <Rule label="Profit target" now={Math.max(0, r.profit)} limit={tier.target} good={r.profit >= tier.target} note={`${pct(r.profit)} of +${pct(tier.target, 0)}`} />
            <Rule label="Drawdown from the peak" now={r.drawdown} limit={tier.maxDrawdown} good={r.drawdown < tier.maxDrawdown} note={`${pct(r.drawdown)} of ${pct(tier.maxDrawdown, 0)} allowed`} />
            <Rule label="Worst day" now={r.worstDay ? r.worstDay.loss / start : 0} limit={tier.dailyLoss} good={!r.worstDay || r.worstDay.loss / start < tier.dailyLoss} note={r.worstDay ? `−${pct(r.worstDay.loss / start)} on ${r.worstDay.day}` : "no losing day"} />
            <Rule label="Trading days" now={r.days} limit={tier.minDays} good={r.days >= tier.minDays} note={`${r.days} of ${tier.minDays}`} />
            <li className="px-4 py-3 text-[13px] text-muted">{r.oversized ? `${r.oversized} buys were over ${pct(tier.maxPosition, 0)} of the account: allowed here, refused on a funded seat.` : `No buy over ${pct(tier.maxPosition, 0)} of the account.`}</li>
          </ul>
        </div>
      )}
    </Instrument>
  );
}
