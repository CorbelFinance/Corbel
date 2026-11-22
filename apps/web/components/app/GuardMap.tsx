"use client";

/**
 * Guard · market map. Each replayed token is a point: price impact of the trade across (log scale), Corbel
 * Score up. The policy is the lit box (score at or above the floor, impact at or under the cap). Both edges
 * drag: move the floor or the cap and every point is judged again at once from the answers already in hand
 * (score and impact recomputed, every other rule as the server said). Hover a point for its card.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import { TokenAvatar } from "./TokenAvatar";

type Rule = { id: string; name: string; ok: boolean; detail: string };
export type MapRow = { token: string; symbol: string; v: { verdict: "allow" | "deny"; score?: { total: number; tag: string }; quote: { impact: number | null } | null; rules?: Rule[]; error?: string } | null };

const H = 300;
const L = 44;
const R = 16;
const T = 14;
const B = 34;
const LO = Math.log10(0.0001);
const HI = Math.log10(1);
const xAt = (W: number) => (imp: number) => L + ((Math.log10(Math.max(0.0001, Math.min(1, imp))) - LO) / (HI - LO)) * (W - L - R);
const impAt = (W: number) => (x: number) => 10 ** (LO + ((x - L) / (W - L - R)) * (HI - LO));
const yOf = (s: number) => T + (1 - s / 100) * (H - T - B);
const scoreOf = (y: number) => (1 - (y - T) / (H - T - B)) * 100;
const pct = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;

/** The verdict under a floor and a cap, other rules as answered. */
export function judge(r: MapRow, minScore: number, maxImpact: number) {
  if (!r.v?.rules) return null;
  const rules = r.v.rules.map((x) => (x.id === "score" ? { ...x, ok: (r.v!.score?.total ?? -1) >= minScore } : x.id === "impact" ? { ...x, ok: r.v!.quote?.impact != null && r.v!.quote.impact <= maxImpact } : x));
  return { ok: rules.every((x) => x.ok), rules };
}

