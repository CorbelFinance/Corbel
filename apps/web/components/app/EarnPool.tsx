"use client";

/**
 * Earn · one pool's own page. The last 30 days of this pool, day by day, from its own events: what it paid in fees,
 * what the price move took back, and what an LP kept. Above, the curve and the record; at the side, what a chosen
 * amount would have kept over the window. The past, read from the chain; nothing here is a promise.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { TokenAvatar } from "./TokenAvatar";
import { EarnDeposit } from "./EarnDeposit";
import { PoolFeeHistory } from "./PoolFeeHistory";
import { PoolHealth } from "./PoolHealth";

type Daily = { day: number; swaps: number; vol: number; fees: number; liq: number; move: number; fy: number; il: number; net: number };
type Days = { n: number; paid: number; curve: number[]; avgApr: number; feesBack: number | null; steadiness: number; total: number; daily: Daily[] };
type Row = { token: string; symbol: string; pair: string; base: string; liquidity: number; volume: number; fees: number; apr: number | null; swaps: number; days: Days | null; covered: number };

const usd = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(2)}`);
const pct = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const date = (day: number) => new Date(day * 86_400_000).toISOString().slice(5, 10);
const SCAN = "https://robinhoodchain.blockscout.com/address/";

function Curve({ v, h = 180 }: { v: number[]; h?: number }) {
  const w = 900;
  if (v.length < 2) return null;
  const lo = Math.min(0, ...v), hi = Math.max(0, ...v), span = hi - lo || 1;
  const X = (i: number) => (i / (v.length - 1)) * w, Y = (x: number) => h - ((x - lo) / span) * (h - 16) - 8;
  const d = v.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join(" ");
  const c = v[v.length - 1]! >= 0 ? "var(--leaf)" : "var(--flesh)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block h-[180px] w-full" role="img" aria-label="What an LP kept over the window, day by day">
      <line x1={0} x2={w} y1={Y(0)} y2={Y(0)} stroke="#303030" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d={`${d} L${w},${Y(0)} L0,${Y(0)} Z`} fill={c} fillOpacity={0.12} />
      <path d={d} fill="none" stroke={c} strokeWidth={2} vectorEffect="non-scaling-stroke" className="draw-line" />
    </svg>
  );
}

export function EarnPool({ pair }: { pair: string }) {
  const [row, setRow] = useState<Row | null | undefined>(undefined);
  const [amt, setAmt] = useState(1000);
  useEffect(() => {
    let off = false;
    fetch("/api/earn")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: Row[] } | null) => !off && setRow(j?.rows?.find((x) => x.pair.toLowerCase() === pair.toLowerCase()) ?? null))
      .catch(() => !off && setRow(null));
    return () => {
      off = true;
    };
  }, [pair]);
  const daily = useMemo(() => [...(row?.days?.daily ?? [])].reverse(), [row]);
  const sum = (k: keyof Daily) => (row?.days?.daily ?? []).reduce((a, d) => a + (d[k] as number), 0);
  const base = row?.base.toUpperCase() === "USDG" || row?.base.toLowerCase() === "0x5fc5360d0400a0fd4f2af552add042d716f1d168" ? "USDG" : "WETH";

  if (row === undefined) return <p className="caret py-20 text-center font-mono text-[13px] text-muted">Reading the pool&apos;s days</p>;
  if (row === null)
    return (
      <p className="py-20 text-center text-[14px] text-muted">
        This pool is not among the ones Corbel tracks.{" "}
        <Link href="/app/account/pools" className="text-leaf underline underline-offset-2">
          All pools →
        </Link>
      </p>
    );
  const d = row.days;
  const kept = d ? amt * d.total : 0;
  const maxFee = Math.max(1e-9, ...(d?.daily ?? []).map((x) => x.fees));

  return (
    <div className="space-y-5">
      <Link href="/app/account/pools" className="text-[13px] text-muted hover:text-text">
        ← All pools
      </Link>
      <header className="flex flex-wrap items-center gap-4">
        <TokenAvatar address={row.token} symbol={row.symbol} size={48} />
        <div className="min-w-0">
          <h1 className="font-display text-3xl tracking-tight text-text">{`${row.symbol}/${base}`}</h1>
          <p className="text-[13px] text-muted">{`Uniswap V2 · 0.3% fee · ${usd(row.liquidity)} deep · ${row.swaps.toLocaleString("en")} swaps in the last day`}</p>
        </div>
        <span className="ml-auto flex gap-2">
          <Link href={`/app/trade/terminal?token=${row.token}`} className="rounded-xl border border-line px-4 py-2.5 text-[13px] text-text hover:border-ui/60">
            Chart
          </Link>
          <a href={`${SCAN}${row.pair}`} target="_blank" rel="noreferrer" className="rounded-xl border border-line px-4 py-2.5 text-[13px] text-text hover:border-ui/60">
            Pool on the explorer ↗
          </a>
        </span>
      </header>

      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["Kept, 30 days", d ? pct(d.total) : "…", d && d.total < 0],
            ["Days paid", d ? `${d.paid} of ${d.n}` : "…", false],
            ["Average APR", d ? `${(d.avgApr * 100).toFixed(1)}%` : "…", false],
            ["Fees in the window", d ? usd(sum("fees")) : "…", false],
            ["Fees back in", d?.feesBack == null ? "now" : d.feesBack < 0.5 ? "now" : `${Math.ceil(d.feesBack)} days`, false],
            ["Steadiness", d ? `${Math.round(d.steadiness * 100)} / 100` : "…", false],
          ] as const
        ).map(([k, v, bad]) => (
          <div key={k} className="bg-[#0e0e0e] p-4">
            <p className="text-[12px] text-muted">{k}</p>
            <p className={cx("mt-1 font-mono text-[20px]", bad ? "text-flesh" : "text-text")}>{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
          <p className="border-b border-line px-5 py-3 text-[14px] font-semibold text-text">What an LP kept, day after day</p>
          <div className="px-5 pt-4">{d && <Curve v={d.curve} />}</div>
          {/* fees per day as bars, the price move as a red cap where it took more back */}
          <div className="flex h-20 items-end gap-[3px] px-5 pb-4 pt-3" aria-hidden>
            {(d?.daily ?? []).map((x) => (
              <span key={x.day} className="flex flex-1 flex-col justify-end gap-px" title={`${date(x.day)}: ${usd(x.fees)} fees, price move ${pct(x.il)}`}>
                <span className="bar-grow rounded-t-[2px] bg-leaf/70" style={{ height: `${Math.max(2, (x.fees / maxFee) * 52)}px` }} />
                {x.il < -x.fy && <span className="h-1 rounded-[1px] bg-flesh/80" />}
              </span>
            ))}
          </div>
          <div className="max-h-[28rem] overflow-auto border-t border-line">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead className="sticky top-0 bg-[#0e0e0e]">
                <tr className="border-b border-line font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                  {["Day", "Swaps", "Volume", "Fees", "Fee yield", "Price move cost", "Kept"].map((h, i) => (
                    <th key={h} className={cx("px-4 py-2.5 font-normal", i > 0 && "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {daily.map((x) => (
                  <tr key={x.day} className="border-b border-[#1a1a1a] last:border-0">
                    <td className="px-4 py-2 text-muted">{date(x.day)}</td>
                    <td className="px-4 py-2 text-right text-text">{x.swaps.toLocaleString("en")}</td>
                    <td className="px-4 py-2 text-right text-text">{usd(x.vol)}</td>
                    <td className="px-4 py-2 text-right text-leaf">{usd(x.fees)}</td>
                    <td className="px-4 py-2 text-right text-text">{pct(x.fy, 3)}</td>
                    <td className={cx("px-4 py-2 text-right", x.il < 0 ? "text-flesh" : "text-muted")}>{x.il === 0 ? "none" : pct(x.il, 3)}</td>
                    <td className={cx("px-4 py-2 text-right", x.net >= 0 ? "text-leaf" : "text-flesh")}>{pct(x.net, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-2xl border border-line bg-[#0e0e0e] p-5">
            <p className="text-[14px] font-semibold text-text">If you had put in</p>
            <p className="mt-2 font-mono text-[30px] text-text">{usd(amt)}</p>
            <input type="range" min={100} max={25000} step={100} value={amt} onChange={(e) => setAmt(Number(e.target.value))} className="mt-2 w-full accent-[var(--ui)]" aria-label="Amount" />
            <div className="mt-3 flex gap-1.5">
              {[500, 1000, 5000, 10000].map((v) => (
                <button key={v} type="button" onClick={() => setAmt(v)} className={cx("flex-1 rounded-lg border py-1 font-mono text-[12px]", amt === v ? "border-leaf text-text" : "border-line text-muted hover:text-text")}>
                  {usd(v)}
                </button>
              ))}
            </div>
            <dl className="mt-4 space-y-2 text-[13px]">
              {(
                [
                  ["Fees it earned", d ? usd(amt * (d.daily ?? []).reduce((a, x) => a + x.fy, 0)) : "…", "text-leaf"],
                  ["Price move took", d ? usd(amt * (d.daily ?? []).reduce((a, x) => a + x.il, 0)) : "…", "text-flesh"],
                  ["Kept after 30 days", d ? `${kept >= 0 ? "+" : "−"}${usd(Math.abs(kept))}` : "…", kept >= 0 ? "text-leaf" : "text-flesh"],
                  ["Share of the pool", `${((amt / Math.max(1, row.liquidity)) * 100).toFixed(2)}%`, "text-text"],
                ] as const
              ).map(([k, v, c]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd className={cx("font-mono", c)}>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 border-t border-line pt-4">
              <EarnDeposit pair={row.pair} token={row.token} symbol={row.symbol} base={row.base} apr={d?.avgApr ?? row.apr ?? 0} />
            </div>
          </section>
          <p className="px-1 text-[12px] text-muted">Read from the pool&apos;s own swaps and reserves, day by day. A bigger position than the pool&apos;s volume earns a smaller share of fees. The past, not a promise.</p>
        </aside>
      </div>
      <PoolHealth pair={row.pair} />
      <PoolFeeHistory pair={row.pair} />
    </div>
  );
}
