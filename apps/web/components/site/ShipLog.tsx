"use client";

/**
 * The changelog as a ship log: a stack per day (one square per update, in its block's colour), filters by block,
 * then each day with its updates on a rail. Data from @corbel/config CHANGELOG.
 */
import { useMemo, useState } from "react";
import { CHANGELOG, ROAD_BLOCKS, type Ship, type ShipKind, type ShipTag } from "@corbel/config";
import { cx } from "@corbel/ui";
import { RoadIcon } from "./RoadIcon";

const TONE: Record<string, string> = { ...Object.fromEntries(ROAD_BLOCKS.map((b) => [b.id, b.tone])), site: "#e6ece9" };
const NAME: Record<string, string> = { ...Object.fromEntries(ROAD_BLOCKS.map((b) => [b.id, b.label])), site: "Site" };
const KIND: Record<ShipKind, { label: string; cls: string }> = {
  new: { label: "New", cls: "border-leaf/40 bg-leaf/10 text-leaf" },
  better: { label: "Better", cls: "border-[#6cc0d0]/40 bg-[#6cc0d0]/10 text-[#6cc0d0]" },
  fix: { label: "Fixed", cls: "border-[#f2c46d]/40 bg-[#f2c46d]/10 text-[#f2c46d]" },
};
const TAG: Record<ShipTag, { label: string; cls: string; title: string }> = {
  onchain: { label: "On chain", cls: "border-leaf/40 text-leaf", title: "Live in a contract on Robinhood Chain: check it in the explorer" },
  report: { label: "From a public review", cls: "border-[#c9a4ff]/40 text-[#c9a4ff]", title: "Found by someone outside the team and fixed in public" },
  experiment: { label: "Experiment", cls: "border-[#f2c46d]/40 text-[#f2c46d]", title: "Testing an idea: not a claim that it works better" },
};
const DAY_MS = 86_400_000;
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en", { ...o, timeZone: "UTC" });

