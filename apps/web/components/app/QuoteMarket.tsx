"use client";

/**
 * The right side of Trade → Swap: what the trader needs next to the ticket, in tabs.
 * Routes (every path simulated), Size (the same trade at other sizes: where the pool starts to hurt),
 * Chart (the token's swaps from the chain) and Token (its Corbel Score, market and links).
 * Everything comes from this site's API; nothing is signed here.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { Candles, toBars, type Tick } from "./Candles";
import { fmtNum, short } from "./kit";
import { score, type Check, type HoldersIn, type MarketIn } from "./score";
import { TokenAvatar } from "./TokenAvatar";
import { clearActs, useActs } from "./activity";

const NATIVE = "0x0000000000000000000000000000000000000000";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const BASE = new Set([NATIVE, WETH, USDG]);
/** Trade sizes tried on the Size tab, as multiples of the ticket amount. */
const SIZES = [0.1, 0.5, 1, 2, 5, 10];

type Asset = { address: string; symbol: string; decimals: number };
type Route = { amountOut: string | null; ok: boolean; hops: { pool: string }[] };
export type QuoteLike = { from: Asset; to: Asset; amountIn: string; block: string; routes: Route[]; best: number | null; impact: number | null; ms: number };
type Market = {
  token: { address: string; symbol: string; name: string };
  trades: { t: number; price: number; base: number; token: number; side: "buy" | "sell"; tx: string; who: string }[];
  base: { symbol: string; usd: number };
  all?: { price: number | null; liquidity: number; volume: number; change: number | null; buys: number; sells: number; venues: string[]; pairs: number; created?: number | null; links?: { label: string; url: string }[]; ds?: string | null } | null;
  launcher: { address: string; launches: number; dead: number } | null;
};

