"use client";

/**
 * Earn · board. The day in the pools at a glance, drawn from the same Earn snapshot as the table:
 * figure cards that each carry their own small chart, the last 24 hours as stacked bars by pool (volume
 * or fees, hover an hour for its breakdown), and liquidity against fees per pool as paired bars, so a pool
 * that pays far more than its size stands out. Click a pool anywhere to load it in the planner.
 */
import { useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { SubTabs } from "./Bay";
import { TokenAvatar } from "./TokenAvatar";

type Row = {
  token: string;
  symbol: string;
  name: string;
  pair: string;
  base: string;
  liquidity: number;
  volume: number;
  fees: number;
  hours: number;
  apr: number | null;
  swaps: number;
  hourly: number[];
  net: number | null;
};
const usd = (v: number) =>
  !Number.isFinite(v)
    ? "—"
    : v >= 1e6
      ? `$${(v / 1e6).toFixed(2)}M`
      : v >= 1e3
        ? `$${(v / 1e3).toFixed(1)}K`
        : `$${v.toFixed(v < 10 ? 2 : 0)}`;
const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 2 : 1)}%`;
/** Series colours: dark-ground tones, one per top pool, the rest in grey. */
const COL = ["#6fe7a8", "#9b86e4", "#6cc0d0", "#f2c46d", "#ff8fa3"];
const REST = "#4b4b4b";
const hh = (t: number) => new Date(t).toISOString().slice(11, 16);

function Bars({ v, color, h = 34 }: { v: number[]; color: string; h?: number }) {
  const max = Math.max(...v, 1e-9);
  return (
    <div className="flex items-end gap-[2px]" style={{ height: h }} aria-hidden>
      {v.map((x, i) => (
        <span
          key={i}
          className="bar-rise flex-1 rounded-t-[2px]"
          style={{
            height: `${Math.max(3, (x / max) * 100)}%`,
            background: x > 0 ? color : "#2b2b2b",
            animationDelay: `${i * 0.02}s`,
          }}
        />
      ))}
    </div>
  );
}

export function EarnBoard({
  rows,
  at,
  onPick,
  picked,
}: {
  rows: Row[];
  at: number | null;
  onPick: (pair: string) => void;
  picked?: string;
}) {
  const [mode, setMode] = useState<"volume" | "fees">("volume");
  const [hour, setHour] = useState<number | null>(null);
  const [hp, setHp] = useState<string | null>(null);

  const d = useMemo(() => {
    const byVol = [...rows].sort((a, b) => b.volume - a.volume);
    const top = byVol.slice(0, 5);
    const rest = byVol.slice(5);
    const rate = (x: Row) => (x.volume > 0 ? x.fees / x.volume : 0);
    const val = (x: Row, i: number) => (x.hourly[i] ?? 0) * (mode === "fees" ? rate(x) : 1);
    const hours = Array.from({ length: 24 }, (_, i) => {
      const parts = top.map((x, k) => ({
        key: x.pair,
        symbol: x.symbol,
        token: x.token,
        color: COL[k]!,
        v: val(x, i),
      }));
      if (rest.length)
        parts.push({
          key: "rest",
          symbol: `${rest.length} others`,
          token: "",
          color: REST,
          v: rest.reduce((s, x) => s + val(x, i), 0),
        });
      return { i, parts, total: parts.reduce((s, p) => s + p.v, 0) };
    });
    const liq = rows.reduce((s, x) => s + x.liquidity, 0);
    const vol = rows.reduce((s, x) => s + x.volume, 0);
    const fees = rows.reduce((s, x) => s + x.fees, 0);
    const volH = Array.from({ length: 24 }, (_, i) => rows.reduce((s, x) => s + (x.hourly[i] ?? 0), 0));
    const feeH = Array.from({ length: 24 }, (_, i) =>
      rows.reduce((s, x) => s + (x.hourly[i] ?? 0) * rate(x), 0),
    );
    const aprs = rows.map((x) => x.apr ?? 0).sort((a, b) => a - b);
    const kept = [...rows].filter((x) => x.net !== null).sort((a, b) => (b.net ?? 0) - (a.net ?? 0))[0];
    const byLiq = [...rows].sort((a, b) => b.liquidity - a.liquidity);
    const paired = byLiq
      .slice(0, 12)
      .map((x) => ({ x, l: liq ? x.liquidity / liq : 0, f: fees ? x.fees / fees : 0 }));
    const colorOf = (pair: string) => {
      const k = top.findIndex((x) => x.pair === pair);
      return k >= 0 ? COL[k]! : REST;
    };
    const each = Array.from({ length: 24 }, (_, i) =>
      rows
        .map((x) => ({ key: x.pair, symbol: x.symbol, color: colorOf(x.pair), v: val(x, i) }))
        .filter((p) => p.v > 0)
        .sort((a, b) => b.v - a.v),
    );
    return {
      top,
      hours,
      each,
      liq,
      vol,
      fees,
      volH,
      feeH,
      aprs,
      median: aprs[Math.floor(aprs.length / 2)] ?? 0,
      kept,
      byLiq,
      paired,
      max: Math.max(...hours.map((h) => h.total), 1e-9),
      pmax: Math.max(...paired.flatMap((p) => [p.l, p.f]), 1e-9),
    };
  }, [rows, mode]);

  const end = at ?? 0;
  const h = hour !== null ? d.hours[hour]! : null;
  const prev = hour !== null && hour > 0 ? d.hours[hour - 1]!.total : null;

  return (
    <div className="space-y-4">
      {/* one instrument strip: five readings, each with its own small chart */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-5">
        <div className="card-in bg-[#0f0f0f] px-4 py-3">
          <p className="text-[12px] text-muted">Liquidity read</p>
          <p className="mt-1 font-mono text-[22px] text-text">{usd(d.liq)}</p>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-[#1e1e1e]">
            {d.byLiq.slice(0, 5).map((x, k) => (
              <span
                key={x.pair}
                title={`${x.symbol} ${pct(x.liquidity / d.liq)}`}
                className="bar-grow h-full"
                style={{
                  width: `${(x.liquidity / d.liq) * 100}%`,
                  background: COL[k],
                  animationDelay: `${k * 0.08}s`,
                }}
              />
            ))}
          </div>
          <p className="mt-1.5 truncate text-[12px] text-muted">{`${d.byLiq[0]?.symbol ?? "—"} holds ${d.byLiq[0] ? pct(d.byLiq[0].liquidity / d.liq) : "—"} · ${rows.length} pools`}</p>
        </div>
        <div
          className="card-in bg-[#0f0f0f] px-4 py-3"
          style={{ animationDelay: ".05s" }}
        >
          <p className="text-[12px] text-muted">Volume, last 24h</p>
          <p className="mt-1 font-mono text-[22px] text-text">{usd(d.vol)}</p>
          <div className="mt-2">
            <Bars v={d.volH} color="#6fe7a8" />
          </div>
        </div>
        <div
          className="card-in bg-[#0f0f0f] px-4 py-3"
          style={{ animationDelay: ".1s" }}
        >
          <p className="text-[12px] text-muted">Paid to LPs</p>
          <p className="mt-1 font-mono text-[22px] text-[#9b86e4]">{usd(d.fees)}</p>
          <div className="mt-2">
            <Bars v={d.feeH} color="#9b86e4" />
          </div>
        </div>
        <div
          className="card-in bg-[#0f0f0f] px-4 py-3"
          style={{ animationDelay: ".15s" }}
        >
          <p className="text-[12px] text-muted">Median fee yield</p>
          <p className="mt-1 font-mono text-[22px] text-text">{pct(d.median)}</p>
          {/* every pool's yearly rate as a tick on one log line; the median lit */}
          <div className="relative mt-4 h-5">
            <span className="absolute inset-x-0 top-1/2 h-px bg-[#2b2b2b]" />
            {d.aprs.map((v, k) => {
              const x = Math.max(0, Math.min(1, (Math.log10(Math.max(v, 0.001)) + 3) / 4));
              return (
                <span
                  key={k}
                  className="tick-in absolute top-0 h-5 w-[2px] rounded bg-[#6cc0d0]/50"
                  style={{ left: `${x * 100}%`, animationDelay: `${k * 0.015}s` }}
                />
              );
            })}
            <span
              className="absolute top-[-3px] h-[26px] w-[3px] rounded bg-[#6cc0d0] shadow-[0_0_8px_#6cc0d0]"
              style={{
                left: `${Math.max(0, Math.min(1, (Math.log10(Math.max(d.median, 0.001)) + 3) / 4)) * 100}%`,
              }}
            />
          </div>
          <p className="mt-1 flex justify-between font-mono text-[12px] text-muted">
            <span>0.1%</span>
            <span>10%</span>
            <span>1000%</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => d.kept && onPick(d.kept.pair)}
          className="card-in col-span-2 bg-[#0f0f0f] px-4 py-3 text-left transition-colors hover:bg-[#141414] lg:col-span-1"
          style={{ animationDelay: ".2s" }}
        >
          <p className="text-[12px] text-muted">Kept the most after the price move</p>
          {d.kept ? (
            <>
              <p className="mt-2 flex items-center gap-2">
                <TokenAvatar address={d.kept.token} symbol={d.kept.symbol} size={26} />
                <span className="font-mono text-[18px] text-text">{d.kept.symbol}</span>
                <span className="ml-auto font-mono text-[18px] text-leaf">{`${(d.kept.net ?? 0) >= 0 ? "+" : ""}${((d.kept.net ?? 0) * 100).toFixed(2)}%`}</span>
              </p>
              <p className="mt-2 text-[12px] text-muted">{`fees ${usd(d.kept.fees)} on ${usd(d.kept.liquidity)} · open in the planner →`}</p>
            </>
          ) : (
            <p className="mt-2 text-muted">—</p>
          )}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* stacked hours */}
        <section
          className="relative rounded-2xl border border-[#242424] bg-[#121212] p-4"
          aria-label="The last 24 hours by pool"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[15px] font-semibold text-text">The last 24 hours, by pool</h2>
            <div className="ml-auto">
              <SubTabs
                label="Measure"
                value={mode}
                onChange={setMode}
                tabs={[
                  { id: "volume", label: "Volume" },
                  { id: "fees", label: "Fees to LPs" },
                ]}
              />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
            {d.top.map((x, k) => (
              <button
                key={x.pair}
                type="button"
                onClick={() => onPick(x.pair)}
                className="flex items-center gap-1.5 hover:text-text"
              >
                <i className="h-2.5 w-2.5 rounded-sm" style={{ background: COL[k] }} />
                {x.symbol}
              </button>
            ))}
            {rows.length > d.top.length && (
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm" style={{ background: REST }} />
                Others
              </span>
            )}
          </div>
          <div
            className="relative mt-3 flex h-56 items-end gap-[3px] border-b border-[#2b2b2b] pl-12"
            onMouseLeave={() => setHour(null)}
          >
            {[1, 0.5].map((k) => (
              <span
                key={k}
                className="pointer-events-none absolute left-12 right-0 border-t border-dashed border-[#242424]"
                style={{ bottom: `${k * 100}%` }}
              >
                <span className="absolute -left-12 -top-2 w-11 text-right tabular-nums text-[12px] text-muted">
                  {usd(d.max * k)}
                </span>
              </span>
            ))}
            {d.hours.map((x) => (
              <button
                key={x.i}
                type="button"
                aria-label={`Hour ending ${hh(end - (23 - x.i) * 3600_000)}: ${usd(x.total)}`}
                onMouseEnter={() => setHour(x.i)}
                onFocus={() => setHour(x.i)}
                className={cx(
                  "relative flex h-full flex-1 flex-col-reverse justify-start rounded-t-[3px]",
                  hour !== null && hour !== x.i && "opacity-45",
                )}
              >
                {x.parts.map((p) => (
                  <span
                    key={p.key}
                    className="stack-in w-full first:rounded-b-none last:rounded-t-[3px]"
                    style={{
                      height: `${(p.v / d.max) * 100}%`,
                      background: p.color,
                      animationDelay: `${x.i * 0.025}s`,
                    }}
                  />
                ))}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between pl-12 font-mono text-[12px] text-muted">
            <span>{hh(end - 24 * 3600_000)}</span>
            <span>{hh(end - 12 * 3600_000)}</span>
            <span>{hh(end)} UTC</span>
          </div>
          {h && (
            <div
              className="pointer-events-none absolute top-14 z-20 w-64 rounded-xl border border-[#2f2f2f] bg-[#0d0d0d]/95 p-3 shadow-2xl backdrop-blur"
              style={{
                left: `calc(3rem + ${((h.i + 0.5) / 24) * 100}% * 0.9 ${h.i > 14 ? "- 17rem" : "+ 1rem"})`,
              }}
            >
              <p className="text-[12px] text-muted">{`${hh(end - (24 - h.i) * 3600_000)}–${hh(end - (23 - h.i) * 3600_000)} UTC · ${mode === "fees" ? "fees to LPs" : "volume"}`}</p>
              <p className="mt-0.5 font-mono text-[20px] text-text">{usd(h.total)}</p>
              {prev !== null && prev > 0 && (
                <p className="text-[12px] text-muted">{`Against the hour before ${h.total >= prev ? "+" : ""}${(((h.total - prev) / prev) * 100).toFixed(1)}%`}</p>
              )}
              <p className="mt-2 border-t border-[#242424] pt-2 text-[12px] text-muted">
                {d.each[h.i]!.length
                  ? `That hour, by pool · ${d.each[h.i]!.length} traded`
                  : "No pool traded that hour"}
              </p>
              <ul className="mt-1 space-y-1.5">
                {d.each[h.i]!.slice(0, 6).map((p) => (
                  <li key={p.key}>
                    <span className="flex items-center gap-1.5 text-[12px]">
                      <i className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
                      <span className="text-text">{p.symbol}</span>
                      <span className="ml-auto font-mono text-muted">{usd(p.v)}</span>
                    </span>
                    <span className="mt-0.5 block h-[3px] rounded-full bg-[#1e1e1e]">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${h.total ? (p.v / h.total) * 100 : 0}%`, background: p.color }}
                      />
                    </span>
                  </li>
                ))}
                {d.each[h.i]!.length > 6 && (
                  <li className="text-[12px] text-muted">{`${d.each[h.i]!.length - 6} more · ${usd(d.each[h.i]!.slice(6).reduce((s, p) => s + p.v, 0))}`}</li>
                )}
              </ul>
            </div>
          )}
        </section>

        {/* liquidity vs fees, paired */}
        <section
          className="rounded-2xl border border-[#242424] bg-[#121212] p-4"
          aria-label="Liquidity against fees by pool"
        >
          <div className="flex items-baseline gap-3">
            <h2 className="text-[15px] font-semibold text-text">Size against pay</h2>
            <span className="ml-auto text-[12px] text-muted">share of all pools</span>
          </div>
          <div className="mt-2 flex gap-4 text-[12px] text-muted">
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-sm bg-[#6fe7a8]" /> Liquidity
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-sm bg-[#9b86e4]" /> Fees paid
            </span>
          </div>
          <ul className="mt-3 space-y-1">
            {d.paired.map(({ x, l, f }, k) => (
              <li key={x.pair}>
                <button
                  type="button"
                  onClick={() => onPick(x.pair)}
                  onMouseEnter={() => setHp(x.pair)}
                  onMouseLeave={() => setHp(null)}
                  className={cx(
                    "grid w-full grid-cols-[1.2rem_6.5rem_1fr_4.2rem] items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors",
                    picked === x.pair ? "bg-leaf/[0.08]" : "hover:bg-[#181818]",
                  )}
                >
                  <span className="font-mono text-[12px] text-muted">{k + 1}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <TokenAvatar address={x.token} symbol={x.symbol} size={18} />
                    <span className="truncate text-[12px] text-text">{x.symbol}</span>
                  </span>
                  <span className="space-y-[3px]">
                    <span className="block h-[5px] rounded-full bg-[#1e1e1e]">
                      <span
                        className="bar-grow block h-full rounded-full bg-[#6fe7a8]"
                        style={{ width: `${(l / d.pmax) * 100}%`, animationDelay: `${k * 0.04}s` }}
                      />
                    </span>
                    <span className="block h-[5px] rounded-full bg-[#1e1e1e]">
                      <span
                        className="bar-grow block h-full rounded-full bg-[#9b86e4]"
                        style={{ width: `${(f / d.pmax) * 100}%`, animationDelay: `${k * 0.04 + 0.1}s` }}
                      />
                    </span>
                  </span>
                  <span className="text-right tabular-nums text-[12px] leading-tight">
                    <span className="block text-[#6fe7a8]">{pct(l)}</span>
                    <span className={cx("block", f > l * 1.5 ? "text-[#9b86e4]" : "text-muted")}>
                      {pct(f)}
                    </span>
                  </span>
                </button>
                {hp === x.pair && (
                  <p className="pane-in px-8 pb-1 text-[12px] text-muted">
                    {f > l
                      ? `Pays ${(f / Math.max(l, 1e-9)).toFixed(1)}× its share of liquidity · ${usd(x.fees)} on ${usd(x.liquidity)}`
                      : `Pays less than its size · ${usd(x.fees)} on ${usd(x.liquidity)}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted">
            A fee bar longer than the liquidity bar means each dollar there earned more than average.
          </p>
        </section>
      </div>
    </div>
  );
}
