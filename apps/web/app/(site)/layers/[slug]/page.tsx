import { notFound } from "next/navigation";
import { FLAGS, LAYERS, TERMS_CAPTION, layerById, type LayerId } from "@corbel/config";
import { Button, Fact, Label, Rich, Section, StatusChip, cx } from "@corbel/ui";
import { XrayLaunch } from "@/components/sections/XrayLaunch";
import { WeekArt } from "@/components/sections/LayerArt";
import { LiveMandate } from "@/components/app/LiveMandate";
import { AgentsShowcase } from "@/components/sections/AgentsShowcase";
import { NetScene, type Story } from "@/components/site/NetScene";

const STORY: Record<LayerId, Story> = { trust: "trust", stocks: "stocks", trade: "trade", agents: "agents", account: "account", launch: "overview", shield: "overview" };
const CAPTION: Record<LayerId, string> = {
  trust: "A scan sweeps the range; what it finds bad turns red",
  stocks: "The token trades all week; the share does not",
  trade: "One swap, three routes; the one that pays most carries it",
  agents: "The agent trades inside its mandate; what crosses the ring stops",
  account: "Wallets feed one vault; what is not spent flows back",
  launch: "",
  shield: "",
};

/** The scene at the top of every layer page: the network over the range, telling this layer's story. */
function Panorama({ l }: { l: L }) {
  return (
    <div className="relative mt-16 h-[62vh] max-h-[640px] min-h-[360px] overflow-hidden border-b border-line bg-[radial-gradient(ellipse_80%_60%_at_50%_100%,#121212,#050807_70%)]">
      <NetScene story={STORY[l.id]} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
      <span className="absolute left-4 top-4 bg-[#070707]/85 px-2 py-1 font-mono text-[12px] uppercase tracking-[0.12em] text-[#cfe9da] sm:left-8">{`Fig. ${l.num} · ${l.name}`}</span>
      <span className="absolute bottom-6 right-4 max-w-sm bg-[#070707]/85 px-2 py-1 text-right font-mono text-[12px] text-[#cfe9da] sm:right-8">{CAPTION[l.id]}</span>
    </div>
  );
}

