"use client";

/**
 * Stocks · Turnover. How hard each stock token's liquidity works, three ways:
 *  - Map: liquidity across, 24h volume up (both log), dot size = trades, colour = 24h move, with the 1× and 0.1×
 *    turnover lines and the band above 1× shaded; labels placed so they never overlap;
 *  - Hottest: tokens ranked by turnover (volume / liquidity);
 *  - Thin books: roughly how far above the current price a buy of the size you pick fills, if one constant-product pool held all of the
 *    token's liquidity. Real routes split and can do better; it ranks, it does not quote.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import { Bay, SubTabs } from "./Bay";
import { TokenAvatar } from "./TokenAvatar";

type S = { token: string; symbol: string; name: string; volume: number; liquidity: number; trades: number; change: number | null; price: number | null; pools: number; venues: number };

const usd = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
const pct = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
const VIEWS = [
  { id: "map", label: "Map" },
  { id: "hot", label: "Hottest" },
  { id: "thin", label: "Thin books" },
] as const;
const MOVES = [
  { id: "all", label: "All" },
  { id: "up", label: "Rising" },
  { id: "down", label: "Falling" },
] as const;
const SIZES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];
const col = (c: number | null) => {
  if (c === null) return "#7d8a83";
  const t = Math.min(1, Math.abs(c) / 5);
  return c >= 0 ? `color-mix(in srgb, #6fe7a8 ${40 + t * 60}%, #7d8a83)` : `color-mix(in srgb, #ff5a72 ${40 + t * 60}%, #7d8a83)`;
};
/**
 * How much above the current price a buy of `x` dollars fills on average, in a constant-product pool holding `liq`
 * dollars in total (half each side): out = Ry·x / (Rx + x), so the average price is spot × (1 + x / Rx).
 */
const impact = (x: number, liq: number) => (liq > 0 ? x / (liq / 2) : 1);

