import { BRAND, FLAGS, LAYERS } from "@corbel/config";
import { Label, Section, StatusChip, WhatCanGoWrong } from "@corbel/ui";
import { SystemStatus } from "@/components/site/SystemStatus";

export const metadata = { title: "Status", description: "Which Corbel layers are open, and the live state of the chain readings behind them." };

export default function Status() {
  return (
    <Section grid className="pb-10 pt-28 sm:pt-36">
      <Label className="mt-14 block">ST/01 · Status</Label>
      <h1 className="mt-6 font-display text-7xl">Live on mainnet.</h1>
      <p className="mt-6 max-w-xl text-lg text-muted">
        Checks, swaps, Predict, agent mandates and AI chat work on Robinhood Chain today. Swaps and stakes are signed in your own wallet.
      </p>
      <div className="mt-12">
        <SystemStatus />
      </div>
      <ul className="mt-14 divide-y divide-line border-y border-line">
        {LAYERS.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-4 py-5">
            <a href={`/layers/${l.id}`} className="flex items-baseline gap-4 transition-colors hover:text-leaf">
              <span className="font-mono text-xs text-muted">[{l.num}]</span>
              <span className="font-display text-2xl tracking-tight">{l.name}</span>
            </a>
            <StatusChip status={FLAGS[l.id]} />
          </li>
        ))}
        <li className="flex items-center justify-between gap-4 py-5">
          <a href="/app/ai/chat" className="flex items-baseline gap-4 transition-colors hover:text-(--ai)">
            <span className="font-mono text-xs text-muted">[006]</span>
            <span className="font-display text-2xl tracking-tight text-(--ai)">AI &amp; GPUs</span>
          </a>
          <StatusChip status="live" />
        </li>
        {["Launch", "Shield", "Elysium network"].map((k) => (
          <li key={k} className="flex items-center justify-between gap-4 py-5">
            <a href="/roadmap" className="font-display text-2xl tracking-tight text-muted transition-colors hover:text-text">
              {k}
            </a>
            <StatusChip status="soon" />
          </li>
        ))}
      </ul>
      <div className="mt-14 grid gap-8 sm:grid-cols-3">
        <div id="docs" className="scroll-mt-24">
          <Label>Docs</Label>
          <p className="mt-3 text-muted">
            Every tool, contract and rule is written up in{" "}
            <a href="/docs/overview" className="text-text underline decoration-line underline-offset-4 hover:text-leaf">
              the docs
            </a>
            .
          </p>
        </div>
        <div id="testnet" className="scroll-mt-24">
          <Label>Network</Label>
          <p className="mt-3 text-muted">None: everything runs on mainnet. Stake small; the contracts have no external audit yet.</p>
        </div>
        <div id="community" className="scroll-mt-24">
          <Label>Community</Label>
          <p className="mt-3 text-muted">Our only Telegram is the one below. Anyone else claiming to be us is not.</p>
          <ul className="mt-4 space-y-2 font-mono text-xs uppercase tracking-[0.1em]">
            <li className="normal-case tracking-normal">
              <a href="https://t.me/corbelfinance" target="_blank" rel="noreferrer" className="text-text underline decoration-line underline-offset-4 hover:text-leaf">
                t.me/corbelfinance
              </a>
            </li>
            <li className="normal-case tracking-normal">
              <a href={`mailto:${BRAND.email}`} className="text-text underline decoration-line underline-offset-4 hover:text-leaf">
                {BRAND.email}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <WhatCanGoWrong items={["Fake sites and accounts can copy this name. Only links on this page are ours."]} />
    </Section>
  );
}
