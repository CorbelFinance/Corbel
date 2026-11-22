"use client";

/**
 * /accuracy: does what the token check reads tell which tokens get drained? Draws /api/accuracy: for every DEX pool and
 * every launchpad launch whose fate Corbel's index knows, the drained share with and without each signal, with a 95%
 * interval, each signal computed only from what was on chain before that pool or launch. Results are shown as they
 * come out, including the ones that go against the check as it is today.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";

type G = { id: string; label: string; n: number; drained: number; rate: number; lo: number; hi: number };
type R = {
  at: string;
  pools: { groups: G[]; known: number; pools: number; drained: number; ready: boolean };
  launches: { groups: G[]; known: number; launches: number } | null;
  verdicts: { n: number; tokens: number; since: string | null };
  error?: string;
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmt = (n: number) => n.toLocaleString("en-US");

function Bars({ groups, base }: { groups: G[]; base: number }) {
  return (
    <div className="divide-y divide-line">
      {groups.map((g) => {
        const thin = g.n < 30;
        return (
          <div key={g.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_9rem] md:items-center">
            <div>
              <p className="text-[14.5px] text-text">{g.label}</p>
              <p className="mt-0.5 font-mono text-[12px] text-muted">{`${fmt(g.drained)} drained of ${fmt(g.n)}`}</p>
            </div>
            <div className="relative h-7 rounded-md bg-[#141414]" aria-hidden>
              {/* the 95% interval as a band, the share as a bar, the base rate as a line */}
              <span className="absolute inset-y-1 rounded-sm bg-white/10" style={{ left: `${g.lo * 100}%`, width: `${Math.max(0.4, (g.hi - g.lo) * 100)}%` }} />
              <span className={cx("absolute inset-y-2 left-0 rounded-sm", thin ? "bg-[#555]" : g.rate > base * 1.15 ? "bg-flesh" : g.rate < base * 0.85 ? "bg-leaf" : "bg-[#9aa39a]")} style={{ width: `${Math.max(0.4, g.rate * 100)}%` }} />
              <span className="absolute inset-y-0 w-px bg-text/70" style={{ left: `${base * 100}%` }} title={`All: ${pct(base)}`} />
            </div>
            <p className="font-mono text-[15px] tabular-nums text-text md:text-right">
              {thin ? <span className="text-muted">too few</span> : pct(g.rate)}
              <span className="block text-[12px] text-muted">{thin ? `n = ${g.n}` : `${pct(g.lo)} – ${pct(g.hi)}`}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function Accuracy() {
  const [r, setR] = useState<R | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/accuracy")
      .then((x) => x.json())
      .then((j: R) => (j.error ? setErr(j.error) : setR(j)))
      .catch(() => setErr("The study did not load. Try again in a minute."));
  }, []);

  const base = r?.pools.groups.find((g) => g.id === "all")?.rate ?? 0;

  return (
    <div className="space-y-14">
      {err && <p className="rounded-2xl border border-flesh/40 p-5 text-[14px] text-flesh">{err}</p>}
      {!r && !err && <p className="caret font-mono text-[13px] text-muted">Reading the index</p>}

      {r && (
        <>
          <section className="grid gap-px overflow-hidden rounded-[24px] border border-line bg-line sm:grid-cols-3">
            {[
              ["Funded pools tracked", fmt(r.pools.known), `of ${fmt(r.pools.pools)} pools read`],
              ["Drained since tracked", fmt(r.pools.drained), "seen with liquidity, later without"],
              ["Study", r.pools.ready ? "Reporting" : "Collecting", r.pools.ready ? "enough drains on record to compare" : `results start at ${fmt(50)} drains on record`],
            ].map(([k, v, s]) => (
              <div key={k} className="bg-[#0d0d0d] p-6">
                <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">{k}</p>
                <p className="mt-2 font-display text-5xl leading-none text-text">{v}</p>
                <p className="mt-2 text-[13px] text-muted">{s}</p>
              </div>
            ))}
          </section>

          {r.pools.ready ? (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-4">
                <h2 className="font-display text-3xl tracking-tight">Funded pools, by what their launcher had done before</h2>
                <p className="font-mono text-[12px] text-muted">{`bar: drained share · band: ${95}% interval · line: all pools`}</p>
              </div>
              <Bars groups={r.pools.groups} base={base} />
            </section>
          ) : (
            <section className="rounded-[20px] border border-[#f2c46d]/30 bg-[#f2c46d]/[0.04] p-6">
              <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#f2c46d]">Collecting, not concluding</p>
              <h2 className="mt-2 text-[22px] font-semibold tracking-tight">The record of drains starts now, so the comparison waits.</h2>
              <p className="mt-3 max-w-3xl text-[14.5px] leading-relaxed text-muted">
                An earlier version of this page counted pools that never had liquidity as drained, and could not see drains in v4 pools at all. Its results compared pool types, not creators, and we withdrew them. Corbel now marks a pool drained only after it was seen with liquidity and later found without it, on V2 and v4 alike. The groups below appear as soon as enough drains are on record to say something.
              </p>
            </section>
          )}

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <h2 className="font-display text-3xl tracking-tight">How it is measured</h2>
              <ul className="mt-4 space-y-3 text-[14.5px] leading-relaxed text-muted">
                <li>A pool counts once it has been seen funded: on V2 both reserves present and the WETH or USDG side above dust; on v4 liquidity at the current price. It counts as drained when it is later found without that liquidity. A pool that never had liquidity is empty, not drained, and is left out.</li>
                <li>On v4, a price can also walk out of positions that are still there. So a v4 pool counts as drained only when its own events show the liquidity taken out; one that is merely out of range is left out.</li>
                <li>Each signal uses only what was on chain before the pool or launch it judges: earlier pools of the same launcher, drains already found before that block, tickers already used. Nothing later leaks in.</li>
                <li>{`Intervals are ${95}% Wilson intervals. Groups under ${30} are marked too few and not read as a result.`}</li>
                <li>The numbers come from the same index the token check reads, recomputed every ten minutes. The raw study is at /api/accuracy.</li>
              </ul>
            </div>
            <div>
              <h2 className="font-display text-3xl tracking-tight">What is not measured yet</h2>
              <ul className="mt-4 space-y-3 text-[14.5px] leading-relaxed text-muted">
                <li>
                  {`The Corbel Score itself. Scores were not stored before, so a score cannot be matched to an outcome. From ${r.verdicts.since ?? "today"} every check's first result of the day is kept per token (${fmt(r.verdicts.tokens)} tokens so far); a score-based study follows once those tokens are a week old.`}
                </li>
                <li>Whether a launcher with earlier drains is riskier. Drains were only started being found recently, so almost none were known before the pools that came after. This group fills in as the index keeps reading.</li>
                <li>Honeypot, tax and owner checks: they catch a trap at the moment of the check and are not drain predictions, so they are not scored here.</li>
              </ul>
            </div>
          </section>

          <p className="border-t border-line pt-5 font-mono text-[12px] text-muted">{`Study computed ${new Date(r.at).toUTCString()}. A check is not a guarantee: it reads the chain, not intent.`}</p>
        </>
      )}
    </div>
  );
}
