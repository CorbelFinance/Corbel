"use client";

/**
 * Stocks · Market. The stock-token market on Robinhood Chain across every venue, as one research page:
 * a market map (area = 24h volume, tint = 24h move), breadth, concentration, venues, a pool table with each
 * pool's price against the stock's headline price, and a turnover map. Hover anything for the numbers.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@corbel/ui";
import { Verdict } from "./kit";
import { fmtPx } from "./Candles";
import { TokenAvatar } from "./TokenAvatar";
import { FlowMap } from "./FlowMap";
import { TurnoverMap } from "./TurnoverMap";
import { pageZoom } from "../../lib/zoom";

type MStock = { token: string; symbol: string; name: string; volume: number; liquidity: number; trades: number; change: number | null; price: number | null; pools: number; venues: number };
type MVenue = { id: string; volume: number; liquidity: number; trades: number; pools: number; stocks: number };
type MPool = { pair: string; venue: string; symbol: string; quote: string; volume: number; liquidity: number; trades: number; price: number | null; gap: number | null; turnover: number | null };
type Snap = {
  at: number;
  totals: { volume: number; liquidity: number; trades: number; pools: number; reporting: number; stocks: number; venues: number };
  stocks: MStock[];
  venues: MVenue[];
  pools: MPool[];
  breadth: { up: number; down: number; flat: number; upVol: number; downVol: number };
  concentration: { stocks: number[]; pools: number[] };
  links: { venue: string; token: string; volume: number; liquidity: number; pools: number }[];
};

const usd = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
const pct = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
const share = (v: number) => `${Math.round(v * 100)}%`;
const big = (n: number) => n.toLocaleString("en");
/** The tint scale saturates at this move. */
const SPAN = 5;

function tint(c: number | null) {
  if (c === null) return { bg: "rgb(141 156 145 / 0.1)", fg: "var(--muted)" };
  const t = Math.min(1, Math.abs(c) / SPAN);
  return c >= 0 ? { bg: `rgba(111,231,168,${0.08 + 0.42 * t})`, fg: "#d8ffe8" } : { bg: `rgba(255,69,96,${0.08 + 0.42 * t})`, fg: "#ffe1e6" };
}

