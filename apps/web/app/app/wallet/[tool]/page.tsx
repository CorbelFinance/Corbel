import Link from "next/link";
import { notFound } from "next/navigation";
import { WhatCanGoWrong } from "@corbel/ui";
import { Approvals } from "@/components/app/Approvals";
import { Exposure } from "@/components/app/Exposure";
import { PaperBook } from "@/components/app/PaperBook";
import { ShareLink } from "@/components/app/ShareLink";
import { StressTest } from "@/components/app/StressTest";
import { WalletXray } from "@/components/app/WalletXray";
import { TxPreview } from "@/components/app/TxPreview";
import { HELD } from "@corbel/config";

/** Wallet tools: one address read the ways other people read it, before you act on it. */
const ALL_TOOLS = [
  { id: "approvals", label: "Approvals", line: "Who can move your tokens" },
  { id: "xray", label: "X-ray", line: "What a sale really pays" },
  { id: "preview", label: "Before you sign", line: "What a transaction moves" },
  { id: "exposure", label: "Exposure", line: "How others see it" },
  { id: "stress", label: "Stress test", line: "After a fall" },
  { id: "paper", label: "Paper account", line: "Real fills, no money" },
  { id: "share", label: "Share link", line: "Expiring, no address shown" },
] as const;
// tools held back from the public site (config HELD) are neither listed nor served
const TOOLS = ALL_TOOLS.filter((t) => !(t.id === "xray" && HELD.xray) && !(t.id === "preview" && HELD.preview));
type Id = (typeof ALL_TOOLS)[number]["id"];

const RISKS = ["Anything on chain is public for good. These tools show it, they cannot hide it.", "Spot values come from pools and can be far from what a sale pays.", "A paper result says nothing about a real one: real trades move first."];

export const dynamicParams = false;
export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.id }));
}
export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const t = TOOLS.find((x) => x.id === tool);
  return t ? { title: `Wallet · ${t.label}` } : {};
}

export default async function WalletTool({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const t = TOOLS.find((x) => x.id === tool);
  if (!t) notFound();
  return (
    <>
      <div className="flex flex-wrap items-center gap-4 border-b border-line pb-4">
        <span className="text-[14px] font-semibold text-text">Wallet</span>
        <span className="text-[14px] text-muted">Read any address the way others do.</span>
        <nav aria-label="Wallet tools" className="ml-auto flex flex-wrap gap-1 rounded-2xl border border-[#242424] bg-[#101010] p-1 xl:hidden">
          {TOOLS.map((x) => (
            <Link key={x.id} href={`/app/wallet/${x.id}`} aria-current={x.id === t.id ? "page" : undefined} className={x.id === t.id ? "rounded-xl bg-[#202020] px-3 py-1.5" : "rounded-xl px-3 py-1.5 hover:bg-[#161616]"}>
              <span className="block text-[13px] text-text">{x.label}</span>
              <span className="block text-[12px] text-muted">{x.line}</span>
            </Link>
          ))}
        </nav>
      </div>
      <h1 className="sr-only">{t.label}</h1>
      <div className="mt-4">{(({ approvals: <Approvals />, xray: <WalletXray />, preview: <TxPreview />, exposure: <Exposure />, stress: <StressTest />, paper: <PaperBook />, share: <ShareLink /> }) as Record<Id, React.ReactNode>)[t.id]}</div>
      <WhatCanGoWrong items={RISKS} />
    </>
  );
}