function Scatter({ stocks, grown, onHover, move }: { stocks: S[]; grown: boolean; onHover: (e: React.MouseEvent, s: S) => void; move: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [hov, setHov] = useState<S | null>(null);
  // the width is read in the observer's callback, after layout
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 440, L = 84, B = 34, T = 14, R = 16;
  const g = useMemo(() => {
    const lx = stocks.map((s) => Math.log10(s.liquidity)), ly = stocks.map((s) => Math.log10(s.volume));
    const x0 = Math.floor(Math.min(...lx)), x1 = Math.ceil(Math.max(...lx)), y0 = Math.floor(Math.min(...ly)), y1 = Math.ceil(Math.max(...ly));
    const X = (v: number) => L + ((Math.log10(v) - x0) / Math.max(1, x1 - x0)) * (w - L - R);
    const Y = (v: number) => T + (1 - (Math.log10(v) - y0) / Math.max(1, y1 - y0)) * (H - T - B);
    const tmax = Math.max(1, ...stocks.map((s) => s.trades));
    const rad = (s: S) => 3.5 + 9 * Math.sqrt(s.trades / tmax);
    // labels for the busiest tokens, each tried right, left, above, below of its dot, skipped when nothing fits
    const placed: { x: number; y: number; w: number; h: number }[] = stocks.map((s) => ({ x: X(s.liquidity) - rad(s), y: Y(s.volume) - rad(s), w: rad(s) * 2, h: rad(s) * 2 }));
    const hit = (a: { x: number; y: number; w: number; h: number }) => a.x < L || a.x + a.w > w - 2 || a.y < 0 || a.y + a.h > H - B || placed.some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
    const labels: { s: S; x: number; y: number; anchor: "start" | "end" | "middle" }[] = [];
    // the outliers first: the books thinnest for their trade (highest turnover), then the busiest names
    const hot = [...stocks].filter((s) => s.volume > 1000 && s.liquidity > 0).sort((a, b) => b.volume / b.liquidity - a.volume / a.liquidity).slice(0, 6);
    const order = [...hot, ...[...stocks].sort((a, b) => b.volume - a.volume).filter((s) => !hot.includes(s))].slice(0, 16);
    for (const s of order) {
      const cx = X(s.liquidity), cy = Y(s.volume), r = rad(s), lw = s.symbol.length * 7.4 + 4, lh = 13;
      const tries = [
        { box: { x: cx + r + 4, y: cy - lh / 2, w: lw, h: lh }, x: cx + r + 6, y: cy + 4, anchor: "start" as const },
        { box: { x: cx - r - 4 - lw, y: cy - lh / 2, w: lw, h: lh }, x: cx - r - 6, y: cy + 4, anchor: "end" as const },
        { box: { x: cx - lw / 2, y: cy - r - 4 - lh, w: lw, h: lh }, x: cx, y: cy - r - 6, anchor: "middle" as const },
        { box: { x: cx - lw / 2, y: cy + r + 4, w: lw, h: lh }, x: cx, y: cy + r + 15, anchor: "middle" as const },
      ];
      const ok = tries.find((t) => !hit(t.box));
      if (ok) {
        placed.push(ok.box);
        labels.push({ s, x: ok.x, y: ok.y, anchor: ok.anchor });
      }
    }
    // turnover lines: volume = k × liquidity, clipped to the plot
    const line = (k: number) => {
      const a = Math.max(x0, y0 - Math.log10(k)), b = Math.min(x1, y1 - Math.log10(k));
      return b > a ? { x1: X(10 ** a), y1: Y(k * 10 ** a), x2: X(10 ** b), y2: Y(k * 10 ** b) } : null;
    };
    return { x0, x1, y0, y1, X, Y, rad, labels, hot: new Set(hot.map((s) => s.token)), hotList: hot, one: line(1), tenth: line(0.1) };
  }, [stocks, w]);

  const shown = (s: S) => move === "all" || (move === "up" ? (s.change ?? 0) > 0.05 : (s.change ?? 0) < -0.05);
  return (
    <div ref={box} className="relative">
      <svg width={w} height={H} className="block" role="group" aria-label="Stock tokens by liquidity and 24h volume" onMouseLeave={() => setHov(null)}>
        <defs>
          <linearGradient id="to-hot" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#f2c46d" stopOpacity="0" />
            <stop offset="1" stopColor="#f2c46d" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {g.one && <path d={`M${g.one.x1},${g.one.y1} L${g.one.x2},${g.one.y2} L${g.one.x2},${T} L${g.one.x1 < L + 1 ? L : g.one.x1},${T} Z`} fill="url(#to-hot)" />}
        {Array.from({ length: g.x1 - g.x0 + 1 }, (_, i) => {
          const x = g.X(10 ** (g.x0 + i));
          return (
            <g key={`x${i}`}>
              <line x1={x} x2={x} y1={T} y2={H - B} stroke="#2a2416" strokeDasharray="2 4" />
              <text x={x} y={H - B + 18} textAnchor="middle" className="fill-muted font-mono text-[12px]">
                {usd(10 ** (g.x0 + i))}
              </text>
            </g>
          );
        })}
        {Array.from({ length: g.y1 - g.y0 + 1 }, (_, i) => {
          const y = g.Y(10 ** (g.y0 + i));
          return (
            <g key={`y${i}`}>
              <line x1={L} x2={w - R} y1={y} y2={y} stroke="#2a2416" strokeDasharray="2 4" />
              <text x={L - 8} y={y + 4} textAnchor="end" className="fill-muted font-mono text-[12px]">
                {usd(10 ** (g.y0 + i))}
              </text>
            </g>
          );
        })}
        {g.tenth && <line {...g.tenth} stroke="#7d8a83" strokeOpacity=".5" strokeDasharray="4 4" />}
        {g.one && (
          <>
            <line {...g.one} stroke="#f2c46d" strokeOpacity="1" strokeWidth={1.6} strokeDasharray="6 4" />
            <text x={g.one.x2 - 6} y={g.one.y2 + 16} textAnchor="end" className="fill-[#f2c46d] font-mono text-[12px]">
              1× a day
            </text>
          </>
        )}
        {g.tenth && (
          <text x={g.tenth.x2 - 6} y={g.tenth.y2 + 16} textAnchor="end" className="fill-muted font-mono text-[12px]">
            0.1×
          </text>
        )}
        <text x={w - R} y={H - 4} textAnchor="end" className="fill-muted text-[12px]">
          Liquidity →
        </text>
        {g.hotList.length > 0 && (
          <g className="pointer-events-none">
            <rect x={L + 10} y={T + 8} width={260} height={30 + g.hotList.length * 17} rx={8} fill="#0d0b06" fillOpacity={0.9} stroke="#e3b341" strokeOpacity={0.4} />
            <text x={L + 22} y={T + 28} className="fill-[#e3b341] text-[13px] font-semibold">
              Thinnest books for their trade
            </text>
            {g.hotList.map((s, i) => (
              <text key={s.token} x={L + 22} y={T + 48 + i * 17} className="fill-text font-mono text-[12.5px]">
                {`${s.symbol}  ${(s.volume / s.liquidity).toFixed(1)}× its liquidity`}
              </text>
            ))}
          </g>
        )}
        <text x={12} y={T + 4} className="fill-muted text-[12px]" transform={`rotate(-90 12 ${T + 4})`} textAnchor="end">
          24h volume →
        </text>
        {hov && (
          <g className="pointer-events-none">
            <line x1={L} x2={g.X(hov.liquidity)} y1={g.Y(hov.volume)} y2={g.Y(hov.volume)} stroke="#f2c46d" strokeOpacity=".6" />
            <line x1={g.X(hov.liquidity)} x2={g.X(hov.liquidity)} y1={g.Y(hov.volume)} y2={H - B} stroke="#f2c46d" strokeOpacity=".6" />
          </g>
        )}
        {stocks.map((s, i) => {
          const x = g.X(s.liquidity), y = g.Y(s.volume), on = shown(s);
          return (
            <a key={s.token} href={`/app/trade/terminal?token=${s.token}`} aria-label={`${s.symbol}: ${usd(s.volume)} volume, ${usd(s.liquidity)} liquidity`}>
              <g style={{ transform: grown ? `translate(${x}px, ${y}px)` : `translate(${L}px, ${H - B}px)`, opacity: grown ? (on ? 1 : 0.12) : 0, transition: `transform .9s cubic-bezier(.3,1.2,.4,1) ${Math.min(i, 60) * 10}ms, opacity .4s` }}>
                {hov?.token === s.token && <circle r={g.rad(s) + 6} fill="none" stroke="#f2c46d" className="to-ping" />}
                {g.hot.has(s.token) && <circle r={g.rad(s) + 3.5} fill="none" stroke="#e3b341" strokeWidth={1.5} />}
                <circle
                  r={g.rad(s)}
                  fill={col(s.change)}
                  fillOpacity={g.hot.has(s.token) || hov?.token === s.token ? 0.95 : 0.4}
                  stroke="#0d0b06"
                  strokeWidth={1.2}
                  onMouseMove={(e) => {
                    setHov(s);
                    onHover(e, s);
                  }}
                />
              </g>
            </a>
          );
        })}
        {g.labels.map((l) => (
          <text key={l.s.token} x={l.x} y={l.y} textAnchor={l.anchor} className="pointer-events-none fill-text font-mono text-[12px] font-semibold" style={{ opacity: grown && shown(l.s) ? 1 : 0, transition: "opacity .6s .5s" }}>
            {l.s.symbol}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function TurnoverMap({ stocks, grown, onHover }: { stocks: S[]; grown: boolean; onHover: (e: React.MouseEvent, s: S) => void }) {
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("map");
  const [move, setMove] = useState<(typeof MOVES)[number]["id"]>("all");
  const [size, setSize] = useState(2);
  const hot = useMemo(() => [...stocks].sort((a, b) => b.volume / b.liquidity - a.volume / a.liquidity).slice(0, 12), [stocks]);
  const x = SIZES[size]!;
  const thin = useMemo(() => [...stocks].filter((s) => s.volume >= 1000).sort((a, b) => impact(x, a.liquidity) - impact(x, b.liquidity)).reverse().slice(0, 12), [stocks, x]);
  const hmax = Math.max(...hot.map((s) => s.volume / s.liquidity), 1);
  const above = stocks.filter((s) => s.volume > s.liquidity).length;

  return (
    <Bay
      tone="amber"
      kicker="Turnover"
      title="How hard the liquidity works"
      right={<SubTabs label="View" value={view} onChange={setView} tabs={VIEWS} />}
      foot={<span>{`Turnover = 24h volume ÷ liquidity. ${above} of ${stocks.length} stock tokens traded more than their whole liquidity in the last day.`}</span>}
    >
      <div key={view} className="pane-in px-5 pb-5">
        {view === "map" && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
              <SubTabs label="Move" value={move} onChange={setMove} tabs={MOVES} />
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-[#6fe7a8]" />
                up
              </span>
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-[#ff5a72]" />
                down
              </span>
              <span>dot size = trades · shaded = trades more than its depth a day</span>
            </div>
            <div className="overflow-hidden rounded-2xl bg-(--bay-bg2) p-2">
              <Scatter stocks={stocks} grown={grown} onHover={onHover} move={move} />
            </div>
          </>
        )}

        {view === "hot" && (
          <ul className="space-y-2">
            {hot.map((s, i) => {
              const t = s.volume / s.liquidity;
              return (
                <li key={s.token}>
                  <a href={`/app/trade/terminal?token=${s.token}`} onMouseMove={(e) => onHover(e, s)} className="grid grid-cols-[1.5rem_6rem_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-xl px-2 py-1.5 text-[12.5px] transition-colors hover:bg-(--bay-bg2) sm:grid-cols-[1.5rem_7rem_minmax(0,1fr)_5rem_6rem_5rem]">
                    <span className="font-mono text-muted">{i + 1}</span>
                    <span className="flex items-center gap-2 font-mono text-text">
                      <TokenAvatar address={s.token} symbol={s.symbol} stock size={18} />
                      {s.symbol}
                    </span>
                    <span className="relative h-5 overflow-hidden rounded-md bg-(--bay-bg2)">
                      <span className={cx("bar-grow absolute inset-y-0 left-0 rounded-md", t >= 1 ? "bg-[#f2c46d]" : "bg-[#f2c46d]/45")} style={{ width: `${Math.max(3, (Math.log10(1 + t) / Math.log10(1 + hmax)) * 100)}%`, animationDelay: `${i * 0.04}s` }} />
                      <span className="absolute inset-y-0 left-2 flex items-center font-mono text-[12px] font-semibold text-[#1a1306]">{`${t.toFixed(2)}×`}</span>
                    </span>
                    <span className="text-right tabular-nums text-text">{usd(s.volume)}</span>
                    <span className="hidden text-right tabular-nums text-muted sm:block">{usd(s.liquidity)}</span>
                    <span className={cx("hidden text-right tabular-nums sm:block", (s.change ?? 0) >= 0 ? "text-leaf" : "text-flesh")}>{s.change !== null ? pct(s.change) : "—"}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        {view === "thin" && (
          <>
            <label className="mb-4 block rounded-2xl bg-(--bay-bg2) p-4">
              <span className="flex items-baseline justify-between text-[12.5px] text-muted">
                A buy of
                <span className="font-mono text-[22px] text-text">{usd(x)}</span>
              </span>
              <input type="range" min={0} max={SIZES.length - 1} step={1} value={size} onChange={(e) => setSize(Number(e.target.value))} className="mt-2 w-full accent-[#f2c46d]" aria-label="Size of the buy" />
              <span className="mt-1 flex justify-between font-mono text-[12px] text-muted">
                {SIZES.map((s) => (
                  <span key={s}>{usd(s)}</span>
                ))}
              </span>
            </label>
            <ul className="space-y-2">
              {thin.map((s, i) => {
                const m = impact(x, s.liquidity);
                return (
                  <li key={s.token}>
                    <a href={`/app/trade/terminal?token=${s.token}`} onMouseMove={(e) => onHover(e, s)} className="grid grid-cols-[6rem_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-xl px-2 py-1.5 text-[12.5px] transition-colors hover:bg-(--bay-bg2) sm:grid-cols-[7rem_minmax(0,1fr)_5rem_6rem]">
                      <span className="flex items-center gap-2 font-mono text-text">
                        <TokenAvatar address={s.token} symbol={s.symbol} stock size={18} />
                        {s.symbol}
                      </span>
                      <span className="h-3 overflow-hidden rounded-full bg-(--bay-bg2)">
                        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, m * 100)}%`, background: m > 0.1 ? "#ff5a72" : m > 0.02 ? "#f2c46d" : "#6fe7a8", transitionDelay: `${i * 25}ms` }} />
                      </span>
                      <span className={cx("text-right tabular-nums", m > 0.1 ? "text-flesh" : m > 0.02 ? "text-[#f2c46d]" : "text-leaf")}>{m >= 10 ? ">999%" : `+${(m * 100).toFixed(m < 0.01 ? 2 : 1)}%`}</span>
                      <span className="hidden text-right tabular-nums text-muted sm:block">{`${usd(s.liquidity)} deep`}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[12px] text-muted">Rough extra you pay over the current price, on average, if one pool held all of the token&apos;s liquidity. Routes split across pools and usually do better; check the quote before you trade.</p>
          </>
        )}
      </div>
    </Bay>
  );
}
