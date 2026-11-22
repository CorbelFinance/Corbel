"use client";

/**
 * Home · every token trading on the chain today, drawn as a mountain of candles. Each candle is one real token (the
 * busiest launches and the stock tokens): risers climb the left slope to the peak, the strongest at the top; fallers
 * run down the right slope, the weakest at the bottom. The peak sits where the day splits, so a red day leans the
 * mountain right. A mouse over it brings up a lens and the token's card; a click opens its chart.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Label, cx } from "@corbel/ui";
import { TokenAvatar } from "../app/TokenAvatar";

type T = { token: string; symbol: string; name: string; change: number; volume: number; price: number | null; liquidity: number; stock: boolean };
type Cell = { t: T; x: number; y: number };
const ZOOM = 2.6, LENS = 150, CW = 18, CH = 22;
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
const price = (v: number) => (v >= 1 ? `$${v.toLocaleString("en", { maximumFractionDigits: 3 })}` : `$${v.toPrecision(3)}`);

/** The column count whose drawing best matches the space's shape, tried rather than guessed. */
function fit(list: T[], aspect: number) {
  let best = layoutCols(list, 20), score = 1e9;
  for (let c = 12; c <= 90; c += 2) {
    const g = layoutCols(list, c);
    const a = (g.cols * CW) / (g.rows * CH + 8);
    const s = Math.abs(Math.log(a / aspect));
    if (s < score) {
      score = s;
      best = g;
    }
  }
  return best;
}

function layoutCols(list: T[], cols: number) {
  const up = list.filter((t) => t.change >= 0).sort((a, b) => a.change - b.change); // left slope, rising
  const down = list.filter((t) => t.change < 0).sort((a, b) => b.change - a.change); // right slope, falling
  const n = list.length || 1;
  const COLS = cols;
  const peak = Math.max(2, Math.min(COLS - 3, Math.round((COLS * up.length) / n)));
  // column heights: a ridge rising to the peak and falling after it, scaled so every token gets a cell
  const shape = Array.from({ length: COLS }, (_, c) => {
    const u = c <= peak ? (c + 1) / (peak + 1) : (COLS - c) / (COLS - peak);
    return Math.max(0.08, u ** 1.15 * (0.85 + 0.15 * Math.sin(c * 1.7)));
  });
  // exact column heights: each slope's cells add up to its count (largest remainder), so no token is left over
  // and none lands on a cell another one holds
  const split = (cols: number[], total: number) => {
    const area = cols.reduce((s, c) => s + shape[c]!, 0) || 1;
    const raw = cols.map((c) => (shape[c]! / area) * total);
    const h = raw.map((x) => Math.floor(x));
    let left = total - h.reduce((s, x) => s + x, 0);
    const order = raw.map((x, k) => [x - Math.floor(x), k] as const).sort((p, q) => q[0] - p[0]);
    for (let k = 0; left > 0; k = (k + 1) % order.length, left--) h[order[k]![1]]!++;
    return h;
  };
  const leftCols = Array.from({ length: peak + 1 }, (_, c) => c), rightCols = Array.from({ length: COLS - peak - 1 }, (_, k) => peak + 1 + k);
  const heights = [...split(leftCols, up.length), ...split(rightCols, down.length)];
  const cells: Cell[] = [];
  // both slopes fill from the ground up, so every column is a solid stack
  let iu = 0;
  for (let c = 0; c <= peak; c++) for (let r = 0; r < heights[c]!; r++) cells.push({ t: up[iu++]!, x: c, y: r });
  let id = 0;
  for (let c = peak + 1; c < COLS; c++) for (let r = 0; r < heights[c]!; r++) cells.push({ t: down[id++]!, x: c, y: r });
  const rows = Math.max(...cells.map((c) => c.y), 1) + 1;
  return { cells, cols: COLS, rows, up: up.length, down: down.length };
}

