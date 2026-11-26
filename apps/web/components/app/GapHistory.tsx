"use client";

/**
 * Stocks · gap history: every recorded weekend, each stock token's chain price just before Monday's bell against
 * Friday's close, Monday's official open, and whether the open closed the gap (same way, at least half of it).
 * Per token: how often that happened. Recorded from the first weekend the sweep ran; nothing is backfilled.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { fmtPx } from "./Candles";
import { Idle, Instrument, Led } from "./kit";

type Row = { week: string; symbol: string; token: string; close: number; chain: number; open: number | null; gap: number; move: number | null; closed: number | null };
type H = { weeks: { week: string; rows: Row[] }[]; bySymbol: { symbol: string; weekends: number; closed: number }[] };
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
const monday = (week: string) => new Date(Date.parse(`${week}T00:00:00Z`) + 3 * 86_400_000).toUTCString().slice(0, 11);

export function GapHistory() {
  const [h, setH] = useState<H | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch("/api/gap?history=1")
      .then((r) => r.json())
      .then((j: H) => setH(j))
      .catch(() => setErr(true));
  }, []);
  const last = h?.weeks[0];
  const settled = (h?.bySymbol ?? []).filter((s) => s.weekends > 0);
  return (
    <Instrument
      code="K-06"
      title="Gap history"
      busy={!h && !err}
      status={<Led tone={err ? "bad" : h?.weeks.length ? "on" : "off"} label={h ? `${h.weeks.length} weekend${h.weeks.length === 1 ? "" : "s"} recorded` : "…"} />}
      foot={
        <>
          <span>Chain = the last pool price before Monday&apos;s bell · Closed = Monday&apos;s open moved the same way, at least half the gap</span>
          <span>Recorded live from the first weekend, not backfilled</span>
        </>
      }
    >
      {err ? (
        <Idle>The history did not load. Try again in a minute.</Idle>
      ) : !h ? (
        <Idle>Reading…</Idle>
      ) : !last ? (
        <Idle>Recording starts with the next weekend: the chain price is kept from Friday&apos;s close to Monday&apos;s bell, then checked against Monday&apos;s open.</Idle>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full text-left">
              <caption className="px-4 pt-3 text-left font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{`Weekend before ${monday(last.week)}`}</caption>
              <thead>
                <tr className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                  <th className="px-4 py-2 font-medium">Token</th>
                  <th className="px-4 py-2 font-medium">Friday close</th>
                  <th className="px-4 py-2 font-medium">Chain before bell</th>
                  <th className="px-4 py-2 font-medium">Monday open</th>
                  <th className="px-4 py-2 font-medium">Closed</th>
                </tr>
              </thead>
              <tbody>
                {last.rows.map((r) => (
                  <tr key={r.symbol} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <Link href={`/app/trade/terminal?token=${r.token}`} className="font-mono text-[14px] text-text hover:underline">
                        {r.symbol}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-text">${fmtPx(r.close)}</td>
                    <td className={cx("px-4 py-2.5 font-mono text-[13px]", r.gap >= 0 ? "text-leaf" : "text-flesh")}>{`$${fmtPx(r.chain)} · ${pct(r.gap)}`}</td>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-text">{r.open === null ? <span className="text-muted">after the bell</span> : `$${fmtPx(r.open)} · ${pct(r.move ?? 0)}`}</td>
                    <td className="px-4 py-2.5 font-mono text-[13px]">{r.closed === null ? <span className="text-muted">—</span> : r.closed ? <span className="text-leaf">Yes</span> : <span className="text-flesh">No</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line p-4 lg:border-l lg:border-t-0">
            <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">How often Monday closed it</p>
            {settled.length === 0 ? (
              <p className="mt-2 text-[14px] text-muted">Shown once a Monday open is in.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {settled.slice(0, 12).map((s) => (
                  <li key={s.symbol} className="flex items-baseline justify-between gap-3 font-mono text-[13px]">
                    <span className="text-text">{s.symbol}</span>
                    <span className="tabular-nums text-muted">{`${s.closed} of ${s.weekends}`}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[12.5px] text-muted">A small record. It says what happened, not what will.</p>
          </div>
        </div>
      )}
    </Instrument>
  );
}
