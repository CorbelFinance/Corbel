"use client";

/**
 * Landing band under the hero: Robinhood Chain right now, from Corbel's own index. A strip of running counts (launches
 * read, launches today, pools read, pools found drained) over a moving tape of real events: a token launched on a
 * launchpad, a launch that reached a DEX pool, a pool found drained, and the tokens checked most today. Each event
 * opens the token check. Until the index answers, the strip shows the verified facts it had before (fallback).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Marquee } from "@corbel/ui/motion";

type Ev = { kind: "launch" | "listed" | "drained"; token: string; symbol: string | null; pad: string | null; block: number };
type Pulse = { head: number | null; counts: { launches: number; launches24h: number; pools: number; drained: number; checked: number }; events: Ev[]; checks: { token: string; symbol: string | null; n: number }[] };

const BLOCK_S = 1 / 9.5; // about 9.5 blocks a second on Robinhood Chain
const KIND = {
  launch: { label: "Launched", cls: "text-leaf", dot: "bg-leaf" },
  listed: { label: "On a DEX", cls: "text-[#6cc0d0]", dot: "bg-[#6cc0d0]" },
  drained: { label: "Drained", cls: "text-flesh", dot: "bg-flesh" },
} as const;
const ago = (head: number | null, block: number) => {
  if (!head) return "";
  const s = Math.max(0, (head - block) * BLOCK_S);
  return s < 60 ? `${Math.round(s)}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86_400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86_400)}d ago`;
};
const fmt = (n: number) => n.toLocaleString("en-US");
const sym = (e: { symbol: string | null; token: string }) => (e.symbol ? `$${e.symbol.slice(0, 14)}` : `${e.token.slice(0, 6)}…${e.token.slice(-4)}`);

export function LivePulse({ fallback }: { fallback: string[] }) {
  const [p, setP] = useState<Pulse | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/pulse")
        .then((r) => (r.ok ? r.json() : null))
        .then((j: Pulse | null) => alive && j?.events && setP(j))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const counts = p?.counts;
  const stats: [string, string][] = counts
    ? [
        ["Launches read", fmt(counts.launches)],
        ["Launched in 24 h", fmt(counts.launches24h)],
        ["Pools read", fmt(counts.pools)],
        ["Drained, tracked", `${fmt(counts.drained)} of ${fmt(counts.checked)}`],
      ]
    : [];

  return (
    <div data-chain-mask="" className="border-y border-line bg-surface/40">
      {counts && (
        <div className="mx-auto grid max-w-page grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-5">
          <p className="flex items-center gap-2 bg-bg px-4 py-3 font-mono text-[12px] uppercase tracking-[0.1em] text-leaf sm:px-6">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-leaf" />
            Robinhood Chain, live
          </p>
          {stats.map(([k, v]) => (
            <p key={k} className="bg-bg px-4 py-3 sm:px-6">
              <span className="block font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{k}</span>
              <span className="mt-0.5 block font-mono text-[15px] tabular-nums text-text">{v}</span>
            </p>
          ))}
        </div>
      )}
      <div className="py-3.5">
        <Marquee speed={70}>
          {p
            ? [
                ...p.events.map((e) => (
                  <Link key={`${e.kind}${e.token}${e.block}`} href={`/app/trust/check?q=${e.token}`} className="group flex items-center gap-2.5 pr-8 font-mono text-[12.5px] text-muted">
                    <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", KIND[e.kind].dot)} />
                    <span className={cx("uppercase tracking-[0.08em]", KIND[e.kind].cls)}>{KIND[e.kind].label}</span>
                    <span className="text-text group-hover:underline">{sym(e)}</span>
                    {e.pad && <span>on {e.pad}</span>}
                    <span className="text-[#6f7a74]">{ago(p.head, e.block)}</span>
                  </Link>
                )),
                ...p.checks.map((c) => (
                  <Link key={`c${c.token}`} href={`/app/trust/check?q=${c.token}`} className="group flex items-center gap-2.5 pr-8 font-mono text-[12.5px] text-muted">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#c9a4ff]" />
                    <span className="uppercase tracking-[0.08em] text-[#c9a4ff]">Checked</span>
                    <span className="text-text group-hover:underline">{sym(c)}</span>
                    <span>{`${c.n}× today`}</span>
                  </Link>
                )),
              ]
            : fallback.map((it) => (
                <span key={it} className="flex items-center gap-6 pr-6 font-mono text-xs uppercase tracking-[0.08em] text-muted">
                  <span aria-hidden className="h-1.5 w-1.5 bg-leaf" />
                  {it}
                </span>
              ))}
        </Marquee>
      </div>
    </div>
  );
}
