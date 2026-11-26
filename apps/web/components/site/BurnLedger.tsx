"use client";

/**
 * /burn · the live part, all from GET /api/burns (the chain, read once a minute):
 *  - how much of the billion is gone, counted up;
 *  - a chart of everything destroyed over time, one mark per burn (Fee Burn green, the team wallet orange);
 *  - a period (all, today, yesterday, seven days, or one day stepped with arrows) and a source filter, with the period's
 *    totals; every burn of the period in a table, each with its transaction;
 *  - times in the viewer's own time zone, or UTC at a tap.
 * Motion: numbers count, the line draws, rows slide in; all of it off under prefers-reduced-motion.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import { CountUp } from "../app/Bay";

type Row = { at: number; by: "contract" | "team"; eth: number | null; coins: number; tx: string; record: string | null };
type B = { block: string; supply: number; destroyed: number; contract: { address: string; burns: number; eth: number; coins: number; ends: number; shareBps: number }; rows: Row[]; stale?: boolean; error?: string };
type Period = "all" | "today" | "yesterday" | "week" | "day";
type Source = "all" | "contract" | "team";

const START = 1e9; // the fixed supply at mint
const SCAN = "https://robinhoodchain.blockscout.com";
const DAY = 86_400_000;
const GREEN = "#6fe7a8";
const ORANGE = "#ff9a5c";
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

/** The viewer's zone as "CET · UTC+1", or "UTC". */
function zoneLabel(utc: boolean): string {
  if (utc) return "UTC";
  const name = new Intl.DateTimeFormat("en-GB", { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";
  const off = -new Date().getTimezoneOffset();
  const h = Math.floor(Math.abs(off) / 60), m = Math.abs(off) % 60;
  const utcOff = off === 0 ? "UTC" : `UTC${off > 0 ? "+" : "-"}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
  return name && !/^GMT[+-]/.test(name) ? `${name} · ${utcOff}` : utcOff;
}
/** Midnight of the day containing `t`, in the chosen zone. */
function dayStart(t: number, utc: boolean): number {
  const d = new Date(t);
  return utc ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
const fmtTime = (t: number, utc: boolean) => {
  const d = new Date(t);
  const p = (x: number) => String(x).padStart(2, "0");
  return utc ? `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmtDay = (t: number, utc: boolean) => new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: utc ? "UTC" : undefined });

function useReduced() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setR(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

/** Everything destroyed over time: a stepped line from the first burn to now, one mark per burn, hover for details. */
function BurnChart({ rows, utc, reduced, from, to }: { rows: Row[]; utc: boolean; reduced: boolean; from: number; to: number }) {
  const W = 1000, H = 260, PX = 44, PY = 22;
  const asc = useMemo(() => [...rows].sort((a, b) => a.at - b.at), [rows]);
  const pts = useMemo(() => asc.reduce<{ r: Row; sum: number }[]>((out, r) => [...out, { r, sum: (out.at(-1)?.sum ?? 0) + r.coins }], []), [asc]);
  const max = Math.max(1, pts.at(-1)?.sum ?? 1);
  const span = Math.max(3600_000, to - from);
  const x = (t: number) => PX + ((t - from) / span) * (W - 2 * PX);
  const y = (v: number) => H - PY - (v / max) * (H - 2 * PY);
  let d = `M ${x(from)} ${y(0)}`;
  for (const p of pts) d += ` H ${x(p.r.at)} V ${y(p.sum)}`;
  d += ` H ${x(to)}`;
  const path = useRef<SVGPathElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = path.current;
    if (!el || reduced) return;
    const len = el.getTotalLength();
    el.animate([{ strokeDasharray: `${len}`, strokeDashoffset: `${len}` }, { strokeDasharray: `${len}`, strokeDashoffset: "0" }], { duration: 1100, easing: "cubic-bezier(.2,.7,.2,1)" });
  }, [d, reduced]);
  const ticks = [0, 0.5, 1].map((k) => ({ v: max * k, y: y(max * k) }));
  const h = hover !== null ? pts[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full sm:h-[260px]" role="img" aria-label="Everything destroyed over the period, one mark per burn">
        <defs>
          <linearGradient id="burn-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={GREEN} stopOpacity="0.22" />
            <stop offset="1" stopColor={GREEN} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t.v}>
            <line x1={PX} x2={W - PX} y1={t.y} y2={t.y} stroke="#ffffff" strokeOpacity="0.07" strokeDasharray="3 6" />
            <text x={PX - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="#7d8a83" fontFamily="var(--font-mono, monospace)">
              {t.v >= 1e6 ? `${(t.v / 1e6).toFixed(1)}M` : t.v >= 1e3 ? `${Math.round(t.v / 1e3)}K` : "0"}
            </text>
          </g>
        ))}
        {pts.length > 0 && <path d={`${d} V ${y(0)} H ${x(from)} Z`} fill="url(#burn-fill)" />}
        <path ref={path} d={d} fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={p.r.tx + p.r.by} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${fmtTime(p.r.at, utc)}, ${p.r.by === "contract" ? "Fee Burn" : "team wallet"}, ${n0(p.r.coins)} burned`}>
            <circle cx={x(p.r.at)} cy={y(p.sum)} r="14" fill="transparent" />
            <circle cx={x(p.r.at)} cy={y(p.sum)} r={hover === i ? 7 : 5} fill={p.r.by === "contract" ? GREEN : ORANGE} stroke="#07080b" strokeWidth="2" className={reduced ? "" : "burn-dot"} style={{ animationDelay: `${0.6 + i * 0.06}s` }} />
          </g>
        ))}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-2 rounded-xl border border-[#2a2a2a] bg-[#0b0b0b]/95 px-3 py-2 font-mono text-[12px] shadow-lg" style={{ left: `min(calc(${(x(h.r.at) / W) * 100}% + 8px), calc(100% - 15rem))` }}>
          <p className={h.r.by === "contract" ? "text-leaf" : "text-[#ff9a5c]"}>{h.r.by === "contract" ? "Fee Burn contract" : "Team wallet"}</p>
          <p className="text-text">{`${n0(h.r.coins)} $CORBEL${h.r.eth !== null ? ` · ${h.r.eth.toFixed(6)} ETH` : ""}`}</p>
          <p className="text-muted">{fmtTime(h.r.at, utc)}</p>
          <p className="text-muted">{`Total by then: ${n0(h.sum)}`}</p>
        </div>
      )}
    </div>
  );
}

export function BurnLedger() {
  const [b, setB] = useState<B | null>(null);
  const [err, setErr] = useState(false);
  const [utc, setUtc] = useState(false);
  const [period, setPeriod] = useState<Period>("all");
  const [day, setDay] = useState<number | null>(null);
  const [source, setSource] = useState<Source>("all");
  const [zone, setZone] = useState("");
  const [now, setNow] = useState(0);
  const reduced = useReduced();

  useEffect(() => {
    const load = () =>
      fetch("/api/burns")
        .then((r) => r.json())
        .then((j: B) => {
          if (j.error) setErr(true);
          else {
            setB(j);
            setNow(Date.now());
            setErr(false);
          }
        })
        .catch(() => setErr(true));
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    void Promise.resolve().then(() => setZone(zoneLabel(utc)));
  }, [utc]);

  const today = dayStart(now, utc);
  const range = useMemo((): [number, number] => {
    if (period === "today") return [today, today + DAY];
    if (period === "yesterday") return [today - DAY, today];
    if (period === "week") return [today - 6 * DAY, today + DAY];
    if (period === "day" && day !== null) return [day, day + DAY];
    const first = b?.rows.reduce((m, r) => Math.min(m, r.at), Infinity) ?? 0;
    // the whole history: from a little before the first burn, so the line uses the width
    return Number.isFinite(first) ? [first - Math.max(600_000, (now - first) * 0.04), now] : [today, now];
  }, [period, day, today, b, now]);
  const rows = useMemo(() => (b?.rows ?? []).filter((r) => r.at >= range[0] && r.at < range[1] && (source === "all" || r.by === source)), [b, range, source]);
  const sums = useMemo(() => ({ coins: rows.reduce((a, r) => a + r.coins, 0), eth: rows.reduce((a, r) => a + (r.eth ?? 0), 0), n: rows.length }), [rows]);
  const team = b?.rows.filter((r) => r.by === "team").reduce((a, r) => a + r.coins, 0) ?? 0;
  const stepDay = (k: number) => {
    setPeriod("day");
    setDay((d) => Math.min(today, (d ?? today) + k * DAY));
  };

  const cells: [string, number | null, string, string][] = [
    ["Destroyed so far", b ? b.destroyed : null, b ? `${((b.destroyed / START) * 100).toFixed(3)}% of the billion` : "Reading the token", ORANGE],
    ["Total supply now", b ? b.supply : null, `Started at ${n0(START)}`, "#e8ece9"],
    ["Burned by Fee Burn", b ? b.contract.coins : null, b ? `${b.contract.burns} burns · ${b.contract.eth.toFixed(4)} ETH of fees` : "Reading the contract", GREEN],
    ["Burned by the team wallet", b ? team : null, "Bought on the market, on top", ORANGE],
  ];
  const chip = (on: boolean) => cx("rounded-full border px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.08em] transition-colors", on ? "border-leaf bg-leaf/10 text-text" : "border-[#2a2a2a] text-muted hover:border-[#3a3a3a] hover:text-text");

  return (
    <>
      <style>{`@media (prefers-reduced-motion: no-preference){.burn-dot{transform-box:fill-box;transform-origin:center;animation:burn-pop .45s cubic-bezier(.2,.9,.3,1.4) both}.burn-row{animation:burn-in .45s ease both}@keyframes burn-pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}@keyframes burn-in{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}.burn-live{animation:burn-pulse 2s ease-in-out infinite}.burn-dot-lit{animation:burn-pop .4s ease both;box-shadow:0 0 6px currentColor}@keyframes burn-pulse{50%{opacity:.35}}}`}</style>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cells.map(([k, v, sub, tone]) => (
          <div key={k} className="relative overflow-hidden rounded-2xl border border-[#1f2a24] bg-[#0a0f0c] p-5">
            <span aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${tone}, transparent)` }} />
            <dt className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#8fb5a0]">{k}</dt>
            <dd className="mt-2 font-mono text-3xl tabular-nums text-text">{v === null ? "…" : <CountUp value={v} ms={reduced ? 1 : 1200} fmt={n0} />}</dd>
            <dd className="mt-1 text-[13px] text-[#a9c9b6]">{sub}</dd>
          </div>
        ))}
      </dl>
      {err && !b && <p className="mt-4 text-[14px] text-flesh">The chain did not answer. Try again in a minute.</p>}

      <section className="mt-8 overflow-hidden rounded-2xl border border-[#242424] bg-[#0b0b0b]">
        <header className="flex flex-wrap items-center gap-2 border-b border-[#1d1d1d] px-4 py-3 sm:px-5">
          {([["all", "All"], ["today", "Today"], ["yesterday", "Yesterday"], ["week", "7 days"]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => (setPeriod(id), setDay(null))} aria-pressed={period === id} className={chip(period === id)}>
              {label}
            </button>
          ))}
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => stepDay(-1)} aria-label="One day back" className={chip(false)}>
              ←
            </button>
            <span className={cx(chip(period === "day"), "min-w-[7.5rem] text-center")}>{period === "day" && day !== null ? fmtDay(day, utc) : "Pick a day"}</span>
            <button type="button" onClick={() => stepDay(1)} disabled={period !== "day" || (day ?? today) >= today} aria-label="One day forward" className={cx(chip(false), "disabled:opacity-40")}>
              →
            </button>
          </span>
          <span className="mx-1 hidden h-5 w-px bg-[#2a2a2a] sm:block" />
          {([["all", "Both"], ["contract", "Fee Burn"], ["team", "Team wallet"]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setSource(id)} aria-pressed={source === id} className={chip(source === id)}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setUtc((u) => !u)} className="ml-auto rounded-full border border-[#2a2a2a] px-3 py-1.5 font-mono text-[12px] text-muted hover:text-text" aria-label="Switch between your time zone and UTC">
            {`Times: ${zone || "…"}`}
          </button>
        </header>

        <div className="grid gap-0 border-b border-[#1d1d1d] lg:grid-cols-[1fr_15rem]">
          <div className="px-2 pt-3 sm:px-4">{b ? <BurnChart rows={rows} utc={utc} reduced={reduced} from={range[0]} to={Math.min(range[1], now)} /> : <div className="h-[220px]" />}</div>
          <dl className="grid grid-cols-3 gap-3 border-t border-[#1d1d1d] p-4 lg:grid-cols-1 lg:border-l lg:border-t-0">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Burns</dt>
              <dd className="font-mono text-2xl text-text">{sums.n}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">$CORBEL burned</dt>
              <dd className="font-mono text-2xl text-text">{n0(sums.coins)}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">ETH spent</dt>
              <dd className="font-mono text-2xl text-text">{sums.eth.toFixed(4)}</dd>
            </div>
            <p className="col-span-3 flex items-center gap-2 font-mono text-[11px] text-muted lg:col-span-1">
              <span className="burn-live inline-block h-1.5 w-1.5 rounded-full bg-leaf" />
              {b ? `Block ${Number(b.block).toLocaleString("en-US")}` : "Reading the chain"}
            </p>
          </dl>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                <th className="px-5 py-3 font-medium">{`When · ${zone || "…"}`}</th>
                <th className="px-5 py-3 font-medium">By</th>
                <th className="px-5 py-3 font-medium">ETH spent</th>
                <th className="px-5 py-3 font-medium">$CORBEL burned</th>
                <th className="px-5 py-3 text-right font-medium">Transaction</th>
              </tr>
            </thead>
            <tbody key={`${period}-${day}-${source}`}>
              {rows.map((r, i) => (
                <tr key={r.tx + r.by} className="burn-row border-t border-[#1a1a1a] transition-colors hover:bg-[#111]" style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
                  <td className="px-5 py-3 font-mono text-[13px] text-muted">{fmtTime(r.at, utc)}</td>
                  <td className="px-5 py-3 text-[14px]">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: r.by === "contract" ? GREEN : ORANGE }} />
                      <span className={r.by === "contract" ? "text-leaf" : "text-[#ffb27a]"}>{r.by === "contract" ? "Fee Burn contract" : "Team wallet"}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-[13px] text-text">{r.eth === null ? "bought on the market" : r.eth.toFixed(6)}</td>
                  <td className="px-5 py-3 font-mono text-[14px] tabular-nums text-text">{n0(r.coins)}</td>
                  <td className="px-5 py-3 text-right">
                    <a href={`${SCAN}/tx/${r.tx}`} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-leaf underline-offset-4 hover:underline">
                      {`${r.tx.slice(0, 10)}…`}
                    </a>
                  </td>
                </tr>
              ))}
              {b && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[14px] text-muted">
                    No burns in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
