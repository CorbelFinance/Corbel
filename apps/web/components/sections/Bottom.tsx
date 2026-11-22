import { OPEN_DATA, ROAD_BLOCKS, ROAD_ITEMS, ROAD_STAGES, ROADMAP, SAFETY } from "@corbel/config";
import { Label, Section } from "@corbel/ui";
import { Reveal } from "@corbel/ui/motion";
import { TokenBlock } from "./TokenBlock";
import { FaqGrid } from "./FaqGrid";

/* 8. Safety: what is checked before you buy or sign, and what a check cannot do */
export function Safety() {
  return (
    <Section id="safety" nav="Safety" className="border-t border-line py-24 sm:py-32">
      <div className="grid items-center gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Label>{SAFETY.label}</Label>
          <h2 className="mt-6 font-display text-4xl">{SAFETY.title}</h2>
        </div>
        <div className="lg:col-span-5">
          <CoverBurst />
        </div>
      </div>

      <div data-stagger className="mt-12 grid gap-px border border-line bg-line md:grid-cols-3">
        {SAFETY.how.map((h, i) => (
          <Reveal chain key={h.k} delay={i * 80} className="bg-bg p-6">
            <Label tone="leaf">{h.k}</Label>
            <p className="mt-4 text-lg leading-snug">{h.line}</p>
          </Reveal>
        ))}
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div data-chain-node="" className="border border-line p-5">
            <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Your keys stay yours</p>
            {SAFETY.keys.map((k) => (
              <div key={k.k} className="mt-3 flex justify-between gap-4 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                <span>{k.k}</span>
                <span className="text-right text-text">{k.v}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-text">{SAFETY.honest}</p>
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          <h3 className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.08em] text-flesh">
            <span aria-hidden>▼</span> {SAFETY.notTitle}
          </h3>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {SAFETY.not.map((n) => (
              <li key={n} data-chain-node="" className="flex gap-3 border border-flesh/25 bg-flesh-deep/30 p-4 text-sm leading-snug">
                <span aria-hidden className="font-mono text-flesh">
                  −
                </span>
                {n}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

/** Radial burst: every line is a claim on the fund. Green ones fit inside the cap; red ones are past it. */
function CoverBurst() {
  const N = 96;
  const lines = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2;
    const len = 34 + ((Math.sin(i * 1.7) + 1) / 2) * 52 + ((i * 13) % 7) * 2;
    const over = len > 78;
    const r0 = 62;
    return { x1: 150 + Math.cos(a) * r0, y1: 150 + Math.sin(a) * r0, x2: 150 + Math.cos(a) * (r0 + len), y2: 150 + Math.sin(a) * (r0 + len), over, i };
  });
  return (
    <figure data-chain-mask="" className="relative mx-auto aspect-square w-full max-w-sm">
      <svg viewBox="0 0 300 300" className="h-full w-full" role="img" aria-label="Illustration: claims radiate from the fund; the ones past the cap ring are not covered.">
        <g className="burst">
          {/* keeps the turning group's box centred on the axis */}
          <circle cx="150" cy="150" r="149" fill="none" stroke="none" />
          {lines.map((l) => (
            <line
              key={l.i}
              x1={l.x1.toFixed(1)}
              y1={l.y1.toFixed(1)}
              x2={l.x2.toFixed(1)}
              y2={l.y2.toFixed(1)}
              stroke={l.over ? "var(--flesh)" : "var(--leaf)"}
              strokeOpacity={l.over ? 0.85 : 0.55}
              strokeWidth="1"
            />
          ))}
        </g>
        <circle cx="150" cy="150" r="140" fill="none" stroke="var(--flesh)" strokeDasharray="2 4" strokeOpacity=".7" />
        <circle cx="150" cy="150" r="56" fill="var(--bg)" stroke="var(--line)" />
        <text x="150" y="146" textAnchor="middle" fill="var(--text)" fontSize="11" fontFamily="var(--font-mono)" letterSpacing="1.5">
          GAP FUND
        </text>
        <text x="150" y="162" textAnchor="middle" fill="var(--muted)" fontSize="8" fontFamily="var(--font-mono)" letterSpacing="1.2">
          SIZE —
        </text>
      </svg>
      <figcaption className="mt-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
        <span>
          <span aria-hidden className="text-leaf">— </span>Paid by rules
        </span>
        <span>
          <span aria-hidden className="text-flesh">— </span>Past the cap
        </span>
      </figcaption>
    </figure>
  );
}

const BARS = 28;

/* 9. Open data: a "selected works" list. On hover the row fills green in vertical bars, left to right. */
export function OpenData() {
  return (
    <Section id="data" nav="Data" className="py-24 sm:py-32">
      <div className="grid items-end gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Label>{OPEN_DATA.label}</Label>
          <h2 className="mt-6 font-display text-[clamp(2.5rem,1rem+4.6vw,6rem)] leading-[0.95] tracking-tight">{OPEN_DATA.title}</h2>
        </div>
        <p className="max-w-sm text-muted lg:col-span-4 lg:justify-self-end lg:text-right">
          Each board answers one question with chain data. The first numbers are live on Analytics; the boards follow.
        </p>
      </div>
      <ul data-stagger className="mt-14 border-t border-dashed border-line">
        {OPEN_DATA.rows.map((r, i) => (
          <li key={r.name}>
            <a href={r.href} data-chain-node="" className="work-row group relative grid grid-cols-12 items-center gap-x-4 gap-y-1 border-b border-dashed border-line px-3 py-6 outline-none sm:px-6">
              <span aria-hidden className="work-fill">
                {Array.from({ length: BARS }, (_, k) => (
                  <span key={k} style={{ ["--k" as string]: k }} />
                ))}
              </span>
              <span className="relative col-span-2 font-display text-3xl tracking-tight sm:col-span-1">0{i + 1}</span>
              <span className="relative col-span-10 font-display text-2xl tracking-tight sm:text-[2.1rem] md:col-span-5">{r.name}</span>
              <span className="relative col-span-4 col-start-3 font-mono text-[12px] tracking-[0.08em] md:col-span-1 md:col-start-auto">[{r.year}]</span>
              <span className="relative col-span-6 font-mono text-[12px] uppercase tracking-[0.08em] md:col-span-4">{r.q}</span>
              <span className="relative col-span-12 flex justify-end md:col-span-1">
                <span className="work-chip grid h-7 w-9 place-items-center font-mono text-xs">
                  <span aria-hidden>→</span>
                  <span className="sr-only">Open the live data</span>
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <a href="/analytics" className="mt-6 inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] text-leaf hover:underline">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-leaf" />
        Live now: Corbel in numbers, hour by hour →
      </a>
    </Section>
  );
}

/* 10. Token: statement, numbered list, live detail card */
export function Token() {
  return (
    <Section id="token" nav="Token" className="border-t border-line py-24 sm:py-32">
      <TokenBlock />
    </Section>
  );
}

/* 11. Roadmap: order, not dates */
export function Roadmap() {
  return (
    <Section id="roadmap" nav="Roadmap" grid className="py-24 sm:py-32">
      <div className="grid gap-6 border-b border-line pb-10 lg:grid-cols-12">
        <Label className="lg:col-span-3">{ROADMAP.label}</Label>
        <h2 className="font-display text-4xl lg:col-span-5">{ROADMAP.title}</h2>
        <p className="self-end text-muted lg:col-span-4">{ROADMAP.sub}</p>
      </div>
      {/* the three stages as one line of figures over one bar, then every block as a card of its own */}
      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {ROAD_STAGES.map((s) => {
          const n = ROAD_ITEMS.filter((x) => x.stage === s.id).length;
          const tone = s.id === "live" ? "text-leaf" : s.id === "next" ? "text-[#9b86e4]" : "text-muted";
          return (
            <div key={s.id} className="flex items-end justify-between gap-4 border-b border-line pb-4">
              <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">{s.label}</span>
              <span className={`font-display text-6xl leading-none ${tone}`}>{n}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex h-1.5 gap-1">
        {ROAD_STAGES.map((s) => (
          <span key={s.id} className={s.id === "live" ? "rounded-full bg-leaf" : s.id === "next" ? "road-stripe rounded-full" : "rounded-full bg-[#282828]"} style={{ flex: ROAD_ITEMS.filter((x) => x.stage === s.id).length }} />
        ))}
      </div>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROAD_BLOCKS.map((b) => {
          const items = ROAD_ITEMS.filter((x) => x.block === b.id).sort((x, y) => ["live", "next", "later"].indexOf(x.stage) - ["live", "next", "later"].indexOf(y.stage));
          const live = items.filter((x) => x.stage === "live").length;
          const next = items.find((x) => x.stage === "next") ?? items.find((x) => x.stage === "later");
          return (
            <li key={b.id}>
              <a href={`/roadmap#${b.id}`} className="road-card group flex h-full flex-col rounded-2xl border border-line bg-[#0f0f0f] p-5 transition-colors" style={{ ["--tone" as string]: b.tone }}>
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[15px] font-medium text-text">
                    <i className="h-2 w-2 rounded-full" style={{ background: b.tone, boxShadow: `0 0 8px ${b.tone}` }} />
                    {b.label}
                  </span>
                  <span className="font-mono text-[12px] text-muted">{`${live}/${items.length}`}</span>
                </span>
                <span className="mt-4 flex h-1.5 gap-1">
                  {items.map((x) => (
                    <span key={x.title} className={x.stage === "next" ? "road-stripe flex-1 rounded-full" : x.stage === "later" ? "flex-1 rounded-full bg-[#242424]" : "flex-1 rounded-full"} style={x.stage === "live" ? { background: b.tone } : undefined} />
                  ))}
                </span>
                <span className="mt-4 block text-[13px] leading-snug text-muted">
                  {next ? (
                    <>
                      <span className="text-[#7d8a83]">{next.stage === "next" ? "Building · " : "Planned · "}</span>
                      <span className="text-text/90">{next.title}</span>
                    </>
                  ) : (
                    "Everything here is live"
                  )}
                </span>
              </a>
            </li>
          );
        })}
        <li>
          <a href="/roadmap#wish" className="group flex h-full flex-col justify-between rounded-2xl border border-dashed border-leaf/40 p-5 transition-colors hover:border-leaf">
            <span className="text-[15px] font-medium text-text">Missing something?</span>
            <span className="mt-4 text-[13px] text-muted">Tell us what to build, by email or in Telegram.</span>
            <span className="mt-4 font-mono text-[12px] uppercase tracking-[0.1em] text-leaf">Send a wish →</span>
          </a>
        </li>
      </ul>
      <a href="/roadmap" className="mt-6 inline-flex font-mono text-[12px] uppercase tracking-[0.1em] text-leaf hover:underline">
        Full roadmap, block by block →
      </a>
    </Section>
  );
}

/* 12. FAQ: framed grid with topic filters */
export function Faq() {
  return (
    <Section id="faq" nav="FAQ" className="overflow-x-clip border-t border-line py-24 sm:py-32">
      <FaqGrid />
    </Section>
  );
}

/* 13. Closing: the last block is the product. One giant input, Enter runs a read-only Trust check. */
export function Closing() {
  return (
    <section aria-labelledby="closing-title" className="relative overflow-hidden border-t border-line pb-12 sm:pb-16">
      <div className="mx-auto max-w-page px-4 pt-24 sm:px-6 sm:pt-32 lg:px-10 xl:px-14">
        <div className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          <span>ST/99 · Last step</span>
          <span>Live on mainnet · your wallet signs</span>
        </div>
        <h2 id="closing-title" className="mt-10 max-w-4xl font-display text-[clamp(1.8rem,1rem+1.8vw,3rem)] leading-[1.05] tracking-tight text-muted">
          Check first. Swap in one step. Let the rest <span className="text-leaf">earn.</span>
        </h2>

        <form action="/app/trust/check" method="get" data-chain-mask="" className="closing-form group mt-12">
          <label htmlFor="closing-q" className="sr-only">
            Token contract address
          </label>
          <div className="flex items-end gap-4 border-b border-line pb-3 transition-colors focus-within:border-leaf sm:gap-8">
            <span aria-hidden className="pb-[0.12em] font-mono text-[clamp(1.2rem,0.6rem+1.6vw,2.4rem)] text-leaf">
              &gt;
            </span>
            <input
              id="closing-q"
              name="q"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              placeholder="Paste a token address"
              className="min-w-0 flex-1 bg-transparent font-display text-[clamp(2rem,0.6rem+4.6vw,6.5rem)] leading-none tracking-tight text-text caret-leaf placeholder:text-muted/60 focus:outline-none"
            />
            <button
              type="submit"
              className="mb-[0.3em] grid h-12 w-12 shrink-0 place-items-center bg-leaf font-mono text-lg text-bg transition-transform hover:scale-105 sm:h-16 sm:w-16"
            >
              <span aria-hidden>↵</span>
              <span className="sr-only">Check this token</span>
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 font-mono text-[12px] uppercase tracking-[0.1em] text-muted">
            <span>
              <span className="text-text">Enter</span> to check the token
            </span>
            <a href="#safety" className="text-leaf hover:text-text">
              Read the risks →
            </a>
          </div>
        </form>
      </div>
    </section>
  );
}

