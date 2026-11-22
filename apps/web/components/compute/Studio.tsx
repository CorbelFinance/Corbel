"use client";

/**
 * Compute · Studio. The front of the AI and GPU market: pick a task and the models that do it line up with live
 * list prices, the market in five figures, and a price map of every model (input against output price, log scale,
 * one dot per model, coloured by maker). Hover a dot for its card; click to open it in Models.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import { CountUp } from "../app/Bay";
import { KINDS, leadPicks, Monogram, ctxK, makerColor, makerName, money, useCatalog, type Gpu, type Model } from "./data";

const PER = "1M";
const TASKS = [...KINDS, { id: "gpu", label: "Rent a GPU" }] as const;

function PriceMap({ rows }: { rows: Model[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);
  const [hov, setHov] = useState<Model | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 340, L = 46, B = 30, T = 10, R = 10;
  const pts = rows.filter((m) => m.pin > 0 && m.pout > 0);
  const lx = (v: number) => Math.log10(Math.max(0.01, Math.min(200, v)));
  const X = (v: number) => L + ((lx(v) + 2) / (lx(200) + 2)) * (W - L - R);
  const Y = (v: number) => T + (1 - (lx(v) + 2) / (lx(200) + 2)) * (H - T - B);
  const ticks = [0.01, 0.1, 1, 10, 100];
  return (
    <div ref={box} className="relative">
      <svg width={W} height={H} className="block" role="img" aria-label="Every model by input and output price">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={T} y2={H - B} stroke="#2a1d17" strokeDasharray="2 4" />
            <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="#2a1d17" strokeDasharray="2 4" />
            <text x={X(t)} y={H - 10} fontSize="10" textAnchor="middle" fill="var(--muted)" fontFamily="var(--font-mono)">{`$${t}`}</text>
            <text x={L - 6} y={Y(t) + 3} fontSize="10" textAnchor="end" fill="var(--muted)" fontFamily="var(--font-mono)">{`$${t}`}</text>
          </g>
        ))}
        <text x={W - R} y={H - 22} fontSize="10" textAnchor="end" fill="var(--muted)">
          {`input, per ${PER} tokens →`}
        </text>
        {pts.map((m, i) => (
          <circle
            key={m.id}
            cx={X(m.pin)}
            cy={Y(m.pout)}
            r={hov?.id === m.id ? 7 : 3 + Math.min(4, Math.log10(Math.max(1, m.ctx / 8000)) * 1.6)}
            fill={makerColor(m.maker)}
            fillOpacity={hov && hov.maker !== m.maker ? 0.15 : 0.8}
            stroke="#0d0907"
            onMouseEnter={() => setHov(m)}
            onMouseLeave={() => setHov(null)}
            style={{ transformOrigin: `${X(m.pin)}px ${Y(m.pout)}px`, animation: `pop-pt .5s ${Math.min(i, 200) * 0.004}s both`, transition: "fill-opacity .2s" }}
            className="cursor-pointer"
          />
        ))}
      </svg>
      {hov && (
        <div className="pointer-events-none absolute z-20 w-64 rounded-2xl border border-[#3a2418] bg-[#120c0a]/95 p-3 shadow-2xl backdrop-blur" style={{ left: X(hov.pin) > W / 2 ? X(hov.pin) - 272 : X(hov.pin) + 14, top: Math.max(0, Y(hov.pout) - 40) }}>
          <div className="flex items-center gap-2">
            <Monogram maker={hov.maker} size={28} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-text">{hov.name}</span>
              <span className="block text-[12px] text-muted">{makerName(hov.maker)}</span>
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[12px]">
            {[
              ["In", money(hov.pin)],
              ["Out", money(hov.pout)],
              ["Context", ctxK(hov.ctx)],
            ].map(([k, v]) => (
              <span key={k} className="rounded-lg bg-[#1c130e] px-2 py-1">
                <span className="block text-muted">{k}</span>
                <span className="font-mono text-[12px] text-text">{v}</span>
              </span>
            ))}
          </div>
          <p className="mt-2 line-clamp-2 text-[12px] text-muted">{hov.about}</p>
        </div>
      )}
    </div>
  );
}

export function Studio() {
  const { rows, at } = useCatalog<Model>("models");
  const { rows: gpus } = useCatalog<Gpu>("gpus");
  const [task, setTask] = useState<(typeof TASKS)[number]["id"]>("text");
  const [maker, setMaker] = useState<string | null>(null);

  const d = useMemo(() => {
    if (!rows) return null;
    const makers = new Map<string, number>();
    for (const m of rows) makers.set(m.maker, (makers.get(m.maker) ?? 0) + 1);
    const text = rows.filter((m) => m.kind === "text" && m.pin > 0);
    const cheapest = [...text].sort((a, b) => a.pin + a.pout - (b.pin + b.pout))[0];
    const newest = [...rows].sort((a, b) => b.created - a.created)[0];
    return { makers: [...makers.entries()].sort((a, b) => b[1] - a[1]), cheapest, newest };
  }, [rows]);
  const pick = useMemo(() => {
    if (!rows || task === "gpu") return [];
    return leadPicks(rows, (m) => m.kind === task || (task === "text" && m.kind === "vision"), 6);
  }, [rows, task]);
  const cheapGpu = gpus ? [...gpus].sort((a, b) => Math.min(a.community ?? 1e9, a.secure ?? 1e9) - Math.min(b.community ?? 1e9, b.secure ?? 1e9))[0] : null;
  const gpuPick = gpus ? [...gpus].filter((g) => g.vram >= 24).slice(0, 6) : [];
  const mapRows = rows ? rows.filter((m) => !maker || m.maker === maker) : [];

  return (
    <div className="compute space-y-5">
      {/* the stage */}
      <section className="cmp-stage card-in relative overflow-hidden rounded-[28px] border border-[#3a2418] px-6 py-8 sm:px-10">
        <span aria-hidden className="cmp-glow" />
        <p className="relative font-mono text-[12px] text-[#ff9a5c]">Corbel AI · paid from one balance</p>
        <h1 className="relative mt-2 max-w-3xl font-display text-4xl leading-[1.05] tracking-tight text-text sm:text-6xl">Every model and GPU, priced live.</h1>
        <p className="relative mt-3 max-w-2xl text-[15px] text-[#d8c2b4]">{rows ? `${rows.length} models from ${d?.makers.length} makers and ${gpus?.length ?? "…"} GPU types, at the prices the market shows right now.` : "Reading the market…"}</p>
        <p className="relative mt-2 text-[13px] text-[#d8c2b4]">
          <span className="font-mono text-[#ff9a5c]">185 models</span> open to top holders at launch: text, pictures, video, voice and music in one chat.
        </p>
        <div className="relative mt-6 flex flex-wrap gap-2">
          {TASKS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTask(t.id)} aria-pressed={task === t.id} className={cx("cmp-task rounded-2xl px-4 py-2.5 text-[14px] font-medium transition-all", task === t.id ? "bg-[#ff9a5c] text-[#1a0d06] shadow-[0_0_30px_rgba(255,154,92,.35)]" : "bg-[#1d130e] text-[#e9d6c8] hover:bg-[#2a1b13]")}>
              {t.label}
            </button>
          ))}
        </div>

        <div key={task} className="relative mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {task !== "gpu" &&
            pick.map((m, i) => (
              <Link key={m.id} href={`/app/ai/models?id=${encodeURIComponent(m.id)}`} className="cmp-card tile-in group rounded-2xl border border-[#3a2418] bg-[#140d0a]/90 p-4 transition-all hover:-translate-y-1 hover:border-[#ff9a5c]/60" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="flex items-center gap-3">
                  <Monogram maker={m.maker} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-text">{m.name}</span>
                      {m.avail ? <span className="shrink-0 rounded-full bg-[#6fe7a8]/15 px-2 py-0.5 text-[12px] font-medium text-[#6fe7a8]">Available</span> : <span className="shrink-0 rounded-full border border-[#3a2418] px-2 py-0.5 text-[12px] text-muted">Soon</span>}
                    </span>
                    <span className="block text-[12px] text-muted">{`${makerName(m.maker)} · ${ctxK(m.ctx)} context`}</span>
                  </span>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  {m.pimg ? (
                    <span>
                      <span className="block text-[12px] text-muted">per image</span>
                      <span className="font-mono text-[22px] text-[#ffcfae]">{money(m.pimg)}</span>
                    </span>
                  ) : (
                    <span>
                      <span className="block text-[12px] text-muted">{`per ${PER} tokens, in / out`}</span>
                      <span className="font-mono text-[22px] text-[#ffcfae]">{`${money(m.pin)} / ${money(m.pout)}`}</span>
                    </span>
                  )}
                  <span className="text-[12px] text-[#ff9a5c] opacity-0 transition-opacity group-hover:opacity-100">Compare →</span>
                </div>
              </Link>
            ))}
          {task === "gpu" &&
            gpuPick.map((g, i) => (
              <Link key={g.id} href="/app/ai/gpus" className="cmp-card tile-in group rounded-2xl border border-[#3a2418] bg-[#140d0a]/90 p-4 transition-all hover:-translate-y-1 hover:border-[#ff9a5c]/60" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold text-text">{g.name}</span>
                  <span className="rounded-lg bg-[#2a1b13] px-2 py-0.5 font-mono text-[12px] text-[#f2c46d]">{`${g.vram} GB`}</span>
                </div>
                <p className="mt-4 text-[12px] text-muted">from, per hour</p>
                <p className="font-mono text-[22px] text-[#ffcfae]">{money(Math.min(g.community ?? 1e9, g.secure ?? 1e9))}</p>
              </Link>
            ))}
          {!rows && Array.from({ length: 6 }, (_, i) => <span key={i} className="h-32 animate-pulse rounded-2xl bg-[#1a110d]" />)}
        </div>
      </section>

      {/* the market in five figures */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Models", rows?.length ?? 0, "on sale right now", null],
          ["Makers", d?.makers.length ?? 0, "companies and labs", null],
          ["Cheapest text model", d?.cheapest ? d.cheapest.pin + d.cheapest.pout : 0, d?.cheapest ? `${d.cheapest.name}, in + out per 1M` : "", "money"],
          ["Cheapest GPU hour", cheapGpu ? Math.min(cheapGpu.community ?? 1e9, cheapGpu.secure ?? 1e9) : 0, cheapGpu ? `${cheapGpu.name}, ${cheapGpu.vram} GB` : "", "money"],
          ["Newest model", d?.newest ? Math.max(0, Math.round(((at ?? 0) / 1000 - d.newest.created) / 86400)) : 0, d?.newest ? `days ago · ${d.newest.name}` : "", "days"],
        ].map(([k, v, s, f], i) => (
          <div key={k as string} className="card-in rounded-2xl border border-[#2e1f17] bg-[#110c0a] p-4" style={{ animationDelay: `${i * 0.05}s` }}>
            <p className="text-[12px] text-muted">{k as string}</p>
            <p className="mt-1 font-mono text-[24px] text-text">
              <CountUp value={v as number} fmt={(n) => (f === "money" ? money(n) : String(Math.round(n)))} />
            </p>
            <p className="truncate text-[12px] text-muted">{s as string}</p>
          </div>
        ))}
      </div>

      {/* the price map */}
      <section className="rounded-[24px] border border-[#2e1f17] bg-[#0f0a08] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[16px] font-semibold text-text">The price map</h2>
          <span className="text-[12px] text-muted">Each dot is a model: input price across, output price up, bigger means a longer context.</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setMaker(null)} aria-pressed={!maker} className={cx("rounded-full border px-2.5 py-1 text-[12px]", !maker ? "border-[#ff9a5c] text-text" : "border-[#2e1f17] text-muted hover:text-text")}>
            All
          </button>
          {d?.makers.slice(0, 14).map(([m, n]) => (
            <button key={m} type="button" onClick={() => setMaker(maker === m ? null : m)} aria-pressed={maker === m} className={cx("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]", maker === m ? "border-[#ff9a5c] text-text" : "border-[#2e1f17] text-muted hover:text-text")}>
              <i className="h-2 w-2 rounded-full" style={{ background: makerColor(m) }} />
              {makerName(m)}
              <span className="font-mono text-[12px] opacity-70">{n}</span>
            </button>
          ))}
        </div>
        <div className="mt-3">{rows ? <PriceMap rows={mapRows} /> : <p className="py-20 text-center text-[13px] text-muted">Reading the catalogue…</p>}</div>
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        {[
          ["Models", "Compare any model across the providers that run it, and see who is cheapest now.", "/app/ai/models"],
          ["GPUs", "Every GPU type with its hourly rate, and which ones fit the model you want to run.", "/app/ai/gpus"],
          ["Credits", "One balance for all of it, paid in USDG or ETH on Robinhood Chain.", "/app/ai/credits"],
        ].map(([k, v, h]) => (
          <Link key={k} href={h!} className="group rounded-2xl border border-[#2e1f17] bg-[#110c0a] p-5 transition-colors hover:border-[#ff9a5c]/50">
            <p className="flex items-center text-[15px] font-semibold text-text">
              {k}
              <span className="ml-auto text-[#ff9a5c] transition-transform group-hover:translate-x-1">→</span>
            </p>
            <p className="mt-1.5 text-[13px] text-muted">{v}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

