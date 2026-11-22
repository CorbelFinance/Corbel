import { notFound } from "next/navigation";
import { FLAGS, LAYERS, layerById } from "@corbel/config";
import { Rich, WhatCanGoWrong } from "@corbel/ui";
import { LayerBar } from "@/components/app/Frame";
import { SoonGate } from "@/components/app/SoonGate";

/** Tabs that describe contracts not deployed yet: shown behind an "opens soon" card. */
const SOON = new Set(["filler-desk", "alerts", "launch-dashboard", "shield-rules", "stock-desk"]);
/** Closed tools whose data must not load even behind the blur. */
const HIDDEN = new Set(["stock-desk"]);
import { TabWidget } from "@/components/app/Widgets";

export const dynamicParams = false;
export function generateStaticParams() {
  return LAYERS.flatMap((l) => l.tabs.map((t) => ({ layer: l.id, tab: t.id })));
}

export async function generateMetadata({ params }: { params: Promise<{ layer: string; tab: string }> }) {
  const { layer, tab } = await params;
  const l = layerById(layer);
  const t = l?.tabs.find((x) => x.id === tab);
  return l && t ? { title: `${l.name} · ${t.label}`, description: l.title } : {};
}

export default async function TabPage({ params }: { params: Promise<{ layer: string; tab: string }> }) {
  const { layer, tab } = await params;
  const l = layerById(layer);
  const t = l?.tabs.find((x) => x.id === tab);
  if (!l || !t) notFound();
  const status = FLAGS[l.id];
  // tools that are the page: no page title or intro above them, like a trading app
  const app = !!t.widget && t.widget !== "steps";
  return (
    // Agents wear violet as their own colour, as AI wears orange
    <div className={l.id === "agents" ? "agents-zone" : l.id === "trade" ? "trade-zone" : undefined}>
      <LayerBar num={l.num} name={l.name} line={l.title} status={status} layer={l.id} tabs={l.tabs.map((x) => ({ id: x.id, label: x.label, step: x.step, soon: status === "soon" || (!!x.widget && SOON.has(x.widget)) }))} current={t.id} />

      <section aria-labelledby="tab-title" className={app ? "mt-0" : "mt-9"}>
        <h1 id="tab-title" className={app ? "sr-only" : "font-display text-4xl tracking-tight sm:text-5xl"}>
          {t.label}
        </h1>
        {!app && t.body.length > 0 && (
          <div className="mt-4 max-w-2xl space-y-2 text-base leading-relaxed text-muted [&_strong]:font-medium [&_strong]:text-text">
            {t.body.map((b) => (
              <p key={b}>
                <Rich text={b} />
              </p>
            ))}
          </div>
        )}
        {t.widget && (
          <div className={app ? "mt-4" : "mt-8"}>
            {status === "soon" || SOON.has(t.widget) ? (
              <SoonGate name={t.label === "Overview" ? l.name : t.label} line={l.title} what={t.body} docs={`/layers/${l.id}`}>
                {HIDDEN.has(t.widget) ? <div className="min-h-[34rem] border border-line" /> : <TabWidget kind={t.widget} layer={l} />}
              </SoonGate>
            ) : (
              <TabWidget kind={t.widget} layer={l} />
            )}
          </div>
        )}
        {t.empty && (
          <div className="dots mt-8 flex min-h-48 items-center justify-center border border-dashed border-line p-8 text-center">
            <p className="font-medium text-xs uppercase tracking-[0.08em] text-muted">{t.empty}</p>
          </div>
        )}
      </section>

      {t.id !== "risk" && <WhatCanGoWrong items={l.risks} />}
    </div>
  );
}
