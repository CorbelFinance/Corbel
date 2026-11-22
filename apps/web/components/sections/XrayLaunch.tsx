"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { XRAY_EXAMPLE as X } from "@corbel/data";
import { Label, cx } from "@corbel/ui";

const N = 44; // candles
const LOOP_MS = 7000;
const SCAN_END = 0.72; // share of the loop the scanner takes to cross the chart
const ZOOM = 2.4; // lens magnification
const LENS = 136; // lens diameter, px

/** A chart that looks healthy: steady higher lows, rising volume. Deterministic. */
function candles() {
  let seed = 11;
  const r = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  let p = 20;
  return Array.from({ length: N }, (_, i) => {
    const o = p;
    p = Math.max(6, p + (r() - 0.38) * 5 + i * 0.06);
    const c = p;
    const hi = Math.max(o, c) + r() * 2.2;
    const lo = Math.min(o, c) - r() * 2.2;
    return { o, c, hi, lo, v: 0.25 + r() * 0.5 + i / N / 2 };
  });
}

type Live = { pools24: number; drained: number | null } | null;
type Lens = { x: number; y: number; w: number; h: number } | null;

/**
 * Landing "Why": one token, two readings. The scanner turns the market chart into what the contract really does.
 * A mouse over the chart brings up a lens: the same candles drawn larger around the pointer, and beside it a card
 * with what that candle says and what the contract does at that point. Example data, labelled as such.
 */
