"use client";

/**
 * Agents · Limits: the live mandate read from its contract, shown as the key an agent holds. What it may spend per
 * token (per trade and per day), the price, hours and cooldown rules, and what a broken rule costs: the cut of the bond
 * that goes to the owner, the strikes before the agent is frozen, the delay before a bond can be taken back. The strike
 * stepper plays the contract's own rule on a bond, so the path of the money is visible. From /api/mandate/key.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument, Led } from "./kit";

type Key = {
  block: number;
  mandate: string;
  agent: string;
  owner: string;
  frozen: boolean;
  strikes: number;
  bond: number;
  bondSymbol: string;
  unbondDelayH: number;
  rules: { maxSlippagePct: number; hourFrom: number; hourTo: number; weekdaysOnly: boolean; cooldownS: number; minBond: number; slashPct: number; strikesToFreeze: number };
  limits: { symbol: string; allowed: boolean; perTrade: number; perDay: number }[];
  proofs: { traded: string; refused: string; revoked: string };
  error?: string;
};
const TX = "https://robinhoodchain.blockscout.com/tx/";
const ADDR = "https://robinhoodchain.blockscout.com/address/";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const n = (v: number) => (v >= 1 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v.toLocaleString("en-US", { maximumSignificantDigits: 3 }));

/**
 * The contract's rule (CorbelMandate._violate): each violation takes slashPct of what is left of the bond and pays it
 * to the owner; at the freezing strike the agent is frozen and the rest of the bond goes to the owner too.
 */
export function bondPath(bond: number, slashPct: number, strikes: number, strikesToFreeze: number) {
  let left = bond, paid = 0, seized = 0;
  const steps: { strike: number; cut: number; left: number }[] = [];
  for (let i = 1; i <= Math.min(strikes, strikesToFreeze); i++) {
    const cut = (left * slashPct) / 100;
    left -= cut;
    paid += cut;
    steps.push({ strike: i, cut, left });
  }
  if (strikes >= strikesToFreeze) {
    seized = left;
    paid += left;
    left = 0;
  }
  return { left, paid, seized, steps };
}

