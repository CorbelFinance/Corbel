"use client";

/**
 * Pool page · every day of fees since the pool's first block, from its own Swap events. Loaded on request: an old,
 * busy pool takes a while to read.
 */
import { useState } from "react";

type Day = { day: number; swaps: number; vol: number; fees: number };
type R = { baseSymbol: string; fromBlock: string; head: string; days: Day[]; error?: string };

const W = 960, H = 160;
/** the V2 pool fee, as the API counts it */
const FEE_PCT = 0.3;
const n = (v: number, sym: string) => `${v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v >= 1 ? v.toFixed(2) : v.toFixed(4)} ${sym}`;
const date = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);

export function PoolFeeHistory({ pair }: { pair: string }) {
  const [r, setR] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  async function load() {
    setBusy(true);
    try {
      // a long history answers 202 "still reading": ask again until the whole history is in (about 10 minutes at most)
      for (let i = 0; i < 40; i++) {
        const x = await fetch(`/api/feehistory?pair=${pair}`);
        if (x.status !== 202) {
          setR((await x.json()) as R);
          return;
        }
        await new Promise((res) => setTimeout(res, 10_000));
      }
      setR({ baseSymbol: "", fromBlock: "0", head: "0", days: [], error: "Still reading this pool's history. Try again in a few minutes." });
    } catch {
      setR({ baseSymbol: "", fromBlock: "0", head: "0", days: [], error: "No answer. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const days = r?.days ?? [];
  const max = Math.max(...days.map((d) => d.fees), 0) || 1;
  const total = days.reduce((a, d) => a + d.fees, 0);
  const best = days.reduce<Day | null>((a, d) => (!a || d.fees > a.fees ? d : a), null);
  const last30 = days.slice(-30).reduce((a, d) => a + d.fees, 0);
  const quiet = days.filter((d) => d.swaps === 0).length;
  const h = hover !== null ? days[hover] : null;
  const bw = days.length ? W / days.length : W;

  return (
    <section aria-label="Fee history" className="overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
        <div>
          <p className="text-[15px] font-semibold text-text">Fees since the first block</p>
          <p className="text-[13px] text-muted">{`Every day the pool has lived, from its own swaps: the pool fee of ${FEE_PCT}% on each trade, in the base asset.`}</p>
        </div>
        {!r && (
          <button type="button" onClick={() => void load()} disabled={busy} className="h-10 rounded-xl border border-line px-4 text-[13.5px] font-semibold text-text hover:border-leaf disabled:opacity-60">
            {busy ? "Reading every swap, a busy pool takes minutes…" : "Read the whole history"}
          </button>
        )}
      </header>
      {r?.error && <p className="px-5 py-4 text-[13.5px] text-flesh">{r.error}</p>}
      {r && !r.error && !days.length && <p className="px-5 py-4 text-[13.5px] text-muted">No swaps on this pool yet.</p>}
      {r && !r.error && days.length > 0 && (
        <>
          <div className="grid grid-cols-2 border-b border-line sm:grid-cols-4 sm:divide-x sm:divide-line">
            {[
              ["Days lived", String(days.length)],
              ["Fees, all time", n(total, r.baseSymbol)],
              ["Last 30 days", n(last30, r.baseSymbol)],
              ["Days with no trade", String(quiet)],
            ].map(([k, v]) => (
              <div key={k} className="px-5 py-3">
                <p className="text-[12px] text-muted">{k}</p>
                <p className="mt-0.5 font-mono text-[17px] tabular-nums text-text">{v}</p>
              </div>
            ))}
          </div>
          <div className="px-5 pt-4">
            <p className="h-5 font-mono text-[12.5px] text-muted">
              {h ? `${date(h.day)} · ${h.swaps} swaps · ${n(h.fees, r.baseSymbol)} in fees` : best ? `Best day ${date(best.day)}: ${n(best.fees, r.baseSymbol)}` : ""}
            </p>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 h-40 w-full" role="img" aria-label={`Fees per day over ${days.length} days`} onPointerLeave={() => setHover(null)}>
              {days.map((d, i) => {
                const bh = Math.max(d.fees > 0 ? 1 : 0, (d.fees / max) * (H - 4));
                return (
                  <rect key={d.day} x={i * bw} y={H - bh} width={Math.max(0.6, bw - (bw > 3 ? 1 : 0))} height={bh} fill={hover === i ? "var(--text)" : "var(--leaf)"} fillOpacity={hover === i ? 1 : 0.8} onPointerEnter={() => setHover(i)} />
                );
              })}
            </svg>
            <div className="flex justify-between pb-3 pt-1 font-mono text-[12px] text-muted">
              <span>{date(days[0]!.day)}</span>
              <span>{`blocks ${Number(r.fromBlock).toLocaleString("en-US")}–${Number(r.head).toLocaleString("en-US")}`}</span>
              <span>{date(days[days.length - 1]!.day)}</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
