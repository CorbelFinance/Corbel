"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Idle, Instrument, Led, Meter, Verdict, short } from "./kit";
import { DRAIN_RULE, launchpadName, launchpadOf, launchpadTone } from "@corbel/config";
import { PadBoard } from "./PadBoard";

type Stats = {
  head: number;
  low: number | null;
  pools: number;
  launchers: number;
  hours: { ago: number; v2: number; v4: number }[];
  venues: { label: string; n: number }[];
  concentration: { label: string; pools: number; wallets: number }[];
  topLaunchers: { address: string; n: number; dead: number; known: number; last: number }[];
  topHooks: { address: string; n: number }[];
  liveness: { v2Known: number; v2Dead: number; v4Live: number; funded?: number; drained?: number; empty?: number };
};

// seconds per block: the rate the API measured from the chain, a recent measurement until it answers
let BLOCK_S = 1 / 8.7;
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
const ago = (head: number, block: number) => {
  const s = (head - block) * BLOCK_S;
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86_400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86_400)}d ago`;
};

/** 48 hourly columns, oldest on the left. One series (pools created), so no legend; hover or focus shows the split. */
function Hourly({ hours }: { hours: Stats["hours"] }) {
  const cols = [...hours].reverse();
  const max = Math.max(1, ...cols.map((h) => h.v2 + h.v4));
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? cols[hover]! : null;
  return (
    <div className="p-4 sm:p-5">
      <div className="mb-3 flex min-h-5 items-baseline justify-between gap-4 font-medium text-[13px] uppercase tracking-[0.08em] text-muted">
        <span>Pools created per hour</span>
        <span aria-live="polite" className="text-text">
          {h ? `${h.ago === 0 ? "This hour" : `${h.ago}h ago`} · ${h.v2 + h.v4} pools (${h.v4} v4 · ${h.v2} V2)` : `Peak ${max} / hour`}
        </span>
      </div>
      <div className="relative h-44" onMouseLeave={() => setHover(null)}>
        {/* recessive guides at max and half */}
        <div aria-hidden className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
        <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 border-t border-line" />
        <div className="relative flex h-full items-end gap-[2px]">
          {cols.map((c, i) => {
            const v = c.v2 + c.v4;
            return (
              <button
                key={c.ago}
                type="button"
                aria-label={`${c.ago === 0 ? "This hour" : `${c.ago} hours ago`}: ${v} pools`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="group relative flex h-full flex-1 items-end focus:outline-none"
              >
                <span
                  className={cx("block w-full transition-colors", hover === i ? "bg-text" : "bg-leaf", c.ago === 0 && hover !== i && "bg-leaf/50")}
                  style={{ height: `${Math.max(v > 0 ? 2 : 0, (v / max) * 100)}%` }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div aria-hidden className="mt-2 flex justify-between font-medium text-[13px] uppercase tracking-[0.08em] text-muted">
        <span>48h ago</span>
        <span>24h</span>
        <span>Now</span>
      </div>
      <table className="sr-only">
        <caption>Pools created per hour, last 48 hours</caption>
        <thead>
          <tr>
            <th scope="col">Hours ago</th>
            <th scope="col">v4</th>
            <th scope="col">V2</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((c) => (
            <tr key={c.ago}>
              <th scope="row">{c.ago}</th>
              <td>{c.v4}</td>
              <td>{c.v2}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Sorted horizontal bars with the value and share written next to each. */
function Bars({ rows, total, caption }: { rows: { label: string; n: number; note?: string }[]; total: number; caption: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="irow border-b border-line last:border-0">
            <th scope="row" className="w-[38%] px-4 py-2.5 text-left font-medium text-[13px] font-normal uppercase tracking-[0.06em] text-text">
              {r.label}
              {r.note && <span className="block text-[13px] normal-case tracking-normal text-muted">{r.note}</span>}
            </th>
            <td className="px-2 py-2.5">
              <span aria-hidden className="block h-2 bg-leaf" style={{ width: `${(r.n / max) * 100}%` }} />
            </td>
            <td className="w-[9.5rem] whitespace-nowrap px-4 py-2.5 text-right text-[13px] tabular-nums text-text">
              {r.n.toLocaleString("en")} <span className="text-muted">· {pct(r.n, total)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LaunchAnalytics() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/launches", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error((j as { error: string }).error);
        if (alive) {
          if ((j as { bps?: number }).bps) BLOCK_S = 1 / (j as { bps: number }).bps;
          setS(j as Stats);
          setErr(null);
        }
      } catch (e) {
        if (alive) setErr((e as Error).message || "No answer. Try again.");
      }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!s) return <Instrument code="L-01" title="Launch analytics" busy={!err} status={<Led tone={err ? "bad" : "off"} label={err ? "Index off" : "Reading"} />}>{err ? <Idle>{err}</Idle> : <Idle>Reading the index…</Idle>}</Instrument>;

  const days = s.low ? ((s.head - s.low) * BLOCK_S) / 86_400 : null;
  const serial = s.concentration.filter((c) => c.label === "21–100" || c.label === "100+");
  const serialPools = serial.reduce((a, c) => a + c.pools, 0);
  const serialWallets = serial.reduce((a, c) => a + c.wallets, 0);
  const last24 = s.hours.slice(0, 24).reduce((a, h) => a + h.v2 + h.v4, 0);

  return (
    <div className="space-y-6">
      <Verdict
        kicker="Launches · this week on Robinhood Chain"
        tone="bad"
        value={pct(s.liveness.v2Dead, s.liveness.v2Known)}
        valueLabel="of new V2 pairs that had liquidity are already drained"
        source={s.head ? `index · up to block ${Number(s.head).toLocaleString("en-US")}` : undefined}
        facts={[
          ["Pools created", s.pools.toLocaleString("en")],
          ["Last 24h", last24.toLocaleString("en")],
          ["Launch wallets", s.launchers.toLocaleString("en")],
          ["Pools per wallet", (s.pools / Math.max(1, s.launchers)).toFixed(1)],
          ["Never got liquidity", (s.liveness.empty ?? 0).toLocaleString("en")],
          ["Serial wallets", serialWallets.toLocaleString("en")],
        ]}
      >
        {`${s.liveness.v2Dead.toLocaleString("en")} of ${s.liveness.v2Known.toLocaleString("en")} new V2 pairs that had liquidity are already drained. ${(s.liveness.empty ?? 0).toLocaleString("en")} of ${s.pools.toLocaleString("en")} new pools never got any liquidity, and ${pct(serialPools, s.pools)} of all new pools come from wallets that launched more than twenty.`}
      </Verdict>
      <p className="text-[13px] leading-relaxed text-muted">{`Method (v${DRAIN_RULE.version}, since ${DRAIN_RULE.since}): ${DRAIN_RULE.text} ${DRAIN_RULE.before}`}</p>
      <Instrument
        code="L-01"
        title="Pools created, hour by hour"
        status={<Led live label={`Index #${s.head.toLocaleString("en")}`} />}
        foot={
          <>
            <span>{days ? `${days.toFixed(1)} days indexed` : "Index window"} · refreshes every minute</span>
            <span>Source: PairCreated + Initialize logs</span>
          </>
        }
      >
        <div>
          <Hourly hours={s.hours} />
        </div>
      </Instrument>

      <PadBoard />

      <div className="grid gap-6 xl:grid-cols-2">
        <Instrument code="L-02" title="Who launches" foot={<span>Pools grouped by how many their wallet launched this week</span>}>
          <Bars
            caption="Pools by launcher size"
            total={s.pools}
            rows={s.concentration.map((c) => ({ label: c.label, n: c.pools, note: `${c.wallets.toLocaleString("en")} wallet${c.wallets === 1 ? "" : "s"}` }))}
          />
        </Instrument>
        <Instrument code="L-03" title="Where they launch" foot={<span>Venue · base asset · hook</span>}>
          <Bars caption="Pools by venue" total={s.pools} rows={s.venues.slice(0, 7).map((v) => ({ label: v.label, n: v.n }))} />
        </Instrument>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Instrument code="L-04" title="Most active launchers" foot={<span>Open one to see what it holds and what it launched</span>}>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <caption className="sr-only">Wallets with the most pools this week</caption>
              <thead>
                <tr className="border-b border-line">
                  {["Wallet", "Pools", "Drained / known", "Last launch", ""].map((h, i) => (
                    <th key={i} scope="col" className="px-4 py-3 font-medium text-[13px] font-normal uppercase tracking-[0.08em] text-muted">
                      {h || <span className="sr-only">Open</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.topLaunchers.map((l) => (
                  <tr key={l.address} className="irow border-b border-line last:border-0">
                    <th scope="row" className="px-4 py-2.5 font-mono text-[13px] font-normal text-text">
                      {short(l.address)}
                    </th>
                    <td className="px-4 py-2.5">
                      <span className="text-[13px] tabular-nums text-flesh">{l.n}</span>
                      <div className="mt-1.5 w-24">
                        <Meter label={`${short(l.address)} pools, relative`} value={l.n / s.topLaunchers[0]!.n} cells={12} tone="bad" />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] tabular-nums text-muted">
                      {l.dead} / {l.known}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-muted">{ago(s.head, l.last)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/app/portfolio?address=${l.address}`} className="font-medium text-[13px] uppercase tracking-[0.08em] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Instrument>
        <Instrument code="L-05" title="Hooks in use" foot={<span>A hook runs code on every swap. Read it before you trade.</span>}>
          <ul className="divide-y divide-line">
            {s.topHooks.map((h) => (
              <li key={h.address} className="irow grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5">
                <span className="flex items-center gap-2 text-[13px]">
                  {launchpadOf(null, h.address) ? (
                    <>
                      <i className="h-2 w-2 rounded-full" style={{ background: launchpadTone(launchpadOf(null, h.address)!) }} />
                      <span className="text-text">{launchpadName(launchpadOf(null, h.address)!)}</span>
                    </>
                  ) : (
                    <span className="text-muted">Unlabelled</span>
                  )}
                  <span className="font-mono text-muted">{short(h.address)}</span>
                </span>
                <span className="text-[13px] tabular-nums text-text">
                  {h.n.toLocaleString("en")} <span className="text-muted">· {pct(h.n, s.pools)}</span>
                </span>
                <div className="col-span-2">
                  <Meter label={`Hook ${short(h.address)} share`} value={h.n / s.topHooks[0]!.n} cells={24} tone="mid" />
                </div>
              </li>
            ))}
          </ul>
        </Instrument>
      </div>
    </div>
  );
}
