import { ROAD_BLOCKS, ROAD_ITEMS, ROAD_STAGES, type RoadItem, type RoadStage } from "@corbel/config";
import { cx } from "@corbel/ui";
import { NavIcon } from "@/components/app/NavIcon";
import { RoadIcon } from "@/components/site/RoadIcon";
import { WishForm } from "@/components/site/WishForm";

export const metadata = { title: "Roadmap", description: "What works in Corbel today, what is being built and what comes after, block by block. Tell us what to build next." };

const STAGE_TEXT: Record<RoadStage, string> = { live: "text-leaf", next: "text-[#9b86e4]", later: "text-muted" };
const ORDER: Record<RoadStage, number> = { live: 0, next: 1, later: 2 };
const NAV_ICON: Record<string, string> = { stocks: "portfolio", data: "tools" };

function Chip({ stage, done }: { stage: RoadStage; done?: number }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[12px]", stage === "live" ? "border-leaf/40 bg-leaf/10 text-leaf" : stage === "next" ? "border-[#9b86e4]/40 bg-[#9b86e4]/10 text-[#9b86e4]" : "border-[#303030] text-muted")}>
      <i className={cx("h-1.5 w-1.5 rounded-full", stage === "live" ? "bg-leaf" : stage === "next" ? "animate-pulse bg-[#9b86e4]" : "bg-[#5d6b64]")} />
      {stage === "live" ? "Live" : stage === "next" ? (done !== undefined ? `Building · ${done}%` : "Building") : "Planned"}
    </span>
  );
}

