"use client";

/**
 * The token's activity in one list: swaps and liquidity added to or pulled from the pool, newest first, each with the
 * wallet that signed it and what that wallet is: the token's developer, a whale, a sniper or a bot, by rules stated
 * under the list. Filters keep one kind. The signer is known for the newest swaps; older rows show the pool's
 * counterparty (often a router) without labels.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { cx } from "@corbel/ui";

type Trade = { block: number; t: number; side: "buy" | "sell"; price: number; token: number; base: number; tx: string; who: string; from?: string };
type Lp = { block: number; t: number; kind: "add" | "remove"; token: number | null; base: number | null; tx: string; from?: string };
type Live = {
  token: { symbol: string };
  base: { symbol: string; usd: number };
  trades: Trade[];
  lp: Lp[];
  dev?: { address: string } | null;
  all?: { created?: number | null } | null;
};
type Tag = "dev" | "whale" | "sniper" | "bot";
type Row =
  | { kind: "swap"; t: number; side: "buy" | "sell"; token: number; base: number; usd: number; tx: string; wallet: string | null; tags: Tag[] }
  | { kind: "add" | "remove"; t: number; token: number | null; base: number | null; usd: number | null; tx: string; wallet: string | null; tags: Tag[] };

const WHALE_SWAP = 1_000;
const WHALE_TOTAL = 5_000;
const SNIPE_S = 120;
const BOT_SWAPS = 50;
const BOT_GAP_S = 60;

const TAG: Record<Tag, { label: string; cls: string }> = {
  dev: { label: "Dev", cls: "border-[#cf7e55]/60 text-[#e7a07a]" },
  whale: { label: "Whale", cls: "border-[#4fbfd3]/60 text-[#7fd3e2]" },
  sniper: { label: "Sniper", cls: "border-[#d9a441]/60 text-[#e7c27a]" },
  bot: { label: "Bot", cls: "border-line text-muted" },
};
const FILTERS = [
  { id: "all", label: "All" },
  { id: "swaps", label: "Swaps" },
  { id: "liquidity", label: "Liquidity" },
  { id: "dev", label: "Dev" },
  { id: "whale", label: "Whales" },
  { id: "sniper", label: "Snipers" },
  { id: "bot", label: "Bots" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const num = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v >= 1 ? v.toFixed(2) : v.toPrecision(3));
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(2)}`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ago = (t: number, now: number) => {
  const s = Math.max(0, Math.round(now - t));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86_400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86_400)}d`;
};

export function TerminalFeed({ live, now }: { live: Live; now: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const k = live.base.usd || 1;
  const rows = useMemo<Row[]>(() => {
    const dev = live.dev?.address?.toLowerCase() ?? null;
    const createdRaw = live.all?.created ?? null;
    const created = createdRaw ? (createdRaw > 1e12 ? createdRaw / 1000 : createdRaw) : null;
    // per signing wallet: how much and how often it traded in this window
    const by = new Map<string, { usd: number; ts: number[] }>();
    for (const x of live.trades)
      if (x.from) {
        const s = by.get(x.from) ?? { usd: 0, ts: [] };
        s.usd += x.base * k;
        s.ts.push(x.t);
        by.set(x.from, s);
      }
    const botty = new Set<string>();
    for (const [w, s] of by) {
      const ts = [...s.ts].sort((a, b) => a - b);
      const gaps = ts.slice(1).map((t, i) => t - ts[i]!).sort((a, b) => a - b);
      const median = gaps.length ? gaps[Math.floor(gaps.length / 2)]! : Infinity;
      if (ts.length > BOT_SWAPS || (ts.length >= 5 && median < BOT_GAP_S)) botty.add(w);
    }
    const tagsOf = (w: string | null, swapUsd: number, t: number, buy: boolean): Tag[] => {
      if (!w) return [];
      const out: Tag[] = [];
      if (dev && w === dev) out.push("dev");
      if (swapUsd >= WHALE_SWAP || (by.get(w)?.usd ?? 0) >= WHALE_TOTAL) out.push("whale");
      if (buy && created && t - created >= 0 && t - created <= SNIPE_S) out.push("sniper");
      if (botty.has(w)) out.push("bot");
      return out;
    };
    const swaps: Row[] = live.trades.map((x) => {
      const u = x.base * k;
      return { kind: "swap", t: x.t, side: x.side, token: x.token, base: x.base, usd: u, tx: x.tx, wallet: x.from ?? null, tags: tagsOf(x.from ?? null, u, x.t, x.side === "buy") };
    });
    const moves: Row[] = live.lp.map((e) => {
      const u = e.base != null ? e.base * k * 2 : null;
      return { kind: e.kind, t: e.t, token: e.token, base: e.base, usd: u, tx: e.tx, wallet: e.from ?? null, tags: tagsOf(e.from ?? null, u ?? 0, e.t, false) };
    });
    return [...swaps, ...moves].sort((a, b) => b.t - a.t);
  }, [live, k]);

  const shown = rows
    .filter((r) => (filter === "all" ? true : filter === "swaps" ? r.kind === "swap" : filter === "liquidity" ? r.kind !== "swap" : r.tags.includes(filter)))
    .slice(0, 200);
  const count = (f: Filter) => (f === "all" ? rows.length : f === "swaps" ? rows.filter((r) => r.kind === "swap").length : f === "liquidity" ? rows.filter((r) => r.kind !== "swap").length : rows.filter((r) => r.tags.includes(f)).length);

  return (
    <div>
      <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5">
        {FILTERS.map((f) => {
          const n = count(f.id);
          return (
            <button key={f.id} type="button" aria-pressed={filter === f.id} disabled={n === 0 && f.id !== "all"} onClick={() => setFilter(f.id)} className={cx("rounded-full border px-2.5 py-0.5 font-mono text-[12px] disabled:opacity-35", filter === f.id ? "border-leaf/60 text-text" : "border-line text-muted hover:text-text")}>
              {f.label} <span className="text-muted">{n}</span>
            </button>
          );
        })}
      </div>
      <div tabIndex={0} role="region" aria-label="Activity, scrollable" className="max-h-[42rem] overflow-auto overscroll-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="sticky top-0 border-b border-line bg-[color-mix(in_srgb,var(--surface)_96%,var(--bg))]">
              {["Age", "Type", "Wallet", live.token.symbol, live.base.symbol, "USD", "Tx"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2.5 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.kind + r.tx + r.t + (r.token ?? 0)} className="border-b border-line/50 font-mono text-xs">
                <td className="px-3 py-2 text-muted">{ago(r.t, now)}</td>
                <td className={cx("px-3 py-2", r.kind === "swap" ? (r.side === "buy" ? "text-leaf" : "text-flesh") : r.kind === "add" ? "text-[#7fd3e2]" : "text-[#e7a07a]")}>
                  {r.kind === "swap" ? (r.side === "buy" ? "Buy" : "Sell") : r.kind === "add" ? "Added to pool" : "Pulled from pool"}
                </td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {r.wallet ? (
                      <Link href={`/app/portfolio?address=${r.wallet}`} className="text-text hover:underline">
                        {short(r.wallet)}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                    {r.tags.map((t) => (
                      <span key={t} className={cx("rounded border px-1 text-[11px]", TAG[t].cls)}>
                        {TAG[t].label}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="px-3 py-2 text-text">{r.token != null ? num(r.token) : "—"}</td>
                <td className="px-3 py-2 text-muted">{r.base != null ? num(r.base) : "—"}</td>
                <td className={cx("px-3 py-2", r.kind === "swap" ? (r.side === "buy" ? "text-leaf" : "text-flesh") : "text-text")}>{r.usd != null ? usd(r.usd) : "range"}</td>
                <td className="px-3 py-2 text-muted">{short(r.tx)}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                  Nothing of this kind in this window
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-[12px] text-muted">
        {`The wallet is the one that signed, read for the newest ${Math.min(150, live.trades.length)} swaps; older rows show no wallet, since the pool only sees a router. Whale: a swap of $${(WHALE_SWAP / 1000).toFixed(0)}K or $${(WHALE_TOTAL / 1000).toFixed(0)}K in the window. Sniper: bought within ${SNIPE_S / 60} minutes of the pool opening. Bot: more than ${BOT_SWAPS} swaps, or under ${BOT_GAP_S} s apart on median. Liquidity in a v4 range shows no amounts.`}
      </p>
    </div>
  );
}
