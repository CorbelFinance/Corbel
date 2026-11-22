import { FACTS, FLAGS, HERO, LAYERS, LAYERS_SECTION, MANIFESTO, MARQUEE_FALLBACK, type LayerId } from "@corbel/config";
import { TokenRange } from "./TokenRange";
import { LaunchTape } from "./LaunchTape";
import { LivePulse } from "./LivePulse";
import { Button, Label, Section, StatusChip, cx } from "@corbel/ui";
import { Marquee, WordReveal } from "@corbel/ui/motion";
import { PullUp } from "./PullUp";
import { NetScene } from "../site/NetScene";
import { AskBar } from "./AskBar";
import { HeroHud } from "./HeroHud";
import { ComputeLoop, LayerLoop } from "./LayerLoops";

/* 1. Hero: centred, full-bleed. The ribbon runs behind the headline, not beside it. */
export function Hero() {
  return (
    <section id="top" data-chain-mask="" className="relative flex min-h-[calc(100svh/var(--vz))] flex-col overflow-hidden pt-16">
      <NetScene story="paths" className="hero-canvas absolute inset-0 h-full w-full" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_42%_at_50%_52%,color-mix(in_srgb,var(--bg)_94%,transparent)_0%,color-mix(in_srgb,var(--bg)_60%,transparent)_55%,transparent_100%)]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />

      <div className="relative mx-auto flex w-full max-w-page flex-1 flex-col px-4 sm:px-6 lg:px-10 xl:px-14">
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line/70 pb-4">
          <Label>{HERO.label}</Label>
          {HERO.tags.map((t, i) => (
            <span key={t} className="flex min-w-0 items-center gap-4 md:flex-1">
              <span aria-hidden className="hidden h-2 min-w-6 flex-1 bg-[repeating-linear-gradient(90deg,var(--line)_0_1px,transparent_1px_5px)] md:block" />
              <Label tone={i === 0 ? "leaf" : "muted"} className="shrink-0">
                {t}
              </Label>
            </span>
          ))}
        </div>

        <div className="pointer-events-none flex flex-1 flex-col items-center justify-center py-16 text-center">
          <h1 className="font-display pointer-events-auto text-[clamp(2.6rem,0.6rem+6vw,7rem)] leading-[0.95] text-text [text-shadow:0_0_40px_var(--bg)]">
            <span className="hero-line md:whitespace-nowrap">
              <span>Check. Swap. Earn.</span>
            </span>
            <span className="hero-line pb-[0.08em] md:whitespace-nowrap">
              <span>
                <em className="not-italic text-[#9b86e4]">Agents.</em> <em className="not-italic text-[#ff9a5c]">AI &amp; GPUs.</em>
              </span>
            </span>
          </h1>
          <p className="hero-after pointer-events-auto mt-6 max-w-xl text-base text-muted sm:text-lg">{HERO.sub}</p>
          <div className="hero-after pointer-events-auto mt-8 flex w-full justify-center">
            <AskBar />
          </div>
          <div className="hero-after pointer-events-auto mt-10 flex flex-wrap justify-center gap-3">
            <Button href={HERO.primary.href}>{HERO.primary.label}</Button>
            <Button href={HERO.secondary.href} variant="ghost">
              {HERO.secondary.label}
            </Button>
          </div>
        </div>

        <div className="mb-6">
          <HeroHud scroll={HERO.scroll} />
        </div>

      </div>
    </section>
  );
}

/* 2. Marquee: verified facts first, then what we build */
export function FactStrip() {
  const verified = Object.values(FACTS).filter((f) => f.status === "verified");
  const items = [...verified.map((f) => `${f.label}: ${f.value}`), ...MARQUEE_FALLBACK];
  // the live chain first; the verified facts are what it shows until the index answers
  return <LivePulse fallback={items} />;
}

