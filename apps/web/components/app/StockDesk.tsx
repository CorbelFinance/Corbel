"use client";

import { WatchButton } from "./WatchButton";
import { TokenAvatar } from "./TokenAvatar";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { Idle, Meter, Seg, Verdict, fmtNum, short } from "./kit";

type Row = { address: string; symbol: string; name: string; pools: number; price: number | null; via: string[]; keep10: number | null; market?: { price: number | null; liquidity: number; volume: number; change: number | null } | null };
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
type Lookalike = { address: string; symbol: string; name: string; pools: number };
type Desk = { block: string; at: number; rows: Row[]; lookalikes: Lookalike[]; checked: number; ms: number; stale?: boolean };

const SORTS = [
  { id: "pools", label: "Volume" },
  { id: "price", label: "Price" },
  { id: "az", label: "A–Z" },
] as const;
type SortId = (typeof SORTS)[number]["id"];
const SHOWS = [
  { id: "all", label: "All" },
  { id: "real", label: "Originals" },
  { id: "fake", label: "Lookalikes" },
] as const;
type ShowId = (typeof SHOWS)[number]["id"];

/** NYSE regular session from the clock alone (no holiday calendar). */
function session(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  if (p.weekday === "Sat" || p.weekday === "Sun") return { id: "weekend", label: "Weekend", note: "No mint or burn: tokens float free" } as const;
  const m = Number(p.hour) * 60 + Number(p.minute);
  if (m >= 570 && m < 960) return { id: "open", label: "Market open", note: "Regular session, New York" } as const;
  if (m >= 240 && m < 1200) return { id: "extended", label: "Extended hours", note: "Pre-market or after-hours" } as const;
  return { id: "closed", label: "Market closed", note: "Overnight, New York" } as const;
}

const ago = (at: number) => {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
};

/**
 * Stocks → Stock tokens: is this one real? A verdict first (how many carry the issuer code, how many copy them), then
 * one table: each issuer token with its chain price, volume, liquidity and depth, and right under it any lookalike
 * that copies its name, marked with the reason. Colour is meaning: green issuer code, red lookalike, tickers neutral.
 */
