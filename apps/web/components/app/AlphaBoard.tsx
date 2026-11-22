"use client";

/**
 * Radar · Alpha: tokens born in the last three days that real money is already moving into. From the trending
 * read: under 72 hours old, at least $1K traded, ranked by volume. Each row shows where it launched, its age,
 * volume, the share of swaps that were buys, the average swap (a few giant swaps flag fake volume) and its liquidity, and opens
 * the check or the chart. A list to look at first, not a list to buy: every row links to the check.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { launchpadName, launchpadTone } from "@corbel/config";
import { cx } from "@corbel/ui";
import { Instrument } from "./kit";
import { TokenAvatar } from "./TokenAvatar";

type Row = { token: string; symbol: string | null; name: string | null; volume: number; swaps: number; buys: number; takers: number; liquidity?: number; change?: number | null; created?: number | null; pad?: string | null };
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
const DAY = 86_400_000;
type Wash = { token: string; symbol: string | null; volume: number; takers: number; swaps: number };

export function AlphaBoard() {
  const [d, setD] = useState<{ at: number; rows: Row[]; wash: Wash[] } | null>(null);
  useEffect(() => {
    let off = false;
    const load = () =>
      fetch("/api/trending")
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { at?: number; rows?: Row[]; wash?: Wash[] } | null) => !off && j?.rows && setD({ at: j.at ?? 0, rows: j.rows, wash: j.wash ?? [] }))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, []);
  const rows = useMemo(() => (d ? d.rows.filter((r) => r.created && d.at - r.created < 3 * DAY && r.volume >= 1000).sort((a, b) => b.volume - a.volume).slice(0, 12) : []), [d]);
  const vmax = Math.max(1, ...rows.map((r) => r.volume));
  const age = (c: number) => {
    const h = ((d?.at ?? 0) - c) / 3_600_000;
    return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
  };

  return (
    <Instrument code="R-00" title="Alpha: new tokens with real flow" foot={
        <span>
          {`Under ${72} hours old and at least $${1}K traded. Check before you buy: new tokens fail most often.`}
          {d && d.wash.length > 0 && (
            <span className="mt-1 block">
              {`Left out: ${d.wash.slice(0, 4).map((w) => `${w.symbol ?? w.token.slice(0, 8)} (${usd(w.volume)} in ${w.swaps} swaps, ${usd(w.volume / Math.max(1, w.swaps))} each)`).join(", ")}${d.wash.length > 4 ? ` and ${d.wash.length - 4} more` : ""}. Millions from a few giant swaps is wash trading or a broken price, not flow.`}
            </span>
          )}
        </span>
      }>
      {!d && (
        <ul aria-label="Reading the busiest new tokens" className="divide-y divide-line">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} aria-hidden className="grid grid-cols-[2rem_minmax(0,1.4fr)_repeat(5,minmax(0,1fr))_6rem] items-center gap-4 px-4 py-3" style={{ opacity: 1 - i * 0.12 }}>
              <span className="h-7 w-7 rounded-full bg-[#181818]" />
              <span className="h-3.5 w-28 rounded bg-[#181818]" />
              {Array.from({ length: 5 }, (_, k) => (
                <span key={k} className="h-3.5 rounded bg-[#181818]" />
              ))}
              <span className="h-7 rounded-lg bg-[#181818]" />
            </li>
          ))}
        </ul>
      )}
      {d && !rows.length && <p className="px-4 py-6 text-[14px] text-muted">{`No token under three days old has crossed $${1}K of volume right now.`}</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line font-medium text-[13px] uppercase tracking-[0.08em] text-muted">
                {["Token", "Launched on", "Age", "Volume", "Buys", "Avg swap", "Liquidity", ""].map((h, i) => (
                  <th key={i} className={cx("px-4 py-2.5 font-normal", i >= 3 && i <= 6 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const buys = r.swaps ? r.buys / r.swaps : 0;
                return (
                  <tr key={r.token} className="irow border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <TokenAvatar address={r.token} symbol={r.symbol} size={26} />
                        <span className="min-w-0">
                          <span className="block font-mono text-text">{r.symbol ?? "?"}</span>
                          <span className="block max-w-[11rem] truncate text-[13px] text-muted">{r.name ?? ""}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.pad ? (
                        <span className="flex items-center gap-1.5 text-[13px] text-text">
                          <i className="h-2 w-2 rounded-full" style={{ background: launchpadTone(r.pad) }} />
                          {launchpadName(r.pad)}
                        </span>
                      ) : (
                        <span className="text-[13px] text-muted">Unlabelled</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-muted">{age(r.created!)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="block font-mono text-text">{usd(r.volume)}</span>
                      <span className="ml-auto mt-1 block h-1 w-20 overflow-hidden rounded-full bg-[#202020]">
                        <span className="block h-full rounded-full bg-leaf" style={{ width: `${(r.volume / vmax) * 100}%` }} />
                      </span>
                    </td>
                    <td className={cx("px-4 py-2.5 text-right tabular-nums", buys >= 0.5 ? "text-leaf" : "text-flesh")}>{`${Math.round(buys * 100)}%`}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text">{r.swaps ? usd(r.volume / r.swaps) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">{r.liquidity ? usd(r.liquidity) : <span className="text-flesh">none</span>}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <Link href={`/app/trade/terminal?token=${r.token}`} className="mr-3 text-[13px] text-muted hover:text-text">
                        Chart
                      </Link>
                      <Link href={`/app/trust/check?q=${r.token}`} className="ibtn h-8 px-3 text-[13px]">
                        Check →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Instrument>
  );
}
