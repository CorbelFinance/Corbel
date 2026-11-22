"use client";

/**
 * Predict. Two kinds of YES/NO market that only Corbel's data can feed: will a pool still hold its
 * liquidity in a week (settled from the chain alone), and will a stock open Monday above Friday's close
 * (settled from the pool's own time-weighted price, no resolver). Candidates come from live reads;
 * the live markets and stakes are in PredictLive, above this on the page.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { fmtPx } from "./Candles";
import { Idle, Instrument, Led, Readout, Seg } from "./kit";

type Pool = { token: string; symbol: string; base: string; liquidity: number; volume: number };
type Gap = { token: string; symbol: string; name: string; chain: number; liquidity: number | null; close: number | null; gap: number | null };
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(v < 10 ? 2 : 0)}`);
/** Mirrors CorbelPredict: +50% weight at creation falling to 0 at close, 1% of the losing side to the Gap Fund. */
const EARLY = 0.5;
const FEE = 0.01;
/** A survival market's line: half of today's liquidity must still be there at every check. */
const KEEP = 0.5;
const THIN = 1000;

function Payout() {
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [stake, setStake] = useState("100");
  const [yesPot, setYesPot] = useState("2000");
  const [noPot, setNoPot] = useState("3000");
  const [when, setWhen] = useState(0.2);
  const r = useMemo(() => {
    const s = Number(stake) || 0, y = Number(yesPot) || 0, n = Number(noPot) || 0;
    const w = s * (1 + EARLY * (1 - when));
    // other stakes on your side are assumed placed at the midpoint
    const mineW = w, sideW = (side === "yes" ? y : n) * (1 + EARLY * 0.5) + mineW;
    const los = side === "yes" ? n : y;
    const win = s + ((los * (1 - FEE)) * mineW) / sideW;
    return { w, win, mult: s > 0 ? win / s : 0, implied: (side === "yes" ? y + s : n + s) / (y + n + s) };
  }, [side, stake, yesPot, noPot, when]);

  return (
    <Instrument code="P-03" title="Payout calculator" status={<Led tone="off" label="How the pool pays" />} foot={<span>{`Winners get their stake back plus the losing side, split by weight, minus ${FEE * 100}% to the Gap Fund`}</span>}>
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <div>
          <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Your side</p>
          <div className="mt-1.5">
            <Seg label="Side" value={side} options={[{ id: "yes", label: "YES" }, { id: "no", label: "NO" }]} onChange={setSide} />
          </div>
        </div>
        {(
          [
            ["pp-s", "Your stake, USDG", stake, setStake],
            ["pp-y", "Already on YES", yesPot, setYesPot],
            ["pp-n", "Already on NO", noPot, setNoPot],
          ] as const
        ).map(([id, l, v, set]) => (
          <div key={id}>
            <label htmlFor={id} className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
              {l}
            </label>
            <div className="ifield mt-1.5 h-10">
              <input id={id} value={v} onChange={(e) => set(e.target.value)} inputMode="decimal" className="px-3 font-mono text-sm text-text" />
            </div>
          </div>
        ))}
        <div className="sm:col-span-2">
          <label htmlFor="pp-t" className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
            When you stake: {Math.round(when * 100)}% of the way to close
          </label>
          <input id="pp-t" type="range" min={0} max={100} value={Math.round(when * 100)} onChange={(e) => setWhen(Number(e.target.value) / 100)} className="mt-2 block w-full accent-[var(--ui)]" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-3 xl:grid-cols-1">
        <Readout label="If you win, USDG" value={fmtPx(r.win)} sub={`×${r.mult.toFixed(2)} your stake`} tone="good" />
        <Readout label="Your weight" value={fmtPx(r.w)} sub={`×${(r.w / (Number(stake) || 1)).toFixed(2)} for timing`} />
        <Readout label="Pool says" value={`${Math.round(r.implied * 100)}%`} sub={`${side.toUpperCase()} share of stakes`} />
      </div>
    </Instrument>
  );
}