export function AgentKey() {
  const [k, setK] = useState<Key | null>(null);
  const [strikes, setStrikes] = useState(1);
  useEffect(() => {
    fetch("/api/mandate/key")
      .then((r) => r.json())
      .then((j: Key) => setK(j))
      .catch(() => setK({ error: "The mandate did not answer." } as Key));
  }, []);

  if (!k || k.error) {
    return (
      <Instrument code="K-01" title="Agent key" busy={!k} status={<Led tone="off" label={k?.error ?? "Reading the contract"} />}>
        <p className="p-5 text-[13.5px] text-muted">{k?.error ?? "Reading the live mandate from the chain…"}</p>
      </Instrument>
    );
  }
  const r = k.rules;
  // the example bond: the one posted now, or the contract's minimum when none is posted
  const bond = k.bond > 0 ? k.bond : r.minBond;
  const path = bondPath(bond, r.slashPct, strikes, r.strikesToFreeze);
  const frozenAt = strikes >= r.strikesToFreeze;
  const hours = r.hourFrom === r.hourTo ? "all day" : `${String(r.hourFrom).padStart(2, "0")}:00–${String(r.hourTo).padStart(2, "0")}:00 UTC`;
  return (
    <Instrument
      code="K-01"
      title="Agent key"
      status={<Led tone={k.frozen ? "bad" : "on"} live label={`${k.frozen ? "frozen" : "active"} · block ${k.block.toLocaleString("en-US")}`} />}
      foot={<span>Read from the live mandate at the latest block. The contract enforces every line; nothing here is a setting of this page.</span>}
    >
      <div className="grid gap-px bg-line lg:grid-cols-2">
        <div className="bg-bg p-5">
          <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Holder of the key</p>
          <dl className="mt-2 space-y-1 font-mono text-[13px]">
            <div className="flex justify-between gap-3"><dt className="text-muted">agent</dt><dd><a href={ADDR + k.agent} target="_blank" rel="noreferrer" className="text-text underline underline-offset-2">{short(k.agent)}</a></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">owner, can replace it any time</dt><dd><a href={ADDR + k.owner} target="_blank" rel="noreferrer" className="text-text underline underline-offset-2">{short(k.owner)}</a></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">mandate</dt><dd><a href={ADDR + k.mandate} target="_blank" rel="noreferrer" className="text-leaf underline underline-offset-2">{short(k.mandate)}</a></dd></div>
          </dl>
          <p className="mt-4 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">May spend</p>
          <table className="mt-2 w-full font-mono text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] text-muted"><th className="py-1 font-normal">token</th><th className="py-1 text-right font-normal">per trade</th><th className="py-1 text-right font-normal">per day</th></tr>
            </thead>
            <tbody>
              {k.limits.map((l) => (
                <tr key={l.symbol} className="border-t border-line/60">
                  <td className="py-1.5 text-text">{l.symbol}</td>
                  <td className="py-1.5 text-right">{l.allowed ? n(l.perTrade) : <span className="text-flesh">not allowed</span>}</td>
                  <td className="py-1.5 text-right">{l.allowed ? n(l.perDay) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[12.5px]">
            <dt className="text-muted">price from mark</dt><dd className="text-right text-text">{`≤ ${r.maxSlippagePct}%`}</dd>
            <dt className="text-muted">hours</dt><dd className="text-right text-text">{hours}{r.weekdaysOnly ? ", weekdays" : ""}</dd>
            <dt className="text-muted">between trades</dt><dd className="text-right text-text">{r.cooldownS ? `${r.cooldownS}s` : "no wait"}</dd>
            <dt className="text-muted">pools</dt><dd className="text-right text-text">owner-approved only</dd>
          </dl>
        </div>
        <div className="bg-bg p-5">
          <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">What a broken rule costs</p>
          <p className="mt-2 text-[13.5px] text-text">{`The trade is not made. ${r.slashPct}% of the bond goes to the owner. After ${r.strikesToFreeze} violations the agent is frozen. A bond can be taken back only ${k.unbondDelayH} h after asking, and it stays slashable until then.`}</p>
          <div className="mt-4 flex items-center gap-2" role="group" aria-label="Violations">
            <span className="font-mono text-[12px] text-muted">violations</span>
            {Array.from({ length: r.strikesToFreeze + 1 }, (_, i) => (
              <button key={i} type="button" aria-pressed={strikes === i} onClick={() => setStrikes(i)} className={cx("h-8 w-8 rounded-md border font-mono text-[13px]", strikes === i ? (i >= r.strikesToFreeze ? "border-flesh bg-flesh/15 text-flesh" : "border-leaf bg-leaf/10 text-text") : "border-line text-muted hover:text-text")}>
                {i}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-1.5 font-mono text-[12.5px]">
            <p className="flex justify-between"><span className="text-muted">{k.bond > 0 ? "bond posted now" : `bond, at the contract's minimum`}</span><span className="text-text">{`${n(bond)} ${k.bondSymbol}`}</span></p>
            {path.steps.map((s) => (
              <p key={s.strike} className="flex justify-between">
                <span className="text-flesh">{`violation ${s.strike} → owner`}</span>
                <span className="text-flesh">{`+${n(s.cut)} ${k.bondSymbol}`}</span>
              </p>
            ))}
            {frozenAt && (
              <p className="flex justify-between">
                <span className="text-flesh">frozen → owner takes the rest</span>
                <span className="text-flesh">{`+${n(path.seized)} ${k.bondSymbol}`}</span>
              </p>
            )}
            <p className="flex justify-between border-t border-line pt-1.5"><span className="text-muted">left to the agent</span><span className="text-text">{`${n(path.left)} ${k.bondSymbol}`}</span></p>
            <p className="flex justify-between"><span className="text-muted">paid to the owner</span><span className="text-leaf">{`${n(path.paid)} ${k.bondSymbol}`}</span></p>
            <p className={cx("pt-1", frozenAt ? "text-flesh" : "text-muted")}>{frozenAt ? "Frozen: the agent cannot trade any more." : `${r.strikesToFreeze - strikes} more to freeze`}</p>
          </div>
          <p className="mt-4 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">On mainnet</p>
          <ul className="mt-1 font-mono text-[12.5px]">
            <li><a href={TX + k.proofs.traded} target="_blank" rel="noreferrer" className="inline-block py-1.5 text-leaf underline underline-offset-2">inside the rules: traded ↗</a></li>
            <li><a href={TX + k.proofs.refused} target="_blank" rel="noreferrer" className="inline-block py-1.5 text-flesh underline underline-offset-2">unapproved pool: refused, bond cut ↗</a></li>
            <li><a href={TX + k.proofs.revoked} target="_blank" rel="noreferrer" className="inline-block py-1.5 text-text underline underline-offset-2">owner replaced the agent ↗</a></li>
          </ul>
        </div>
      </div>
    </Instrument>
  );
}
