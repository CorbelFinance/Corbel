"use client";

/**
 * Agents · for hire: every agent that holds a Corbel mandate, with its record read from the chain. Trades made, trades
 * the contract refused, bond posted and bond lost to owners. Pick one by its record and make it your mandate's agent.
 */
import { Fragment, useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { CopyButton } from "@/components/docs/CopyButton";
import { short } from "./kit";
import { AgentHire } from "./AgentHire";

type A = { agent: string; mandates: number; trades: number; refused: number; bonded: number; lost: number; frozen: number };
type R = { block: string; mandates: number; agents: A[]; error?: string };
const SCAN = "https://robinhoodchain.blockscout.com/address/";

export function AgentRegistry() {
  const [r, setR] = useState<R | null>(null);
  const [hire, setHire] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/agents/registry")
      .then((x) => x.json() as Promise<R>)
      .then(setR)
      .catch(() => undefined);
  }, []);
  return (
    <section aria-label="Agents for hire" className="overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
        <p className="text-[15px] font-semibold text-text">Agents and their record</p>
        <span className="font-mono text-[12px] text-muted">{r && !r.error ? `${r.agents.length} agents · ${r.mandates} mandates · block ${Number(r.block).toLocaleString("en-US")}` : "reading the chain…"}</span>
      </header>
      {r?.error ? (
        <p className="px-5 py-4 text-[13.5px] text-flesh">{r.error}</p>
      ) : !r ? null : r.agents.length === 0 ? (
        <p className="px-5 py-4 text-[13.5px] text-muted">No agent holds a mandate yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[12px] text-muted">
                {["Agent", "Mandates", "Trades", "Refused", "Bond posted", "Bond lost", ""].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.agents.map((a) => (
                <Fragment key={a.agent}>
                <tr className="border-b border-line/60 font-mono">
                  <td className="px-4 py-2"><a href={SCAN + a.agent} target="_blank" rel="noreferrer" className="text-text hover:underline">{short(a.agent)} ↗</a>{a.frozen > 0 && <span className="ml-2 text-[11.5px] text-flesh">frozen once</span>}</td>
                  <td className="px-4 py-2 text-text">{a.mandates}</td>
                  <td className="px-4 py-2 text-leaf">{a.trades}</td>
                  <td className={cx("px-4 py-2", a.refused ? "text-flesh" : "text-muted")}>{a.refused}</td>
                  <td className="px-4 py-2 text-text">{`${a.bonded.toFixed(2)} USDG`}</td>
                  <td className={cx("px-4 py-2", a.lost ? "text-flesh" : "text-muted")}>{`${a.lost.toFixed(2)} USDG`}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="inline-flex items-center gap-2">
                      <CopyButton text={a.agent} />
                      {a.frozen === 0 && (
                        <button type="button" onClick={() => setHire(hire === a.agent ? null : a.agent)} className="rounded-md border border-leaf/50 px-2.5 py-1 font-sans text-[12px] text-leaf hover:bg-leaf/10">
                          Hire
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
                {hire === a.agent && (
                  <tr>
                    <td colSpan={7} className="p-0">
                      <AgentHire agent={a.agent} onClose={() => setHire(null)} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">Every figure is an event of the mandate contract. Hire one and your own wallet makes a mandate for it: your caps, your end date, its bond. Agents that were frozen cannot be hired here.</p>
    </section>
  );
}