export function Predict() {
  const [pools, setPools] = useState<Pool[] | null>(null);
  const [gaps, setGaps] = useState<Gap[] | null>(null);
  const [tab, setTab] = useState<"survive" | "monday">("survive");

  useEffect(() => {
    let off = false;
    const get = <T,>(url: string, set: (v: T) => void, pick: (j: Record<string, unknown>) => T, again = 0) => {
      fetch(url)
        .then(async (r) => ({ code: r.status, j: (await r.json()) as Record<string, unknown> }))
        .then(({ code, j }) => {
          if (off) return;
          if (code === 202 && again < 20) return void setTimeout(() => get(url, set, pick, again + 1), 15_000);
          set(pick(j));
        })
        .catch(() => undefined);
    };
    get<Pool[]>("/api/earn", setPools, (j) => (j.rows as Pool[]) ?? []);
    get<Gap[]>("/api/gap", setGaps, (j) => (j.rows as Gap[]) ?? []);
    return () => {
      off = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-px border border-line bg-line md:grid-cols-4">
        {[
          ["A pool of stakes", "No market maker to drain: YES and NO stakes form two pots; the winners split the losers'."],
          ["Early is worth more", `Up to +${EARLY * 100}% weight at the open, falling to zero at close. Information pays, last-second sniping doesn't.`],
          ["Settled by the chain", "Survival markets read the pool's reserve at every check in the last week and keep the lowest. One pull is NO."],
          ["No resolver", "Price markets settle from the pool's own time-weighted average price over the last window. Betting closes before the window opens. A missed window or an empty side refunds."],
        ].map(([k, v]) => (
          <div key={k} className="bg-bg p-4">
            <p className="font-medium text-[12px] uppercase tracking-[0.1em] text-leaf">{k}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Instrument
          code="P-01"
          title="Markets that can open"
          status={<Seg label="Market kind" value={tab} options={[{ id: "survive", label: "Will it survive" }, { id: "monday", label: "Monday open" }]} onChange={setTab} />}
          foot={
            <>
              <span>CorbelPredict: 16 tests, a solvency fuzz and four attack cases; live on Robinhood Chain, not audited yet</span>
              <span>Staking opens after deployment</span>
            </>
          }
        >
          {tab === "survive" &&
            (!pools ? (
              <Idle className="min-h-60">Reading the deepest pools…</Idle>
            ) : (
              <ul>
                {pools.map((p) => (
                  <li key={p.token} className="grid gap-3 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-[15px] text-text">
                        Will <b className="font-mono font-medium">{p.symbol}/{p.base}</b> still hold {usd(p.liquidity * KEEP)} of liquidity at every check next week?
                      </p>
                      <p className="mt-1 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                        Now {usd(p.liquidity)} · volume last day {usd(p.volume)} · settles from the pool&apos;s reserves
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link href={`/app/trust/check?q=${p.token}`} className="font-medium text-[12px] uppercase tracking-[0.08em] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                        Check →
                      </Link>
                      <span className="border border-line px-2 py-1 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Not open</span>
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          {tab === "monday" &&
            (!gaps ? (
              <Idle className="min-h-60">Reading pool prices and last closes…</Idle>
            ) : (
              <ul>
                {gaps
                  .filter((g) => g.close !== null)
                  .map((g) => {
                    const thin = g.liquidity === null || g.liquidity < THIN;
                    return (
                      <li key={g.token} className="grid gap-3 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[1fr_auto]">
                        <div>
                          <p className="text-[15px] text-text">
                            Will <b className="font-mono font-medium">{g.symbol}</b> open Monday above ${fmtPx(g.close!)}?
                          </p>
                          <p className="mt-1 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                            The token trades{" "}
                            <span className={cx(thin ? "text-muted" : g.gap! >= 0 ? "text-leaf" : "text-flesh")}>
                              {g.gap! >= 0 ? "+" : ""}
                              {(g.gap! * 100).toFixed(2)}%
                            </span>{" "}
                            from that close on chain{thin ? " (thin pool: a hint, not a forecast)" : ""}
                          </p>
                        </div>
                        <span className="self-center border border-line px-2 py-1 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Not open</span>
                      </li>
                    );
                  })}
              </ul>
            ))}
        </Instrument>
        <Payout />
      </div>
    </div>
  );
}