function Card({ it, tone }: { it: RoadItem; tone: string }) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border" style={{ color: tone, borderColor: `${tone}40`, background: `${tone}12` }}>
          <RoadIcon id={it.icon} className="h-5 w-5" />
        </span>
        <Chip stage={it.stage} done={it.done} />
      </span>
      <span className="mt-4 block text-[17px] font-semibold tracking-tight text-text">{it.title}</span>
      <span className="mt-1.5 block flex-1 text-[13.5px] leading-relaxed text-muted">{it.line}</span>
      {it.stage === "live" && <span className="mt-4 block text-[13px] font-medium transition-transform group-hover:translate-x-0.5" style={{ color: tone }}>Open →</span>}
      {it.stage === "next" && (
        <span className="mt-4 block h-1 overflow-hidden rounded-full bg-[#202020]">
          {it.done !== undefined ? <span className="block h-full rounded-full" style={{ width: `${it.done}%`, background: "linear-gradient(90deg,#7f6bd6,#9b86e4)" }} /> : <span className="road-run block h-full w-1/3 rounded-full bg-[#9b86e4]/70" />}
        </span>
      )}
    </>
  );
  const cls = cx(
    "group flex h-full flex-col rounded-2xl border p-4 transition-colors",
    it.stage === "live" ? "border-[#242424] bg-[#121212] hover:border-[var(--tone)]" : it.stage === "next" ? "border-[#2a2440] bg-[linear-gradient(160deg,#15121e,#0f0f0f)]" : "border-dashed border-[#2b2b2b] bg-transparent",
  );
  return it.href ? (
    <a href={it.href} className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function Roadmap() {
  const count = (s: RoadStage, list = ROAD_ITEMS) => list.filter((i) => i.stage === s).length;
  const blocks = ROAD_BLOCKS.map((b) => ({ ...b, items: ROAD_ITEMS.filter((i) => i.block === b.id).sort((x, y) => ORDER[x.stage] - ORDER[y.stage]) }));

  return (
    <main className="mx-auto max-w-page px-4 pb-28 pt-28 sm:px-6 sm:pt-36 lg:px-10 xl:px-14">
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-3xl">
          <h1 className="font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">What works, what we build, what comes next.</h1>
          <p className="mt-6 text-lg text-muted">Every block of Corbel, item by item. Order, not dates. Miss something? Tell us at the bottom of the page.</p>
        </div>
        <div className="flex gap-6 sm:gap-10">
          {ROAD_STAGES.map((s) => (
            <div key={s.id}>
              <span className={cx("block font-display text-5xl leading-none", STAGE_TEXT[s.id])}>{count(s.id)}</span>
              <span className="mt-2 block text-[13px] text-muted">{s.label}</span>
            </div>
          ))}
        </div>
      </header>

      {/* the map: three zones (live, building, planned); each block is a rail through them, each item a node in its zone */}
      <section aria-label="The map" className="rmap relative mt-14 overflow-hidden rounded-[28px] border border-[#242424] bg-[#0d0d0d]">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[10rem_1.5fr_1fr_1fr] border-b border-[#1f1f1f]">
              <div className="flex items-end px-5 py-4">
                <h2 className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">The map</h2>
              </div>
              {ROAD_STAGES.map((s) => (
                <div key={s.id} className={cx("rmap-zone-h flex items-end justify-between border-l border-[#1f1f1f] px-5 py-4", `rmap-${s.id}`)}>
                  <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">{s.label}</span>
                  <span className={cx("font-display text-3xl leading-none", STAGE_TEXT[s.id])}>{count(s.id)}</span>
                </div>
              ))}
            </div>
            <ul>
              {blocks.map((b, row) => (
                <li key={b.id} className="rmap-row grid grid-cols-[10rem_1.5fr_1fr_1fr]" style={{ ["--tone" as string]: b.tone, ["--r" as string]: row }}>
                  <a href={`#${b.id}`} className="flex items-center gap-2.5 px-5 py-3.5 text-[14px] text-text hover:text-[var(--tone)]">
                    <i className="h-2 w-2 rounded-full" style={{ background: b.tone, boxShadow: `0 0 10px ${b.tone}` }} />
                    {b.label}
                  </a>
                  {ROAD_STAGES.map((s) => {
                    const its = b.items.filter((x) => x.stage === s.id);
                    return (
                      <div key={s.id} className={cx("rmap-cell relative flex flex-wrap items-center gap-x-3 gap-y-2 border-l border-[#1f1f1f] px-5 py-3.5", `rmap-${s.id}`)}>
                        {its.map((it) => (
                          <a key={it.title} href={it.href ?? `#${b.id}`} className={cx("rmap-chip relative z-10 flex items-center gap-2 rounded-full py-1 pl-1 pr-3", `is-${s.id}`)} aria-label={`${it.title}: ${s.short.toLowerCase()}`}>
                            <span className={cx("rmap-node", `is-${s.id}`)} style={it.done !== undefined ? { ["--done" as string]: `${it.done}%` } : undefined} />
                            <span className="whitespace-nowrap text-[12px]">{it.title}</span>
                          </a>
                        ))}
                        {!its.length && <span className="text-[12px] text-[#454545]">—</span>}
                      </div>
                    );
                  })}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="mt-20 space-y-16">
        {blocks.map((b) => {
          const live = count("live", b.items);
          return (
            <section key={b.id} id={b.id} aria-labelledby={`h-${b.id}`} className="scroll-mt-28 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]" style={{ ["--tone" as string]: b.tone }}>
              <header className="lg:sticky lg:top-28 lg:self-start">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border" style={{ color: b.tone, borderColor: `${b.tone}55`, background: `${b.tone}14` }}>
                  <NavIcon id={NAV_ICON[b.id] ?? b.id} className="h-6 w-6" />
                </span>
                <h2 id={`h-${b.id}`} className="mt-4 font-display text-4xl tracking-tight">{b.label}</h2>
                <p className="mt-2 text-[14px] text-muted">{b.line}</p>
                <div className="mt-4 flex items-center gap-3">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1e1e1e]">
                    <span className="block h-full rounded-full" style={{ width: `${(live / b.items.length) * 100}%`, background: b.tone }} />
                  </span>
                  <span className="font-mono text-[12px] text-muted">{`${live} of ${b.items.length} live`}</span>
                </div>
                <a href={`?b=${b.id}#wish`} className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#2a2a2a] px-3 py-1.5 text-[12.5px] text-text transition-colors hover:border-[var(--tone)]">
                  <span style={{ color: b.tone }}>+</span>
                  {`Wish for ${b.label}`}
                </a>
              </header>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {b.items.map((it) => (
                  <li key={it.title}>
                    <Card it={it} tone={b.tone} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <section id="wish" aria-labelledby="h-wish" className="mt-24 scroll-mt-28 grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <header>
          <h2 id="h-wish" className="font-display text-4xl tracking-tight">What should we build?</h2>
          <p className="mt-3 text-[14px] text-muted">Pick a block, then write to us by email or in Telegram. A person on the team reads every message.</p>
        </header>
        <WishForm />
      </section>

      <p className="mt-20 max-w-2xl text-[14px] text-muted">Nothing here is a promise of a date or of a price. Corbel contracts are reviewed in-house, not externally audited.</p>
    </main>
  );
}
