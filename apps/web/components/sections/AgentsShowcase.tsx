"use client";

/**
 * Agents layer page · what the mandate contract does, shown working:
 *  1. Live from the contract: every decision the mandate made in Break it runs, as a tape, with the last few listed.
 *  2. The rules a trade must pass, each with how many times it has stopped a trade so far.
 *  3. An agent with your key against an agent under a mandate, side by side.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { MANDATE_DEMO } from "@corbel/config";
import { cx } from "@corbel/ui";

type Entry = { id: number; minute: number; scenario: string; block: string; rule: string; traded: boolean; slashed: string; frozen: boolean };
type Log = { entries: Entry[]; totals: { runs: number; traded: number; stopped: number; frozen: number } | null };
const title = (id: string) => (MANDATE_DEMO.scenarios as Record<string, { title: string }>)[id]?.title ?? id;

export function AgentsShowcase() {
  const [log, setLog] = useState<Log | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/mandate?log")
      .then((r) => (r.ok ? (r.json() as Promise<Log>) : null))
      .then((j) => !off && j && setLog(j))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);
  const stops = new Map<string, number>();
  for (const e of log?.entries ?? []) if (!e.traded) stops.set(e.rule, (stops.get(e.rule) ?? 0) + 1);
  const t = log?.totals;
  const tape = [...(log?.entries ?? [])].reverse().slice(-48);

  return (
    <div className="space-y-16">
      {/* 1 · live from the contract */}
      <section className="overflow-hidden rounded-3xl border border-line bg-[#090909]">
        <div className="grid gap-px bg-line md:grid-cols-4">
          {[
            ["Decisions", t ? t.runs : null, "made by the contract"],
            ["Traded", t ? t.traded : null, "inside every rule"],
            ["Stopped", t ? t.stopped : null, "a rule broken, bond slashed"],
            ["Frozen", t ? t.frozen : null, "third strike, agent off"],
          ].map(([k, v, sub], i) => (
            <div key={String(k)} className="bg-[#090909] p-6">
              <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">{k}</p>
              <p className={cx("mt-3 font-display text-5xl tabular-nums", i === 1 ? "text-leaf" : i >= 2 ? "text-flesh" : "text-text")}>{v ?? "···"}</p>
              <p className="mt-2 text-[13px] text-muted">{sub}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-6 py-5">
          <p role="img" className="break-all font-mono text-[20px] leading-tight tracking-[0.14em]" aria-label={`Each decision, oldest first: ${tape.filter((e) => e.traded).length} traded, ${tape.filter((e) => !e.traded && e.frozen).length} frozen, ${tape.filter((e) => !e.traded && !e.frozen).length} stopped`}>
            {tape.length ? tape.map((e) => <span key={e.id} className={e.traded ? "text-leaf" : e.frozen ? "text-[#8f3341]" : "text-flesh"}>{e.traded ? "▮" : e.frozen ? "#" : "×"}</span>) : <span aria-hidden className="inline-block w-full border-t border-dotted border-[#2a2a2a] align-middle" />}
          </p>
          <ul className="mt-5 divide-y divide-[#1a1a1a] border-t border-[#1a1a1a]">
            {(log?.entries ?? []).slice(0, 5).map((e) => (
              <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-4 py-2.5 text-[14px]">
                <span className="truncate text-text">{title(e.scenario)}</span>
                <span className={cx("font-mono text-[12px]", e.traded ? "text-leaf" : "text-flesh")}>{e.traded ? "traded" : `stopped · ${e.rule}`}</span>
                <span className="font-mono text-[12px] text-muted">{`#${Number(e.block).toLocaleString("en")}`}</span>
              </li>
            ))}
          </ul>
          <Link href="/app/agents/break" className="mt-4 inline-block text-[14px] text-leaf underline underline-offset-4">
            Attack the mandate yourself →
          </Link>
        </div>
      </section>

      {/* 2 · the rules, as a chain, with what each has stopped */}
      <section>
        <h2 className="font-display text-4xl tracking-tight">Every trade passes five gates.</h2>
        <p className="mt-3 max-w-2xl text-muted">{MANDATE_DEMO.bondLine}</p>
        <ol className="mt-10 grid gap-3 lg:grid-cols-5">
          {MANDATE_DEMO.rules.map((r, i) => {
            const n = stops.get(r.id) ?? 0;
            return (
              <li key={r.id} className="relative overflow-hidden rounded-2xl border border-line bg-surface/40 p-5">
                <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-[#9b86e4]" style={{ opacity: 0.35 + (i / 5) * 0.65 }} />
                <p className="font-mono text-[12px] text-[#9b86e4]">{`gate ${r.n}`}</p>
                <p className="mt-3 text-[20px] font-semibold text-text">{r.id}</p>
                <p className="mt-1 text-[14px] text-muted">{r.what}</p>
                <p className="mt-6 flex items-baseline gap-2 border-t border-line pt-3">
                  <span className={cx("font-display text-3xl tabular-nums", n ? "text-flesh" : "text-muted")}>{n}</span>
                  <span className="text-[12px] text-muted">{n === 1 ? "trade stopped" : "trades stopped"}</span>
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* 3 · with your key, or under a mandate */}
      <section className="grid gap-4 md:grid-cols-2">
        {[
          { k: "An agent with your key", bad: true, rows: ["Can send everything anywhere, in one transaction", "Its limits are a promise in its own code", "A mistake costs you, and only you", "Nobody can see what it decided, or why"] },
          { k: "An agent under a mandate", bad: false, rows: ["Trades only what the owner listed, up to a cap", "The limits are checked by the contract on every trade", "A broken rule costs the agent its bond, paid to you", "Every decision is public, block by block"] },
        ].map((c) => (
          <div key={c.k} className={cx("rounded-3xl p-7 ring-1", c.bad ? "bg-[color-mix(in_oklab,var(--flesh)_7%,var(--bg))] ring-flesh/30" : "bg-leaf/[0.05] ring-leaf/30")}>
            <p className={cx("font-mono text-[12px] uppercase tracking-[0.1em]", c.bad ? "text-flesh" : "text-leaf")}>{c.bad ? "Without" : "With"}</p>
            <p className="mt-2 font-display text-3xl tracking-tight text-text">{c.k}</p>
            <ul className="mt-6 space-y-3">
              {c.rows.map((r) => (
                <li key={r} className="flex gap-3 text-[15px] text-text">
                  <span aria-hidden className={c.bad ? "text-flesh" : "text-leaf"}>
                    {c.bad ? "✕" : "✓"}
                  </span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
