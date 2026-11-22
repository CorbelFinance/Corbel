"use client";

/**
 * Who trades where. Three views of the same venue × stock-token links (24h volume):
 *  - Flow: venues on the left, the busiest stock tokens on the right, a ribbon per pair as wide as its volume, with
 *    packets running along the biggest ribbons;
 *  - Matrix: a heat grid of venue × token;
 *  - Split: for each token, how its volume divides between venues (one venue or many).
 * Hover or click a venue or a token to isolate it; the side panel counts what is lit.
 */
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { Bay, CountUp, SubTabs } from "./Bay";
import { TokenAvatar } from "./TokenAvatar";

type Stock = { token: string; symbol: string; volume: number; change?: number | null };
type Venue = { id: string; volume: number; liquidity: number; pools: number; stocks: number };
type Link = { venue: string; token: string; volume: number; liquidity: number; pools: number };
type Focus = { kind: "venue" | "stock"; id: string } | null;

const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
const PAL = ["#6fe7a8", "#6cc0d0", "#9b86e4", "#f2c46d", "#ff9a5c", "#93a6ff", "#ff8fa3", "#7fd1b9"];
const VIEWS = [
  { id: "towers", label: "Towers" },
  { id: "flow", label: "Flow" },
  { id: "matrix", label: "Matrix" },
  { id: "split", label: "Split" },
] as const;
const W = 1000, PAD = 8;
// venue marks, kept on our own host; unknown venues fall back to initials
const LOGOS = new Set(["uniswap", "aero", "metric", "ramses", "up", "giga", "alandale", "nami", "abyss", "sheriff", "morpheus", "sushiswap", "robinswap"]);
const logoOf = (id: string) => {
  const k = id.split(" ")[0]!.toLowerCase();
  return LOGOS.has(k) ? `/venues/${k}.png` : null;
};
const initials = (id: string) => id.replace(/[^A-Za-z0-9 ]/g, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

function VenueMark({ id, color, size = 18 }: { id: string; color: string; size?: number }) {
  const src = logoOf(id);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full bg-[#0b1214]" style={{ width: size, height: size, boxShadow: `0 0 0 1.5px ${color}` }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full font-mono text-[12px] font-semibold" style={{ width: size, height: size, color, boxShadow: `0 0 0 1.5px ${color}`, background: "#0b1214" }}>
      {initials(id)}
    </span>
  );
}

export function FlowMap({ stocks, venues, links, grown }: { stocks: Stock[]; venues: Venue[]; links: Link[]; grown: boolean }) {
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("towers");
  const [focus, setFocus] = useState<Focus>(null);
  const [hover, setHover] = useState<Focus>(null);
  const act = hover ?? focus;
  // the flow is drawn for wide screens; a phone opens on the split, which reads at any width
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) void Promise.resolve().then(() => setView("split"));
  }, []);

  const g = useMemo(() => {
    const vs = venues.filter((v) => v.volume > 0).slice(0, 8);
    const top = stocks.filter((s) => s.volume > 0).slice(0, 14);
    const key = (t: string) => t.toLowerCase();
    const tset = new Set(top.map((s) => key(s.token)));
    const vset = new Set(vs.map((v) => v.id));
    const ls = links.filter((l) => vset.has(l.venue) && tset.has(key(l.token)) && l.volume > 0).map((l) => ({ ...l, token: key(l.token) }));
    const color = new Map(vs.map((v, i) => [v.id, PAL[i % PAL.length]!]));
    const vSum = new Map(vs.map((v) => [v.id, ls.filter((l) => l.venue === v.id).reduce((a, l) => a + l.volume, 0)]));
    const sSum = new Map(top.map((s) => [key(s.token), ls.filter((l) => l.token === key(s.token)).reduce((a, l) => a + l.volume, 0)]));
    const total = ls.reduce((a, l) => a + l.volume, 0) || 1;
    // sankey geometry: node heights share the column height, ribbons stack inside each node in the other side's order
    const H = Math.max(440, top.length * 34, vs.length * 44);
    const col = (ids: string[], sum: Map<string, number>) => {
      const room = H - PAD * (ids.length - 1);
      const pos = new Map<string, { y: number; h: number }>();
      let y = 0;
      for (const id of ids) {
        const h = Math.max(4, ((sum.get(id) ?? 0) / total) * room);
        pos.set(id, { y, h });
        y += h + PAD;
      }
      const k = H / Math.max(H, y - PAD);
      for (const p of pos.values()) {
        p.y *= k;
        p.h *= k;
      }
      return pos;
    };
    const vpos = col(vs.map((v) => v.id), vSum);
    const spos = col(top.map((s) => key(s.token)), sSum);
    const vOrder = vs.map((v) => v.id), sOrder = top.map((s) => key(s.token));
    const vOff = new Map(vOrder.map((id) => [id, 0])), sOff = new Map(sOrder.map((id) => [id, 0]));
    const X1 = 210, X2 = 760;
    const ribbons = [...ls]
      .sort((a, b) => vOrder.indexOf(a.venue) - vOrder.indexOf(b.venue) || sOrder.indexOf(a.token) - sOrder.indexOf(b.token))
      .map((l) => {
        const vp = vpos.get(l.venue)!, sp = spos.get(l.token)!;
        const hv = (l.volume / (vSum.get(l.venue) || 1)) * vp.h, hs = (l.volume / (sSum.get(l.token) || 1)) * sp.h;
        const y1 = vp.y + vOff.get(l.venue)!, y2 = sp.y + sOff.get(l.token)!;
        vOff.set(l.venue, vOff.get(l.venue)! + hv);
        sOff.set(l.token, sOff.get(l.token)! + hs);
        const m = (X1 + X2) / 2;
        const d = `M${X1},${y1} C${m},${y1} ${m},${y2} ${X2},${y2} L${X2},${y2 + hs} C${m},${y2 + hs} ${m},${y1 + hv} ${X1},${y1 + hv} Z`;
        const c = `M${X1},${y1 + hv / 2} C${m},${y1 + hv / 2} ${m},${y2 + hs / 2} ${X2},${y2 + hs / 2}`;
        return { l, d, c, w: Math.min(hv, hs) };
      });
    const maxL = Math.max(...ls.map((l) => l.volume), 1);
    // label rows: at each node's middle, pushed apart to at least `gap`, then pulled back inside the column
    const spread = (ids: string[], pos: Map<string, { y: number; h: number }>, gap: number) => {
      const ys = ids.map((id) => pos.get(id)!.y + pos.get(id)!.h / 2);
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i]!, ys[i - 1]! + gap);
      let lim = H - gap / 2;
      for (let i = ys.length - 1; i >= 0; i--) {
        ys[i] = Math.min(ys[i]!, lim);
        lim = ys[i]! - gap;
      }
      return new Map(ids.map((id, i) => [id, ys[i]!]));
    };
    const vLab = spread(vOrder, vpos, 38);
    const sLab = spread(sOrder, spos, 26);
    return { vs, top, ls, color, vSum, sSum, total, H, vpos, spos, ribbons, X1, X2, maxL, vLab, sLab };
  }, [stocks, venues, links]);

  const lit = (l: { venue: string; token: string }) => !act || (act.kind === "venue" ? l.venue === act.id : l.token === act.id);
  const sel = g.ls.filter(lit);
  const selVol = sel.reduce((a, l) => a + l.volume, 0), selLiq = sel.reduce((a, l) => a + l.liquidity, 0), selPools = sel.reduce((a, l) => a + l.pools, 0);
  const sym = (t: string) => g.top.find((s) => s.token.toLowerCase() === t)?.symbol ?? "?";
  const label = act ? (act.kind === "venue" ? act.id : sym(act.id)) : "Every venue";
  const pick = (f: NonNullable<Focus>) => setFocus(focus && focus.kind === f.kind && focus.id === f.id ? null : f);
  const nodeOn = (kind: "venue" | "stock", id: string) => !act || (act.kind === kind ? act.id === id : g.ls.some((l) => lit(l) && (kind === "venue" ? l.venue === id : l.token === id)));
  const topLinks = [...sel].sort((a, b) => b.volume - a.volume).slice(0, 5);

  return (
    <Bay tone="ice" kicker="Venues" title="Who trades where" right={<SubTabs label="View" value={view} onChange={setView} tabs={VIEWS} />} foot={<span>{`24h volume of the ${g.top.length} busiest stock tokens on the ${g.vs.length} busiest venues. Hover to look, click to pin.`}</span>}>
      <div className="grid gap-4 px-5 pb-5 lg:grid-cols-[minmax(0,1fr)_15rem]" onMouseLeave={() => setHover(null)}>
        <div key={view} className="pane-in min-w-0 overflow-hidden rounded-2xl bg-(--bay-bg2)">
          {view === "towers" && <Towers g={g} lit={lit} nodeOn={nodeOn} setHover={setHover} pick={pick} act={act} grown={grown} />}

          {view === "flow" && (
            <svg viewBox={`-10 -10 ${W + 20} ${g.H + 20}`} className="block h-auto w-full" role="img" aria-label="Volume from each venue to each stock token">
              {g.ribbons.map((r, i) => {
                const on = lit(r.l);
                const c = g.color.get(r.l.venue)!;
                return (
                  <g key={`${r.l.venue}-${r.l.token}`}>
                    <path d={r.d} fill={c} fillOpacity={on ? (act ? 0.55 : 0.28) : 0.05} style={{ opacity: grown ? 1 : 0, transition: `fill-opacity .3s, opacity .9s ease ${Math.min(i, 30) * 25}ms` }} />
                    {on && r.l.volume > g.maxL * 0.04 && <path d={r.c} fill="none" stroke={c} strokeWidth={Math.max(1, Math.min(3, r.w / 3))} strokeLinecap="round" className="vf-flow" style={{ animationDuration: `${2.6 - Math.min(1.6, (r.l.volume / g.maxL) * 1.6)}s` }} />}
                  </g>
                );
              })}
              {g.vs.map((v) => {
                const p = g.vpos.get(v.id)!;
                const ly = g.vLab.get(v.id)!;
                const on = nodeOn("venue", v.id);
                return (
                  <g key={v.id} className="cursor-pointer" opacity={on ? 1 : 0.3} onMouseEnter={() => setHover({ kind: "venue", id: v.id })} onClick={() => pick({ kind: "venue", id: v.id })}>
                    <rect x={g.X1 - 14} y={p.y} width={14} height={p.h} rx={3} fill={g.color.get(v.id)} />
                    <rect x={0} y={ly - 17} width={g.X1 - 20} height={34} fill="transparent" />
                    {Math.abs(ly - (p.y + p.h / 2)) > 2 && <path d={`M${g.X1 - 16},${p.y + p.h / 2} L${g.X1 - 22},${p.y + p.h / 2} L${g.X1 - 28},${ly}`} fill="none" stroke={g.color.get(v.id)} strokeOpacity=".6" />}
                    {/* the venue's badge: its initials on its own colour */}
                    <foreignObject x={g.X1 - 55} y={ly - 12} width={24} height={24}>
                      <VenueMark id={v.id} color={g.color.get(v.id)!} size={22} />
                    </foreignObject>
                    <text x={g.X1 - 62} y={ly - 1} textAnchor="end" className="fill-text text-[12.5px] font-medium">
                      {v.id}
                    </text>
                    <text x={g.X1 - 62} y={ly + 12} textAnchor="end" className="fill-muted font-mono text-[12px]">
                      {`${usd(g.vSum.get(v.id) ?? 0)} · ${(((g.vSum.get(v.id) ?? 0) / g.total) * 100).toFixed(0)}%`}
                    </text>
                  </g>
                );
              })}
              {g.top.map((s) => {
                const id = s.token.toLowerCase();
                const p = g.spos.get(id)!;
                const ly = g.sLab.get(id)!;
                const on = nodeOn("stock", id);
                return (
                  <g key={id} className="cursor-pointer" opacity={on ? 1 : 0.3} onMouseEnter={() => setHover({ kind: "stock", id })} onClick={() => pick({ kind: "stock", id })}>
                    <rect x={g.X2} y={p.y} width={10} height={p.h} rx={2.5} fill="#e6ece9" fillOpacity={0.85} />
                    <rect x={g.X2 + 10} y={ly - 13} width={W - g.X2 - 10} height={26} fill="transparent" />
                    {Math.abs(ly - (p.y + p.h / 2)) > 2 && <path d={`M${g.X2 + 10},${p.y + p.h / 2} L${g.X2 + 16},${p.y + p.h / 2} L${g.X2 + 24},${ly}`} fill="none" stroke="#e6ece9" strokeOpacity=".35" />}
                    <foreignObject x={g.X2 + 28} y={ly - 10} width={20} height={20}>
                      <TokenAvatar address={s.token} symbol={s.symbol} stock size={20} />
                    </foreignObject>
                    <text x={g.X2 + 56} y={ly + 5} className="fill-text font-mono text-[12.5px] font-semibold">
                      {s.symbol}
                    </text>
                    <text x={W} y={ly + 5} textAnchor="end" className="fill-muted font-mono text-[12px]">
                      {usd(g.sSum.get(id) ?? 0)}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          {view === "matrix" && (
            <div className="overflow-x-auto p-3">
              <table className="w-full min-w-[620px] border-separate border-spacing-[3px] text-[12px]">
                <thead>
                  <tr>
                    <th />
                    {g.vs.map((v) => (
                      <th key={v.id} scope="col" className="pb-1 font-normal">
                        <button type="button" onMouseEnter={() => setHover({ kind: "venue", id: v.id })} onClick={() => pick({ kind: "venue", id: v.id })} className={cx("w-full truncate rounded-md px-1 py-1 text-center", nodeOn("venue", v.id) ? "text-text" : "text-[#5d6b64]")}>
                          <span className="mx-auto mb-1 block w-fit">
                            <VenueMark id={v.id} color={g.color.get(v.id)!} size={20} />
                          </span>
                          {v.id}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.top.map((s, r) => {
                    const id = s.token.toLowerCase();
                    return (
                      <tr key={id}>
                        <th scope="row" className="pr-2 text-left font-normal">
                          <button type="button" onMouseEnter={() => setHover({ kind: "stock", id })} onClick={() => pick({ kind: "stock", id })} className={cx("flex items-center gap-2 font-mono", nodeOn("stock", id) ? "text-text" : "text-[#5d6b64]")}>
                            <TokenAvatar address={s.token} symbol={s.symbol} stock size={16} />
                            {s.symbol}
                          </button>
                        </th>
                        {g.vs.map((v, c) => {
                          const l = g.ls.find((x) => x.venue === v.id && x.token === id);
                          const k = l ? Math.log10(1 + l.volume) / Math.log10(1 + g.maxL) : 0;
                          const on = l && lit(l);
                          return (
                            <td key={v.id} title={l ? `${s.symbol} on ${v.id}: ${usd(l.volume)} volume, ${usd(l.liquidity)} liquidity` : `${s.symbol} has no pool on ${v.id}`} className="tile-in h-8 rounded-md text-center font-mono transition-opacity" style={{ background: l ? `color-mix(in srgb, ${g.color.get(v.id)} ${Math.round(10 + k * 70)}%, #0b1214)` : "#0f1a1d", opacity: !act || on ? 1 : 0.25, color: k > 0.55 ? "#061012" : "#cfe3e6", animationDelay: `${(r + c) * 0.015}s` }}>
                              {l ? usd(l.volume) : ""}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {view === "split" && (
            <ul className="space-y-2.5 p-4">
              {g.top.map((s, i) => {
                const id = s.token.toLowerCase();
                const parts = g.ls.filter((l) => l.token === id).sort((a, b) => b.volume - a.volume);
                const sum = g.sSum.get(id) || 1;
                const lead = parts[0];
                return (
                  <li key={id} onMouseEnter={() => setHover({ kind: "stock", id })} onClick={() => pick({ kind: "stock", id })} className={cx("grid cursor-pointer grid-cols-[6rem_minmax(0,1fr)_7.5rem] items-center gap-3 text-[12.5px] transition-opacity", !nodeOn("stock", id) && "opacity-30")}>
                    <span className="flex items-center gap-2 font-mono text-text">
                      <TokenAvatar address={s.token} symbol={s.symbol} stock size={18} />
                      {s.symbol}
                    </span>
                    <span className="bar-grow flex h-4 overflow-hidden rounded-md" style={{ animationDelay: `${i * 0.04}s` }}>
                      {parts.map((p) => (
                        <span key={p.venue} title={`${p.venue}: ${usd(p.volume)} (${((p.volume / sum) * 100).toFixed(0)}%)`} className="h-full border-r border-[#0b1214] last:border-0" style={{ width: `${(p.volume / sum) * 100}%`, background: g.color.get(p.venue) }} />
                      ))}
                    </span>
                    <span className="text-right tabular-nums text-[12px] text-muted">{lead ? `${parts.length} ${parts.length === 1 ? "venue" : "venues"} · ${((lead.volume / sum) * 100).toFixed(0)}% top` : ""}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="flex flex-col rounded-2xl bg-(--bay-bg2) p-4">
          <p className="text-[12px] text-muted">{focus ? "Pinned" : hover ? "Looking at" : "Showing"}</p>
          <p className="mt-0.5 flex items-center gap-2 truncate text-[18px] font-semibold text-text">
            {act?.kind === "venue" && <VenueMark id={act.id} color={g.color.get(act.id)!} size={22} />}
            {label}
          </p>
          <div className="mt-4">
            <p className="text-[12px] text-muted">24h volume</p>
            <p className="font-mono text-[24px] text-text">
              <CountUp value={selVol} fmt={usd} />
            </p>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#0b1214]">
              <span className="block h-full rounded-full bg-(--bay-acc) transition-[width] duration-500" style={{ width: `${(selVol / g.total) * 100}%` }} />
            </span>
            <p className="mt-1 font-mono text-[12px] text-muted">{`${((selVol / g.total) * 100).toFixed(0)}% of what is drawn`}</p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            {(
              [
                ["Liquidity", selLiq, usd],
                ["Pools", selPools, (x: number) => `${Math.round(x)}`],
              ] as const
            ).map(([k, v, f]) => (
              <div key={k}>
                <dt className="text-[12px] text-muted">{k}</dt>
                <dd className="font-mono text-[17px] text-text">
                  <CountUp value={v} fmt={f} />
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[12px] text-muted">Biggest links</p>
          <ul className="mt-1.5 space-y-1.5">
            {topLinks.map((l) => (
              <li key={`${l.venue}-${l.token}`} className="flex items-center gap-2 text-[12px]">
                <VenueMark id={l.venue} color={g.color.get(l.venue)!} size={16} />
                <span className="truncate text-text">{`${sym(l.token)} · ${l.venue}`}</span>
                <span className="ml-auto font-mono text-muted">{usd(l.volume)}</span>
              </li>
            ))}
          </ul>
          {focus && (
            <button type="button" onClick={() => setFocus(null)} className="mt-auto w-full rounded-lg border border-(--bay-edge) py-1.5 text-[12px] text-text transition-colors hover:border-(--bay-acc)">
              Show everything
            </button>
          )}
        </aside>
      </div>
    </Bay>
  );
}

type G = {
  vs: Venue[];
  top: Stock[];
  ls: Link[];
  color: Map<string, string>;
  maxL: number;
};

/**
 * Towers: the venue × token grid in isometric 3D. Each bar stands on its cell as tall as the pair's 24h volume (log
 * scale, so a small venue still shows); venues run down the left edge with their marks, tokens down the right.
 * Painted back to front so nearer bars cover farther ones; a hovered venue or token keeps its row lit.
 */
function Towers({ g, lit, nodeOn, setHover, pick, act, grown }: { g: G; lit: (l: { venue: string; token: string }) => boolean; nodeOn: (k: "venue" | "stock", id: string) => boolean; setHover: (f: Focus) => void; pick: (f: NonNullable<Focus>) => void; act: Focus; grown: boolean }) {
  const nv = g.vs.length, nt = g.top.length;
  const cw = Math.min(30, 560 / Math.max(1, nv + nt)), chh = cw / 2;
  const ox = 120 + nv * cw + 40, oy = 190, TALL = 170;
  const P = (i: number, j: number) => [ox + (j - i) * cw, oy + (i + j) * chh] as const;
  const VH = oy + (nv + nt) * chh + 40;
  const cells: { i: number; j: number; l: Link | undefined }[] = [];
  for (let i = 0; i < nv; i++) for (let j = 0; j < nt; j++) cells.push({ i, j, l: g.ls.find((x) => x.venue === g.vs[i]!.id && x.token === g.top[j]!.token.toLowerCase()) });
  cells.sort((a, b) => a.i + a.j - (b.i + b.j));
  const pt = (xs: (readonly [number, number])[]) => xs.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${VH}`} className="block h-auto w-full" role="group" aria-label="24h volume of each stock token on each venue, as towers">
      {/* the floor */}
      <polygon points={pt([P(0, 0), P(0, nt), P(nv, nt), P(nv, 0)])} fill="#0b1214" stroke="#1c2a2e" />
      {Array.from({ length: nv + 1 }, (_, i) => (
        <line key={`r${i}`} x1={P(i, 0)[0]} y1={P(i, 0)[1]} x2={P(i, nt)[0]} y2={P(i, nt)[1]} stroke="#16232a" />
      ))}
      {Array.from({ length: nt + 1 }, (_, j) => (
        <line key={`c${j}`} x1={P(0, j)[0]} y1={P(0, j)[1]} x2={P(nv, j)[0]} y2={P(nv, j)[1]} stroke="#16232a" />
      ))}
      {cells.map(({ i, j, l }) => {
        if (!l) return null;
        const k = Math.log10(1 + l.volume) / Math.log10(1 + g.maxL);
        const h = grown ? 4 + k * TALL : 2;
        const on = lit(l);
        // colour is meaning: green when the stock rose today, red when it fell, grey when unknown; brighter the bigger the move
        const ch = g.top[j]!.change;
        const c = ch == null ? "#7d8a83" : `color-mix(in srgb, ${ch >= 0 ? "#6fe7a8" : "#ff4560"} ${Math.round(55 + Math.min(45, Math.abs(ch) * 9))}%, #1f1f1f)`;
        const g0 = 0.14, a = P(i + g0, j + g0), b = P(i + g0, j + 1 - g0), d = P(i + 1 - g0, j + g0), e = P(i + 1 - g0, j + 1 - g0);
        const up = (q: readonly [number, number]) => [q[0], q[1] - h] as const;
        return (
          <g key={`${i}-${j}`} opacity={on ? 1 : 0.16} style={{ transition: "opacity .3s" }}>
            <title>{`${g.top[j]!.symbol} on ${l.venue}: ${usd(l.volume)} in 24h`}</title>
            <polygon points={pt([d, e, up(e), up(d)])} fill={`color-mix(in srgb, ${c} 45%, #05090a)`} />
            <polygon points={pt([b, e, up(e), up(b)])} fill={`color-mix(in srgb, ${c} 28%, #05090a)`} />
            <polygon points={pt([up(a), up(b), up(e), up(d)])} fill={c} fillOpacity={0.92} />
          </g>
        );
      })}
      {g.vs.map((v, i) => {
        const [x, y] = P(i + 0.5, 0);
        return (
          <g key={v.id} className="cursor-pointer" opacity={nodeOn("venue", v.id) ? 1 : 0.35} onMouseEnter={() => setHover({ kind: "venue", id: v.id })} onClick={() => pick({ kind: "venue", id: v.id })}>
            <rect x={x - 190} y={y - 14} width={180} height={28} fill="transparent" />
            <text x={x - 40} y={y + 4} textAnchor="end" className="fill-text text-[12.5px] font-medium">
              {v.id}
            </text>
            <foreignObject x={x - 33} y={y - 11} width={22} height={22}>
              <VenueMark id={v.id} color={g.color.get(v.id)!} size={20} />
            </foreignObject>
          </g>
        );
      })}
      {g.top.map((s, j) => {
        const id = s.token.toLowerCase();
        const [x, y] = P(0, j + 0.5);
        return (
          <g key={id} className="cursor-pointer" opacity={nodeOn("stock", id) ? 1 : 0.35} onMouseEnter={() => setHover({ kind: "stock", id })} onClick={() => pick({ kind: "stock", id })}>
            <rect x={x + 8} y={y - 22} width={110} height={22} fill="transparent" />
            <text x={x + 12} y={y - 6} className="fill-text font-mono text-[12px] font-semibold">
              {s.symbol}
            </text>
          </g>
        );
      })}
      {!act && (
        <text x={W - 12} y={VH - 12} textAnchor="end" className="fill-muted font-mono text-[12px]">
          height = 24h volume, log scale · green rose today, red fell
        </text>
      )}
    </svg>
  );
}