/** The facts strip as it was, kept for pages without the index. */
export function FactStripStatic() {
  const verified = Object.values(FACTS).filter((f) => f.status === "verified");
  const items = [...verified.map((f) => `${f.label}: ${f.value}`), ...MARQUEE_FALLBACK];
  return (
    <div data-chain-mask="" className="border-y border-line bg-surface/40 py-4">
      <Marquee speed={60}>
        {items.map((it) => (
          <span key={it} className="flex items-center gap-6 pr-6 font-mono text-xs uppercase tracking-[0.08em] text-muted">
            <span aria-hidden className="h-1.5 w-1.5 bg-leaf" />
            {it}
          </span>
        ))}
      </Marquee>
    </div>
  );
}

/* 3. Manifesto: full width, words brighten as you read */
export function Manifesto() {
  return (
    <Section id="why" nav="Why" className="py-24 sm:py-36">
      <div className="flex items-center justify-between border-b border-line pb-5">
        <Label>{MANIFESTO.label}</Label>
        <Label>Launch exits · weekend gap</Label>
      </div>
      <WordReveal
        text={MANIFESTO.paragraphs[0]!}
        className="why-head mt-12 font-display text-[clamp(2.4rem,0.8rem+5.2vw,7rem)] leading-[0.98] tracking-tight"
      />
      <div className="mt-6 grid gap-10 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          {MANIFESTO.paragraphs.slice(1).map((p) => (
            <WordReveal key={p} text={p} className="font-display text-2xl leading-tight tracking-tight" />
          ))}
          <Button href={MANIFESTO.cta.href} variant="ghost">
            {MANIFESTO.cta.label}
          </Button>
          <div className="pt-4">
            <LaunchTape />
          </div>
        </div>
        <div className="lg:col-span-7">
          <PullUp above="#why .why-head">
            <TokenRange />
          </PullUp>
        </div>
      </div>
    </Section>
  );
}

