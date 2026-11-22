"use client";

/**
 * Home · the platform. The Corbel mark in the middle, drawn live: its six outer rings are the six areas, each
 * with an arc of its colour running round it, and the red core beats. Every area is a tile with a small live
 * picture from its own tool, wired to its own ring by a circuit trace (straight out, a 45° bend, into the tile)
 * with packets running out to the tile and a dashed flow running back to the core. Hover a tile and its ring and
 * trace light up.
 */
import Link from "next/link";
import { DotScene, type SceneId } from "../app/DotScene";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { pageZoom } from "../../lib/zoom";

type Live = {
  swaps?: number;
  vols?: { s: string; v: number }[];
  pools?: { s: string; apr: number }[];
  agents?: { runs: number; traded: number; stopped: number };
  models?: { name: string; pin: number; pout: number }[];
  modelN?: number;
  gpuN?: number;
};
const AREAS = [
  { k: "Check", line: "Seven checks before you buy", href: "/app/trade/check", tone: "#6cc0d0", side: "l" },
  { k: "Trade", line: "Best route across every pool", href: "/app/trade/terminal", tone: "#6fe7a8", side: "l" },
  { k: "Earn", line: "What pools paid, and your share", href: "/app/account/pools", tone: "#f2c46d", side: "l" },
  { k: "Agents", line: "A budget a bot cannot break", href: "/app/agents/guard", tone: "#9b86e4", side: "r" },
  { k: "AI", line: "Models, chat and GPUs, priced live", href: "/app/ai/studio", tone: "#ff9a5c", side: "r" },
  { k: "Wallet", line: "Your wallet as others see it", href: "/app/wallet/exposure", tone: "#93a6ff", side: "r" },
] as const;
/** Which outer ring of the mark feeds each area, in degrees (0 = right, clockwise). */
const RING: Record<string, number> = { Check: -120, Trade: 180, Earn: 120, Agents: -60, AI: 0, Wallet: 60 };
/** A polyline with rounded corners. */
function trace(pts: [number, number][], r: number) {
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1]!, [x, y] = pts[i]!, [nx, ny] = pts[i + 1]!;
    const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y);
    const k = Math.min(r, l1 / 2, l2 / 2);
    const ax = x + ((px - x) / (l1 || 1)) * k, ay = y + ((py - y) / (l1 || 1)) * k;
    const bx = x + ((nx - x) / (l2 || 1)) * k, by = y + ((ny - y) / (l2 || 1)) * k;
    d += ` L${ax.toFixed(1)},${ay.toFixed(1)} Q${x.toFixed(1)},${y.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
  }
  const e = pts[pts.length - 1]!;
  return `${d} L${e[0].toFixed(1)},${e[1].toFixed(1)}`;
}
const SCENE: Record<string, SceneId> = { Check: "scan", Trade: "helix", Earn: "rings", Agents: "lattice", AI: "stack", Wallet: "net" };
const CHECKS = ["sell", "exit", "tax", "owner", "lock", "name", "maker"];
const money = (v: number) => (v < 0.01 ? `$${v.toPrecision(2)}` : `$${v.toFixed(2)}`);

function Ticker({ models }: { models: { name: string; pin: number; pout: number }[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (models.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % models.length), 2200);
    return () => clearInterval(t);
  }, [models.length]);
  const m = models[i];
  return m ? (
    <span key={i} className="pane-in flex items-center justify-between gap-2 font-mono text-[12px]">
      <span className="truncate text-text">{m.name}</span>
      <span className="text-[#ffcfae]">{`${money(m.pin)} / ${money(m.pout)}`}</span>
    </span>
  ) : (
    <span className="font-mono text-[12px] text-muted">reading prices…</span>
  );
}

export function Platform() {
  const [v, setV] = useState<Live>({});
  const [hot, setHot] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const core = useRef<HTMLDivElement>(null);
  const tiles = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [rays, setRays] = useState<{ k: string; d: string; tone: string; s: [number, number]; e: [number, number] }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const put = (p: Live) => setV((x) => ({ ...x, ...p }));
    fetch("/api/trending")
      .then((r) => r.json())
      .then((j: { swaps?: number; rows?: { symbol: string | null; volume: number }[] }) => put({ swaps: j.swaps, vols: (j.rows ?? []).slice(0, 14).map((r) => ({ s: r.symbol ?? "?", v: r.volume })) }))
      .catch(() => undefined);
    fetch("/api/earn")
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((j: { rows?: { symbol: string; apr: number | null }[] } | null) => j?.rows && put({ pools: j.rows.filter((r) => r.apr).sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0)).slice(0, 3).map((r) => ({ s: r.symbol, apr: r.apr ?? 0 })) }))
      .catch(() => undefined);
    fetch("/api/mandate?log")
      .then((r) => r.json())
      .then((j: { totals?: { runs: number; traded: number; stopped: number } }) => j.totals && put({ agents: j.totals }))
      .catch(() => undefined);
    fetch("/api/compute?what=models")
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((j: { rows?: { id: string; name: string; maker: string; pin: number; pout: number; created: number }[] } | null) => {
        if (!j?.rows) return;
        const lead = ["anthropic", "openai", "google", "x-ai", "deepseek", "qwen", "moonshotai", "mistralai"];
        const pick = lead.map((m) => j.rows!.filter((x) => x.maker === m && x.pin > 0 && !x.id.includes(":") && !/batch/i.test(x.name)).sort((a, b) => b.created - a.created)[0]).filter((x): x is NonNullable<typeof x> => !!x);
        put({ models: pick.map((x) => ({ name: x.name, pin: x.pin, pout: x.pout })), modelN: j.rows.length });
      })
      .catch(() => undefined);
    fetch("/api/compute?what=gpus")
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((j: { rows?: unknown[] } | null) => j?.rows && put({ gpuN: j.rows.length }))
      .catch(() => undefined);
  }, []);

  // the curves: from the edge of the balance to the inner edge of each tile, measured after layout
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const draw = () => {
      const z = pageZoom();
      const zr = (r: DOMRect) => ({ left: r.left / z, top: r.top / z, right: r.right / z, bottom: r.bottom / z, width: r.width / z, height: r.height / z });
      const b = zr(el.getBoundingClientRect());
      const cr = core.current?.getBoundingClientRect();
      const c = cr ? zr(cr) : null;
      if (!c || window.innerWidth < 1024) return setRays([]);
      const cx = c.left + c.width / 2 - b.left;
      const cy = c.top + c.height / 2 - b.top;
      const u = c.width / 200;
      const out: { k: string; d: string; tone: string; s: [number, number]; e: [number, number] }[] = [];
      for (const a of AREAS) {
        const tr = tiles.current[a.k]?.getBoundingClientRect();
        const t = tr ? zr(tr) : null;
        if (!t) continue;
        const dir = a.side === "l" ? -1 : 1;
        const tx = (a.side === "l" ? t.right : t.left) - b.left;
        const ty = t.top + t.height / 2 - b.top;
        // leave from the far edge of the area's own ring
        const ang = (RING[a.k]! * Math.PI) / 180;
        // leave from the area's port on the orbit around the mark
        const sx = cx + Math.cos(ang) * 100 * u;
        const sy = cy + Math.sin(ang) * 100 * u;
        const span = Math.abs(tx - sx);
        const lead = Math.min(28, span * 0.22);
        const diag = Math.min(Math.abs(ty - sy), Math.max(0, span - lead - 18));
        const p1: [number, number] = [sx + dir * lead, sy];
        const p2: [number, number] = [p1[0] + dir * diag, ty];
        out.push({ k: a.k, d: trace([[sx, sy], p1, p2, [tx, ty]], 14), tone: a.tone, s: [sx, sy], e: [tx, ty] });
      }
      setSize({ w: b.width, h: b.height });
      setRays(out);
    };
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fig: Record<string, string> = {
    Check: "7 checks",
    Trade: v.swaps != null ? `${v.swaps.toLocaleString("en")} swaps` : "—",
    Earn: v.pools?.[0] ? `up to ${(v.pools[0].apr * 100).toFixed(0)}%` : "—",
    Agents: v.agents ? `${v.agents.runs} decisions` : "—",
    AI: v.modelN != null ? `${v.modelN} models · ${v.gpuN ?? "…"} GPUs` : "—",
    Wallet: "4 tools",
  };
  const vmax = Math.max(1, ...(v.vols ?? []).map((x) => x.v));
  const art = (k: string, tone: string) => {
    if (k === "Check")
      return (
        <span className="flex gap-1">
          {CHECKS.map((c, i) => (
            <span key={c} className="plat-pip flex-1 rounded-md py-1 text-center font-mono text-[12px]" style={{ ["--t" as string]: tone, animationDelay: `${i * 0.35}s` }}>
              {c}
            </span>
          ))}
        </span>
      );
    if (k === "Trade")
      return (
        <span className="flex h-8 items-end gap-[3px]">
          {(v.vols ?? Array.from({ length: 14 }, () => ({ s: "", v: 0 }))).map((x, i) => (
            <span key={i} title={x.s} className="bar-rise flex-1 rounded-t-[2px]" style={{ height: `${Math.max(6, Math.sqrt(x.v / vmax) * 100)}%`, background: x.v ? tone : "#232323", animationDelay: `${i * 0.03}s` }} />
          ))}
        </span>
      );
    if (k === "Earn")
      return (
        <span className="grid gap-1">
          {(v.pools ?? []).map((p, i) => (
            <span key={p.s} className="flex items-center gap-2 font-mono text-[12px]">
              <span className="w-12 truncate text-text">{p.s}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#2a2516]">
                <span className="bar-grow block h-full rounded-full" style={{ width: `${Math.min(100, (p.apr / (v.pools![0]!.apr || 1)) * 100)}%`, background: tone, animationDelay: `${i * 0.1}s` }} />
              </span>
              <span style={{ color: tone }}>{`${(p.apr * 100).toFixed(1)}%`}</span>
            </span>
          ))}
          {!v.pools && <span className="font-mono text-[12px] text-muted">reading pools…</span>}
        </span>
      );
    if (k === "Agents") {
      const a = v.agents;
      const tot = a ? Math.max(1, a.traded + a.stopped) : 1;
      return (
        <span className="grid gap-1 font-mono text-[12px]">
          <span className="flex h-2 overflow-hidden rounded-full bg-[#221d33]">
            <span className="bar-grow h-full" style={{ width: `${a ? (a.traded / tot) * 100 : 0}%`, background: "#6fe7a8" }} />
            <span className="bar-grow h-full" style={{ width: `${a ? (a.stopped / tot) * 100 : 0}%`, background: tone, animationDelay: ".15s" }} />
          </span>
          <span className="flex justify-between text-muted">
            <span>{a ? `${a.traded} traded` : "—"}</span>
            <span style={{ color: tone }}>{a ? `${a.stopped} stopped by the rules` : ""}</span>
          </span>
        </span>
      );
    }
    if (k === "AI") return <Ticker models={v.models ?? []} />;
    return (
      <span className="flex flex-wrap gap-1">
        {["Exposure", "Stress", "Paper", "Share"].map((x) => (
          <span key={x} className="rounded-md border px-1.5 py-0.5 font-mono text-[12px]" style={{ borderColor: `color-mix(in srgb, ${tone} 35%, transparent)`, color: tone }}>
            {x}
          </span>
        ))}
      </span>
    );
  };

  const tile = (a: (typeof AREAS)[number], i: number) => (
    <Link
      key={a.k}
      ref={(n) => {
        tiles.current[a.k] = n;
      }}
      href={a.href}
      onMouseEnter={() => setHot(a.k)}
      onMouseLeave={() => setHot(null)}
      onFocus={() => setHot(a.k)}
      onBlur={() => setHot(null)}
      className="plat-tile group relative grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3 overflow-hidden rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur transition-all hover:-translate-y-0.5"
      style={{ ["--t" as string]: a.tone, animationDelay: `${i * 0.08}s` }}
    >
      <span className="min-w-0">
      <span className="flex items-center gap-2">
        <i className="h-2 w-2 rounded-full" style={{ background: a.tone, boxShadow: `0 0 10px ${a.tone}` }} />
        <span className="text-[16px] font-semibold text-text">{a.k}</span>
        <span className="ml-auto font-mono text-[12px]" style={{ color: a.tone }}>
          {fig[a.k]}
        </span>
      </span>
      <span className="mt-1 block text-[13px] text-muted">{a.line}</span>
      <span className="mt-3 block min-h-8">{art(a.k, a.tone)}</span>
      </span>
      <span aria-hidden className="plat-scene relative self-stretch rounded-xl">
        <DotScene scene={SCENE[a.k]!} tone={a.tone} className="absolute inset-0 h-full w-full" />
      </span>
    </Link>
  );

  return (
    <section id="platform" data-chain-mask="" className="relative mx-auto max-w-page px-4 py-24 sm:px-6 lg:px-10 xl:px-14">
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-leaf">One balance</p>
        <h2 className="mt-3 font-display text-4xl tracking-tight text-text sm:text-5xl">Not just a terminal.</h2>
        <p className="mt-4 text-[16px] text-muted">The same balance checks a token, trades it, earns on a pool, funds an agent and pays for AI. Everything below is live.</p>
      </div>
      <div ref={box} className="relative mt-14 grid items-center gap-4 lg:grid-cols-[1fr_minmax(16rem,20rem)_1fr] lg:gap-20">
        {rays.length > 0 && (
          <svg aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block" width={size.w} height={size.h}>
            {rays.map((r, n) => {
              const on = hot === r.k;
              const dur = on ? 1.2 : 3.2;
              return (
                <g key={r.k}>
                  <path d={r.d} fill="none" stroke={r.tone} strokeOpacity={on ? 0.22 : 0.08} strokeWidth={on ? 9 : 6} strokeLinecap="round" style={{ transition: "stroke-opacity .3s, stroke-width .3s" }} />
                  <path id={`ray-${r.k}`} d={r.d} fill="none" stroke={r.tone} strokeOpacity={on ? 0.95 : 0.35} strokeWidth={on ? 1.8 : 1.2} style={{ transition: "stroke-opacity .3s" }} />
                  <path d={r.d} fill="none" stroke={r.tone} strokeOpacity={on ? 0.9 : 0.5} strokeWidth={1.4} className="plat-flow" style={{ animationDuration: on ? "0.6s" : "1.6s" }} />
                  <circle cx={r.s[0]} cy={r.s[1]} r={3.5} fill="var(--bg)" stroke={r.tone} strokeWidth={1.4} />
                  <rect x={r.e[0] - 3} y={r.e[1] - 6} width={6} height={12} rx={1.5} fill={r.tone} fillOpacity={on ? 1 : 0.6} />
                  {[0, 0.5].map((off) =>
                    [0, 1, 2].map((j) => (
                      <circle key={`${off}-${j}`} r={(on ? 3.6 : 2.6) - j * 0.8} fill={r.tone} opacity={1 - j * 0.3}>
                        <animateMotion dur={`${dur}s`} begin={`${-(off * dur) - n * 0.37 + j * 0.06}s`} repeatCount="indefinite" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.45 0 0.25 1">
                          <mpath href={`#ray-${r.k}`} />
                        </animateMotion>
                      </circle>
                    )),
                  )}
                </g>
              );
            })}
          </svg>
        )}
        <div className="relative z-10 grid gap-4">{AREAS.filter((a) => a.side === "l").map(tile)}</div>
        <div className="relative z-10 mx-auto w-full max-w-[20rem] text-center">
          <div className="plat-core relative mx-auto aspect-square w-[78%] max-w-[15rem] lg:w-full">
            <div ref={core} className="absolute inset-0">
              {/* the real mark, turning slowly on a soft glow; the area under the pointer lights its port */}
              <span aria-hidden className="plat-mark-glow absolute inset-[12%] rounded-full" />
              {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a static file */}
              <img src="/brand/corbel-logo-512.png" alt="" width={512} height={512} className="plat-mark absolute inset-[10%] h-[80%] w-[80%]" />
              {/* the orbit and one port per area: the traces leave from here, so the mark can turn freely */}
              <svg aria-hidden viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                <circle cx={100} cy={100} r={100} fill="none" stroke="var(--leaf)" strokeOpacity=".22" strokeDasharray="2 5" className="plat-orbit-line" />
                {AREAS.map((a) => {
                  const ang = (RING[a.k]! * Math.PI) / 180;
                  return <circle key={a.k} cx={100 + Math.cos(ang) * 100} cy={100 + Math.sin(ang) * 100} r={hot === a.k ? 5 : 3.5} fill={a.tone} style={{ filter: `drop-shadow(0 0 ${hot === a.k ? 8 : 4}px ${a.tone})`, transition: "r .25s" }} />;
                })}
              </svg>
            </div>
          </div>
          <p className="mt-6 font-mono text-[12px] text-muted">USDG · ETH · stock tokens</p>
          <p className="mt-1 font-display text-4xl text-text">One balance</p>
          <p className="mt-2 min-h-[3.6em] px-2 text-[13px] text-muted">{hot ? `${hot}: ${AREAS.find((a) => a.k === hot)?.line}` : "On Robinhood Chain. You hold the keys; every tool reads it, none of them takes it."}</p>
        </div>
        <div className="relative z-10 grid gap-4">{AREAS.filter((a) => a.side === "r").map((a, i) => tile(a, i + 3))}</div>
      </div>
    </section>
  );
}