const pct = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(v < 10 ? 2 : 0)}`);
const units = (raw: string, d: number) => Number(raw) / 10 ** d;

/** The token this pair is about: the non-base side, or WETH when both sides are base assets. */
export function subjectOf(q: QuoteLike) {
  const t = q.to.address.toLowerCase(), f = q.from.address.toLowerCase();
  if (!BASE.has(t)) return { address: q.to.address, symbol: q.to.symbol };
  if (!BASE.has(f)) return { address: q.from.address, symbol: q.from.symbol };
  return { address: WETH, symbol: "WETH" };
}

/** One line over the tabs: what the best route pays and how far the others fall behind. */
export function QuoteSummary({ q }: { q: QuoteLike }) {
  const outs = q.routes.filter((r) => r.ok && r.amountOut).map((r) => units(r.amountOut!, q.to.decimals));
  const best = outs.length ? Math.max(...outs) : null, worst = outs.length ? Math.min(...outs) : null;
  const pools = new Set(q.routes.flatMap((r) => r.hops.map((h) => h.pool))).size;
  const gap = best !== null && worst !== null && best > worst ? best / worst - 1 : 0;
  const thin = q.impact != null && q.impact > 0.05;
  return (
    <div className={cx("border-b border-line px-4 py-4", thin ? "bg-flesh/[0.06]" : "bg-leaf/[0.04]")}>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <p className="min-w-0 flex-1 text-[16px] leading-snug text-text">
          {best === null
            ? "No route fills this trade at the latest block."
            : outs.length > 1 && gap > 0.0005
              ? `The best of ${outs.length} routes pays ${pct(gap)} more than the worst that fills.`
              : `${outs.length} ${outs.length === 1 ? "route fills" : "routes fill"} this trade at the same price.`}
          {thin && <span className="text-flesh">{` The pool is thin: ${pct(q.impact!)} price impact.`}</span>}
        </p>
        {best !== null && (
          <p className="text-right">
            <span className="block font-display text-[34px] leading-none tabular-nums text-text">{fmtNum(best)}</span>
            <span className="text-[13px] text-muted">{`${q.to.symbol} on the best route`}</span>
          </p>
        )}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-5 text-[13px] tabular-nums">
        <span>
          <span className="text-muted">Routes that fill</span> <span className="text-text">{`${outs.length} of ${q.routes.length}`}</span>
        </span>
        <span>
          <span className="text-muted">Pools compared</span> <span className="text-text">{pools}</span>
        </span>
        {q.impact != null && (
          <span>
            <span className="text-muted">Price impact</span> <span className={thin ? "text-flesh" : "text-text"}>{pct(-q.impact)}</span>
          </span>
        )}
      </p>
    </div>
  );
}

/** The same trade at other sizes, each one simulated. Shows where the pool starts to cost you. */
export function SizeLadder({ q, from, to, amount }: { q: QuoteLike; from: string; to: string; amount: string }) {
  const [rows, setRows] = useState<{ k: number; amt: number; out: number | null }[] | null>(null);
  useEffect(() => {
    let off = false;
    const base = Number(amount);
    if (!(base > 0)) return;
    void Promise.resolve().then(() => setRows(null));
    (async () => {
      const got: { k: number; amt: number; out: number | null }[] = [];
      for (const k of SIZES) {
        const amt = Number((base * k).toPrecision(6));
        try {
          const j = (await fetch(`/api/quote?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amt}`, { cache: "no-store" }).then((r) => r.json())) as QuoteLike & { error?: string };
          const b = j.best !== null && j.routes ? j.routes[j.best] : null;
          got.push({ k, amt, out: b?.amountOut ? units(b.amountOut, j.to.decimals) : null });
        } catch {
          got.push({ k, amt, out: null });
        }
        if (off) return;
        setRows([...got]);
      }
    })();
    return () => {
      off = true;
    };
  }, [from, to, amount]);
  const ref = rows?.find((r) => r.out) ?? null;
  const refRate = ref && ref.out ? ref.out / ref.amt : null;
  return (
    <div>
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-[12px] text-muted">
            {["Size", `You pay (${q.from.symbol})`, `You get (${q.to.symbol})`, "Rate", "vs smallest", ""].map((h, i) => (
              <th key={i} scope="col" className={cx("px-4 py-2 font-normal", i > 0 && i < 5 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SIZES.map((k) => {
            const r = rows?.find((x) => x.k === k);
            const rate = r?.out ? r.out / r.amt : null;
            const loss = rate && refRate ? rate / refRate - 1 : null;
            return (
              <tr key={k} className={cx("border-b border-line/50", k === 1 && "bg-[color-mix(in_oklab,var(--leaf)_7%,transparent)]")}>
                <td className="px-4 py-2.5 font-mono text-muted">{k === 1 ? "Your ticket" : `×${k}`}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text">{r ? fmtNum(r.amt) : "…"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text">{!r ? "…" : r.out === null ? "no fill" : fmtNum(r.out)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">{rate ? fmtNum(rate) : "—"}</td>
                <td className={cx("px-4 py-2.5 text-right tabular-nums", loss === null ? "text-muted" : loss < -0.05 ? "text-flesh" : loss < -0.01 ? "text-text" : "text-leaf")}>{loss === null ? "—" : pct(loss)}</td>
                <td className="w-40 px-4 py-2.5">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-[#242424]">
                    <span className={cx("block h-full rounded-full", loss !== null && loss < -0.05 ? "bg-flesh" : "bg-leaf")} style={{ width: `${loss === null ? 0 : Math.min(100, Math.abs(loss) * 400)}%` }} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-4 py-3 text-[12px] text-muted">Each row is a separate simulation at the latest block. The rate falls as size grows: that drop is what the pool charges you for size. Split a trade when the row you need turns red.</p>
    </div>
  );
}

function useMarket(token: string) {
  const [m, setM] = useState<Market | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let off = false;
    void Promise.resolve().then(() => (setM(null), setErr(false)));
    fetch(`/api/market?token=${token}&w=12`)
      .then((r) => r.json())
      .then((j: Market & { error?: string; none?: boolean }) => !off && (j.error || j.none ? setErr(true) : setM(j)))
      .catch(() => !off && setErr(true));
    return () => {
      off = true;
    };
  }, [token]);
  return { m, err };
}

/** The subject token's swaps as candles, in dollars. */
export function PairChart({ token, symbol }: { token: string; symbol: string }) {
  const { m, err } = useMarket(token);
  const bars = useMemo(() => {
    if (!m) return [];
    const k = m.base.usd || 1;
    const ticks: Tick[] = m.trades.map((t) => ({ t: t.t, price: t.price * k, vol: t.base * k, side: t.side }));
    return toBars(ticks, 300);
  }, [m]);
  if (err) return <p className="px-4 py-10 text-center text-[13px] text-muted">No pool for {symbol} that Corbel reads swap by swap.</p>;
  if (!m) return <p className="px-4 py-10 text-center text-[13px] text-muted">Reading {symbol} swaps from the chain…</p>;
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 text-[12px] text-muted">
        <span>
          {symbol} · 5m candles · USD · {m.trades.length} swaps read
        </span>
        <Link href={`/app/trade/terminal?token=${token}`} className="text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
          Full chart and holders →
        </Link>
      </div>
      <Candles bars={bars} mode="candles" unit="USD" height={340} />
    </div>
  );
}

/** The subject token at a glance: score, why, market and links. */
export function PairToken({ token, symbol }: { token: string; symbol: string }) {
  const { m } = useMarket(token);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [holders, setHolders] = useState<HoldersIn | null>(null);
  const [market, setMarket] = useState<MarketIn | null>(null);
  useEffect(() => {
    let off = false;
    void Promise.resolve().then(() => setChecks(null));
    fetch(`/api/token?q=${token}`)
      .then((r) => r.json())
      .then((j: { checks?: Check[]; holders?: HoldersIn | null; market?: MarketIn | null }) => !off && (setChecks(j.checks ?? []), setHolders(j.holders ?? null), setMarket(j.market ?? null)))
      .catch(() => !off && setChecks([]));
    return () => {
      off = true;
    };
  }, [token]);
  const sc = checks && checks.length ? score(checks, holders, market) : null;
  const bad = (checks ?? []).filter((c) => c.result === "fail" || c.result === "warn");
  const a = m?.all;
  const stats: [string, string, string?][] = a
    ? [
        ["Price", a.price ? `$${a.price < 1 ? a.price.toPrecision(3) : a.price.toFixed(2)}` : "—"],
        ["24h", a.change == null ? "—" : `${a.change >= 0 ? "+" : ""}${a.change.toFixed(1)}%`, a.change == null ? undefined : a.change >= 0 ? "text-leaf" : "text-flesh"],
        ["Liquidity", usd(a.liquidity)],
        ["Volume 24h", usd(a.volume)],
        ["Buys / sells", `${a.buys} / ${a.sells}`],
        ["Venues", `${a.venues.length} · ${a.pairs} pools`],
      ]
    : [];
  return (
    <div className="grid gap-px bg-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="bg-bg p-4">
        <div className="flex items-center gap-3">
          <TokenAvatar address={token} symbol={symbol} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold text-text">{m?.token.name ?? symbol}</p>
            <p className="font-mono text-[12px] text-muted">
              {symbol} · {short(token)}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className={cx("font-display text-4xl leading-none", !sc ? "text-muted" : sc.total >= 80 ? "text-leaf" : sc.total >= 60 ? "text-text" : sc.total >= 40 ? "text-[var(--lav)]" : "text-flesh")}>{sc ? sc.total : "…"}</p>
            <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{sc ? `Corbel Score · ${sc.tag}` : "checking"}</p>
          </div>
        </div>
        {sc && <p className="mt-3 text-[13px] text-text">{sc.why}</p>}
        {sc && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {sc.parts.map((p) => (
              <div key={p.id}>
                <p className="text-[12px] text-muted">{p.label}</p>
                <p className="font-mono text-[14px] text-text">{p.score}</p>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[#242424]">
                  <span className={cx("block h-full", p.score >= 60 ? "bg-leaf" : p.score >= 40 ? "bg-[var(--lav)]" : "bg-flesh")} style={{ width: `${p.score}%` }} />
                </span>
              </div>
            ))}
          </div>
        )}
        {bad.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-[12px]">
            {bad.slice(0, 4).map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className={c.result === "fail" ? "text-flesh" : "text-text"}>{c.result === "fail" ? "✕" : "▲"}</span>
                <span className="text-muted">
                  <span className="text-text">{c.name}.</span> {c.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
          <Link href={`/app/trade/check?q=${token}`} className="rounded-full border border-leaf/50 px-3 py-1 text-leaf hover:bg-leaf/10">
            Full check →
          </Link>
          <Link href={`/app/trade/terminal?token=${token}`} className="rounded-full border border-[#343434] px-3 py-1 text-text hover:border-ui/60">
            Terminal →
          </Link>
          {(a?.links ?? []).map((x) => (
            <a key={x.url} href={x.url} target="_blank" rel="noreferrer noopener nofollow" className="rounded-full border border-[#343434] px-3 py-1 text-muted hover:text-text">
              {x.label} ↗
            </a>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 content-start gap-px bg-line sm:grid-cols-3">
        {stats.map(([k, v, tone]) => (
          <div key={k} className="bg-[#131313] px-4 py-3">
            <p className="text-[12px] text-muted">{k}</p>
            <p className={cx("mt-1 font-mono text-[15px] text-text", tone)}>{v}</p>
          </div>
        ))}
        {m?.launcher && (
          <div className="col-span-full bg-[#131313] px-4 py-3 text-[13px]">
            <p className="text-[12px] text-muted">Pool maker</p>
            <p className="mt-1">
              <a href={`/app/portfolio?address=${m.launcher.address}`} className="font-mono text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                {short(m.launcher.address)}
              </a>
              <span className={cx("ml-2", m.launcher.dead > 0 ? "text-flesh" : "text-muted")}>
                {m.launcher.launches} pools this week · {m.launcher.dead} drained
              </span>
              <a href={`/app/trust/creator?address=${m.launcher.address}`} className="ml-3 text-leaf underline decoration-leaf/30 underline-offset-4">
                Dossier →
              </a>
            </p>
          </div>
        )}
        {!m && <p className="col-span-full bg-bg px-4 py-8 text-center text-[13px] text-muted">Reading the market…</p>}
      </div>
    </div>
  );
}

const TX = "https://robinhoodchain.blockscout.com/tx/";
const agoS = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

/** Swaps you sent from Corbel in this browser, newest first, with what was quoted and what arrived. */
export function MySwaps({ compact = false }: { compact?: boolean }) {
  const acts = useActs();
  if (compact && acts.length === 0) return null;
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 text-[12px]">
        <span className="font-medium text-text">Your recent swaps</span>
        {acts.length > 0 && (
          <button type="button" onClick={clearActs} className="text-muted hover:text-text">
            Clear
          </button>
        )}
      </div>
      {acts.length === 0 && <p className="px-4 pb-4 text-[12px] text-muted">None yet. A swap you send here shows up with its progress, the quote and what arrived. Kept in this browser only.</p>}
      <ul className="divide-y divide-line/60">
        {acts.slice(0, compact ? 5 : 30).map((a) => (
          <li key={a.hash} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-[12px]">
            <span className={cx("h-2 w-2 rounded-full", a.status === "done" ? "bg-leaf" : a.status === "failed" ? "bg-flesh" : "animate-pulse bg-[var(--lav)]")} title={a.status} />
            <span className="min-w-0">
              <span className="block truncate text-text">
                {a.amount} {a.from} → {Number(a.got ?? a.quoted).toLocaleString("en", { maximumFractionDigits: 6 })} {a.to}
              </span>
              <span className="block text-muted">
                {a.status === "done" ? "Received" : a.status === "failed" ? "Reverted, nothing swapped" : "Waiting for the block"} · {agoS(a.at)}
              </span>
            </span>
            <a href={TX + a.hash} target="_blank" rel="noreferrer" className="font-mono text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
              tx ↗
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The latest swaps of the token on the chain, newest first. */
export function ChainActivity({ token, symbol }: { token: string; symbol: string }) {
  const { m, err } = useMarket(token);
  if (err) return <p className="px-4 py-6 text-center text-[13px] text-muted">No pool for {symbol} that Corbel reads swap by swap.</p>;
  if (!m) return <p className="px-4 py-6 text-center text-[13px] text-muted">Reading the latest {symbol} swaps…</p>;
  const k = m.base.usd || 1;
  const rows = [...m.trades].sort((a, b) => b.t - a.t).slice(0, 40);
  return (
    <div>
      <p className="px-4 py-2 text-[12px] font-medium text-text">Latest {symbol} swaps on the chain</p>
      <div className="max-h-[26rem] overflow-auto">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="sticky top-0 border-b border-line bg-[#131313] text-[12px] text-muted">
              {["When", "Side", "USD", symbol, "Price", "Wallet", ""].map((h, i) => (
                <th key={i} scope="col" className={cx("px-4 py-1.5 font-normal", i >= 2 && i <= 4 && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tx + r.t} className="border-b border-line/40">
                <td className="px-4 py-1.5 text-muted">{agoS(r.t * 1000)}</td>
                <td className={cx("px-4 py-1.5", r.side === "buy" ? "text-leaf" : "text-flesh")}>{r.side === "buy" ? "Buy" : "Sell"}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-text">{usd(r.base * k)}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-muted">{fmtNum(r.token)}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-muted">{fmtNum(r.price * k)}</td>
                <td className="px-4 py-1.5">
                  <a href={`/app/portfolio?address=${r.who}`} className="font-mono text-muted hover:text-leaf">
                    {short(r.who)}
                  </a>
                </td>
                <td className="px-4 py-1.5">
                  <a href={TX + r.tx} target="_blank" rel="noreferrer" className="font-mono text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                    ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
