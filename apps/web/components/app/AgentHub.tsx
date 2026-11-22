"use client";

/**
 * Agents · Overview. The path every agent trade takes on Corbel, drawn as a pipeline with live numbers:
 * the agent proposes, the Guard checks the trade against the owner's policy (simulated, deny-first),
 * the mandate contract enforces the rules on chain and slashes the bond, the pool fills. Each stage links to
 * the tool that runs it.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { MANDATE_DEMO } from "@corbel/config";
import { cx } from "@corbel/ui";
import { Instrument, Led } from "./kit";

type Totals = { runs: number; traded: number; stopped: number; frozen: number } | null;
type Policy = { maxIn: string; minScore: number; maxImpact: number; must: string[]; noHooks: boolean };

const STAGES = [
  { n: "01", k: "Agent", what: "Proposes a trade", how: "Any bot or AI model. It holds no keys to your funds.", href: "/docs/mcp", cta: "Tools for agents" },
  { n: "02", k: "Guard", what: "Checks it first", how: "Your policy, a simulated trade at the latest block, deny-first.", href: "/app/agents/guard", cta: "Open the Guard" },
  { n: "03", k: "Mandate", what: "Enforces on chain", how: "Assets, size, budget, price and window. A broken rule slashes the bond.", href: "/app/agents/break", cta: "Try to break it" },
  { n: "04", k: "Pool", what: "Fills or refuses", how: "The trade lands only if every rule held. Each decision is logged.", href: "/app/agents/log", cta: "Read the log" },
];

export function AgentHub() {
  const [t, setT] = useState<Totals>(null);
  const [p, setP] = useState<Policy | null>(null);
  useEffect(() => {
    fetch("/api/mandate?log")
      .then((r) => r.json())
      .then((j: { totals?: Totals }) => setT(j.totals ?? null))
      .catch(() => undefined);
    try {
      const s = localStorage.getItem("corbel.guard.policy");
      if (s) void Promise.resolve().then(() => setP(JSON.parse(s) as Policy));
    } catch {
      // no saved policy
    }
  }, []);
  const live: string[] = [
    "MCP · six tools",
    p ? `Score ≥ ${p.minScore} · impact ≤ ${(p.maxImpact * 100).toFixed(1)}%` : "Balanced preset",
    `${MANDATE_DEMO.rules.length} rules · bond ${MANDATE_DEMO.bond}`,
    t ? `${t.runs} decisions · ${t.stopped} stopped` : "reading…",
  ];
  return (
    <div className="space-y-4">
      <Instrument code="G-00" title="How an agent trade goes through Corbel" status={<Led tone="on" label="Two locks: off chain and on chain" />}>
        <ol className="grid gap-px bg-line md:grid-cols-4">
          {STAGES.map((s, i) => (
            <li key={s.k} className="relative flex flex-col bg-[#131313] p-5">
              <span className="font-mono text-[12px] text-muted">{s.n}</span>
              <span className={cx("mt-3 font-display text-3xl tracking-tight", i === 1 || i === 2 ? "text-leaf" : "text-text")}>{s.k}</span>
              <span className="mt-1 text-[14px] text-text">{s.what}</span>
              <span className="mt-2 flex-1 text-[12px] leading-relaxed text-muted">{s.how}</span>
              <span className="mt-4 rounded-lg border border-[#242424] bg-[#0d0d0d] px-2.5 py-1.5 font-mono text-[12px] text-text">{live[i]}</span>
              <Link href={s.href} className="mt-3 text-[12px] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                {s.cta} →
              </Link>
              {i < STAGES.length - 1 && (
                <span aria-hidden className="absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-[#343434] bg-bg font-mono text-[12px] text-leaf md:grid">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </Instrument>

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          ["Why two locks", "The Guard stops a bad trade before it is signed and costs nothing. The contract stops it even if the agent skips the Guard."],
          ["What the agent can never do", "Withdraw your funds, raise a limit at once, or trade an asset you did not list. Funds only return to your account."],
          ["What still goes wrong", "A strategy can lose inside every rule. Limits cap the size of a loss; they do not make a bad idea good."],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-[#242424] bg-[#131313] p-5">
            <p className="text-[14px] font-semibold text-text">{k}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