export const dynamicParams = false;
export function generateStaticParams() {
  return LAYERS.map((l) => ({ slug: l.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const l = layerById((await params).slug);
  return l ? { title: l.name, description: l.title } : {};
}

type L = NonNullable<ReturnType<typeof layerById>>;

/**
 * Each layer page is laid out its own way: the stage that shows its mechanism, then the same facts (steps, what it
 * does not do, questions, risks) in a form that suits that layer. No two pages share an arrangement.
 */
type Form = {
  hero: "stage" | "over" | "side-stack";
  steps: "pipeline" | "ring" | "rows" | "gates" | "timeline" | "ladder" | "columns";
  doesnt: "strike" | "wall";
  faq: "open" | "columns";
  risks: "band" | "ledger";
};
const FORMS: Record<LayerId, Form> = {
  trust: { hero: "stage", steps: "pipeline", doesnt: "strike", faq: "columns", risks: "band" },
  stocks: { hero: "over", steps: "timeline", doesnt: "wall", faq: "open", risks: "ledger" },
  trade: { hero: "stage", steps: "rows", doesnt: "wall", faq: "columns", risks: "ledger" },
  agents: { hero: "side-stack", steps: "gates", doesnt: "strike", faq: "open", risks: "band" },
  account: { hero: "side-stack", steps: "ring", doesnt: "wall", faq: "columns", risks: "band" },
  launch: { hero: "over", steps: "ladder", doesnt: "strike", faq: "open", risks: "ledger" },
  shield: { hero: "stage", steps: "columns", doesnt: "wall", faq: "columns", risks: "band" },
};
const ART: Partial<Record<LayerId, React.ReactNode>> = {
  trust: <XrayLaunch />,
  stocks: <WeekArt />,
};

function Head({ l }: { l: L }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Label tone="leaf">{`[${l.num}] ${l.name}`}</Label>
      <StatusChip status={FLAGS[l.id]} />
    </div>
  );
}
function Actions({ l }: { l: L }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button href={l.cta.href}>{l.cta.label}</Button>
      <Button href="#risk" variant="ghost">
        Read the risks
      </Button>
    </div>
  );
}

function Hero({ l, f }: { l: L; f: Form }) {
  if (f.hero === "stage")
    return (
      <Section className="pb-12 pt-14">
        <div className="flex flex-col items-center text-center">
          <Head l={l} />
          <h1 className="mt-6 max-w-5xl font-display text-[clamp(2.8rem,1.2rem+5vw,6.4rem)] leading-[0.98] tracking-tight">{l.title}</h1>
          <p className="mt-6 max-w-2xl text-lg text-muted">
            <Rich text={l.sub} />
          </p>
          <div className="mt-8">
            <Actions l={l} />
          </div>
        </div>
        {ART[l.id] && <div className="mt-14">{ART[l.id]}</div>}
      </Section>
    );
  if (f.hero === "over")
    return (
      <Section className="pb-12 pt-14">
        <div className="grid gap-6 border-b border-line pb-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Head l={l} />
            <h1 className="mt-6 font-display text-[clamp(2.8rem,1.2rem+5vw,6.4rem)] leading-[0.98] tracking-tight">{l.title}</h1>
          </div>
          <div className="flex flex-col justify-end gap-6 lg:col-span-4">
            <p className="text-lg text-muted">
              <Rich text={l.sub} />
            </p>
            <Actions l={l} />
          </div>
        </div>
        {ART[l.id] && <div className="mt-6">{ART[l.id]}</div>}
      </Section>
    );
  // side-stack: the drawing first, full width, the words under it on one line
  return (
    <Section className="pb-12 pt-14">
      <Head l={l} />
      {ART[l.id] && <div className="mt-6">{ART[l.id]}</div>}
      <div className="mt-8 grid gap-6 border-t border-line pt-8 lg:grid-cols-12">
        <h1 className="font-display text-[clamp(2.4rem,1.2rem+3.6vw,4.8rem)] leading-[1] tracking-tight lg:col-span-7">{l.title}</h1>
        <div className="flex flex-col justify-end gap-6 lg:col-span-5">
          <p className="text-lg text-muted">
            <Rich text={l.sub} />
          </p>
          <Actions l={l} />
        </div>
      </div>
    </Section>
  );
}

function Steps({ l, f }: { l: L; f: Form }) {
  const s = l.steps;
  const title = (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="font-display text-4xl tracking-tight">How it works</h2>
      <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">{`${s.length} steps`}</span>
    </div>
  );
  let body: React.ReactNode;
  if (f.steps === "pipeline")
    body = (
      <ol className="relative mt-10 ml-4 border-l border-leaf/40">
        {s.map(([n, line], i) => (
          <li key={n} className="relative pb-9 pl-10 last:pb-0">
            <span className="absolute -left-[13px] top-0 grid h-6 w-6 place-items-center rounded-full border border-leaf bg-bg font-mono text-[12px] text-leaf">{i + 1}</span>
            <p className="font-display text-2xl tracking-tight text-text">{n}</p>
            <p className="mt-1 max-w-xl text-muted">{line}</p>
          </li>
        ))}
      </ol>
    );
  else if (f.steps === "ring")
    body = (
      <div className="mt-10 grid gap-3 sm:grid-cols-5">
        {s.map(([n, line], i) => (
          <div key={n} className="relative rounded-[28px] border border-line bg-surface/50 p-5">
            <span className="font-mono text-[12px] text-leaf">{`0${i + 1}`}</span>
            <p className="mt-6 font-display text-2xl tracking-tight text-text">{n}</p>
            <p className="mt-2 text-[14px] text-muted">{line}</p>
            {i < s.length - 1 && <span aria-hidden className="absolute -right-2.5 top-1/2 hidden h-px w-4 bg-leaf/60 sm:block" />}
          </div>
        ))}
        <p className="font-mono text-[12px] text-muted sm:col-span-5">↻ What you do not spend goes back to the first step.</p>
      </div>
    );
  else if (f.steps === "rows")
    body = (
      <ol className="mt-10 border-t border-line">
        {s.map(([n, line], i) => (
          <li key={n} className="grid grid-cols-[3rem_minmax(0,14rem)_minmax(0,1fr)] items-baseline gap-4 border-b border-line py-5">
            <span className="font-mono text-[12px] text-muted">{String(i + 1).padStart(2, "0")}</span>
            <span className="font-display text-2xl tracking-tight text-text">{n}</span>
            <span className="text-muted">{line}</span>
          </li>
        ))}
      </ol>
    );
  else if (f.steps === "gates")
    body = (
      <ol className="mt-10 flex flex-col gap-2 lg:flex-row">
        {s.map(([n, line], i) => (
          <li key={n} className="flex-1 border-t-2 border-[#9b86e4]/60 pt-4">
            <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#9b86e4]">{`gate ${i + 1}`}</p>
            <p className="mt-2 text-[17px] font-semibold text-text">{n}</p>
            <p className="mt-1 text-[14px] text-muted">{line}</p>
          </li>
        ))}
      </ol>
    );
  else if (f.steps === "timeline")
    body = (
      <div className="mt-10 overflow-x-auto">
        <ol className="grid min-w-[760px] grid-flow-col auto-cols-fr">
          {s.map(([n, line], i) => (
            <li key={n} className="relative pr-6">
              <span className="block h-1 rounded-full bg-[#d9a441]" style={{ opacity: 0.35 + (i / s.length) * 0.65 }} />
              <p className="mt-4 font-mono text-[12px] uppercase tracking-[0.1em] text-[#d9a441]">{n}</p>
              <p className="mt-2 text-[15px] text-text">{line}</p>
            </li>
          ))}
        </ol>
      </div>
    );
  else if (f.steps === "ladder")
    body = (
      <ol className="mt-10 space-y-2">
        {s.map(([n, line], i) => (
          <li key={n} className="flex items-baseline gap-6 rounded-xl border border-line bg-surface/40 px-5 py-4" style={{ marginLeft: `${i * 4}%` }}>
            <span className="font-display text-3xl tabular-nums text-muted">{i + 1}</span>
            <span>
              <span className="block text-[17px] font-semibold text-text">{n}</span>
              <span className="block text-[14px] text-muted">{line}</span>
            </span>
          </li>
        ))}
      </ol>
    );
  else
    body = (
      <div className="mt-10 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-5">
        {s.map(([n, line], i) => (
          <div key={n} className="bg-bg p-5">
            <p className="font-mono text-[12px] text-muted">{`${i + 1} / ${s.length}`}</p>
            <p className="mt-10 text-[17px] font-semibold text-text">{n}</p>
            <p className="mt-1 text-[14px] text-muted">{line}</p>
          </div>
        ))}
      </div>
    );
  return (
    <Section id="how" className="border-t border-line py-20">
      {title}
      {body}
    </Section>
  );
}

function Facts({ l, f }: { l: L; f: Form }) {
  return (
    <Section className="border-t border-line py-20">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Label>{l.terms.length ? "Target terms" : "Terms"}</Label>
          {l.terms.length ? (
            <dl className="mt-6 space-y-6">
              {l.terms.map((t) => (
                <div key={t.label}>
                  <dd className="font-display text-5xl tracking-tight text-text">
                    <Fact k={t.fact} />
                  </dd>
                  <dt className="mt-2 text-sm text-muted">{t.label}</dt>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-6 font-display text-3xl tracking-tight text-muted">Set before launch.</p>
          )}
          <p className="mt-6 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{TERMS_CAPTION}</p>
        </div>
        <div className="lg:col-span-7">
          <Label>What it does not do</Label>
          {f.doesnt === "strike" ? (
            <ul className="mt-6 space-y-4">
              {l.doesnt.map((d) => (
                <li key={d} className="font-display text-[clamp(1.3rem,1rem+0.9vw,1.9rem)] leading-snug tracking-tight text-text">
                  <span aria-hidden className="mr-3 text-flesh">✕</span>
                  {d}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {l.doesnt.map((d) => (
                <li key={d} className="rounded-2xl bg-[repeating-linear-gradient(135deg,var(--surface)_0_10px,var(--bg)_10px_11px)] p-5 text-[16px] leading-snug text-text ring-1 ring-line">
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-16">
        <Label>Questions</Label>
        {f.faq === "open" ? (
          <div className="mt-4 divide-y divide-line border-y border-line">
            {l.faq.map((q, i) => (
              <details key={q.q} open={i === 0} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[19px] text-text">
                  {q.q}
                  <span aria-hidden className="font-mono text-leaf transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl text-muted">{q.a}</p>
              </details>
            ))}
          </div>
        ) : (
          <dl className="mt-4 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {l.faq.map((q) => (
              <div key={q.q}>
                <dt className="text-[19px] text-text">{q.q}</dt>
                <dd className="mt-2 text-muted">{q.a}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Section>
  );
}

function Risks({ l, f }: { l: L; f: Form }) {
  return (
    <Section id="risk" className="scroll-mt-24 border-t border-line py-20">
      {f.risks === "band" ? (
        <div className="rounded-3xl bg-[color-mix(in_oklab,var(--flesh)_9%,var(--bg))] p-6 ring-1 ring-flesh/30 sm:p-10">
          <h2 className="font-display text-4xl tracking-tight text-text">What can go wrong</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-2">
            {l.risks.map((r, i) => (
              <li key={r} className="flex gap-4">
                <span className="font-display text-3xl tabular-nums text-flesh">{i + 1}</span>
                <span className="text-[16px] text-text">
                  <Rich text={r} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-12">
          <h2 className="font-display text-4xl tracking-tight text-text lg:col-span-4">What can go wrong</h2>
          <ul className="border-t border-flesh/40 lg:col-span-8">
            {l.risks.map((r, i) => (
              <li key={r} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4 border-b border-flesh/20 py-4">
                <span className="font-mono text-[12px] text-flesh">{`R${i + 1}`}</span>
                <span className="text-text">
                  <Rich text={r} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function Others({ l }: { l: L }) {
  const others = LAYERS.filter((o) => o.id !== l.id);
  return (
    <Section className="border-t border-line py-16">
      <nav aria-label="Other layers" className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">Other layers</span>
        {others.map((o) => (
          <a key={o.id} href={`/layers/${o.id}`} className={cx("font-display text-2xl tracking-tight text-muted transition-colors hover:text-text")}>
            {o.name}
            <span className="ml-1 align-top font-mono text-[12px] text-leaf">{o.num}</span>
          </a>
        ))}
      </nav>
    </Section>
  );
}

export default async function LayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const l = layerById((await params).slug);
  if (!l) notFound();
  const f = FORMS[l.id];
  return (
    <>
      <Panorama l={l} />
      <Hero l={l} f={f} />
      {l.id === "agents" && (
        <Section className="space-y-16 pb-20">
          <LiveMandate />
          <AgentsShowcase />
        </Section>
      )}
      <Steps l={l} f={f} />
      <Facts l={l} f={f} />
      <Risks l={l} f={f} />
      <Others l={l} />
    </>
  );
}
