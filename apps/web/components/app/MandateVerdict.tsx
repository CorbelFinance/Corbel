"use client";

/**
 * Agents · the answer first: did the mandate contract hold? Read from its decision log (/api/mandate?log): how many
 * trades it was asked to make, how many it refused for breaking a rule (each refusal slashed the agent's bond), how
 * many it froze. One verdict, worded for the page it opens.
 */
import { useEffect, useState } from "react";
import { MANDATE_DEMO } from "@corbel/config";
import { Verdict } from "./kit";

type Log = { entries?: { traded: boolean; frozen: boolean; rule: string }[]; totals?: { runs: number; traded: number; stopped: number; frozen: number } | null };

const WORDS = {
  hub: { kicker: "Agents · can one go past your rules", lead: (s: number, r: number) => `No. On mainnet the contract refused all ${s} trades that broke a rule, out of ${r} it was asked to make, and slashed the bond each time.` },
  break: { kicker: "Break it · so far", lead: (s: number, r: number) => `${s} of ${r} attempts to break the mandate were refused by the contract itself; the trades inside the rules went through.` },
  log: { kicker: "Decision log · what the contract decided", lead: (s: number, r: number) => `${r} decisions on mainnet: ${r - s} traded inside the rules, ${s} refused and slashed.` },
} as const;

export function MandateVerdict({ page }: { page: keyof typeof WORDS }) {
  const [d, setD] = useState<Log | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/mandate?log")
      .then((r) => (r.ok ? (r.json() as Promise<Log>) : null))
      .then((j) => !off && setD(j ?? {}))
      .catch(() => !off && setD({}));
    return () => {
      off = true;
    };
  }, []);
  const t = d?.totals;
  if (!t)
    return (
      <div aria-hidden className="h-40 rounded-2xl border border-line bg-[#0e0e0e] p-8">
        <span className="block h-3 w-40 rounded bg-[#181818]" />
        <span className="mt-5 block h-8 w-[55%] rounded bg-[#181818]" />
      </div>
    );
  const rules = new Map<string, number>();
  for (const e of d?.entries ?? []) if (!e.traded) rules.set(e.rule, (rules.get(e.rule) ?? 0) + 1);
  const top = [...rules.entries()].sort((a, b) => b[1] - a[1])[0];
  const w = WORDS[page];
  return (
    <Verdict
      kicker={w.kicker}
      tone="good"
      value={`${t.stopped}/${t.stopped}`}
      valueLabel="rule breaks refused by the contract"
      facts={[
        ["Decisions", t.runs],
        ["Traded", t.traded],
        ["Refused", t.stopped],
        ["Frozen", t.frozen],
        ...(top ? ([["Rule hit most", `${top[0]} · ${top[1]}`]] as [string, string][]) : []),
        ["Bond", String(MANDATE_DEMO.bond)],
      ]}
      visual={
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {(d?.entries ?? []).map((e, i) => (
            <span key={i} className={e.traded ? "flex-1 bg-leaf/80" : e.frozen ? "flex-1 bg-[#8f3341]" : "flex-1 bg-flesh/80"} />
          ))}
        </div>
      }
    >
      {w.lead(t.stopped, t.runs)}
    </Verdict>
  );
}