export function StockDesk() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortId>("pools");
  const [show, setShow] = useState<ShowId>("all");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await fetch("/api/stocks");
        const j = (await r.json()) as Desk & { warming?: boolean; error?: string };
        if (!alive) return;
        if (r.status === 202) timer = setTimeout(load, 6000);
        else if (j.error) setErr(j.error);
        else {
          setDesk(j);
          setErr(null);
          timer = setTimeout(load, 180_000);
        }
      } catch {
        if (alive) setErr("No answer. Try again.");
      }
    };
    void load();
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (desk?.rows ?? []).filter((r) => !s || r.symbol.toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || r.address.toLowerCase() === s);
    if (sort === "az") return [...list].sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (sort === "price") return [...list].sort((a, b) => (b.market?.price ?? b.price ?? -1) - (a.market?.price ?? a.price ?? -1));
    return list;
  }, [desk, q, sort]);

  const sess = session(now);
  const priced = desk?.rows.filter((r) => r.price !== null).length ?? 0;
  // each lookalike sits right under the issuer token it copies (same ticker, ignoring a trailing x); the rest at the end
  const base = (s: string) => s.toUpperCase().replace(/X$/, "");
  const fakes = new Map<string, Lookalike[]>();
  for (const l of desk?.lookalikes ?? []) fakes.set(base(l.symbol), [...(fakes.get(base(l.symbol)) ?? []), l]);
  const shown = rows.flatMap((r) => [{ kind: "real" as const, r }, ...(show !== "real" ? (fakes.get(base(r.symbol)) ?? []).map((l) => ({ kind: "fake" as const, l, of: r.symbol })) : [])]);
  const matched = new Set(rows.flatMap((r) => (fakes.get(base(r.symbol)) ?? []).map((l) => l.address)));
  const orphans = show === "real" ? [] : (desk?.lookalikes ?? []).filter((l) => !matched.has(l.address) && (!q.trim() || l.symbol.toLowerCase().includes(q.trim().toLowerCase()) || l.name.toLowerCase().includes(q.trim().toLowerCase())));
  const list = show === "fake" ? [...shown.filter((x) => x.kind === "fake"), ...orphans.map((l) => ({ kind: "fake" as const, l, of: null as string | null }))] : [...shown, ...orphans.map((l) => ({ kind: "fake" as const, l, of: null as string | null }))];

  return (
    <div className="mx-auto max-w-[76rem] space-y-6">
      {desk ? (
        <Verdict
          kicker="Stock tokens · is it the real one"
          tone={desk.lookalikes.length ? "caution" : "good"}
          value={desk.lookalikes.length}
          valueLabel="lookalikes copy an issuer token's name"
          facts={[
            ["Issuer tokens", desk.rows.length],
            ["Priced now", priced],
            ["Session", sess.label],
            ["Block", `#${Number(desk.block).toLocaleString("en")}`],
          ]}
        >
          {desk.lookalikes.length
            ? `${desk.rows.length} stock tokens carry the issuer's code. ${desk.lookalikes.length} more copy their names: each is marked right under the token it copies.`
            : `${desk.rows.length} stock tokens carry the issuer's code, and no copy of their names trades right now.`}
        </Verdict>
      ) : (
        <div className="h-44 overflow-hidden rounded-2xl border border-line bg-[#0e0e0e] p-8">
          <span aria-hidden className="block h-3 w-40 rounded bg-[#181818]" />
          <span aria-hidden className="mt-5 block h-8 w-[60%] rounded bg-[#181818]" />
          <span aria-hidden className="mt-3 block h-8 w-[40%] rounded bg-[#181818]" />
          <span className="sr-only">Reading the stock tokens</span>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <label className="sr-only" htmlFor="desk-q">
            Filter by ticker, name or address
          </label>
          <input id="desk-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter: NVDA, Apple, 0x…" className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-[14px] text-text placeholder:text-muted focus:border-ui/60 focus:outline-none" />
          <Seg label="Show" value={show} options={SHOWS} onChange={setShow} />
          <Seg label="Sort" value={sort} options={SORTS} onChange={setSort} />
        </div>
        {err ? (
          <Idle>{err}</Idle>
        ) : !desk ? (
          <ul aria-hidden className="divide-y divide-line">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="grid grid-cols-[2.4rem_minmax(0,1fr)_7rem_7rem_7rem_8rem] items-center gap-4 px-4 py-3">
                <span className="h-8 w-8 rounded-full bg-[#181818]" />
                <span className="h-3.5 w-48 rounded bg-[#181818]" />
                <span className="h-3.5 rounded bg-[#181818]" />
                <span className="h-3.5 rounded bg-[#181818]" />
                <span className="h-3.5 rounded bg-[#181818]" />
                <span className="h-5 rounded-full bg-[#181818]" />
              </li>
            ))}
          </ul>
        ) : (
          <div className="relative max-h-[720px] overflow-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-[14px]">
              <caption className="sr-only">Issuer stock tokens and their lookalikes, with chain prices in USDG</caption>
              <thead className="sticky top-0 z-10 bg-[#0e0e0e]">
                <tr className="border-b border-line text-[12px] text-muted">
                  {["Token", "Status", "Price", "24h volume", "Liquidity", "Sell ten keeps", "Pools", ""].map((h, i) => (
                    <th key={i} scope="col" className={cx("px-4 py-3 font-medium", i >= 2 && i <= 4 && "text-right")}>
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((x) =>
                  x.kind === "real" ? (
                    <tr key={x.r.address} className="irow border-b border-line">
                      <th scope="row" className="px-4 py-3 font-normal">
                        <span className="flex items-center gap-3">
                          <TokenAvatar address={x.r.address} symbol={x.r.symbol} stock size={30} />
                          <span className="min-w-0">
                            <span className="font-mono text-[14px] font-semibold text-text">{x.r.symbol}</span>
                            <span className="ml-2 text-[13px] text-muted">{x.r.name}</span>
                            <span className="block font-mono text-[12px] text-muted">{short(x.r.address)}</span>
                          </span>
                        </span>
                      </th>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf/10 px-2.5 py-0.5 text-[12px] text-leaf">
                          <span aria-hidden>✓</span> Issuer code
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text">
                        {x.r.market?.price != null ? `$${fmtNum(x.r.market.price, 2)}` : x.r.price !== null ? fmtNum(x.r.price, 2) : <span className="text-muted">no route</span>}
                        {x.r.market?.change != null && <span className={cx("block text-[12px]", x.r.market.change >= 0 ? "text-leaf" : "text-flesh")}>{`${x.r.market.change >= 0 ? "+" : ""}${x.r.market.change.toFixed(2)}%`}</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text">{x.r.market ? usd(x.r.market.volume) : <span className="text-muted">none today</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-text">{x.r.market ? usd(x.r.market.liquidity) : <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3">
                        {x.r.keep10 === null ? (
                          <span className="text-[12px] text-muted">no quote</span>
                        ) : (
                          <div className="w-28">
                            <Meter label={`${x.r.symbol} keeps this share of its price when ten are sold`} value={x.r.keep10} cells={10} tone={x.r.keep10 < 0.5 ? "bad" : x.r.keep10 < 0.9 ? "mid" : "good"} />
                            <span className={cx("mt-1 block text-[12px] tabular-nums", x.r.keep10 < 0.5 ? "text-flesh" : "text-muted")}>{x.r.keep10 < 0.5 ? "thin pool" : `${Math.round(x.r.keep10 * 100)} of 100`}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-text">{x.r.pools}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <WatchButton kind="token" value={x.r.address} label={x.r.symbol} className="mr-3" />
                        <Link href={`/app/trade/terminal?token=${x.r.address}`} className="mr-3 text-[13px] text-muted hover:text-text">
                          Chart
                        </Link>
                        <Link href={`/app/trust/check?q=${x.r.address}`} className="text-[13px] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                          Check →
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    <tr key={x.l.address} className="irow border-b border-line bg-flesh/[0.04]">
                      <th scope="row" className="px-4 py-2.5 font-normal">
                        <span className="flex items-center gap-3 pl-4">
                          <span aria-hidden className="text-muted">↳</span>
                          <span className="min-w-0">
                            <span className="font-mono text-[14px] text-text">{x.l.symbol}</span>
                            <span className="ml-2 text-[13px] text-muted">{x.l.name}</span>
                            <span className="block font-mono text-[12px] text-muted">{short(x.l.address)}</span>
                          </span>
                        </span>
                      </th>
                      <td className="px-4 py-2.5" colSpan={5}>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-flesh/10 px-2.5 py-0.5 text-[12px] text-flesh">
                          <span aria-hidden>✕</span> Lookalike
                        </span>
                        <span className="ml-3 text-[13px] text-muted">{x.of ? `Same name as ${x.of}, different contract code · ${x.l.pools} pools` : `Copies an issuer name, different contract code · ${x.l.pools} pools`}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <Link href={`/app/trust/check?q=${x.l.address}`} className="text-[13px] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                          Check →
                        </Link>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            {!list.length && <Idle>No token matches this filter.</Idle>}
          </div>
        )}
        <p className="border-t border-line px-4 py-3 text-[12px] text-muted">{`Price: selling one token to USDG at the latest block. Sell ten keeps: what a sale of ten fetches per token, against the price of one. No off-chain reference.${desk ? ` Updated ${ago(desk.at)}.` : ""}`}</p>
      </section>
    </div>
  );
}