/* 4. Layers */
export function Layers() {
  return (
    <Section id="layers" nav="Layers" grid className="overflow-x-clip py-24 sm:py-32">
      <div className="grid gap-6 border-b border-line pb-10 lg:grid-cols-12">
        <Label className="lg:col-span-3">{LAYERS_SECTION.label}</Label>
        <h2 className="font-display text-4xl lg:col-span-5">{LAYERS_SECTION.title}</h2>
        <p className="self-end text-muted lg:col-span-4">{LAYERS_SECTION.sub}</p>
      </div>
      <ul data-stagger className="frames mt-12 grid sm:grid-cols-2 lg:grid-cols-4">
        {LAYERS.map((l, i) => (
          // Agents wear the violet of the agent lines in the hero scene, as AI wears orange
          <li key={l.id} data-chain-node="" className="frame" style={l.id === "agents" ? ({ "--leaf": "#9b86e4", "--ui": "#9b86e4" } as React.CSSProperties) : l.id === "trade" ? ({ "--leaf": "#3ddc84", "--ui": "#3ddc84" } as React.CSSProperties) : undefined}>
            <span aria-hidden className="fr-sq tl" />
            <span aria-hidden className="fr-sq tr" />
            <span aria-hidden className="fr-sq bl" />
            <span aria-hidden className="fr-sq br" />
            <span aria-hidden className="fr-draw t" />
            <span aria-hidden className="fr-draw r" />
            <span aria-hidden className="fr-draw b" />
            <span aria-hidden className="fr-draw l" />
            <a
              href={`/app/${l.id}`}
              className={cx(
                "group relative flex h-full flex-col p-5 sm:p-7 focus-visible:outline-offset-[-6px]",
              )}
            >
              <div className="fr-ill dots flex h-40 items-center justify-center border border-line bg-bg/60 transition-colors duration-500">
                <div className="scale-110 sm:scale-125 lg:scale-[0.8] xl:scale-90 2xl:scale-110">
                  <LayerLoop id={l.id} />
                </div>
              </div>
              <div className="flex flex-1 flex-col">
              <div className="mt-6 flex items-start justify-between gap-4">
                <h3 className={cx("font-display text-[2.1rem] leading-[1.02] tracking-tight lg:text-[1.75rem] 2xl:text-[2.1rem]", l.id === "agents" && "text-[#9b86e4]", l.id === "trust" && "text-leaf", l.id === "trade" && "text-[#3ddc84]")}>
                  {l.name}
                  {l.brand && <span className="ml-3 align-middle font-mono text-[12px] uppercase tracking-[0.1em] text-muted">{`${l.brand} · soon`}</span>}
                </h3>
                <span className="mt-1 border border-leaf/50 px-1.5 py-0.5 font-mono text-[12px] tracking-[0.08em] text-leaf">[{l.num}]</span>
              </div>
              <p className="mt-3 max-w-xs text-sm text-muted">{l.line}</p>
              <div className="mt-auto flex items-center justify-between pt-8">
                <StatusChip status={FLAGS[l.id as LayerId]} />
                <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted transition-colors group-hover:text-leaf">
                  {String(i + 1).padStart(2, "0")}. Open <span aria-hidden>→</span>
                </span>
              </div>
              </div>
            </a>
          </li>
        ))}
        <li data-chain-node="" className="frame">
          <span aria-hidden className="fr-sq tl" />
          <span aria-hidden className="fr-sq tr" />
          <span aria-hidden className="fr-sq bl" />
          <span aria-hidden className="fr-sq br" />
          <span aria-hidden className="fr-draw t" />
          <span aria-hidden className="fr-draw r" />
          <span aria-hidden className="fr-draw b" />
          <span aria-hidden className="fr-draw l" />
          <a href="/app/ai/studio" className="group relative flex h-full flex-col p-5 sm:p-7 focus-visible:outline-offset-[-6px]">
            <div className="fr-ill dots flex h-40 items-center justify-center border border-line bg-bg/60 transition-colors duration-500">
              <div className="scale-110 sm:scale-125 lg:scale-[0.8] xl:scale-90 2xl:scale-110">
                <ComputeLoop />
              </div>
            </div>
            <div className="flex flex-1 flex-col">
            <div className="mt-6 flex items-start justify-between gap-4">
              <h3 className="font-display text-[2.1rem] leading-[1.02] tracking-tight text-[#ff9a5c] lg:text-[1.75rem] 2xl:text-[2.1rem]">AI &amp; GPUs</h3>
              <span className="mt-1 border border-[#ff9a5c]/50 px-1.5 py-0.5 font-mono text-[12px] tracking-[0.08em] text-[#ff9a5c]">[006]</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted">AI models and GPUs at live prices, paid from one balance.</p>
            <div className="mt-auto flex items-center justify-between pt-8">
              <StatusChip status="live" />
              <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted transition-colors group-hover:text-[#ff9a5c]">
                08. Open <span aria-hidden>→</span>
              </span>
            </div>
            </div>
          </a>
        </li>
        {/* not built yet: named, marked soon, no page of their own */}
        <li className="frame sm:col-span-2">
          <span aria-hidden className="fr-sq tl" />
          <span aria-hidden className="fr-sq tr" />
          <span aria-hidden className="fr-sq bl" />
          <span aria-hidden className="fr-sq br" />
          <div className="flex h-full flex-col p-5 sm:p-7">
            <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">Soon</p>
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {[
                ["Launch", "New tokens with a refund window for early buyers."],
                ["Shield", "A wallet that refuses to sign a transaction that drains it."],
              ].map(([k, line]) => (
                <li key={k} className="flex items-baseline gap-4 py-4">
                  <span className="w-24 shrink-0 font-display text-2xl tracking-tight text-muted">{k}</span>
                  <span className="text-sm text-muted">{line}</span>
                  <span className="ml-auto shrink-0">
                    <StatusChip status="soon" />
                  </span>
                </li>
              ))}
            </ul>
            <a href="/roadmap" className="mt-auto pt-6 font-mono text-[12px] uppercase tracking-[0.08em] text-muted hover:text-text">
              In the roadmap <span aria-hidden>→</span>
            </a>
          </div>
        </li>
      </ul>
    </Section>
  );
}


