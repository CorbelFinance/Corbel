import Link from "next/link";
import { notFound } from "next/navigation";
import { WhatCanGoWrong } from "@corbel/ui";
import { Chat } from "@/components/compute/Chat";
import { Credits } from "@/components/compute/Credits";
import { GpuRent } from "@/components/compute/GpuRent";
import { GpuDesk } from "@/components/compute/GpuDesk";
import { ModelConsensus } from "@/components/app/ModelConsensus";
import { Gpus } from "@/components/compute/Gpus";
import { Models } from "@/components/compute/Models";
import { ModelsVerdict } from "@/components/compute/ModelsVerdict";
import { Studio } from "@/components/compute/Studio";

/** Compute: AI models and GPUs at live market prices, paid from one balance. Its own look, apart from trading. */
const TABS = [
  { id: "studio", label: "Studio", line: "Pick a task" },
  { id: "chat", label: "Chat", line: "Talk to a model" },
  { id: "models", label: "Models", line: "Compare providers" },
  { id: "gpus", label: "GPUs", line: "Rent a machine" },
  { id: "credits", label: "Credits", line: "Soon" },
] as const;
type Id = (typeof TABS)[number]["id"];
const RISKS = [
  "Prices are list prices from public catalogues and change without notice.",
  "A model can be slow, down or wrong. Check what it tells you before you act on it.",
  "Payments are not open yet. Nothing on these pages takes money.",
];

export const dynamicParams = false;
export function generateStaticParams() {
  return TABS.map((t) => ({ tab: t.id }));
}
export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const t = TABS.find((x) => x.id === tab);
  return t
    ? {
        title: `AI · ${t.label}`,
        description: "AI models and GPUs at live prices, paid from one balance on Robinhood Chain.",
      }
    : {};
}

export default async function ComputePage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const t = TABS.find((x) => x.id === tab);
  if (!t) notFound();
  return (
    <>
      {t.id === "chat" ? null : (
        <div className="flex flex-wrap items-center gap-4 xl:hidden">
          <nav
            aria-label="AI"
            className="flex flex-wrap gap-1 rounded-2xl border border-[#3a2418] bg-[#120c0a] p-1"
          >
            {TABS.map((x) => (
              <Link
                key={x.id}
                href={`/app/ai/${x.id}`}
                aria-current={x.id === t.id ? "page" : undefined}
                className={
                  x.id === t.id
                    ? "rounded-xl bg-[#2a1b13] px-3 py-1.5"
                    : "rounded-xl px-3 py-1.5 hover:bg-[#1a110d]"
                }
              >
                <span className="block text-[13px] text-text">{x.label}</span>
                <span className="block text-[12px] text-muted">{x.line}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
      <h1 className="sr-only">{`AI · ${t.label}`}</h1>
      {(t.id === "models" || t.id === "studio") && (
        <div className="mt-4 xl:mt-0">
          <ModelsVerdict />
        </div>
      )}
      <div
        className={t.id === "chat" ? "" : t.id === "models" || t.id === "studio" ? "mt-4" : "mt-4 xl:mt-0"}
      >
        {
          (
            {
              studio: <Studio />,
              chat: (
                <div className="space-y-4">
                  <ModelConsensus />
                  <Chat />
                </div>
              ),
              models: <Models />,
              gpus: (
                <div className="space-y-4">
                  <GpuDesk />
                  <GpuRent />
                  <Gpus />
                </div>
              ),
              credits: <Credits />,
            } as Record<Id, React.ReactNode>
          )[t.id]
        }
      </div>
      <WhatCanGoWrong items={RISKS} />
    </>
  );
}
