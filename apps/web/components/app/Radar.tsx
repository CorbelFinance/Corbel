"use client";

import { WatchButton } from "./WatchButton";
import Link from "next/link";
import { TokenAvatar } from "./TokenAvatar";
import { useCallback, useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument, Led, Seg, short } from "./kit";
import { launchpadName, launchpadTone } from "@corbel/config";

type Row = {
  launchpad?: string | null;
  pool: string;
  kind: "v2" | "v4";
  token: string;
  symbol: string | null;
  name: string | null;
  base: "ETH" | "WETH" | "USDG" | null;
  hooked: boolean;
  block: number;
  launcher: string | null;
  launches: number;
  dead: 0 | 1 | null;
};
type Feed = { head: number | null; low: number | null; pools: number; last24h: Record<string, number> | null; rows: Row[] };

const BLOCK_S = 1 / 9.5; // measured on 4663 (2026-11-18): ~9.5 blocks per second
const REFRESH_MS = 20_000;

function age(head: number | null, block: number) {
  if (!head) return "—";
  const s = Math.max(0, (head - block) * BLOCK_S);
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86_400)}d`;
}

/** The one thing that decides a new pool, with its number. Drained beats everything; then a serial launcher. */
function signal(r: Row): { k: string; v: string; tone: "bad" | "good" | "plain" } {
  if (r.dead === 1) return { k: "Liquidity pulled", v: r.launcher ? `by ${short(r.launcher)}` : "pool emptied", tone: "bad" };
  if (r.launcher && r.launches > 5) return { k: `${r.launches} launches by this wallet`, v: short(r.launcher), tone: "bad" };
  if (r.launcher && r.launches > 1) return { k: `${r.launches} launches by this wallet`, v: short(r.launcher), tone: "plain" };
  if (r.launcher) return { k: "First launch of this wallet", v: short(r.launcher), tone: r.dead === 0 ? "good" : "plain" };
  return { k: r.kind === "v4" ? "Launcher not indexed yet" : "Checking the launcher", v: r.dead === 0 ? "pool live" : "—", tone: "plain" };
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "v4", label: "v4" },
  { id: "v2", label: "V2" },
] as const;

/** New pools from the local index. The browser only talks to /api/radar. */
export function Radar() {
  const [kind, setKind] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [hideDead, setHideDead] = useState(true);
  const [find, setFind] = useState("");
  const [feed, setFeed] = useState<Feed | null>(null);
  const [older, setOlder] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (k: string, before?: number) => {
    const qs = new URLSearchParams({ limit: "40" });
    if (k !== "all") qs.set("kind", k);
    if (before) qs.set("before", String(before));
    const r = await fetch(`/api/radar?${qs}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error((j as { error: string }).error);
    return j as Feed;
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const f = await load(kind);
        if (alive) {
          setFeed(f);
          setError(null);
        }
      } catch (e) {
        if (alive) setError((e as Error).message || "No answer. Try again.");
      }
    };
    void Promise.resolve().then(() => {
      setOlder([]);
      void tick();
    });
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [kind, load]);

  async function more() {
    const all = [...(feed?.rows ?? []), ...older];
    const last = all.at(-1);
    if (!last) return;
    setBusy(true);
    try {
      const f = await load(kind, last.block);
      setOlder((o) => [...o, ...f.rows]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const needle = find.trim().toLowerCase();
  const all = [...(feed?.rows ?? []), ...older].filter((r) => !(hideDead && r.dead === 1));
  const rows = needle ? all.filter((r) => [r.symbol, r.name, r.token, r.launcher].some((v) => v?.toLowerCase().includes(needle))) : all;
  const day = feed?.last24h;

  return (
    <Instrument
      code="R-01"
      title="New pools"
      busy={!feed && !error}
      status={
        <>
          <Seg label="Pool type" value={kind} options={FILTERS} onChange={setKind} />
          <label className="flex cursor-pointer items-center gap-2 font-medium text-[13px] uppercase tracking-[0.08em] text-muted">
            <input type="checkbox" checked={hideDead} onChange={(e) => setHideDead(e.target.checked)} className="accent-[var(--ui)]" />
            Hide drained
          </label>
          <Led tone={error ? "bad" : "on"} live={!error} label={error ? "Paused" : `Live · ${REFRESH_MS / 1000}s`} />
        </>
      }
      foot={
        <>
          <span>Ages from block height · ×N = pools from the same wallet this week</span>
          <button type="button" onClick={more} disabled={busy || !feed} className="ibtn-ghost">
            {busy ? "Loading…" : "Older"}
          </button>
        </>
      }
    >
      <p className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line px-4 py-2.5 text-[14px] tabular-nums">
        {(
          [
            ["Pools indexed", feed ? feed.pools.toLocaleString("en") : null],
            ["New v4, 24h", day ? (day.v4 ?? 0).toLocaleString("en") : null],
            ["New V2, 24h", day ? (day.v2 ?? 0).toLocaleString("en") : null],
            ["Index head", feed?.head ? `#${feed.head.toLocaleString("en")}` : null],
          ] as const
        ).map(([k, v]) => (
          <span key={k}>
            <span className="text-muted">{k}</span>{" "}
            {v ? <span className="text-text">{v}</span> : <span aria-hidden className="inline-block h-3 w-12 rounded bg-[#181818] align-middle" />}
          </span>
        ))}
      </p>

      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <label htmlFor="radar-find" className="font-medium text-[13px] uppercase tracking-[0.08em] text-muted">
          Find
        </label>
        <input id="radar-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="symbol, name, token or wallet" autoComplete="off" spellCheck={false} maxLength={64} className="h-8 min-w-0 flex-1 border border-line bg-transparent px-3 font-mono text-[13px] text-text placeholder:text-muted sm:max-w-sm" />
        <span className="ml-auto font-medium text-[13px] uppercase tracking-[0.08em] text-muted">
          {needle ? `${rows.length} of ${all.length} loaded` : `${all.length} loaded`}
        </span>
      </div>

      {error && <p className="border-b border-line bg-flesh-deep/50 px-4 py-3 text-sm text-text">{error}</p>}

      <div tabIndex={0} role="region" aria-label="Pool list, scrollable" className="relative max-h-[min(34rem,68vh)] overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <caption className="sr-only">New pools on Robinhood Chain, newest first</caption>
          <thead>
            <tr className="sticky top-0 z-10 border-b border-line bg-[color-mix(in_srgb,var(--surface)_96%,var(--bg))]">
              {["Age", "Token", "Pool", "Signal", ""].map((h, i) => (
                <th key={i} scope="col" className="px-4 py-3 font-medium text-[13px] font-normal uppercase tracking-[0.08em] text-muted">
                  {h || <span className="sr-only">Action</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!feed && !error && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center font-medium text-[13px] uppercase tracking-[0.08em] text-muted">
                  Reading the index…
                </td>
              </tr>
            )}
            {feed && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center font-medium text-[13px] uppercase tracking-[0.08em] text-muted">
                  No pools in this view.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.pool} className="irow border-b border-line last:border-0">
                <td className="px-4 py-3 text-[13px] tabular-nums text-muted" title={`Block ${r.block}`}>
                  {age(feed?.head ?? null, r.block)}
                </td>
                <th scope="row" className="px-4 py-3 font-normal">
                  <span className="flex items-center gap-3">
                  <TokenAvatar address={r.token} symbol={r.symbol} size={30} />
                  <span className="min-w-0">
                  <span className="block max-w-[14rem] truncate font-mono text-text">{r.symbol ?? "no symbol"}</span>
                  <span className="block max-w-[14rem] truncate text-[13px] text-muted">
                    {r.name ? `${r.name} · ` : ""}
                    {short(r.token)}
                  </span>
                  </span>
                  </span>
                </th>
                <td className="px-4 py-3 font-mono text-[13px] text-muted">
                  {r.launchpad ? (
                    <span className="mb-1 flex items-center gap-1.5 text-[13px] text-text">
                      <i className="h-2 w-2 rounded-full" style={{ background: launchpadTone(r.launchpad) }} />
                      {launchpadName(r.launchpad)}
                    </span>
                  ) : (
                    r.hooked && <span className="mb-1 block text-[13px] text-muted">Unlabelled hook</span>
                  )}
                  {r.kind === "v4" ? "v4" : "V2"} · {r.base ?? "other"}
                </td>
                <td className="px-4 py-3">
                  {/* one sentence that decides, and its number: what a buyer needs before Check */}
                  {(() => {
                    const sig = signal(r);
                    return (
                      <span className="block max-w-[17rem]">
                        <span className={cx("block text-[14px] font-medium", sig.tone === "bad" ? "text-flesh" : sig.tone === "good" ? "text-leaf" : "text-text")}>{sig.k}</span>
                        <span className="block font-mono text-[13px] text-muted">
                          {r.launcher ? (
                            <Link href={`/app/portfolio?address=${r.launcher}`} className="hover:underline">{sig.v}</Link>
                          ) : (
                            sig.v
                          )}
                        </span>
                      </span>
                    );
                  })()}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <WatchButton kind="token" value={r.token} label={r.symbol ?? ""} className="mr-3" />
                  <Link href={`/app/trade/terminal?token=${r.token}`} className="mr-3 font-medium text-[13px] uppercase tracking-[0.08em] text-muted hover:text-leaf">
                    Chart
                  </Link>
                  <Link href={`/app/trust/check?q=${r.token}`} className="ibtn-ghost">
                    Check →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Instrument>
  );
}
