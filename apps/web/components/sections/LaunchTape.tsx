"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Label, cx } from "@corbel/ui";

type Row = { pool: string; kind: "v2" | "v4"; token: string; symbol: string | null; base: string | null; hooked: boolean; block: number; launches: number };
type Feed = { head: number | null; last24h: { v2: number; v4: number } | null; rows: Row[] };

const SHOW = 3;
const BLOCK_S = 1 / 9.5; // measured on 4663 (2026-11-18): ~9.5 blocks per second
const SERIAL = 20; // launches in the indexed week that make a wallet "serial"

const age = (head: number | null, block: number) => {
  if (!head) return "—";
  const s = Math.max(0, (head - block) * BLOCK_S);
  return s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86_400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86_400)}d`;
};

/** Landing "Why", left column: the real flow of new pools on the chain, one sliding in every few seconds. */
export function LaunchTape() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [at, setAt] = useState(0); // index of the newest row shown
  const [tick, setTick] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/radar")
        .then((r) => (r.ok ? r.json() : null))
        .then((j: Feed | null) => {
          if (!alive || !j?.rows?.length) return;
          setFeed(j);
          setAt(Math.min(j.rows.length - SHOW, 12)); // start a little back, so new rows can slide in
        })
        .catch(() => undefined);
    void load();
    const refresh = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    if (!feed || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let on = false;
    let id = 0;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !on) {
        on = true;
        id = window.setInterval(() => {
          setAt((a) => (a > 0 ? a - 1 : Math.min(feed.rows.length - SHOW, 12)));
          setTick((t) => t + 1);
        }, 2600);
      } else if (!e?.isIntersecting && on) {
        on = false;
        clearInterval(id);
      }
    });
    if (box.current) io.observe(box.current);
    return () => {
      io.disconnect();
      clearInterval(id);
    };
  }, [feed]);

  const rows = feed?.rows.slice(at, at + SHOW) ?? [];
  const day = feed?.last24h ? feed.last24h.v2 + feed.last24h.v4 : null;
  const serial = feed ? feed.rows.filter((r) => r.launches > SERIAL).length / Math.max(1, feed.rows.length) : null;

  return (
    <div ref={box} className="border border-line bg-surface/40">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <Label>Launching right now</Label>
        <span className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
          <span aria-hidden className={cx("h-1.5 w-1.5", feed ? "tape-led bg-leaf" : "bg-line")} />
          Robinhood Chain
        </span>
      </div>

      <ol className="relative overflow-hidden" aria-live="off">
        {feed ? (
          rows.map((r, i) => {
            const serialRow = r.launches > SERIAL;
            return (
              <li key={`${r.pool}-${i === 0 ? tick : 0}`} className={cx("grid grid-cols-[3rem_1fr_auto] items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0", i === 0 && "tape-in")}>
                <span className="font-mono text-[12px] tabular-nums text-muted">{age(feed.head, r.block)}</span>
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-mono text-xs text-text">${r.symbol ?? "?"}</span>
                    <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                      {r.kind}
                      {r.base ? ` · ${r.base}` : ""}
                      {r.hooked ? " · hook" : ""}
                    </span>
                  </span>
                  <span className={cx("mt-0.5 block font-mono text-[12px] uppercase tracking-[0.08em]", serialRow ? "text-flesh" : "text-muted")}>
                    {serialRow ? `▲ creator launched ${r.launches} this week` : r.launches > 1 ? `creator: ${r.launches} launches` : "first launch by this wallet"}
                  </span>
                </span>
                <Link href={`/app/trust/check?q=${r.token}`} className="font-mono text-[12px] uppercase tracking-[0.08em] text-leaf hover:underline">
                  Check →
                </Link>
              </li>
            );
          })
        ) : (
          <li className="px-4 py-8 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Reading the chain…</li>
        )}
      </ol>

      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line">
        <div className="bg-bg px-4 py-3">
          <dt className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Pools, last 24h</dt>
          <dd className="mt-1 font-display text-xl tabular-nums text-text">{day !== null ? day.toLocaleString("en") : "—"}</dd>
        </div>
        <div className="bg-bg px-4 py-3">
          <dt className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">From serial creators</dt>
          <dd className={cx("mt-1 font-display text-xl tabular-nums", serial ? "text-flesh" : "text-text")}>{serial !== null ? `${Math.round(serial * 100)}%` : "—"}</dd>
        </div>
      </dl>
    </div>
  );
}
