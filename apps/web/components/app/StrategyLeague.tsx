"use client";

/**
 * Agents · League. Rules a buyer or an agent could follow, run on paper over every DEX pool created on Robinhood Chain
 * in the last seven days. Each rule takes or skips a pool from what was on chain when the pool appeared, and is ranked
 * by the share of the pools it took that were later found drained. Survival only: a pool that survived is not a
 * profit. From /api/league (Corbel's index, refreshed every five minutes).
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument, Led } from "./kit";

type Row = { id: string; name: string; rule: string; picked: number; known: number; drained: number; survived: number; rate: number; lo: number; hi: number };
type L = { at: string; days: number; pools: number; rows: Row[]; drained: number; tracked: number; ready: boolean; error?: string };

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmt = (n: number) => n.toLocaleString("en-US");

export function StrategyLeague() {
  const [l, setL] = useState<L | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/league")
      .then((r) => r.json())
      .then((j: L) => (j.error ? setErr(j.error) : setL(j)))
      .catch(() => setErr("The league did not load. Try again in a minute."));
  }, []);

  const base = l?.rows.find((r) => r.id === "all");
  const ranked = l ? [...l.rows].filter((r) => r.known >= 30).sort((a, b) => a.rate - b.rate) : [];
  return (
    <Instrument
      code="G-70"
      title="Survival league"
      busy={!l && !err}
      status={<Led tone={l ? "on" : "off"} label={l ? `${fmt(l.pools)} pools · last ${l.days} days` : "Reading the index"} />}
      foot={<span>Paper only. Each rule decides from what was on chain when the pool appeared. Ranked by the share of its picks later found drained (a pool that had liquidity and lost it; method since 22 Nov 2026): a survivor is not a profit. Refreshed every five minutes.</span>}
    >
      {err && <p className="p-5 text-[13.5px] text-flesh">{err}</p>}
      {l && !l.ready && (
        <div className="p-5">
          <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-amber">Collecting, not ranking</p>
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted">
            {`A pool counts as drained only after it was seen with liquidity and later found without it, on V2 and v4 alike. That record started recently: ${fmt(l.tracked)} funded pools of the last ${l.days} days are tracked and ${fmt(l.drained)} drained so far. The league ranks the rules once there are enough drains to tell them apart.`}
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {l.rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-line px-4 py-3">
                <p className="text-[14px] font-semibold text-text">{r.name}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">{r.rule}</p>
                <p className="mt-1 font-mono text-[12px] text-muted">{`${fmt(r.picked)} picked · ${fmt(r.known)} tracked`}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {l && l.ready && base && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                {["#", "Rule", "Took", "Fate known", "Drained", "vs buying everything", ""].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => {
                const delta = r.rate - base.rate;
                return (
                  <tr key={r.id} className={cx("border-b border-line/50 align-top", i === 0 && "bg-leaf/[0.04]")}>
                    <td className="px-4 py-3 font-mono text-muted">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-text">{r.name}</p>
                      <p className="mt-0.5 text-[12.5px] text-muted">{r.rule}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-text">{fmt(r.picked)}</td>
                    <td className="px-4 py-3 font-mono text-muted">{fmt(r.known)}</td>
                    <td className="px-4 py-3 font-mono">
                      <span className={cx(r.rate < base.rate * 0.85 ? "text-leaf" : r.rate > base.rate * 1.15 ? "text-flesh" : "text-text")}>{pct(r.rate)}</span>
                      <span className="block text-[12px] text-muted">{`${pct(r.lo)} – ${pct(r.hi)}`}</span>
                    </td>
                    <td className={cx("px-4 py-3 font-mono", r.id === "all" ? "text-muted" : delta < 0 ? "text-leaf" : "text-flesh")}>{r.id === "all" ? "baseline" : `${delta < 0 ? "−" : "+"}${(Math.abs(delta) * 100).toFixed(1)} pts`}</td>
                    <td className="w-40 px-4 py-3">
                      <div className="relative h-2.5 rounded-full bg-[#1b1b1b]" aria-hidden>
                        <i className={cx("absolute inset-y-0 left-0 rounded-full", r.rate < base.rate ? "bg-leaf" : "bg-flesh")} style={{ width: `${Math.max(1, r.rate * 100)}%` }} />
                        <i className="absolute inset-y-[-3px] w-px bg-text/70" style={{ left: `${base.rate * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-3 text-[12.5px] text-muted">
            A launchpad that locks its pools makes its graduates hard to drain: a low share there is a property of the launchpad, not of the creators. Rules with fewer than thirty known fates are left out.
          </p>
        </div>
      )}
    </Instrument>
  );
}