export function GuardMap({ rows, minScore, maxImpact, onFloor, onCap }: { rows: MapRow[]; minScore: number; maxImpact: number; onFloor: (v: number) => void; onCap: (v: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const xOf = xAt(W);
  const impOf = impAt(W);
  const [drag, setDrag] = useState<"floor" | "cap" | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const pts = useMemo(
    () =>
      rows
        .filter((r) => r.v && !r.v.error && r.v.score)
        .map((r, i) => {
          const imp = r.v!.quote?.impact ?? null;
          // a trade with no measured impact sits on the right wall
          return { r, x: imp === null ? W - R - 6 : xAt(W)(imp), y: yOf(r.v!.score!.total) + ((i % 3) - 1) * 2, ly: 0, imp, j: judge(r, minScore, maxImpact) };
        })
        .sort((a, b) => a.y - b.y)
        // labels that would overlap a neighbour move down a line
        .map((p, i, all) => {
          let ly = p.y;
          for (let k = 0; k < i; k++) {
            const o = all[k]!;
            if (Math.abs(o.x - p.x) < 80 && Math.abs(o.ly - ly) < 12) ly = o.ly + 12;
          }
          p.ly = ly;
          return p;
        }),
    [rows, minScore, maxImpact, W],
  );
  const fx = xOf(maxImpact);
  const fy = yOf(minScore);
  const move = (e: React.PointerEvent) => {
    if (!drag || !svg.current) return;
    const b = svg.current.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * W;
    const y = ((e.clientY - b.top) / b.height) * H;
    if (drag === "floor") onFloor(Math.max(0, Math.min(100, Math.round(scoreOf(y) / 5) * 5)));
    else onCap(Math.max(0.001, Math.min(0.1, Math.round(impOf(x) * 1000) / 1000)));
  };
  const hp = pts.find((p) => p.r.token === hover);
  const passN = pts.filter((p) => p.j?.ok).length;

  return (
    <div ref={box} className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full bg-leaf" /> passes now
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full bg-[#ff6b6b]" /> refused
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-3.5 rounded-sm border border-dashed border-[var(--bay-acc)] bg-[color-mix(in_srgb,var(--bay-acc)_12%,transparent)]" /> your policy, drag its edges
        </span>
        <span className="ml-auto font-mono text-text">{`${passN} of ${pts.length} pass`}</span>
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        height={H}
        className={cx("block w-full touch-none select-none", drag === "floor" ? "cursor-ns-resize" : drag === "cap" ? "cursor-ew-resize" : "")}
        onPointerMove={move}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
        role="img"
        aria-label="Trending tokens by score and price impact, with the policy box"
      >
        {[0, 25, 50, 75, 100].map((s) => (
          <g key={s}>
            <line x1={L} x2={W - R} y1={yOf(s)} y2={yOf(s)} stroke="var(--bay-edge)" strokeDasharray="2 4" />
            <text x={L - 8} y={yOf(s) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)">
              {s}
            </text>
          </g>
        ))}
        {[0.001, 0.01, 0.1, 1].map((v) => (
          <g key={v}>
            <line x1={xOf(v)} x2={xOf(v)} y1={T} y2={H - B} stroke="var(--bay-edge)" strokeDasharray="2 4" />
            <text x={xOf(v)} y={H - B + 16} textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)">
              {pct(v)}
            </text>
          </g>
        ))}
        <text x={W - R} y={H - 4} textAnchor="end" fontSize="10" fill="var(--muted)">
          price impact of the trade, log scale · no route on the right edge →
        </text>
        <text x={4} y={T + 2} fontSize="10" fill="var(--muted)" transform={`rotate(-90 ${4} ${T + 2})`} textAnchor="end">
          score
        </text>

        {/* the policy box */}
        <rect x={L} y={T} width={Math.max(0, fx - L)} height={Math.max(0, fy - T)} fill="var(--bay-acc)" fillOpacity="0.1" style={{ transition: drag ? "none" : "all .25s" }} />
        <line x1={L} x2={fx} y1={fy} y2={fy} stroke="var(--bay-acc)" strokeWidth="1.5" strokeDasharray="5 3" />
        <line x1={fx} x2={fx} y1={T} y2={fy} stroke="var(--bay-acc)" strokeWidth="1.5" strokeDasharray="5 3" />
        <g className="cursor-ns-resize" onPointerDown={(e) => (e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId), setDrag("floor"))}>
          <line x1={L} x2={fx} y1={fy} y2={fy} stroke="transparent" strokeWidth="14" />
          <rect x={L + 6} y={fy - 9} width="62" height="18" rx="9" fill="var(--bay-acc)" />
          <text x={L + 37} y={fy + 3.5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#07080b">{`floor ${minScore}`}</text>
        </g>
        <g className="cursor-ew-resize" onPointerDown={(e) => (e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId), setDrag("cap"))}>
          <line x1={fx} x2={fx} y1={T} y2={fy} stroke="transparent" strokeWidth="14" />
          <rect x={fx - 34} y={T + 4} width="68" height="18" rx="9" fill="var(--bay-acc)" />
          <text x={fx} y={T + 16.5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#07080b">{`cap ${pct(maxImpact)}`}</text>
        </g>

        {pts.map((p, i) => (
          <g key={p.r.token} onPointerEnter={() => setHover(p.r.token)} onPointerLeave={() => setHover(null)} className="cursor-pointer" style={{ transformOrigin: `${p.x}px ${p.y}px`, animation: `pop-pt .5s ${i * 0.05}s cubic-bezier(.3,1.5,.4,1) both` }}>
            {p.j?.ok && <circle cx={p.x} cy={p.y} r="13" fill="none" stroke="var(--leaf)" strokeOpacity="0.35" className="pt-ring" />}
            <circle cx={p.x} cy={p.y} r={hover === p.r.token ? 8 : 6} fill={p.j?.ok ? "var(--leaf)" : "#ff6b6b"} stroke="var(--bay-bg)" strokeWidth="2" style={{ transition: "fill .3s, r .15s" }} />
            <text x={p.x > W - 90 ? p.x - 10 : p.x + 10} y={p.ly + 3.5} textAnchor={p.x > W - 90 ? "end" : "start"} fontSize="10.5" fill="var(--text)">
              {p.r.symbol}
            </text>
          </g>
        ))}
      </svg>

      {hp && (
        <div className="pointer-events-none absolute z-20 w-64 rounded-xl border border-[var(--bay-edge)] bg-[#0b0a07]/95 p-3 shadow-2xl backdrop-blur" style={{ left: hp.x > W / 2 ? `calc(${(hp.x / W) * 100}% - 17rem)` : `calc(${(hp.x / W) * 100}% + 14px)`, top: `${(hp.y / H) * 100}%`, transform: hp.y > H * 0.45 ? "translateY(-85%)" : "translateY(-10%)" }}>
          <div className="flex items-center gap-2">
            <TokenAvatar address={hp.r.token} symbol={hp.r.symbol} size={26} />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-text">{hp.r.symbol}</span>
              <span className="block text-[12px] text-muted">{hp.r.v?.score?.tag}</span>
            </span>
            <span className={cx("ml-auto font-mono text-[13px] font-semibold", hp.j?.ok ? "text-leaf" : "text-[#ff8a8a]")}>{hp.j?.ok ? "ALLOW" : "DENY"}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[12px]">
            <span className="rounded-md bg-[var(--bay-bg2)] px-2 py-1">
              <span className="block text-muted">Score</span>
              <span className="font-mono text-[13px] text-text">{hp.r.v?.score?.total}</span>
            </span>
            <span className="rounded-md bg-[var(--bay-bg2)] px-2 py-1">
              <span className="block text-muted">Impact</span>
              <span className="font-mono text-[13px] text-text">{hp.imp === null ? "no route" : pct(hp.imp)}</span>
            </span>
          </div>
          <p className="mt-2 border-t border-[var(--bay-edge)] pt-2 text-[12px] text-muted">Gates</p>
          <ul className="mt-1 space-y-0.5 text-[12px]">
            {(hp.j?.rules ?? []).map((x) => (
              <li key={x.id} className="flex items-center gap-1.5">
                <span className={x.ok ? "text-leaf" : "text-[#ff8a8a]"}>{x.ok ? "✓" : "✕"}</span>
                <span className={x.ok ? "text-muted" : "text-text"}>{x.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
