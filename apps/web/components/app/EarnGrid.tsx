"use client";

/**
 * Earn · the pools as an LP would choose them. One row per pool: the last 30 days after fees (fees minus what price
 * moves took back) as a curve, how many of those days paid, how many days of fees pay back the window's price-move
 * loss, the yield now and on average. Three ways to sort. Pick a row and the panel on the right replays the window
 * for the amount you would put in. Everything is the past, read from the pool's own events; nothing is promised.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { SubTabs } from "./Bay";
import { TokenAvatar } from "./TokenAvatar";
import { EarnDeposit } from "./EarnDeposit";
import { Verdict } from "./kit";

type Days = { n: number; paid: number; curve: number[]; avgApr: number; feesBack: number | null; steadiness: number; total: number };
type Row = { token: string; symbol: string; pair: string; base: string; liquidity: number; volume: number; fees: number; apr: number | null; swaps: number; days: Days | null; covered: number; doubt?: string | null };
const SORTS = [
  { id: "apr", label: "Highest APR" },
  { id: "steady", label: "Steadiest" },
  { id: "back", label: "Fees back soonest" },
] as const;
const usd = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(2)}`);
const pct = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
// the pool's base comes as a symbol ("USDG") or as an address, depending on the reader: both name the same two tokens
const baseSym = (b: string) => (b.toUpperCase() === "USDG" || b.toLowerCase() === "0x5fc5360d0400a0fd4f2af552add042d716f1d168" ? "USDG" : "WETH");
const SCAN = "https://robinhoodchain.blockscout.com/address/";

function Curve({ v, w = 140, h = 34, strong }: { v: number[]; w?: number; h?: number; strong?: boolean }) {
  if (v.length < 2) return <span className="font-mono text-[12px] text-muted">reading days…</span>;
  const lo = Math.min(0, ...v), hi = Math.max(0, ...v), span = hi - lo || 1;
  const X = (i: number) => (i / (v.length - 1)) * w, Y = (x: number) => h - ((x - lo) / span) * h;
  const d = v.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join(" ");
  const up = v[v.length - 1]! >= 0;
  const c = up ? "var(--leaf)" : "var(--flesh)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="block overflow-visible">
      <line x1={0} x2={w} y1={Y(0)} y2={Y(0)} stroke="#303030" strokeDasharray="2 3" />
      <path d={`${d} L${w},${Y(0)} L0,${Y(0)} Z`} fill={c} fillOpacity={strong ? 0.16 : 0.1} />
      <path d={d} fill="none" stroke={c} strokeWidth={strong ? 2 : 1.5} strokeLinejoin="round" />
      <circle cx={X(v.length - 1)} cy={Y(v[v.length - 1]!)} r={strong ? 3.5 : 2.5} fill={c} />
    </svg>
  );
}

function Paid({ d }: { d: Days }) {
  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-[13px] text-text">{`${d.paid}/${d.n}`}</span>
      <span className="flex gap-[2px]">
        {Array.from({ length: d.n }, (_, i) => (
          <i key={i} className={cx("h-3 w-[3px] rounded-[1px]", i < d.paid ? "bg-leaf/80" : "bg-[#2a2a2a]")} />
        ))}
      </span>
    </span>
  );
}


const LINE_TONES = ["var(--leaf)", "#9b86e4", "#6cc0d0", "#f2c46d", "#ff8fa3", "#93a6ff", "#7fd1b9", "#e8a07a"];

/** The selected pool's window, one bar per day: what an LP kept that day after price moves. */
function DayBars({ r }: { r: Row }) {
  const c = r.days?.curve ?? [];
  if (c.length < 2) return <p className="caret font-mono text-[12px] text-muted">Reading the days</p>;
  const daily = c.map((v, i) => v - (i ? c[i - 1]! : 0));
  const m = Math.max(...daily.map((v) => Math.abs(v)), 1e-9);
  let best = 0, worst = 0, run = 0, streak = 0;
  daily.forEach((v, i) => {
    if (v > daily[best]!) best = i;
    if (v < daily[worst]!) worst = i;
    run = v > 0 ? run + 1 : 0;
    streak = Math.max(streak, run);
  });
  const ago = (i: number) => daily.length - 1 - i;
  return (
    <div>
      <div className="relative flex h-28 items-center gap-[3px]">
        <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-[#303030]" />
        {daily.map((v, i) => (
          <span key={i} className="relative h-full flex-1" title={`${ago(i) ? `${ago(i)} days ago` : "today"}: ${pct(v, 2)}`}>
            <span
              className={cx("bar-grow-y absolute inset-x-0 mx-auto max-w-[14px] rounded-[2px]", v >= 0 ? "bottom-1/2 origin-bottom bg-leaf/80" : "top-1/2 origin-top bg-flesh/80")}
              style={{ height: `${Math.max(2, (Math.abs(v) / m) * 48)}%`, animationDelay: `${i * 18}ms` }}
            />
          </span>
        ))}
      </div>
      <p className="mt-1 flex justify-between font-mono text-[12px] text-muted">
        <span>{`${daily.length} days ago`}</span>
        <span>today</span>
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {(
          [
            ["Best day", pct(daily[best]!, 2), "text-leaf", ago(best) ? `${ago(best)} d ago` : "today"],
            ["Worst day", pct(daily[worst]!, 2), daily[worst]! < 0 ? "text-flesh" : "text-text", ago(worst) ? `${ago(worst)} d ago` : "today"],
            ["Longest run", `${streak} d`, "text-text", "paying days in a row"],
          ] as const
        ).map(([k, v, tone, sub]) => (
          <div key={k} className="rounded-xl bg-[#0d0d0d] px-3 py-2">
            <dt className="text-[12px] text-muted">{k}</dt>
            <dd className={cx("font-mono text-[15px]", tone)}>{v}</dd>
            <dd className="text-[12px] text-muted">{sub}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Every pool's window on one chart, so the shapes compare at a glance. */
function AllCurves({ rows, sel, onPick }: { rows: Row[]; sel: string | null; onPick: (p: string) => void }) {
  const ls = rows.filter((r) => (r.days?.curve.length ?? 0) > 1);
  if (!ls.length) return <p className="caret font-mono text-[12px] text-muted">Reading the pools</p>;
  // a square-root scale, so one pool with a deep loss does not flatten the rest; every line ends at today
  const sq = (v: number) => Math.sign(v) * Math.sqrt(Math.abs(v));
  const all = ls.flatMap((r) => r.days!.curve.map(sq));
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all), span = hi - lo || 1;
  const Y = (v: number) => 100 - ((sq(v) - lo) / span) * 100;
  const N = Math.max(...ls.map((r) => r.days!.curve.length));
  const X = (i: number, n: number) => 100 - ((n - 1 - i) / Math.max(1, N - 1)) * 100;
  return (
    <div>
      <div className="relative h-28">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <line x1={0} x2={100} y1={Y(0)} y2={Y(0)} stroke="#303030" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          {ls.map((r, k) => {
            const c = r.days!.curve;
            const d = c.map((v, i) => `${i ? "L" : "M"}${X(i, c.length).toFixed(2)},${Y(v).toFixed(2)}`).join(" ");
            const on = r.pair === sel;
            return <path key={r.pair} d={d} fill="none" stroke={LINE_TONES[k % LINE_TONES.length]} strokeWidth={on ? 2.4 : 1.3} strokeOpacity={on ? 1 : 0.55} vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
      </div>
      <p className="mt-1 flex justify-between font-mono text-[12px] text-muted">
        <span>{`${N} days ago`}</span>
        <span>square-root scale</span>
        <span>today</span>
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {ls.map((r, k) => (
          <li key={r.pair}>
            <button type="button" onClick={() => onPick(r.pair)} aria-pressed={r.pair === sel} className={cx("flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[12px]", r.pair === sel ? "border-leaf text-text" : "border-line text-muted hover:text-text")}>
              <i className="h-2 w-2 rounded-full" style={{ background: LINE_TONES[k % LINE_TONES.length] }} />
              {r.symbol}
              <span className={r.days!.total >= 0 ? "text-leaf" : "text-flesh"}>{pct(r.days!.total)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EarnGrid() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("apr");
  const [pick, setPick] = useState<string | null>(null);
  const [amount, setAmount] = useState(1000);

  useEffect(() => {
    let off = false;
    const load = () =>
      fetch("/api/earn")
        .then((r) => (r.status === 200 ? r.json() : null))
        .then((j: { rows?: Row[] } | null) => !off && j?.rows && setRows(j.rows))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, []);

  const list = useMemo(() => {
    const r = [...(rows ?? [])];
    const k = (x: Row) => (sort === "apr" ? -(x.days?.avgApr ?? x.apr ?? 0) : sort === "steady" ? -(x.days?.steadiness ?? 0) : (x.days?.feesBack ?? 1e9));
    return r.sort((a, b) => k(a) - k(b));
  }, [rows, sort]);
  const sel = list.find((r) => r.pair === pick) ?? list[0] ?? null;
  const made = sel?.days ? amount * sel.days.total : null;
  const recorded = sel?.covered ?? 0;
  // the page's answer: which pool left an LP ahead after price moves, and by how much
  const best = [...(rows ?? [])].filter((r) => r.days && !r.doubt).sort((a, b) => b.days!.total - a.days!.total)[0];
  const ahead = (rows ?? []).filter((r) => r.days && !r.doubt && r.days.total > 0).length;
  const withDays = (rows ?? []).filter((r) => r.days && !r.doubt).length;
  // before the record has days: the best of the last day, from pools no check doubts
  const day = [...(rows ?? [])].filter((r) => !r.doubt && r.apr != null).sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0))[0];
  // the window the record really covers (it fills toward thirty days), named as it is
  const win = Math.max(0, ...(rows ?? []).map((r) => r.days?.n ?? 0));
  const span = win >= 30 ? "the last 30 days" : `the last ${win} day${win === 1 ? "" : "s"}`;

  return (
    <div className="space-y-4">
    {best ? (
      <Verdict
        kicker={`Pool fees · ${span}`}
        tone={best.days!.total > 0 ? "good" : "bad"}
        value={pct(best.days!.total)}
        valueLabel={`kept by an LP in ${best.symbol}/${baseSym(best.base)}, after price moves`}
        facts={[
          ["Pools ahead", `${ahead} of ${withDays}`],
          ["Best average APR", `${(Math.max(...(rows ?? []).filter((r) => !r.doubt).map((r) => r.days?.avgApr ?? 0)) * 100).toFixed(1)}%`],
          ["Steadiest", (() => { const s = [...(rows ?? [])].filter((r) => r.days).sort((a, b) => b.days!.paid / b.days!.n - a.days!.paid / a.days!.n)[0]; return s ? `${s.symbol} ${s.days!.paid}/${s.days!.n} days` : "—"; })()],
        ]}
      >
        {best.days!.total > 0
          ? `Over ${span}, ${ahead} of ${withDays} pools left their LPs ahead once price moves took their share. ${best.symbol} kept the most.`
          : `Over ${span}, no pool left its LPs ahead once price moves took their share.`}
      </Verdict>
    ) : day ? (
      <Verdict
        kicker="Pool fees · last 24 hours"
        tone="info"
        value={`${((day.apr ?? 0) * 100).toFixed(1)}%`}
        valueLabel={`yearly rate in ${day.symbol}/${baseSym(day.base)}, from the last day of swaps`}
        facts={[
          ["Pools read", String((rows ?? []).length)],
          ["Deepest", usd(Math.max(...(rows ?? []).map((r) => r.liquidity)))],
        ]}
      >
        The day-by-day record is being rebuilt from the chain and fills in over the next hours. Until then this is one day, not a month.
      </Verdict>
    ) : (
      <div aria-hidden className="h-40 rounded-2xl border border-line bg-[#0e0e0e] p-8">
        <span className="block h-3 w-40 rounded bg-[#181818]" />
        <span className="mt-5 block h-8 w-[55%] rounded bg-[#181818]" />
      </div>
    )}
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
      <section className="flex flex-col overflow-hidden rounded-2xl border border-line bg-[#0f0f0f]">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <div>
            <p className="text-[15px] font-semibold text-text">{`Pools, ${span}`}</p>
            <p className="text-[12px] text-muted">After fees: what an LP kept once price moves took their share back.</p>
          </div>
          <div className="ml-auto">
            <SubTabs label="Sort" value={sort} onChange={setSort} tabs={SORTS} />
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                {["Pair", "After fees", "Paid", "Fees back", "Now", "Avg APR"].map((h, i) => (
                  <th key={h} className={cx("px-4 py-2.5 font-normal", i >= 3 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!rows && (
                <tr>
                  <td colSpan={6} className="caret px-4 py-8 font-mono text-[12px] text-muted">
                    Reading the pools
                  </td>
                </tr>
              )}
              {list.map((r) => {
                const on = sel?.pair === r.pair;
                return (
                  <tr key={r.pair} onClick={() => setPick(r.pair)} className={cx("cursor-pointer border-b border-[#1a1a1a] transition-colors last:border-0", on ? "bg-leaf/[0.06]" : "hover:bg-[#141414]")}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        {on && <span className="h-6 w-0.5 rounded-full bg-leaf" />}
                        <TokenAvatar address={r.token} symbol={r.symbol} size={28} />
                        <span>
                          <Link href={`/app/pool/${r.pair}`} onClick={(e) => e.stopPropagation()} className="block font-mono text-text hover:text-leaf hover:underline">{`${r.symbol}/${baseSym(r.base)}`}</Link>
                          <span className="block text-[12px] text-muted">{`${usd(r.liquidity)} deep`}</span>
                          {r.doubt && <span title="A second check did not confirm this pool's figures" className="mt-0.5 block text-[12px] text-amber">{`In doubt: ${r.doubt}`}</span>}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        <Curve v={r.days?.curve ?? []} />
                        {r.days && <span className={cx("font-mono text-[12px]", r.days.total >= 0 ? "text-leaf" : "text-flesh")}>{pct(r.days.total)}</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">{r.days ? <Paid d={r.days} /> : <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-text">{r.days?.feesBack == null ? "—" : r.days.feesBack < 0.5 ? "now" : `${Math.ceil(r.days.feesBack)} d`}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-text">{r.apr == null ? "—" : `${(r.apr * 100).toFixed(1)}%`}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-leaf">{r.days ? `${(r.days.avgApr * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sel && (
          <div className="grid flex-1 grid-cols-1 gap-px border-t border-line bg-line lg:grid-cols-2">
            <div className="bg-[#0f0f0f] px-5 py-4">
              <p className="mb-3 flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] font-semibold text-text">{`${sel.symbol}/${baseSym(sel.base)}, day by day`}</span>
                <span className="font-mono text-[12px] text-muted">kept after fees each day</span>
              </p>
              <DayBars r={sel} />
            </div>
            <div className="bg-[#0f0f0f] px-5 py-4">
              <p className="mb-3 flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] font-semibold text-text">Every pool, side by side</span>
                <span className="font-mono text-[12px] text-muted">click one to open it</span>
              </p>
              <AllCurves rows={list} sel={sel.pair} onPick={setPick} />
            </div>
          </div>
        )}
        <p className="border-t border-line px-5 py-3 text-[12px] text-muted">Paid: days that ended ahead after fees. Fees back: days of average fees that pay back the window&apos;s whole price-move loss. The past, not a promise.</p>
      </section>

      <aside className="xl:sticky xl:top-24 xl:self-start">
        <section className="overflow-hidden rounded-2xl border border-line bg-[#0f0f0f]">
          {sel ? (
            <>
              <header className="flex items-center gap-3 border-b border-line px-5 py-4">
                <TokenAvatar address={sel.token} symbol={sel.symbol} size={34} />
                <span>
                  <span className="block font-mono text-[15px] text-text">{`${sel.symbol}/${baseSym(sel.base)}`}</span>
                  <span className="block text-[12px] text-muted">{`Uniswap V2 · 0.3% fee · ${usd(sel.liquidity)} deep`}</span>
                </span>
              </header>
              <div className="px-5 py-4">
                <label className="block">
                  <span className="flex justify-between text-[12px] text-muted">
                    If you had put in
                    <span className="font-mono text-text">{usd(amount)}</span>
                  </span>
                  <input type="range" min={100} max={25000} step={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mt-2 w-full accent-[var(--ui)]" aria-label="Amount" />
                </label>
                <div className="mt-4 rounded-xl bg-[#0d0d0d] p-3">
                  <Curve v={sel.days?.curve ?? []} w={330} h={110} strong />
                  <p className="mt-2 flex justify-between font-mono text-[12px] text-muted">
                    <span>{sel.days ? `${sel.days.n} days ago` : ""}</span>
                    <span>today</span>
                  </p>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2">
                  {(
                    [
                      ["Kept after fees", made == null ? "—" : `${made >= 0 ? "+" : "−"}${usd(Math.abs(made))}`, made != null && made < 0],
                      ["Days paid", sel.days ? `${sel.days.paid} of ${sel.days.n}` : "—", false],
                      ["Avg APR", sel.days ? `${(sel.days.avgApr * 100).toFixed(1)}%` : "—", false],
                      ["Fees last day", usd(sel.fees), false],
                    ] as const
                  ).map(([k, v, bad]) => (
                    <div key={k} className="rounded-xl bg-[#0d0d0d] px-3 py-2.5">
                      <dt className="text-[12px] text-muted">{k}</dt>
                      <dd className={cx("font-mono text-[16px]", bad ? "text-flesh" : "text-text")}>{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4">
                  <EarnDeposit key={sel.pair} pair={sel.pair} token={sel.token} symbol={sel.symbol} base={sel.base} apr={sel.days?.avgApr ?? sel.apr ?? 0} />
                </div>
                {recorded < 30 && <p className="mt-3 text-[12px] text-muted">{`${recorded} of 30 days recorded so far; the rest fills in within the hour.`}</p>}
                <div className="mt-4 flex gap-2">
                  <Link href={`/app/pool/${sel.pair}`} className="flex-1 rounded-xl bg-ui py-2.5 text-center text-[13px] font-semibold text-[#0b0b0b]">
                    Day by day
                  </Link>
                  <Link href={`/app/trade/terminal?token=${sel.token}`} className="flex-1 rounded-xl border border-line py-2.5 text-center text-[13px] text-text hover:border-ui/60">
                    Chart
                  </Link>
                  <a href={`${SCAN}${sel.pair}`} target="_blank" rel="noreferrer" className="flex-1 rounded-xl border border-line py-2.5 text-center text-[13px] text-text hover:border-ui/60">
                    Pool ↗
                  </a>

                </div>
              </div>
            </>
          ) : (
            <p className="caret px-5 py-8 font-mono text-[12px] text-muted">Reading the pools</p>
          )}
        </section>
      </aside>
    </div>
    </div>
  );
}
