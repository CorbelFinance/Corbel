"use client";

/**
 * /token · the live figures: total supply, coins in the team's locker and coins burned, read from the contract at
 * one block (GET /api/tokeninfo). While the read is on its way the cells say so; a failed read says so too.
 */
import { useEffect, useState } from "react";

type Info = { block: string; supply: number; locked: number; burned: number; locker: string };
const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const pct = (v: number, of: number) => (of > 0 ? `${((v / of) * 100).toFixed(2)}%` : "—");

export function TokenLive() {
  const [d, setD] = useState<Info | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let off = false;
    fetch("/api/tokeninfo")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Info) => !off && setD(j))
      .catch(() => !off && setErr(true));
    return () => {
      off = true;
    };
  }, []);
  const cells: [string, string, string][] = [
    ["Total supply", d ? fmt(d.supply) : "…", "Fixed. The contract has no mint function."],
    ["Locked by the team", d ? fmt(d.locked) : "…", d ? `${pct(d.locked, d.supply)} of supply, in the HoodLock locker` : "Reading the locker"],
    ["Burned", d ? fmt(d.burned) : "…", d && d.burned === 0 ? "None yet. Burns start when Credits open." : "Sent to the dead and zero addresses"],
  ];
  return (
    <div>
      <div className="grid gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424] sm:grid-cols-3">
        {cells.map(([k, v, s]) => (
          <div key={k} className="bg-[#0f0f0f] p-5">
            <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">{k}</p>
            <p className="mt-2 font-display text-3xl tabular-nums tracking-tight text-text">{v}</p>
            <p className="mt-2 text-[13.5px] text-muted">{s}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[12.5px] text-muted">
        {err ? "The chain did not answer. Try again in a minute." : d ? `Read from the contract at block ${Number(d.block).toLocaleString("en-US")}.` : "Reading the contract…"}
      </p>
    </div>
  );
}