/** Squarified treemap: rectangles close to square, areas proportional to the values. */
type R = { x: number; y: number; w: number; h: number };
function squarify(vals: number[], box: R): R[] {
  const out: R[] = new Array(vals.length);
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const scale = (box.w * box.h) / total;
  let rect = { ...box };
  let row: number[] = [];
  const rest = vals.map((_, i) => i);
  const area = (i: number) => vals[i]! * scale;
  const worst = (r: number[], side: number) => {
    const s = r.reduce((a, i) => a + area(i), 0);
    const mx = Math.max(...r.map(area)), mn = Math.min(...r.map(area));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const place = (r: number[]) => {
    const s = r.reduce((a, i) => a + area(i), 0);
    if (rect.w >= rect.h) {
      const cw = s / rect.h;
      let y = rect.y;
      for (const i of r) {
        const h = area(i) / cw;
        out[i] = { x: rect.x, y, w: cw, h };
        y += h;
      }
      rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
    } else {
      const ch = s / rect.w;
      let x = rect.x;
      for (const i of r) {
        const w = area(i) / ch;
        out[i] = { x, y: rect.y, w, h: ch };
        x += w;
      }
      rect = { x: rect.x, y: rect.y + ch, w: rect.w, h: rect.h - ch };
    }
  };
  while (rest.length) {
    const side = Math.min(rect.w, rect.h);
    const i = rest[0]!;
    if (!row.length || worst([...row, i], side) <= worst(row, side)) {
      row.push(i);
      rest.shift();
    } else {
      place(row);
      row = [];
    }
  }
  if (row.length) place(row);
  return out;
}

function Card({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-[#242424] bg-[#131313] p-5", className)}>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-text">{title}</h2>
        {aside && <span className="text-[12px] text-muted">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

/** Bars grow from zero once, after the page has data. */
function useGrown(ready: boolean) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, [ready]);
  return on;
}

type Tip = { x: number; y: number; max: number; body: ReactNode } | null;

export function StockMarket() {
  const [d, setD] = useState<Snap | null>(null);
  const [mapBy, setMapBy] = useState<"volume" | "liquidity">("volume");
  const [tip, setTip] = useState<Tip>(null);
  const [allPools, setAllPools] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const grown = useGrown(!!d);

  useEffect(() => {
    let off = false;
    let t: ReturnType<typeof setTimeout>;
    const load = () =>
      fetch("/api/stockmarket")
        .then(async (r) => ({ code: r.status, j: (await r.json()) as Snap }))
        .then(({ code, j }) => {
          if (off) return;
          if (code === 202) t = setTimeout(load, 8000);
          else setD(j);
        })
        .catch(() => undefined);
    void load();
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, []);

  const show = (e: React.MouseEvent, body: ReactNode) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    const z = pageZoom();
    // the card sits on the far side of the pointer, so it never covers the tiles next to it
    const x = (e.clientX - r.left) / z, y = (e.clientY - r.top) / z, w = r.width / z;
    setTip({ x: x > w / 2 ? Math.max(8, x - 320) : Math.min(x + 32, w - 300), y: Math.max(8, y - 60), max: w - 300, body });
  };
  const hide = () => setTip(null);

  const map = useMemo(() => {
    if (!d) return { tiles: [], tail: null };
    const all = d.stocks.filter((s) => (mapBy === "volume" ? s.volume : s.liquidity) > 0);
    const list = all.slice(0, 24);
    const rest = all.slice(24).reduce((a, s) => a + (mapBy === "volume" ? s.volume : s.liquidity), 0);
    // the long tail is one tile, so every drawn tile stays readable
    const rects = squarify([...list.map((s) => (mapBy === "volume" ? s.volume : s.liquidity)), ...(rest > 0 ? [rest] : [])], { x: 0, y: 0, w: 100, h: 100 });
    return { tiles: list.map((s, i) => ({ s, r: rects[i]! })), tail: rest > 0 ? { n: all.length - list.length, v: rest, r: rects[list.length]! } : null };
  }, [d, mapBy]);

  if (!d)
    return (
      <div className="grid min-h-[60vh] place-items-center rounded-2xl border border-[#242424] bg-[#131313]">
        <p className="text-muted">Reading every stock pool on every venue…</p>
      </div>
    );

  const t = d.totals;
  const maxVenue = Math.max(...d.venues.map((v) => Math.max(v.volume, v.liquidity)), 1);
  const movers = d.stocks.filter((s) => s.change !== null && s.volume >= 1000);
  const upMost = [...movers].sort((a, b) => b.change! - a.change!).slice(0, 7);
  const downMost = [...movers].sort((a, b) => a.change! - b.change!).slice(0, 7);
  const trBase = d.breadth.up + d.breadth.down + d.breadth.flat || 1;
  const volBase = d.breadth.upVol + d.breadth.downVol || 1;
  const pools = allPools ? d.pools : d.pools.slice(0, 10);

  const tipBody = (s: MStock) => (
    <>
      <p className="flex items-center gap-2 text-[14px] font-semibold text-text">
        <TokenAvatar address={s.token} symbol={s.symbol} stock size={20} />
        {s.symbol} <span className="font-normal text-muted">{s.name}</span>
      </p>
      <p className="mt-2 font-mono text-2xl text-text">
        {usd(s.volume)} {s.change !== null && <span className={cx("text-[14px]", s.change >= 0 ? "text-leaf" : "text-flesh")}>{pct(s.change, 2)}</span>}
      </p>
      <dl className="mt-3 space-y-1 text-[13px]">
        {(
          [
            ["Price", s.price !== null ? `$${fmtPx(s.price)}` : "—"],
            ["Liquidity", usd(s.liquidity)],
            ["Trades, 24h", big(s.trades)],
            ["Pools · venues", `${s.pools} · ${s.venues}`],
            ["Turnover", s.liquidity ? `${(s.volume / s.liquidity).toFixed(2)}×` : "—"],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-6">
            <dt className="text-muted">{k}</dt>
            <dd className="font-mono text-text">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-[#242424] pt-2 text-[12px] text-muted">Click to open the chart</p>
    </>
  );

  return (
    <div ref={wrap} className="relative min-w-0 space-y-4 overflow-x-clip" onMouseLeave={hide}>
      {/* the answer first: which way the money traded today */}
      {(() => {
        const down = d.breadth.downVol / volBase, up = d.breadth.upVol / volBase;
        const falling = down > up;
        return (
          <Verdict
            kicker="Stock tokens · last 24 hours"
            tone={falling ? "bad" : "good"}
            value={share(falling ? down : up)}
            valueLabel={falling ? "of the volume is on falling names" : "of the volume is on rising names"}
            facts={[
              ["Volume", usd(t.volume)],
              ["Liquidity", usd(t.liquidity)],
              ["Trades", big(t.trades)],
              ["Tokens", big(t.stocks)],
              ["Venues", big(t.venues)],
            ]}
            visual={
              <div className="flex h-2.5 overflow-hidden rounded-full">
                <span className="bar-grow bg-leaf/80" style={{ width: `${up * 100}%` }} title={`Rising ${share(up)}`} />
                <span className="bg-flesh/80" style={{ width: `${down * 100}%` }} title={`Falling ${share(down)}`} />
              </div>
            }
          >
            {falling
              ? `Most of today's money is trading names that are falling: ${d.breadth.down} down against ${d.breadth.up} up.`
              : `Most of today's money is trading names that are rising: ${d.breadth.up} up against ${d.breadth.down} down.`}
          </Verdict>
        );
      })()}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* market map */}
        <Card
          title="Market map"
          aside={
            <span className="flex items-center gap-3">
              <span>area = {mapBy === "volume" ? "24h volume" : "liquidity"} · tint = 24h move</span>
              <span className="flex rounded-full bg-[#181818] p-[3px]">
                {(["volume", "liquidity"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={mapBy === m} onClick={() => setMapBy(m)} className={cx("rounded-full px-3 py-1 text-[12px] capitalize", mapBy === m ? "bg-[#282828] text-text" : "text-muted")}>
                    {m}
                  </button>
                ))}
              </span>
            </span>
          }
        >
          <div className="relative h-[420px] overflow-hidden rounded-xl bg-[#0d0d0d]">
            {map.tiles.map(({ s, r }, i) => {
              const c = tint(s.change);
              const small = r.w < 9 || r.h < 9;
              return (
                <Link
                  key={s.token}
                  href={`/app/trade/terminal?token=${s.token}`}
                  onMouseMove={(e) => show(e, tipBody(s))}
                  aria-label={`${s.symbol}: ${usd(mapBy === "volume" ? s.volume : s.liquidity)}${s.change !== null ? `, ${pct(s.change, 2)}` : ""}`}
                  className="absolute block overflow-hidden border border-[#0d0d0d] p-2 transition-[opacity,transform,filter] duration-700 hover:z-10 hover:brightness-125"
                  style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, background: c.bg, opacity: grown ? 1 : 0, transform: grown ? "none" : "scale(0.94)", transitionDelay: `${Math.min(i, 30) * 25}ms` }}
                >
                  {!small && (
                    <>
                      <span className="flex items-center gap-1.5 font-mono text-[12px] font-semibold" style={{ color: c.fg }}>
                        {r.w > 14 && r.h > 14 && <TokenAvatar address={s.token} symbol={s.symbol} stock size={16} />}
                        {s.symbol}
                      </span>
                      {r.h > 14 && (
                        <span className="mt-0.5 block font-mono text-[12px]" style={{ color: c.fg }}>
                          {s.change !== null ? pct(s.change, 2) : "—"}
                        </span>
                      )}
                      {r.h > 20 && r.w > 14 && <span className="block font-mono text-[12px]" style={{ color: c.fg }}>{usd(mapBy === "volume" ? s.volume : s.liquidity)}</span>}
                    </>
                  )}
                </Link>
              );
            })}
            {map.tail && (
              <Link
                href="/app/stocks/desk"
                className="absolute flex flex-col justify-end border border-[#0d0d0d] bg-[#181818] p-2 hover:brightness-125"
                style={{ left: `${map.tail.r.x}%`, top: `${map.tail.r.y}%`, width: `${map.tail.r.w}%`, height: `${map.tail.r.h}%` }}
              >
                <span className="font-mono text-[12px] text-text">{`+${map.tail.n} more`}</span>
                {map.tail.r.h > 10 && <span className="font-mono text-[12px] text-muted">{usd(map.tail.v)}</span>}
              </Link>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3 text-[12px] text-muted">
            <span>{pct(-SPAN, 0)}</span>
            <span className="h-1.5 w-40 rounded-full bg-gradient-to-r from-[rgba(255,69,96,0.6)] via-[rgba(141,156,145,0.15)] to-[rgba(111,231,168,0.6)]" />
            <span>{pct(SPAN, 0)}</span>
            <span className="ml-auto">{`${map.tiles.length} largest drawn${map.tail ? `, ${map.tail.n} more in one tile` : ""}`}</span>
          </div>
        </Card>

        <div className="space-y-4">
          {/* breadth */}
          <Card title="24h breadth" aside={d.breadth.downVol > d.breadth.upVol ? `Falling names carry ${share(d.breadth.downVol / volBase)} of volume` : `Rising names carry ${share(d.breadth.upVol / volBase)} of volume`}>
            {(
              [
                ["Names", d.breadth.up / trBase, d.breadth.flat / trBase, `${d.breadth.up}`, `${d.breadth.down}`],
                ["Volume", d.breadth.upVol / volBase, 0, share(d.breadth.upVol / volBase), share(d.breadth.downVol / volBase)],
              ] as const
            ).map(([k, u, f, lu, ld]) => (
              <div key={k} className="mb-2 grid grid-cols-[4.5rem_1fr] items-center gap-3">
                <span className="text-[12px] text-muted">{k}</span>
                <div className="flex h-6 overflow-hidden rounded-md bg-[#181818] font-mono text-[12px]">
                  <span className="flex items-center justify-center bg-ui/70 text-[#0b0b0b] transition-[width] duration-1000" style={{ width: grown ? `${u * 100}%` : "0%" }}>
                    {u > 0.08 && lu}
                  </span>
                  <span className="bg-[#303030] transition-[width] duration-1000" style={{ width: grown ? `${f * 100}%` : "0%" }} />
                  <span className="flex flex-1 items-center justify-center bg-flesh/60 font-semibold text-white">{ld}</span>
                </div>
              </div>
            ))}
            <div className="mt-4 grid grid-cols-2 gap-4">
              {(
                [
                  ["Up most", upMost],
                  ["Down most", downMost],
                ] as const
              ).map(([k, list]) => (
                <div key={k}>
                  <p className="mb-2 text-[12px] uppercase tracking-[0.12em] text-muted">{k}</p>
                  <ul className="space-y-1.5">
                    {list.map((s) => (
                      <li key={s.token}>
                        <Link href={`/app/trade/terminal?token=${s.token}`} onMouseMove={(e) => show(e, tipBody(s))} className="flex items-center gap-2 text-[13px] hover:text-leaf">
                          <TokenAvatar address={s.token} symbol={s.symbol} stock size={18} />
                          <span className="w-14 truncate font-mono text-text">{s.symbol}</span>
                          <span className={cx("font-mono", s.change! >= 0 ? "text-leaf" : "text-flesh")}>{pct(s.change!)}</span>
                          <span className="ml-auto font-mono text-[12px] text-muted">{usd(s.volume)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          {/* concentration */}
          <Card title="Concentration" aside="share of 24h volume">
            {(
              [
                ["Stocks", d.concentration.stocks, ["Top 1", "Top 5", "Top 10", "Top 25"]],
                ["Pools", d.concentration.pools, ["Top 1", "Top 5", "Top 12"]],
              ] as const
            ).map(([k, cuts, labels]) => {
              const steps = cuts.map((c, i) => c - (cuts[i - 1] ?? 0));
              return (
                <div key={k} className="mb-4 last:mb-0">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[12px] uppercase tracking-[0.12em] text-muted">{k}</p>
                    <p className="flex gap-4 font-mono text-[12px]">
                      {cuts.map((c, i) => (
                        <span key={i}>
                          <span className="text-text">{share(c)}</span> <span className="text-muted">{labels[i]}</span>
                        </span>
                      ))}
                    </p>
                  </div>
                  <div className="mt-2 flex h-8 overflow-hidden rounded-md bg-[#181818]">
                    {steps.map((s, i) => (
                      <span key={i} className="border-r border-[#0d0d0d] transition-[width] duration-1000" style={{ width: grown ? `${s * 100}%` : "0%", background: `rgba(111,231,168,${0.75 - i * 0.16})`, transitionDelay: `${i * 120}ms` }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* venues */}
        <Card title="Venues" aside="sorted by 24h volume">
          <ul className="space-y-3">
            {d.venues.slice(0, 12).map((v, i) => (
              <li key={v.id} onMouseMove={(e) => show(e, <VenueTip v={v} total={t} />)} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-3 sm:grid-cols-[9rem_1fr_5rem]">
                <span className="truncate text-[13px] text-text">
                  {v.id}
                  <span className="block text-[12px] text-muted">
                    {v.pools} pools · {v.stocks} stocks
                  </span>
                </span>
                <span className="space-y-1">
                  <span className="block h-2 rounded-full bg-leaf/80 transition-[width] duration-1000" style={{ width: grown ? `${(v.volume / maxVenue) * 100}%` : "0%", transitionDelay: `${i * 50}ms` }} />
                  <span className="block h-1 rounded-full bg-[var(--lav)]/70 transition-[width] duration-1000" style={{ width: grown ? `${(v.liquidity / maxVenue) * 100}%` : "0%", transitionDelay: `${i * 50 + 80}ms` }} />
                </span>
                <span className="text-right tabular-nums text-[12px] text-text">
                  {usd(v.volume)}
                  <span className="block text-[12px] text-muted">{usd(v.liquidity)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex gap-4 text-[12px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-leaf/80" /> 24h volume
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-4 rounded-full bg-[var(--lav)]/70" /> Liquidity
            </span>
          </p>
        </Card>

        {/* pools */}
        <Card title="Pools" aside="price against the stock's deepest pool">
          <div tabIndex={0} role="region" aria-label="Pools, scrollable" className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#242424] text-[12px] text-muted">
                  {["Pool", "24h volume", "Liquidity", "Turnover", "Vs headline", "Trades"].map((h) => (
                    <th key={h} scope="col" className={cx("py-2 font-normal", h !== "Pool" && "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pools.map((p) => (
                  <tr key={p.pair} className="border-b border-[#242424]/60 last:border-0 hover:bg-[#181818]">
                    <td className="py-2.5">
                      <span className="font-mono text-text">
                        {p.symbol}/{p.quote}
                      </span>
                      <span className="block text-[12px] text-muted">{p.venue}</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-text">{usd(p.volume)}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted">{usd(p.liquidity)}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted">{p.turnover !== null ? `${p.turnover.toFixed(2)}×` : "—"}</td>
                    <td className={cx("py-2.5 text-right tabular-nums", p.gap === null ? "text-muted" : Math.abs(p.gap) < 0.002 ? "text-muted" : p.gap > 0 ? "text-leaf" : "text-flesh")}>{p.gap === null ? "—" : pct(p.gap * 100, 2)}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted">{big(p.trades)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.pools.length > 10 && (
            <button type="button" onClick={() => setAllPools((v) => !v)} className="mt-3 rounded-lg border border-[#242424] bg-[#181818] px-3 py-1.5 text-[12px] text-text hover:border-ui/60">
              {allPools ? "Show top 10" : `Show all ${d.pools.length}`}
            </button>
          )}
        </Card>
      </div>

      <FlowMap stocks={d.stocks} venues={d.venues} links={d.links ?? []} grown={grown} />

      <TurnoverMap stocks={d.stocks.filter((s) => s.volume > 0 && s.liquidity > 0)} grown={grown} onHover={(e, s) => show(e, tipBody(s))} />

      <p className="text-[12px] text-muted">
        Pools on every venue on Robinhood Chain; stock tokens from Corbel&apos;s index and issuer-code check. Read {new Date(d.at).toISOString().slice(11, 16)} UTC, refreshed every five minutes.
      </p>

      {tip && (
        <div className="pointer-events-none absolute z-50 w-72 rounded-xl border border-[#303030] bg-[#0d0d0d]/95 p-4 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md" style={{ left: Math.min(tip.x, tip.max), top: tip.y }}>
          {tip.body}
        </div>
      )}
    </div>
  );
}

function VenueTip({ v, total }: { v: MVenue; total: Snap["totals"] }) {
  return (
    <>
      <p className="text-[14px] font-semibold text-text">{v.id}</p>
      <p className="mt-1 font-mono text-2xl text-text">{usd(v.volume)}</p>
      <dl className="mt-3 space-y-1 text-[13px]">
        {(
          [
            ["Liquidity", usd(v.liquidity)],
            ["Trades, 24h", big(v.trades)],
            ["Pools · stocks", `${v.pools} · ${v.stocks}`],
            ["Share of volume", share(v.volume / (total.volume || 1))],
            ["Share of liquidity", share(v.liquidity / (total.liquidity || 1))],
          ] as const
        ).map(([k, x]) => (
          <div key={k} className="flex justify-between gap-6">
            <dt className="text-muted">{k}</dt>
            <dd className="font-mono text-text">{x}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
