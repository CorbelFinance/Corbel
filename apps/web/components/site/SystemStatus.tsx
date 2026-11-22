"use client";

import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";

type Probe = { name: string; path: string; what: string };
type Result = { ok: boolean; status: number; ms: number; detail: string };

const PROBES: Probe[] = [
  { name: "Chain reads", path: "/api/net", what: "latest block and gas" },
  { name: "Pool index", path: "/api/radar", what: "newest pools" },
  { name: "Launch analytics", path: "/api/launches", what: "the indexed week" },
  { name: "Stock desk", path: "/api/stocks", what: "issuer tokens, prices" },
  { name: "Mandate lab", path: "/api/mandate", what: "attack scenarios" },
  { name: "Sign-in", path: "/api/auth/me", what: "session check" },
];
const BLOCK_S = 1 / 9.5; // measured on 4663 (2026-11-18): ~9.5 blocks per second
const EVERY = 15_000;

/** Status page: live health of every read-only service, measured from this browser. */
export function SystemStatus() {
  const [res, setRes] = useState<Record<string, Result>>({});
  const [chain, setChain] = useState<number | null>(null);
  const [index, setIndex] = useState<{ head: number; pools: number } | null>(null);
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const out: Record<string, Result> = {};
      await Promise.all(
        PROBES.map(async (pr) => {
          const t = performance.now();
          try {
            const r = await fetch(pr.path, { cache: "no-store" });
            const ms = Math.round(performance.now() - t);
            const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
            let detail = "";
            if (pr.path === "/api/net" && j?.block) {
              detail = `block #${Number(j.block).toLocaleString("en")}`;
              if (alive) setChain(Number(j.block));
            }
            if (pr.path === "/api/radar" && j?.head) {
              detail = `${Number(j.pools).toLocaleString("en")} pools`;
              if (alive) setIndex({ head: Number(j.head), pools: Number(j.pools) });
            }
            if (pr.path === "/api/launches" && j?.launchers) detail = `${Number(j.launchers).toLocaleString("en")} launch wallets`;
            if (pr.path === "/api/stocks") detail = r.status === 202 ? "warming up" : Array.isArray(j?.rows) ? `${(j.rows as unknown[]).length} issuer tokens` : "";
            if (pr.path === "/api/mandate" && Array.isArray(j?.scenarios)) detail = `${(j.scenarios as unknown[]).length} scenarios`;
            if (pr.path === "/api/auth/me") detail = j?.address ? "signed in" : "not signed in";
            out[pr.path] = { ok: r.ok || r.status === 202, status: r.status, ms, detail: detail || (j && typeof j.error === "string" ? j.error : "") };
          } catch {
            out[pr.path] = { ok: false, status: 0, ms: Math.round(performance.now() - t), detail: "no answer" };
          }
          // each row updates as soon as its service answers; slow ones do not hold the rest
          if (alive) setRes((m) => ({ ...m, [pr.path]: out[pr.path]! }));
        }),
      );
      if (alive) setAt(Date.now());
    };
    void run();
    const id = setInterval(run, EVERY);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const lag = chain !== null && index ? Math.max(0, chain - index.head) : null;
  const up = Object.values(res).filter((r) => r.ok).length;

  return (
    <div className="inst">
      <span aria-hidden className="inst-sq tl" />
      <span aria-hidden className="inst-sq tr" />
      <span aria-hidden className="inst-sq bl" />
      <span aria-hidden className="inst-sq br" />
      <header className="inst-head">
        <span className="inst-code">[S-01]</span>
        <span className="inst-title">System</span>
        <span className="ml-auto inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
          <span aria-hidden className="led" data-tone={at && up === PROBES.length ? "on" : at ? "bad" : "off"} data-live={at ? "true" : "false"} />
          {at ? `${up} / ${PROBES.length} up · checked ${new Date(at).toLocaleTimeString("en-GB")}` : "checking"}
        </span>
      </header>

      <div className="grid gap-px bg-line sm:grid-cols-4">
        {[
          ["Chain head", chain !== null ? `#${chain.toLocaleString("en")}` : "—", "Robinhood Chain"],
          ["Index head", index ? `#${index.head.toLocaleString("en")}` : "—", "our pool index"],
          ["Index lag", lag !== null ? `${lag.toLocaleString("en")} blocks` : "—", lag !== null ? `≈ ${Math.round(lag * BLOCK_S)} s behind` : "chain minus index"],
          ["Pools indexed", index ? index.pools.toLocaleString("en") : "—", "the indexed week"],
        ].map(([k, v, s]) => (
          <div key={k} className="bg-bg p-4 sm:p-5">
            <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{k}</p>
            <p className={cx("mt-2.5 font-display text-xl tabular-nums sm:text-2xl", k === "Index lag" && lag !== null && lag > 2400 ? "text-flesh" : "text-text")}>{v}</p>
            <p className="mt-1.5 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{s}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <caption className="sr-only">Service health, measured from this browser</caption>
          <thead>
            <tr className="border-b border-line">
              {["Service", "Endpoint", "State", "Latency", "Detail"].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-mono text-[12px] font-normal uppercase tracking-[0.08em] text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PROBES.map((pr) => {
              const r = res[pr.path];
              return (
                <tr key={pr.path} className="irow border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-3 font-normal text-text">
                    {pr.name}
                    <span className="block font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{pr.what}</span>
                  </th>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{pr.path}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em]">
                      <span aria-hidden className="led" data-tone={!r ? "off" : r.ok ? "on" : "bad"} />
                      <span className={!r ? "text-muted" : r.ok ? "text-leaf" : "text-flesh"}>{!r ? "…" : r.ok ? (r.status === 202 ? "warming" : "up") : `down ${r.status || ""}`}</span>
                    </span>
                  </td>
                  <td className={cx("px-4 py-3 font-mono text-xs tabular-nums", r && r.ms > 4000 ? "text-flesh" : "text-text")}>{r ? `${r.ms} ms` : "—"}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-muted">{r?.detail || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="inst-foot">
        <span>Measured from your browser every 15 s. Trust checks and quotes run on demand and are not polled here.</span>
      </footer>
    </div>
  );
}
