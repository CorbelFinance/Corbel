"use client";

/**
 * Compute · Models. The whole catalogue with filters. Open a model to set it against its nearest rivals (the same
 * kind of model from other makers, closest in price) as a monthly bill for a daily token budget.
 */
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { SubTabs } from "../app/Bay";
import { KINDS, Monogram, ctxK, makerColor, makerName, money, useCatalog, type Model } from "./data";

const SORTS = [
  { id: "new", label: "Newest" },
  { id: "cheap", label: "Cheapest" },
  { id: "ctx", label: "Longest context" },
] as const;

/**
 * The open model against its nearest rivals: the same kind of model from other makers at the closest price, each
 * priced as a monthly bill for the daily token budget set on the right.
 */
function Rivals({ m, rows }: { m: Model; rows: Model[] }) {
  const [inTok, setIn] = useState(2);
  const [outTok, setOut] = useState(0.5);
  const cost = (e: { pin: number; pout: number }) => (e.pin * inTok + e.pout * outTok) * 30;
  const rivals = useMemo(() => {
    const unit = (x: Model) => x.pin + x.pout * 0.25;
    const seen = new Set([m.maker]);
    const out: Model[] = [];
    const pool = rows
      .filter((x) => x.id !== m.id && !x.media && x.pin > 0 && !x.id.includes(":") && !/\(batch\)/i.test(x.name) && (x.kind === m.kind || (m.kind === "text" && x.kind === "vision") || (m.kind === "vision" && x.kind === "text")))
      .sort((x, y) => Math.abs(Math.log(unit(x) / unit(m))) - Math.abs(Math.log(unit(y) / unit(m))) || Number(!!y.avail) - Number(!!x.avail));
    for (const x of pool) {
      if (seen.has(x.maker)) continue;
      seen.add(x.maker);
      out.push(x);
      if (out.length >= 4) break;
    }
    return [m, ...out].sort((x, y) => cost(x) - cost(y));
    // cost depends on the sliders only through the order, which is recomputed below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, rows]);
  const list = [...rivals].sort((x, y) => cost(x) - cost(y));
  const max = Math.max(1e-9, ...list.map(cost));
  const low = list[0];
  return (
    <div className="pane-in grid gap-4 border-t border-[#2e1f17] bg-[#0d0806] px-5 py-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div>
        <p className="text-[12.5px] text-text">Against similar models</p>
        <p className="mt-0.5 text-[12px] text-muted">Same kind of model from other makers, closest in price. Bars are the monthly bill for your budget.</p>
        {m.pin <= 0 ? (
          <p className="mt-3 text-[12px] text-muted">This model is priced per output, not per token.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {list.map((e, i) => (
              <li key={e.id} className="tile-in" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="flex items-center gap-2 text-[12.5px]">
                  <Monogram maker={e.maker} size={20} />
                  <span className={cx("truncate", e.id === m.id ? "font-semibold text-text" : "text-[#e9d6c8]")}>{e.name}</span>
                  {e.id === m.id && <span className="rounded-full border border-[#ff9a5c]/50 px-1.5 text-[12px] text-[#ff9a5c]">this one</span>}
                  {e.id === low?.id && <span className="rounded-full bg-[#6fe7a8]/15 px-2 text-[12px] text-[#6fe7a8]">cheapest</span>}
                  <span className="ml-auto shrink-0 font-mono text-[12px] text-muted">{`${money(e.pin)} / ${money(e.pout)}`}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#1c130e]">
                    <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${(cost(e) / max) * 100}%`, background: e.id === low?.id ? "#6fe7a8" : e.id === m.id ? "#ff9a5c" : "#6b4a36" }} />
                  </span>
                  <span className="w-24 text-right tabular-nums text-[12px] text-text">{`${money(cost(e))}/mo`}</span>
                  <span className={cx("w-16 text-right text-[12px]", e.avail ? "text-[#6fe7a8]" : "text-muted")}>{e.avail ? "available" : "soon"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-2xl border border-[#2e1f17] bg-[#140d0a] p-4">
        <p className="text-[12.5px] text-text">Your monthly bill</p>
        {[
          ["Tokens in, per day", inTok, setIn, 0.1, 50] as const,
          ["Tokens out, per day", outTok, setOut, 0.05, 20] as const,
        ].map(([k, v, set, step, mx]) => (
          <label key={k} className="mt-3 block">
            <span className="flex justify-between text-[12px] text-muted">
              {k}
              <span className="font-mono text-[#ffcfae]">{`${v}M`}</span>
            </span>
            <input type="range" min={step} max={mx} step={step} value={v} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full accent-[#ff9a5c]" />
          </label>
        ))}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[#1c130e] px-3 py-2">
            <p className="text-[12px] text-muted">This model</p>
            <p className="font-mono text-[18px] text-text">{money(cost(m))}</p>
          </div>
          <div className="rounded-xl bg-[#1c130e] px-3 py-2">
            <p className="text-[12px] text-muted">Cheapest of these</p>
            <p className="font-mono text-[18px] text-[#6fe7a8]">{low ? money(cost(low)) : "—"}</p>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-muted">{low && low.id !== m.id && cost(m) > 0 ? `${low.name} would cost ${((1 - cost(low) / cost(m)) * 100).toFixed(0)}% less on this budget.` : "This is the cheapest of its rivals on this budget."}</p>
      </div>
    </div>
  );
}

function Avail({ on }: { on?: boolean }) {
  return on ? <span className="shrink-0 rounded-full bg-[#6fe7a8]/15 px-2 py-0.5 text-[12px] font-medium text-[#6fe7a8]">Available</span> : <span className="shrink-0 rounded-full border border-[#3a2418] px-2 py-0.5 text-[12px] text-muted">Soon</span>;
}

export function Models() {
  const { rows, at } = useCatalog<Model>("models");
  const [kind, setKind] = useState<"all" | Model["kind"]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("new");
  const [onlyOn, setOnlyOn] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) void Promise.resolve().then(() => (setOpen(id), setQ(id.split("/")[1] ?? id)));
  }, []);
  const list = useMemo(() => {
    if (!rows) return [];
    const s = q.trim().toLowerCase();
    return rows
      .filter((m) => kind === "all" || m.kind === kind)
      .filter((m) => !onlyOn || m.avail)
      .filter((m) => !s || m.id.toLowerCase().includes(s) || m.name.toLowerCase().includes(s) || makerName(m.maker).toLowerCase().includes(s))
      .sort((a, b) => (sort === "new" ? b.created - a.created : sort === "cheap" ? a.pin + a.pout + (a.pimg ?? 0) - (b.pin + b.pout + (b.pimg ?? 0)) : b.ctx - a.ctx));
  }, [rows, kind, sort, q, onlyOn]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of rows ?? []) c[m.kind] = (c[m.kind] ?? 0) + 1;
    return c;
  }, [rows]);
  const ago = (t: number) => {
    const d = Math.round(((at ?? 0) / 1000 - t) / 86400);
    return d <= 0 ? "today" : d < 60 ? `${d}d ago` : `${Math.round(d / 30)}mo ago`;
  };

  return (
    <div className="compute space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#2e1f17] bg-[#110c0a] p-2">
        <button type="button" aria-pressed={onlyOn} onClick={() => setOnlyOn(!onlyOn)} className={cx("flex h-10 items-center gap-2 rounded-xl border px-4 text-[13px] font-semibold transition-colors", onlyOn ? "border-[#ff9a5c] bg-[#ff9a5c] text-[#1a0d06]" : "border-[#3a2418] text-[#ff9a5c] hover:bg-[#ff9a5c]/10")}>
          {`Available now${rows ? ` · ${rows.filter((x) => x.avail).length}` : ""}`}
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a model or a maker" aria-label="Find a model" className="h-10 min-w-60 flex-1 rounded-xl border border-[#2e1f17] bg-[#0b0706] px-3 text-[13px] text-text outline-none focus:border-[#ff9a5c]" />
        <div className="compute-tabs">
          <SubTabs label="Kind" value={kind} onChange={setKind} tabs={[{ id: "all", label: "All", n: rows?.length }, ...KINDS.map((k) => ({ id: k.id, label: k.label, n: counts[k.id] || undefined }))]} />
        </div>
        <div className="compute-tabs">
          <SubTabs label="Sort" value={sort} onChange={setSort} tabs={SORTS} />
        </div>
      </div>
      <p className="px-1 text-[12px] text-muted">{rows ? `${list.length} of ${rows.length} models · list prices, refreshed every 30 minutes` : "Reading the catalogue…"}</p>

      <ul className="space-y-2">
        {list.slice(0, 120).map((m, i) => (
          <li key={m.id} className={cx("overflow-hidden rounded-2xl border bg-[#110c0a] transition-colors", open === m.id ? "border-[#ff9a5c]/60" : "border-[#2e1f17] hover:border-[#4a3020]")}>
            <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 text-left sm:grid-cols-[auto_minmax(0,1fr)_7rem_9rem_6rem_1rem]" style={{ animationDelay: `${Math.min(i, 20) * 0.02}s` }}>
              <Monogram maker={m.maker} />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold text-text">{m.name}</span>
                  <Avail on={m.avail} />
                </span>
                <span className="block truncate text-[12px] text-muted">{`${makerName(m.maker)} · ${m.in.join(", ")} → ${m.out.join(", ")}`}</span>
              </span>
              <span className="hidden text-right tabular-nums text-[12px] text-muted sm:block">{m.media ? "" : ctxK(m.ctx)}</span>
              <span className="text-right tabular-nums text-[13px] text-[#ffcfae]">{m.media ? "Price at launch" : m.pimg ? `${money(m.pimg)} / img` : `${money(m.pin)} / ${money(m.pout)}`}</span>
              <span className="hidden text-right text-[12px] text-muted sm:block">{m.created ? ago(m.created) : ""}</span>
              <span className={cx("hidden text-[#ff9a5c] transition-transform sm:block", open === m.id && "rotate-90")}>›</span>
            </button>
            {open === m.id && (
              <>
                <p className="border-t border-[#2e1f17] px-5 py-3 text-[12.5px] text-[#d8c2b4]">
                  <i className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: makerColor(m.maker) }} />
                  {m.about}
                </p>
                {m.media ? <p className="border-t border-[#2e1f17] bg-[#0d0806] px-5 py-4 text-[12.5px] text-muted">Opens in AI &amp; GPUs soon, paid from the same credits. The price shows here when it opens.</p> : <Rivals m={m} rows={rows ?? []} />}
              </>
            )}
          </li>
        ))}
      </ul>
      {list.length > 120 && <p className="text-center text-[12px] text-muted">{`Showing 120 of ${list.length}. Narrow it with the search.`}</p>}
    </div>
  );
}
