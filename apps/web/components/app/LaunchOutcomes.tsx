"use client";

/**
 * Launch · outcomes. Every launch our index knows, per launch pad: still on its launch curve, reached a pool and
 * trading, reached a pool not checked yet, or drained (every pool of the token dead by the liveness rule). One bar per
 * pad, all time or the last 7 days. Read from our own index, no chain call.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument } from "./kit";

type Row = { pad: string; total: number; noPool: number; trading: number; drained: number; unchecked: number };
type Data = { launches: number; all: { total: Row; pads: Row[] }; week: { total: Row; pads: Row[] } };

const PAD: Record<string, string> = { pons: "Pons", launchhood: "Launchhood", pools: "Straight to a pool", all: "All launches" };
const PARTS: { k: keyof Omit<Row, "pad" | "total">; label: string; color: string }[] = [
  { k: "trading", label: "Trading in a pool", color: "bg-leaf" },
  { k: "unchecked", label: "In a pool, not checked yet", color: "bg-[#5c6b63]" },
  { k: "drained", label: "Drained", color: "bg-flesh" },
  { k: "noPool", label: "Still on its launch curve", color: "bg-[#2a2f2c]" },
];
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(n / d < 0.1 ? 1 : 0)}%` : "0%");

export function LaunchOutcomes() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [span, setSpan] = useState<"week" | "all">("week");
  useEffect(() => {
    let off = false;
    fetch("/api/outcomes")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Data) => !off && setD(j))
      .catch(() => !off && setErr(true));
    return () => {
      off = true;
    };
  }, []);
  const view = d?.[span];
  const rows = view ? [view.total, ...view.pads] : [];

  return (
    <Instrument
      code="L-01"
      title="What became of each launch"
      foot={<span>Our own index of launch pads and pools. &quot;Drained&quot; needs every pool of the token checked dead; a pool not checked yet is never counted as trading.</span>}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        {(["week", "all"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={span === s} onClick={() => setSpan(s)} className={cx("rounded-full border px-3 py-1 font-mono text-[12px]", span === s ? "border-leaf/60 text-text" : "border-line text-muted hover:text-text")}>
            {s === "week" ? "Last 7 days" : "All time"}
          </button>
        ))}
        <span className="ml-auto flex flex-wrap gap-3">
          {PARTS.map((p) => (
            <span key={p.k} className="flex items-center gap-1.5 font-mono text-[11.5px] text-muted">
              <span aria-hidden className={cx("h-2 w-2", p.color)} />
              {p.label}
            </span>
          ))}
        </span>
      </div>
      {!d && !err && <p className="caret px-4 py-6 font-mono text-xs text-muted">Reading launches</p>}
      {err && <p className="px-4 py-6 font-mono text-xs text-muted">The index is not answering right now.</p>}
      {view && (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const reached = r.trading + r.unchecked + r.drained;
            return (
              <li key={r.pad} className="grid gap-2 px-4 py-3 sm:grid-cols-[12rem_minmax(0,1fr)_9rem] sm:items-center">
                <p>
                  <span className={cx("text-[14px]", r.pad === "all" ? "font-semibold text-text" : "text-text")}>{PAD[r.pad] ?? r.pad}</span>
                  <span className="block font-mono text-[12px] text-muted">{`${r.total.toLocaleString("en-US")} launches`}</span>
                </p>
                <div className="flex h-3 w-full overflow-hidden bg-[#141414]" role="img" aria-label={PARTS.map((p) => `${p.label} ${r[p.k]}`).join(", ")}>
                  {PARTS.map((p) => (r[p.k] ? <span key={p.k} className={p.color} style={{ width: `${(r[p.k] / r.total) * 100}%` }} /> : null))}
                </div>
                <p className="font-mono text-[12.5px] text-muted sm:text-right">
                  <span className="text-text">{pct(reached, r.total)}</span> reached a pool
                  {r.drained > 0 && <span className="block text-flesh">{`${r.drained} drained`}</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Instrument>
  );
}