export function XrayLaunch() {
  const data = useMemo(() => candles(), []);
  const [t, setT] = useState(0); // 0..1 position in the loop
  const [live, setLive] = useState<Live>(null);
  const [lens, setLens] = useState<Lens>(null);
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t0 = 0;
    let on = false;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      setT(((now - t0) % LOOP_MS) / LOOP_MS);
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (still) {
        setT(0.99);
        return;
      }
      if (e?.isIntersecting && !on) {
        on = true;
        raf = requestAnimationFrame(tick);
      } else if (!e?.isIntersecting && on) {
        on = false;
        cancelAnimationFrame(raf);
      }
    });
    if (box.current) io.observe(box.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/launches")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { hours?: { v2: number; v4: number }[]; liveness?: { v2Known: number; v2Dead: number } } | null) => {
        if (!alive || !j?.hours) return;
        const pools24 = j.hours.slice(0, 24).reduce((a, h) => a + h.v2 + h.v4, 0);
        const drained = j.liveness && j.liveness.v2Known ? j.liveness.v2Dead / j.liveness.v2Known : null;
        setLive({ pools24, drained });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // the lens follows a mouse; touch keeps the plain chart
  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !plot.current) return;
    const r = plot.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    setLens(x < 0 || y < 0 || x > r.width || y > r.height ? null : { x, y, w: r.width, h: r.height });
  };

  const scan = Math.min(1, t / SCAN_END); // scanner position across the chart
  const verdict = t >= SCAN_END; // the simulations land after the scan
  const lo = Math.min(...data.map((d) => d.lo));
  const hi = Math.max(...data.map((d) => d.hi));
  const W = 1000;
  const CH = 200;
  const VH = 46;
  const VB = CH + VH + 6;
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (CH - 16);
  const cw = W / N;

  const pick = lens ? Math.max(0, Math.min(N - 1, Math.floor((lens.x / lens.w) * N))) : null;
  const pd = pick !== null ? data[pick]! : null;
  const chg = pd ? ((pd.c - pd.o) / pd.o) * 100 : 0;
  const found = pick !== null ? X.findings.filter((f) => f.at <= (pick + 1) / N) : [];

  // the candles and volume, drawn once and used in the chart and inside the lens
  const body = (
    <>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={0} x2={W} y1={CH * g} y2={CH * g} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
      ))}
      {data.map((d, i) => {
        const x = i * cw + cw / 2;
        const seen = (i + 0.5) / N < scan; // left of the scanner: x-rayed
        const up = d.c >= d.o;
        const col = seen ? "var(--flesh)" : up ? "var(--leaf)" : "var(--muted)";
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(d.hi)} y2={y(d.lo)} stroke={col} strokeOpacity={seen ? 0.55 : 0.9} vectorEffect="non-scaling-stroke" />
            <rect x={x - cw * 0.3} width={cw * 0.6} y={y(Math.max(d.o, d.c))} height={Math.max(1.5, Math.abs(y(d.o) - y(d.c)))} fill={seen ? "none" : col} stroke={col} strokeOpacity={seen ? 0.7 : 1} vectorEffect="non-scaling-stroke" />
            <rect x={x - cw * 0.3} width={cw * 0.6} y={CH + 6 + VH * (1 - d.v)} height={VH * d.v} fill={seen ? "var(--flesh)" : "var(--leaf)"} opacity={seen ? 0.18 : 0.32} />
          </g>
        );
      })}
    </>
  );

  return (
    <div ref={box} className="xr border border-line bg-surface/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <Label>One token, two readings</Label>
        <span className="flex items-center gap-3">
          <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-text">${X.ticker}</span>
          <Label>Example token</Label>
        </span>
      </div>

      <div className="relative px-4 pt-4">
        <div className="mb-2 flex justify-between font-mono text-[12px] uppercase tracking-[0.08em]">
          <span className="text-leaf">What the chart says</span>
          <span className={cx("transition-colors", scan > 0.05 ? "text-flesh" : "text-muted")}>What the contract does</span>
        </div>

        <div ref={plot} className={cx("relative", lens && "cursor-none")} onPointerMove={move} onPointerLeave={() => setLens(null)}>
          <svg viewBox={`0 0 ${W} ${VB}`} preserveAspectRatio="none" className="block h-80 w-full" role="img" aria-label="A rising price chart; a scanner reveals that the owner can mint, liquidity is not locked, sells are taxed and transfers are blocked">
            <defs>
              <linearGradient id="xr-beam" x1="0" x2="1">
                <stop offset="0" stopColor="var(--flesh)" stopOpacity="0" />
                <stop offset="1" stopColor="var(--flesh)" stopOpacity="0.28" />
              </linearGradient>
            </defs>
            {body}
            {pick !== null && <rect x={pick * cw + cw * 0.06} y={0} width={cw * 0.88} height={VB} fill="none" stroke="var(--text)" strokeOpacity={0.4} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
            {/* scanner */}
            {scan > 0 && scan < 1 && (
              <g>
                <rect x={Math.max(0, scan * W - 90)} y={0} width={Math.min(90, scan * W)} height={VB} fill="url(#xr-beam)" />
                <line x1={scan * W} x2={scan * W} y1={0} y2={VB} stroke="var(--flesh)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </g>
            )}
          </svg>

          {lens && pd && pick !== null && (
            <>
              {/* the lens: the same chart drawn larger, centred on the pointer */}
              <div aria-hidden className="pointer-events-none absolute z-10 overflow-hidden rounded-full border border-leaf/70 bg-bg shadow-[0_0_0_5px_rgba(0,0,0,0.35),0_14px_40px_rgba(0,0,0,0.6)]" style={{ width: LENS, height: LENS, left: lens.x - LENS / 2, top: lens.y - LENS / 2 }}>
                <div className="absolute" style={{ width: lens.w * ZOOM, height: lens.h * ZOOM, left: LENS / 2 - lens.x * ZOOM, top: LENS / 2 - lens.y * ZOOM }}>
                  <svg viewBox={`0 0 ${W} ${VB}`} preserveAspectRatio="none" className="block h-full w-full">
                    {body}
                  </svg>
                </div>
                <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 bg-text/60" />
                <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-text/60" />
              </div>
              {/* what this candle says, and what the contract does at the same moment */}
              <div aria-hidden className="pointer-events-none absolute z-20 w-64 border border-line bg-bg/95 p-3" style={{ top: Math.max(0, Math.min(lens.h - 200, lens.y - 70)), ...(lens.x > lens.w * 0.55 ? { right: lens.w - lens.x + LENS / 2 + 12 } : { left: lens.x + LENS / 2 + 12 }) }}>
                <p className="flex items-baseline justify-between font-mono text-[12px] uppercase tracking-[0.08em]">
                  <span className="text-text">{`$${X.ticker}`}</span>
                  <span className="text-muted">{`candle ${pick + 1} of ${N}`}</span>
                </p>
                <p className="mt-2 font-mono text-[12px] uppercase tracking-[0.08em] text-leaf">The chart</p>
                <p className="mt-0.5 flex justify-between text-[13px] text-text">
                  <span>{`${chg >= 0 ? "+" : ""}${chg.toFixed(1)}% this candle`}</span>
                  <span className="font-mono text-muted">{`vol ${Math.round(pd.v * 100)}`}</span>
                </p>
                <p className="mt-2.5 font-mono text-[12px] uppercase tracking-[0.08em] text-flesh">The contract</p>
                {found.length ? (
                  <ul className="mt-0.5 space-y-0.5 text-[12.5px]">
                    {found.map((f) => (
                      <li key={f.code} className="text-text">
                        <span className="mr-1.5 font-mono text-flesh">{f.code}</span>
                        {f.line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-[12.5px] text-muted">Looks clean this early.</p>
                )}
                <p className="mt-2.5 border-t border-line pt-2 font-mono text-[12px] text-muted">
                  {"A sell here returns "}
                  <span className="text-flesh">{X.exitBack}</span>
                </p>
              </div>
            </>
          )}
        </div>

        {/* findings pop as the scanner passes them */}
        {X.findings.map((f, i) => {
          const shown = scan >= f.at;
          return (
            <div
              key={f.code}
              className={cx("pointer-events-none absolute border border-flesh/60 bg-bg/95 px-2 py-1.5 font-mono text-[12px] uppercase tracking-[0.06em] transition-all duration-300", shown && !lens ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0")}
              style={f.at > 0.7 ? { right: "1.25rem", top: `${3.4 + (i % 2) * 3.2}rem` } : { left: `calc(1rem + (100% - 2rem) * ${f.at} - 4rem)`, top: `${3.4 + (i % 2) * 3.2}rem` }}
            >
              <span className="text-flesh">✕ {f.code}</span>
              <span className="ml-2 text-text">{f.line}</span>
            </div>
          );
        })}
      </div>

      {/* the two simulations Trust runs, then the verdict */}
      <div className="mt-3 grid gap-px border-t border-line bg-line sm:grid-cols-3">
        <div className="bg-bg px-4 py-3">
          <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Simulated buy</p>
          <p className={cx("mt-1 font-mono text-sm transition-colors", verdict ? "text-leaf" : "text-muted")}>{verdict ? `✓ ${X.buy}` : "waiting for the scan"}</p>
        </div>
        <div className="bg-bg px-4 py-3">
          <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Simulated sell</p>
          <p className={cx("mt-1 font-mono text-sm transition-colors delay-300", verdict ? "text-flesh" : "text-muted")}>{verdict ? `✕ ${X.sell}` : "—"}</p>
        </div>
        <div className={cx("px-4 py-3 transition-colors delay-500", verdict ? "bg-[color-mix(in_oklab,var(--flesh)_14%,var(--bg))]" : "bg-bg")}>
          <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Exit now</p>
          <p className={cx("mt-1 font-display text-2xl tabular-nums transition-colors delay-500", verdict ? "text-flesh" : "text-muted")}>{verdict ? `${X.exitBack} back` : "—"}</p>
        </div>
      </div>

      <p className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
        <span>
          <span aria-hidden className="text-flesh">▲ </span>Trust runs both sides before you buy. Nothing is sent.
        </span>
        {live && (
          <span className="text-text">
            Live · {live.pools24.toLocaleString("en")} pools in 24h
            {live.drained !== null && <span className="text-flesh"> · {Math.round(live.drained * 100)}% of funded V2 pairs drained</span>}
          </span>
        )}
      </p>
    </div>
  );
}
