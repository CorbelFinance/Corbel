"use client";

/**
 * Predict · your positions: every market the linked wallet has a stake in, its side and size, the odds the two pots
 * imply now, when it settles, and what it can claim. Read from the contract (/api/predict?who=).
 */
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { cx } from "@corbel/ui";
import { useLinked } from "./wallet";

type Mkt = { id: number; kind: "survival" | "price"; state: "open" | "proposed" | "settled" | "void"; outcome: boolean; closeAt: number; expiry: number; yesPot: string; noPot: string; pool: { symbol: string } | null; mine: { yes: string; no: string; claimable: string } | null };
type Res = { now: number; markets: Mkt[]; error?: string };
const usdg = (raw: string) => Number(formatUnits(BigInt(raw), 6));
const date = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ");

export function PredictPositions() {
  const { linked } = useLinked();
  const [r, setR] = useState<Res | null>(null);
  useEffect(() => {
    if (!linked?.address) return;
    fetch(`/api/predict?who=${linked.address}`)
      .then((x) => x.json() as Promise<Res>)
      .then(setR)
      .catch(() => undefined);
  }, [linked?.address]);

  const mine = (r?.markets ?? []).filter((m) => m.mine && (BigInt(m.mine.yes) > 0n || BigInt(m.mine.no) > 0n || BigInt(m.mine.claimable) > 0n));
  return (
    <section aria-label="Your positions" className="overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
        <p className="text-[15px] font-semibold text-text">Your positions</p>
        <span className="font-mono text-[12px] text-muted">{linked?.address ? `${mine.length} market${mine.length === 1 ? "" : "s"} with a stake` : "link a wallet to see them"}</span>
      </header>
      {!linked?.address ? (
        <p className="px-5 py-4 text-[13.5px] text-muted">Link your wallet at the top right: every stake it holds shows here, read from the contract.</p>
      ) : mine.length === 0 ? (
        <p className="px-5 py-4 text-[13.5px] text-muted">{r ? "No stakes on this wallet yet." : "Reading the contract…"}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[12px] text-muted">
                {["Market", "Your stake", "Odds now (YES)", "Settles", "State", "To claim"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mine.map((m) => {
                const y = usdg(m.yesPot), n = usdg(m.noPot), yes = usdg(m.mine!.yes), no = usdg(m.mine!.no), claim = usdg(m.mine!.claimable);
                return (
                  <tr key={m.id} className="border-b border-line/60 font-mono">
                    <td className="px-4 py-2 text-text">{`#${m.id} · ${m.kind === "survival" ? "keeps liquidity" : "price"}${m.pool ? ` · ${m.pool.symbol}` : ""}`}</td>
                    <td className="px-4 py-2 text-text">{[yes ? `YES ${yes.toFixed(2)}` : "", no ? `NO ${no.toFixed(2)}` : ""].filter(Boolean).join(" · ")}</td>
                    <td className="px-4 py-2 text-text">{y + n ? `${Math.round((y / (y + n)) * 100)}%` : "—"}</td>
                    <td className="px-4 py-2 text-muted">{`${date(m.expiry)} UTC`}</td>
                    <td className={cx("px-4 py-2", m.state === "settled" ? "text-leaf" : m.state === "void" ? "text-amber" : "text-muted")}>{m.state === "settled" ? (m.outcome ? "YES won" : "NO won") : m.state === "void" ? "void, refunded" : m.state}</td>
                    <td className={cx("px-4 py-2", claim ? "text-leaf" : "text-muted")}>{claim ? `${claim.toFixed(2)} USDG` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