export function TokenRange() {
  const router = useRouter();
  const [list, setList] = useState<T[] | null>(null);
  const [lens, setLens] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let off = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // a busy moment (too many requests at once) is retried, never left on "reading"; the list refreshes every minute
    const load = (tries: number) =>
      fetch("/api/trending")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { rows?: { token: string; symbol: string | null; name: string | null; change?: number | null; volume: number; price?: number | null; liquidity?: number }[]; stocks?: { token: string; symbol: string; name: string; change: number | null; volume: number; price: number | null; liquidity: number }[] }) => {
          if (off) return;
          const a: T[] = [];
          for (const r of j.rows ?? []) if (r.change != null && r.volume > 500 && (r.liquidity ?? 0) >= 1000) a.push({ token: r.token, symbol: r.symbol ?? "?", name: r.name ?? "", change: r.change, volume: r.volume, price: r.price ?? null, liquidity: r.liquidity ?? 0, stock: false });
          for (const s of j.stocks ?? []) if (s.change != null && s.volume > 1000 && (s.price ?? 0) >= 0.01 && s.liquidity >= 1000) a.push({ token: s.token, symbol: s.symbol, name: s.name, change: s.change, volume: s.volume, price: s.price, liquidity: s.liquidity, stock: true });
          // one cell per token: a token listed both as a launch and as a stock is kept once
          const seen = new Set<string>();
          const one = a.filter((x) => (seen.has(x.token.toLowerCase()) ? false : (seen.add(x.token.toLowerCase()), true)));
          if (one.length) setList(one.slice(0, 220));
          timer = setTimeout(() => load(0), a.length ? 60_000 : 4000);
        })
        .catch(() => {
          if (off) return;
          timer = setTimeout(() => load(tries + 1), Math.min(15_000, 1500 * (tries + 1)));
        });
    void load(0);
    return () => {
      off = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const [aspect, setAspect] = useState(2.6);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e || !e.contentRect.height) return;
      const a = e.contentRect.width / e.contentRect.height;
      setAspect((old) => (Math.abs(old - a) > 0.25 ? Math.max(1.2, Math.min(5, a)) : old));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const g = useMemo(() => fit(list ?? [], aspect), [list, aspect]);
  const W = g.cols * CW, H = g.rows * CH + 8;
  const X = (c: number) => c * CW + CW / 2, Y = (r: number) => H - 4 - (r + 0.5) * CH;
  const pick = useMemo(() => {
    if (!lens || !g.cells.length) return null;
    const px = (lens.x / lens.w) * W, py = (lens.y / lens.h) * H;
    let best: Cell | null = null, bd = 1e9;
    for (const c of g.cells) {
      const d = Math.hypot(X(c.x) - px, Y(c.y) - py);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return bd < CW * 1.6 ? best : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, g]);

  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    setLens(x < 0 || y < 0 || x > r.width || y > r.height ? null : { x, y, w: r.width, h: r.height });
  };

  const body = (
    <>
      <line x1={0} x2={W} y1={H - 2} y2={H - 2} stroke="var(--line)" />

      {g.cells.map((c) => {
        const up = c.t.change >= 0;
        const k = Math.min(1, Math.abs(c.t.change) / 40);
        const bh = 5 + k * (CH - 9), x = X(c.x), y = Y(c.y);
        const col = up ? "var(--leaf)" : "var(--flesh)";
        const on = pick?.t.token === c.t.token;
        return (
          <g key={c.t.token} opacity={pick && !on ? 0.55 : 1}>
            <line x1={x} x2={x} y1={y - CH / 2 + 2} y2={y + CH / 2 - 2} stroke={col} strokeOpacity={0.55} />
            <rect x={x - 4} y={y - bh / 2} width={8} height={bh} rx={1} fill={col} fillOpacity={up ? 0.9 : 0.85} />
            {on && <rect x={x - 7} y={y - CH / 2} width={14} height={CH} fill="none" stroke="var(--text)" strokeOpacity={0.8} />}
          </g>
        );
      })}
    </>
  );

  return (
    <div className="flex h-full min-h-[22rem] flex-col border border-line bg-surface/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <Label>Every token, today</Label>
        <span className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.08em]">
          <span className="text-leaf">{`▲ ${g.up} rising`}</span>
          <span className="text-flesh">{`▼ ${g.down} falling`}</span>
        </span>
      </div>
      {list && list.length > 0 && <Leaders list={list} onOpen={(a) => router.push(`/app/trade/terminal?token=${a}`)} />}
      <div ref={area} className="flex min-h-0 flex-1 flex-col px-4 pt-3">
        <div ref={box} className={cx("relative min-h-[16rem] flex-1", lens && pick && "cursor-pointer")} onPointerMove={move} onPointerLeave={() => setLens(null)} onClick={() => pick && router.push(`/app/trade/terminal?token=${pick.t.token}`)}>
          {!list && <p className="caret flex h-72 items-center justify-center font-mono text-[12px] text-muted">Reading the chain&apos;s tokens</p>}
          {list && (
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax meet" className="absolute inset-0 block h-full w-full" role="img" aria-label={`${g.up} tokens rising and ${g.down} falling today, as a mountain of candles`}>
              {body}
            </svg>
          )}
          {lens && pick && (
            <>
              <div aria-hidden className="pointer-events-none absolute z-10 overflow-hidden rounded-full border border-leaf/70 bg-bg shadow-[0_0_0_5px_rgba(0,0,0,0.35),0_14px_40px_rgba(0,0,0,0.6)]" style={{ width: LENS, height: LENS, left: lens.x - LENS / 2, top: lens.y - LENS / 2 }}>
                <div className="absolute" style={{ width: lens.w * ZOOM, height: lens.h * ZOOM, left: LENS / 2 - lens.x * ZOOM, top: LENS / 2 - lens.y * ZOOM }}>
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full">
                    {body}
                  </svg>
                </div>
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-bg/90 px-1.5 font-mono text-[12px] font-semibold text-text">{pick.t.symbol}</span>
              </div>
              <div aria-hidden className="pointer-events-none absolute z-20 w-72 rounded-xl border border-line bg-[#0e0e0e]/95 p-3.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]" style={{ top: Math.max(0, Math.min(lens.h - 210, lens.y - 80)), ...(lens.x > lens.w * 0.55 ? { right: lens.w - lens.x + LENS / 2 + 10 } : { left: lens.x + LENS / 2 + 10 }) }}>
                <div className="flex items-center gap-3">
                  <TokenAvatar address={pick.t.token} symbol={pick.t.symbol} stock={pick.t.stock} size={34} />
                  <span className="min-w-0">
                    <span className="block font-mono text-[15px] font-semibold text-text">{pick.t.symbol}</span>
                    <span className="block truncate text-[12px] text-muted">{pick.t.name.replace(/\s*•.*$/, "")}</span>
                  </span>
                  <span className={cx("ml-auto text-right font-mono text-[18px]", pick.t.change >= 0 ? "text-leaf" : "text-flesh")}>
                    {`${pick.t.change >= 0 ? "▲" : "▼"} ${Math.abs(pick.t.change).toFixed(2)}%`}
                    <span className="block text-[12px] text-muted">24h</span>
                  </span>
                </div>
                <dl className="mt-3 divide-y divide-line border-t border-line text-[12.5px]">
                  {(
                    [
                      ["24h volume", usd(pick.t.volume)],
                      ["Price", pick.t.price ? price(pick.t.price) : "—"],
                      ["Liquidity", pick.t.liquidity ? usd(pick.t.liquidity) : "—"],
                      ["Kind", pick.t.stock ? "Stock token" : "Token on Robinhood Chain"],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-1.5">
                      <dt className="text-muted">{k}</dt>
                      <dd className="font-mono text-text">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 font-mono text-[12px] text-leaf">Click to open its chart →</p>
              </div>
            </>
          )}
        </div>
      </div>
      <p className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
        <span>One candle per token · candle height = size of the move · hover a candle, click to chart it</span>
        <span className="text-text">{list ? `${list.length} tokens · live` : ""}</span>
      </p>
    </div>
  );
}

/** The day's extremes above the mountain: the three biggest risers and fallers, each a way into its chart. */
function Leaders({ list, onOpen }: { list: T[]; onOpen: (a: string) => void }) {
  const once = (xs: T[]) => xs.filter((x, i) => xs.findIndex((y) => y.symbol === x.symbol) === i);
  const up = once([...list].sort((a, b) => b.change - a.change)).slice(0, 3);
  const down = once([...list].sort((a, b) => a.change - b.change)).slice(0, 3);
  const med = [...list].map((x) => x.change).sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0;
  const chip = (x: T) => (
    <button key={x.token} type="button" onClick={() => onOpen(x.token)} className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-bg/60 py-1 pl-1 pr-2.5 text-left transition-colors hover:border-[color:var(--t)]" style={{ ["--t" as string]: x.change >= 0 ? "var(--leaf)" : "var(--flesh)" }}>
      <TokenAvatar address={x.token} symbol={x.symbol} stock={x.stock} size={22} />
      <span className="truncate font-mono text-[12px] text-text">{x.symbol}</span>
      <span className={cx("font-mono text-[12px]", x.change >= 0 ? "text-leaf" : "text-flesh")}>{`${x.change >= 0 ? "+" : ""}${x.change.toFixed(0)}%`}</span>
    </button>
  );
  return (
    <div className="grid gap-3 border-b border-line px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[12px] uppercase tracking-[0.08em] text-leaf">↗ rising most</span>
        {up.map(chip)}
      </div>
      <p className="text-center font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
        median <span className={med >= 0 ? "text-leaf" : "text-flesh"}>{`${med >= 0 ? "+" : ""}${med.toFixed(1)}%`}</span>
      </p>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {down.map(chip)}
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.08em] text-flesh">falling most ↘</span>
      </div>
    </div>
  );
}
