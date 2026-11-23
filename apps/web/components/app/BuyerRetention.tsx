"use client";

/**
 * Token check · buyer retention: of the wallets that bought in the token's first week, how many still hold it.
 * Read on its own after the report (it takes a few seconds); a fact next to the score, not part of it.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";

type R = { retention: { from: string; to: string; buyers: number; checked: number; holdAny: number; holdHalf: number } | null; days?: number; why?: string; error?: string };

export function BuyerRetention({ token }: { token: string }) {
  const [r, setR] = useState<R | null>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => (setBusy(true), setR(null)));
    fetch(`/api/retention?token=${token}`)
      .then((x) => x.json() as Promise<R>)
      .then((j) => live && setR(j))
      .catch(() => live && setR({ retention: null, error: "No answer." }))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [token]);

  const x = r?.retention;
  if (!busy && (!x || x.buyers === 0)) {
    const line = r?.error ? "Buyer retention could not be read just now." : r?.why ?? "Nobody bought this token from a pool in its first week.";
    return <p className="rounded-2xl border border-[#242424] bg-[#131313] px-4 py-3 text-[13.5px] text-muted">{`Buyer retention · ${line}`}</p>;
  }
  const any = x && x.checked ? x.holdAny / x.checked : 0;
  const half = x && x.checked ? x.holdHalf / x.checked : 0;
  const days = r?.days ?? 7;
  return (
    <section aria-label="Buyer retention" className="overflow-hidden rounded-2xl border border-[#242424] bg-[#131313]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#242424] px-4 py-3">
        <p className="text-[15px] font-semibold text-text">Do its first buyers still hold?</p>
        {x && <span className="font-mono text-[12px] text-muted">{`blocks ${Number(x.from).toLocaleString("en-US")}–${Number(x.to).toLocaleString("en-US")}`}</span>}
      </header>
      {busy || !x ? (
        <p className="px-4 py-4 text-[13.5px] text-muted">Reading the first week of transfers…</p>
      ) : (
        <div className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div>
            <p className={cx("font-mono text-[34px] leading-none tabular-nums", any >= 0.5 ? "text-leaf" : any >= 0.2 ? "text-amber" : "text-flesh")}>{`${Math.round(any * 100)}%`}</p>
            <p className="mt-2 text-[13.5px] text-muted">
              {`still hold some: ${x.holdAny} of ${x.checked} wallets that bought in the first ${days >= 6.95 ? "week" : days >= 1 ? `${days.toFixed(1)} days` : `${Math.max(1, Math.round(days * 24))} hours`}${x.checked < x.buyers ? ` (the ${x.checked} largest of ${x.buyers})` : ""}.`}
            </p>
          </div>
          <div className="space-y-2.5">
            {[
              ["Hold some", any, x.holdAny],
              ["Hold at least half of what they bought", half, x.holdHalf],
            ].map(([k, v, n]) => (
              <div key={k as string}>
                <div className="flex justify-between text-[13px]">
                  <span className="text-text">{k}</span>
                  <span className="font-mono tabular-nums text-muted">{`${n} · ${Math.round((v as number) * 100)}%`}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#1d1d1d]">
                  <div className="h-full rounded-full bg-leaf" style={{ width: `${((v as number) * 100).toFixed(1)}%` }} />
                </div>
              </div>
            ))}
            <p className="text-[12.5px] text-muted">A buyer is a wallet that ended a transaction with more of the token after it left a pool. Holding is today&apos;s balance, read from the token.</p>
          </div>
        </div>
      )}
    </section>
  );
}
