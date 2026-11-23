"use client";

/**
 * /accuracy · the verdict ledger: every check's verdict sealed into an hourly Merkle root before its outcome is known,
 * and the outcomes of verdicts a week old, misses and false alarms included.
 */
import { useEffect, useState } from "react";

type Batch = { id: number; count: number; root: string; at: number; tx: string | null };
type L = { batches: Batch[]; outcomes: { judged: number; hits: number; falseAlarms: number; misses: number; cleanAlive: number; unknown: number }; poster: boolean; scheme: string };
const SCAN = "https://robinhoodchain.blockscout.com";

export function VerdictLedger() {
  const [l, setL] = useState<L | null>(null);
  useEffect(() => {
    fetch("/api/ledger")
      .then((r) => r.json() as Promise<L>)
      .then(setL)
      .catch(() => undefined);
  }, []);
  if (!l) return null;
  const o = l.outcomes;
  return (
    <section aria-label="Verdict ledger" className="mt-14 overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
      <header className="border-b border-line px-5 py-4">
        <p className="text-[17px] font-semibold text-text">Every verdict, sealed before the outcome</p>
        <p className="mt-1 max-w-3xl text-[13.5px] text-muted">{`Each token check's verdict is hashed and closed into an hourly Merkle root, so no verdict can be changed after the fact. ${l.poster ? "Each root is posted on chain." : "Roots are kept here and will be posted on chain once the ledger wallet is set."} Anyone can prove one verdict with /api/ledger?token=0x….`}</p>
      </header>
      <div className="grid grid-cols-2 border-b border-line sm:grid-cols-5 sm:divide-x sm:divide-line">
        {[
          ["Judged", o.judged, "a week old or more"],
          ["Hits", o.hits, "flagged, then drained"],
          ["False alarms", o.falseAlarms, "flagged, still alive"],
          ["Misses", o.misses, "passed, then drained"],
          ["Clean and alive", o.cleanAlive, "passed, still alive"],
        ].map(([k, v, sub]) => (
          <div key={k as string} className="px-5 py-3">
            <p className="text-[12px] text-muted">{k}</p>
            <p className="mt-0.5 font-mono text-[20px] tabular-nums text-text">{(v as number).toLocaleString("en-US")}</p>
            <p className="text-[12px] text-muted">{sub}</p>
          </div>
        ))}
      </div>
      {l.batches.length === 0 ? (
        <p className="px-5 py-4 text-[13.5px] text-muted">The first batch closes in the hour after the first verdicts are saved.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[12px] text-muted">
                {["Batch", "Closed (UTC)", "Verdicts", "Root", "On chain"].map((h) => (
                  <th key={h} scope="col" className="px-5 py-2.5 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {l.batches.map((b) => (
                <tr key={b.id} className="border-b border-line/60 font-mono last:border-0">
                  <td className="px-5 py-2 text-text">{`#${b.id}`}</td>
                  <td className="px-5 py-2 text-muted">{new Date(b.at).toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="px-5 py-2 tabular-nums text-text">{b.count}</td>
                  <td className="px-5 py-2 text-muted">{`${b.root.slice(0, 14)}…${b.root.slice(-6)}`}</td>
                  <td className="px-5 py-2">{b.tx ? <a href={`${SCAN}/tx/${b.tx}`} target="_blank" rel="noreferrer" className="text-leaf underline underline-offset-4">posted ↗</a> : <span className="text-muted">not yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-line px-5 py-3 font-mono text-[12px] text-muted">{`${l.scheme} · outcomes from the index; ${o.unknown.toLocaleString("en-US")} verdicts on tokens with no known pool fate are not judged`}</p>
    </section>
  );
}