export function ShipLog() {
  const [block, setBlock] = useState<string>("all");
  const all = CHANGELOG.flatMap((d) => d.items);
  const used = useMemo(() => ["all", ...Object.keys(TONE).filter((k) => all.some((i) => i.block === k))], [all]);
  // every UTC day from the first ship to the newest, quiet days included
  const days = useMemo(() => {
    const first = Date.parse(`${CHANGELOG[CHANGELOG.length - 1]!.day}T00:00:00Z`);
    const last = Date.parse(`${CHANGELOG[0]!.day}T00:00:00Z`);
    const out: { day: string; items: Ship[] }[] = [];
    for (let t = first; t <= last; t += DAY_MS) {
      const day = new Date(t).toISOString().slice(0, 10);
      out.push({ day, items: CHANGELOG.find((d) => d.day === day)?.items ?? [] });
    }
    return out;
  }, []);
  const tall = Math.max(...days.map((d) => d.items.length));
  const shown = CHANGELOG.map((d) => ({ ...d, items: d.items.filter((i) => block === "all" || i.block === block) })).filter((d) => d.items.length);
  const count = (k: ShipKind) => all.filter((i) => i.kind === k).length;

  return (
    <>
      {/* the ship rate: one column per UTC day across the full width, each update a cell in its block's colour,
          grouped by block; the day's count on top and its blocks named underneath. Totals on the right. */}
      <div className="mt-12 grid gap-px overflow-hidden rounded-[24px] border border-[#242424] bg-[#242424] lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="bg-[#0d0d0d] p-5 sm:p-6">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Updates per day</p>
            <p className="font-mono text-[12px] text-muted">{`${days.length} days · ${all.length} updates`}</p>
          </div>
          <div className="mt-5 flex items-end gap-2 sm:gap-3" aria-label="Updates per day">
            {days.map((d) => {
              const groups = Object.keys(TONE)
                .map((k) => ({ k, n: d.items.filter((x) => x.block === k).length }))
                .filter((g) => g.n);
              return (
                <a key={d.day} href={d.items.length ? `#d-${d.day}` : undefined} className="group flex min-w-0 flex-1 flex-col items-stretch" title={`${fmt(d.day, { month: "short", day: "numeric" })}: ${d.items.length} updates`}>
                  <span className={cx("mb-2 text-center font-display text-2xl leading-none", d.items.length ? "text-text" : "text-[#7d8a83]")}>{d.items.length}</span>
                  <span className="flex flex-col-reverse gap-[3px]" style={{ height: `${tall * 15}px` }}>
                    {groups.flatMap((g) =>
                      d.items
                        .filter((x) => x.block === g.k)
                        .map((it, i) => (
                          <i
                            key={it.title}
                            title={`${NAME[it.block]}: ${it.title}`}
                            className={cx("ship-cell block h-[12px] w-full rounded-[3px] transition-opacity group-hover:brightness-110", block !== "all" && it.block !== block && "opacity-15")}
                            style={{ background: TONE[it.block], animationDelay: `${i * 0.03}s` }}
                          />
                        )),
                    )}
                    {!d.items.length && <i className="block h-[12px] w-full rounded-[3px] border border-dashed border-[#303030]" />}
                  </span>
                  <span className="mt-2 border-t border-[#242424] pt-2 text-center font-mono text-[12px] text-muted group-hover:text-text">{fmt(d.day, { month: "short", day: "numeric" })}</span>
                  <span className="mt-1 hidden truncate text-center text-[12px] text-[#7d8a83] sm:block">{groups.slice(0, 3).map((g) => NAME[g.k]).join(" · ") || "quiet"}</span>
                </a>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col bg-[#0d0d0d]">
          {(["new", "better", "fix"] as const).map((k) => (
            <div key={k} className="flex flex-1 items-center justify-between border-b border-[#242424] px-5 py-4 last:border-0">
              <span className="flex items-center gap-2 text-[13px] text-muted">
                <i className={cx("h-2 w-2 rounded-full", k === "new" ? "bg-leaf" : k === "better" ? "bg-[#6cc0d0]" : "bg-[#f2c46d]")} />
                {k === "new" ? "New" : k === "better" ? "Made better" : "Fixed"}
              </span>
              <span className="font-display text-4xl leading-none text-text">{count(k)}</span>
            </div>
          ))}
          <div className="border-t border-[#242424] px-5 py-4">
            <p className="text-[12px] text-muted">Busiest block</p>
            {(() => {
              const top = Object.keys(TONE).map((k) => ({ k, n: all.filter((x) => x.block === k).length })).sort((a, b) => b.n - a.n)[0]!;
              return (
                <p className="mt-1 flex items-center gap-2 text-[15px] text-text">
                  <i className="h-2.5 w-2.5 rounded-full" style={{ background: TONE[top.k] }} />
                  {`${NAME[top.k]} · ${top.n}`}
                </p>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="sticky top-16 z-20 -mx-4 mt-10 border-y border-[#1e1e1e] bg-bg/95 px-4 py-3 md:bg-bg/90 md:backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 xl:-mx-14 xl:px-14">
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Show updates of">
          {used.map((k) => (
            <button key={k} type="button" aria-pressed={block === k} onClick={() => setBlock(k)} className={cx("flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors", block === k ? "border-text bg-text text-bg" : "border-[#2a2a2a] text-text hover:border-[#424242]")}>
              {k !== "all" && <i className="h-2 w-2 rounded-full" style={{ background: TONE[k] }} />}
              {k === "all" ? `All · ${all.length}` : `${NAME[k]} · ${all.filter((i) => i.block === k).length}`}
            </button>
          ))}
        </div>
      </div>

      <ol className="mt-10 space-y-14">
        {shown.map((d) => (
          <li key={d.day} id={`d-${d.day}`} className="scroll-mt-36 grid gap-6 md:grid-cols-[9rem_minmax(0,1fr)]">
            <div className="md:sticky md:top-36 md:self-start">
              <span className="block font-display text-6xl leading-none text-text">{fmt(d.day, { day: "numeric" })}</span>
              <span className="mt-1 block text-[14px] text-text">{fmt(d.day, { month: "long", year: "numeric" })}</span>
              <span className="mt-1 block font-mono text-[12px] text-muted">{`${d.items.length} ${d.items.length === 1 ? "update" : "updates"} · UTC`}</span>
            </div>
            <ul className="relative border-l border-[#242424] pl-6 sm:pl-8">
              {d.items.map((it) => {
                const tone = TONE[it.block]!;
                const row = (
                  <>
                    <span aria-hidden className="absolute -left-[29px] top-6 h-[9px] w-[9px] rounded-full ring-4 ring-bg sm:-left-[37px]" style={{ background: tone }} />
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border" style={{ color: tone, borderColor: `${tone}45`, background: `${tone}12` }}>
                      <RoadIcon id={it.icon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[16px] font-semibold tracking-tight text-text">{it.title}</span>
                        <span className={cx("rounded-full border px-2 py-px font-mono text-[12px]", KIND[it.kind].cls)}>{KIND[it.kind].label}</span>
                        <span className="font-mono text-[12px]" style={{ color: tone }}>
                          {NAME[it.block]}
                        </span>
                        {it.tags?.map((t) => (
                          <span key={t} title={TAG[t].title} className={cx("rounded-full border px-2 py-px font-mono text-[12px]", TAG[t].cls)}>
                            {TAG[t].label}
                          </span>
                        ))}
                      </span>
                      <span className="mt-1 block text-[14px] leading-relaxed text-muted">{it.line}</span>
                    </span>
                    {it.href && <span className="hidden shrink-0 self-center text-[13px] text-muted transition-colors group-hover:text-text sm:block">Open →</span>}
                  </>
                );
                const cls = "group relative flex gap-4 rounded-2xl px-3 py-3.5 transition-colors hover:bg-[#121212]";
                return (
                  <li key={it.title} className="relative">
                    {it.href ? (
                      <a href={it.href} className={cls}>
                        {row}
                      </a>
                    ) : (
                      <div className={cls}>{row}</div>
                    )}
                    {it.proof?.length ? (
                      <p className="-mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 pl-[4.25rem] pr-3 text-[12.5px]">
                        <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#7d8a83]">Proof</span>
                        {it.proof.map((pr) => (
                          <a key={pr.href} href={pr.href} target="_blank" rel="noreferrer" className="text-muted underline decoration-[#3a3a3a] underline-offset-4 hover:text-text hover:decoration-leaf">
                            {pr.label} ↗
                          </a>
                        ))}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}
