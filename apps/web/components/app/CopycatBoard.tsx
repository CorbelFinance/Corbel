"use client";

/**
 * Radar · Copycats: tokens born in the last week whose ticker an earlier token already used, newest first. Each row
 * names the first token seen under that ticker and how many contracts now share it, and opens the check on the copy.
 * The first token seen is usually, not always, the original: the check says which one is the issuer's.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Instrument } from "./kit";

type Row = { address: string; symbol: string; name: string | null; block: number; same: number; original: string; originalName: string | null };
type Feed = { head: number; bps: number; days: number; rows: Row[] };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function CopycatBoard() {
  const [d, setD] = useState<Feed | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let off = false;
    fetch("/api/copycats?days=7")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Feed) => !off && setD(j))
      .catch(() => !off && setErr(true));
    return () => {
      off = true;
    };
  }, []);
  const age = (block: number) => {
    if (!d) return "";
    const h = (d.head - block) / d.bps / 3600;
    return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
  };
  const rows = d?.rows.slice(0, 14) ?? [];

  return (
    <Instrument
      code="R-05"
      title="Copycats: new tokens that reuse a ticker"
      foot={<span>{d ? `Tokens first seen in the last ${d.days} days whose ticker an earlier token already had. Check the address, never the ticker.` : "Read from the index."}</span>}
    >
      {err && <p className="px-4 py-6 text-[14px] text-muted">The index did not answer. Try again in a minute.</p>}
      {!d && !err && <p className="caret px-4 py-6 font-mono text-[13px] text-muted">Reading the index</p>}
      {d && !rows.length && <p className="px-4 py-6 text-[14px] text-muted">No new token reused a ticker this week.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-[13px] uppercase tracking-[0.08em] text-muted">
                {["Ticker", "Copy", "Age", "First seen under it", "Same ticker", ""].map((h, i) => (
                  <th key={h || i} scope="col" className={i === 4 ? "px-4 py-2.5 text-right font-normal" : "px-4 py-2.5 font-normal"}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.address} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-2.5 font-semibold text-text">
                    {r.symbol}
                    {r.name && <span className="block max-w-[14rem] truncate text-[13px] font-normal text-muted">{r.name}</span>}
                  </th>
                  <td className="px-4 py-2.5 font-mono text-[13px] text-muted">{short(r.address)}</td>
                  <td className="px-4 py-2.5 font-mono text-[13px] text-muted">{age(r.block)}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/app/trust/check?q=${r.original}`} className="font-mono text-[13px] text-text underline decoration-line underline-offset-4 hover:decoration-leaf">
                      {short(r.original)}
                    </Link>
                    {r.originalName && <span className="block max-w-[14rem] truncate text-[13px] text-muted">{r.originalName}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text">{r.same.toLocaleString("en-US")}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/app/trust/check?q=${r.address}`} className="rounded-lg bg-leaf px-3 py-1.5 text-[13px] font-semibold text-[#0b0b0b] hover:brightness-110">
                      Check
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Instrument>
  );
}
