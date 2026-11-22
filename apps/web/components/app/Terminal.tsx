"use client";

/**
 * Trade · Terminal. One token at a time: a list to pick from (new pools, stock tokens, search), the market
 * header, a candle chart built from the pool's swaps, pulse and liquidity read from the chain, Corbel's
 * seven checks next to the chart, and a buy/sell ticket that simulates the swap. Nothing is signed.
 */
import Link from "next/link";
import { Gutter, useSize } from "./Resize";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { launchpadName, launchpadTone } from "@corbel/config";
import { Candles, fmtPx, toBars, type Marker, type Tick } from "./Candles";
import type { ReactNode } from "react";
import { Idle, Led, Seg, short } from "./kit";

/** A pane of the terminal: a thin label row and content, separated from its neighbours by 1px lines. */
function Pane({ title, status, foot, children, className, busy }: { title: string; status?: ReactNode; foot?: ReactNode; children: ReactNode; className?: string; busy?: boolean }) {
  return (
    <section aria-label={title} aria-busy={busy || undefined} className={cx("flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#242424] bg-[#131313]", className)}>
      <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-3 border-b border-line px-3 py-1.5">
        <span className="text-[14px] font-semibold text-text">{title}</span>
        {busy && <span aria-hidden className="led" data-live="true" />}
        {status && <span className="ml-auto flex flex-wrap items-center gap-3">{status}</span>}
      </header>
      {children}
      {foot && <footer className="mt-auto flex justify-between gap-3 border-t border-line px-3 py-2 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{foot}</footer>}
    </section>
  );
}
import { WatchButton, useWatch } from "./WatchButton";
import { TokenAvatar } from "./TokenAvatar";
import { SwapButton } from "./SwapButton";
import { useLinked } from "./wallet";
import { HoldersPanel, InsiderStrip, useHolders } from "./HoldersPanel";
import { briefOf, score, type Check as ScoreCheck } from "./score";
import { MySwaps } from "./QuoteMarket";
import { useActs } from "./activity";
import { Support } from "./Support";
import { TerminalFeed } from "./TerminalFeed";

type Trade = { block: number; t: number; side: "buy" | "sell"; price: number; token: number; base: number; tx: string; who: string; from?: string };
type Step = { move: number; base: number; token: number };
type Market = {
  token: { address: string; symbol: string; name: string; decimals: number; supply: number | null };
  pool: { kind: "v2" | "v4"; id: string; base: string; hooked: boolean; fee: number | null };
  base: { symbol: string; usd: number };
  head: number;
  from: number;
  since: number;
  price: number | null;
  reserves: { token: number; base: number } | null;
  ladder: { up: Step[]; down: Step[]; estimate?: boolean } | null;
  trades: Trade[];
  lp: { block: number; t: number; kind: "add" | "remove"; token: number | null; base: number | null; tx: string; from?: string }[];
  launcher: { address: string; launches: number; dead: number; checked: number } | null;
  dev?: { address: string; from: "launchpad" | "pool" } | null;
  all?: { price: number | null; liquidity: number; volume: number; change: number | null; buys: number; sells: number; venues: string[]; pairs: number; created?: number | null; fdv?: number | null; dex?: string | null; ds?: string | null; links?: { label: string; url: string }[] } | null;
  ms: number;
};
type Item = { address: string; symbol: string; name: string; note: string; hot?: boolean; stock?: boolean; change?: number | null };
type Check = { id: string; name: string; result: "pass" | "warn" | "fail" | "unknown"; reason: string; metric?: string };

const TF = [
  { id: "60", label: "1m" },
  { id: "300", label: "5m" },
  { id: "900", label: "15m" },
  { id: "3600", label: "1h" },
  { id: "14400", label: "4h" },
] as const;
/** WETH: its pair with USDG is the busiest market on the chain. */
/** Slippage shown on the ticket. */
const SLIP = 0.01;
/** Exit pace: the share of hourly buying a seller should take. */
const PACE = 0.25;
/** The price drop used for the header's "how much can I sell" figure. */
const EXIT_MOVE = 0.02;
const DEFAULT = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const usdFmt = (v: number) => (!Number.isFinite(v) ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(v < 10 ? 2 : 0)}`);
const ago = (t: number, now: number) => {
  const s = Math.max(0, Math.round(now - t));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
};
const MARK = { pass: ["✓", "text-leaf"], warn: ["▲", "text-text"], fail: ["✕", "text-flesh"], unknown: ["?", "text-muted"] } as const;

/* ------------------------------------------------------------------ token list */
type Row = { token: string; symbol: string | null; name: string | null; volume: number; swaps: number; change?: number | null; liquidity?: number; created?: number | null; age: number; pad?: string | null };
type StockRow = { token: string; symbol: string; name: string; volume: number; price: number | null; change: number | null; pools: number };
type ListItem = Item & { vol: number; tx: number; pad?: string | null; age?: string; dead?: boolean };
type PadTok = { token: string; symbol: string | null; name: string | null; ago: number; dead: 0 | 1 | null; lookalike?: boolean };
type PadRow = { id: string; name: string; tone: string; day: number; total: number; tokens: PadTok[] };
const padName = (id: string) => launchpadName(id);
const agoFmt = (s: number) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))}m` : s < 172_800 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86_400)}d`);
const LIST_TABS = [
  { id: "trend", label: "Trending" },
  { id: "new", label: "New" },
  { id: "stocks", label: "Stocks" },
  { id: "pads", label: "Launchpads" },
  { id: "watch", label: "Watch" },
] as const;
const SORTS = [
  { id: "vol", label: "Volume" },
  { id: "chg", label: "Move" },
  { id: "tx", label: "Trades" },
] as const;
const DAY_MS = 86_400_000;

function TokenList({ current, onPick, onHide }: { current: string; onPick: (a: string) => void; onHide?: () => void }) {
  const [tab, setTab] = useState<(typeof LIST_TABS)[number]["id"]>("trend");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("vol");
  const [pad, setPad] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ rows: Row[]; stocks: StockRow[]; at: number } | null>(null);
  const [found, setFound] = useState<Item[] | null>(null);
  const [padData, setPadData] = useState<PadRow[] | null>(null);
  const watch = useWatch();

  // launchpads and the tokens that came out of each, read when the tab opens and every minute while it is open
  useEffect(() => {
    if (tab !== "pads") return;
    let off = false;
    const load = () =>
      fetch("/api/pads")
        .then((r) => r.json())
        .then((j: { pads?: PadRow[] }) => !off && setPadData(j.pads ?? []))
        .catch(() => !off && setPadData([]));
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, [tab]);

  useEffect(() => {
    let off = false;
    const load = (again = 0): void => {
      fetch("/api/trending")
        .then(async (r) => ({ code: r.status, j: (await r.json()) as { rows?: Row[]; stocks?: StockRow[]; at?: number } }))
        .then(({ code, j }) => {
          if (off) return;
          if (code === 202 && again < 20) return void setTimeout(() => load(again + 1), 10_000);
          setData({ rows: j.rows ?? [], stocks: j.stocks ?? [], at: j.at ?? 0 });
        })
        .catch(() => !off && setData({ rows: [], stocks: [], at: 0 }));
    };
    load();
    const t = setInterval(() => load(), 60_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, []);

  const at = data?.at ?? 0;
  const isNew = useCallback((r: Row) => (r.created ? at - Number(r.created) < DAY_MS : r.age < 900_000), [at]);
  const pads = useMemo(() => (padData ?? []).filter((p) => p.tokens.length).map((p) => [p.id, p.day] as [string, number]), [padData]);
  const items = useMemo<ListItem[] | null>(() => {
    if (!data) return null;
    const ageOf = (r: Row) => {
      if (!r.created) return undefined;
      const h = (at - r.created) / 3_600_000;
      return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
    };
    const fromRow = (r: Row): ListItem => ({ address: r.token, symbol: r.symbol ?? "?", name: r.name ?? "", note: `${usdFmt(r.volume)} · ${r.swaps} tx`, change: r.change ?? null, vol: r.volume, tx: r.swaps, pad: r.pad, age: ageOf(r) });
    let list: ListItem[];
    if (tab === "stocks") list = data.stocks.map((r) => ({ address: r.token, symbol: r.symbol, name: r.name.replace(/ • Robinhood Token$/, ""), note: r.volume > 0 ? `${usdFmt(r.volume)} vol` : `${r.pools} pools`, change: r.change, stock: true, vol: r.volume, tx: 0 }));
    else if (tab === "new") list = data.rows.filter(isNew).map(fromRow);
    else if (tab === "pads") {
      // the newest tokens of the picked launchpad (or of all of them), with market figures where the token trades
      const market = new Map(data.rows.map((r) => [r.token.toLowerCase(), r]));
      const src = (padData ?? []).filter((p) => (pad ? p.id === pad : p.id !== "other"));
      list = src
        .flatMap((p) => p.tokens.map((x) => ({ x, p })))
        .sort((a, b) => a.x.ago - b.x.ago)
        .map(({ x, p }) => {
          const m = market.get(x.token.toLowerCase());
          return { address: x.token, symbol: x.symbol ?? "?", name: x.name ?? "", note: x.lookalike ? "lookalike" : m ? `${usdFmt(m.volume)} · ${m.swaps} tx` : x.dead === 1 ? "drained" : "new", change: m?.change ?? null, vol: m?.volume ?? 0, tx: m?.swaps ?? 0, pad: p.id, age: agoFmt(x.ago), dead: x.dead === 1 };
        });
      return list;
    }
    else if (tab === "watch") {
      const keep = new Set((watch ?? []).filter((w) => w.kind === "token").map((w) => w.value.toLowerCase()));
      list = data.rows.filter((r) => keep.has(r.token.toLowerCase())).map(fromRow);
      for (const w of watch ?? []) if (w.kind === "token" && !list.some((x) => x.address.toLowerCase() === w.value.toLowerCase())) list.push({ address: w.value, symbol: w.label, name: "", note: "watched", change: null, vol: 0, tx: 0 });
    } else list = data.rows.filter((r) => !isNew(r)).map(fromRow);
    const k = (x: ListItem) => (sort === "vol" ? x.vol : sort === "tx" ? x.tx : Math.abs(x.change ?? 0));
    return [...list].sort((a, b) => k(b) - k(a));
  }, [data, tab, pad, sort, watch, isNew, at, padData]);

  async function search(v: string) {
    const s = v.trim();
    if (!s) return setFound(null);
    if (/^0x[0-9a-fA-F]{40}$/.test(s)) return onPick(s);
    const j = (await fetch(`/api/token?q=${encodeURIComponent(s)}`).then((r) => r.json()).catch(() => ({}))) as { candidates?: { address: string; symbol: string | null; name: string | null; pools: number }[] };
    setFound((j.candidates ?? []).map((c) => ({ address: c.address, symbol: c.symbol ?? "?", name: c.name ?? "", note: `${c.pools} pools` })));
  }

  const list: (Item & { pad?: string | null; age?: string })[] | null = found ?? items;
  const maxMove = Math.max(1, ...(list ?? []).map((x) => Math.abs(x.change ?? 0)));
  const count = (id: string) => {
    if (!data) return undefined;
    if (id === "trend") return data.rows.filter((r) => !isNew(r)).length;
    if (id === "new") return data.rows.filter(isNew).length;
    if (id === "stocks") return data.stocks.length;
    if (id === "pads") return padData ? padData.filter((p) => p.id !== "other").reduce((s, p) => s + p.day, 0) : undefined;
    return (watch ?? []).filter((w) => w.kind === "token").length;
  };
  return (
    <Pane title="Tokens" className="h-full">
      <form
        className="flex items-center gap-2 border-b border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
      >
        <label htmlFor="tl-q" className="sr-only">
          Search a token
        </label>
        <input id="tl-q" value={q} onChange={(e) => (setQ(e.target.value), !e.target.value && setFound(null))} placeholder="Ticker or 0x… then Enter" autoComplete="off" spellCheck={false} maxLength={64} className="h-9 w-full rounded-lg border border-line bg-transparent px-3 font-mono text-xs text-text placeholder:text-muted" />
        {onHide && (
          <button type="button" onClick={onHide} title="Hide the token list" aria-label="Hide the token list" className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-ui/60 hover:text-text xl:grid">
            <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9.5 4.5v15" /></svg>
          </button>
        )}
      </form>
      <div role="tablist" aria-label="Token list" className="flex flex-wrap gap-1 border-b border-line px-2 py-2">
        {LIST_TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => (setTab(x.id), setFound(null), setPad(null))} className={cx("rounded-lg px-2.5 py-1 text-[12px] transition-colors", tab === x.id ? "bg-[#202020] text-text" : "text-muted hover:text-text")}>
            {x.label}
            {count(x.id) !== undefined && <span className="ml-1 font-mono text-[12px] text-muted">{count(x.id)}</span>}
          </button>
        ))}
      </div>
      {tab === "pads" && !found && (
        <div className="flex flex-wrap gap-1 border-b border-line px-2 py-2">
          <button type="button" onClick={() => setPad(null)} aria-pressed={!pad} className={cx("rounded-full border px-2.5 py-1 text-[12px] transition-colors", !pad ? "border-text bg-text text-bg" : "border-line text-muted hover:text-text")}>
            All
          </button>
          {pads.map(([a, n]) => (
            <button key={a} type="button" onClick={() => setPad(pad === a ? null : a)} aria-pressed={pad === a} className={cx("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors", pad === a ? "text-text" : "border-line text-muted hover:text-text")} style={pad === a ? { borderColor: launchpadTone(a), background: `color-mix(in srgb, ${launchpadTone(a)} 14%, transparent)` } : undefined}>
              <i className="h-2 w-2 rounded-full" style={{ background: launchpadTone(a) }} />
              {padName(a)}
              <span className="font-mono text-[12px] text-muted">{n}</span>
            </button>
          ))}
          {!padData && <span className="caret px-1 py-0.5 text-[12px] text-muted">Reading launchpads</span>}
          {padData && pads.length === 0 && <span className="px-1 py-0.5 text-[12px] text-muted">No launches read in the last three days.</span>}
        </div>
      )}
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-[12px] text-muted">{found ? `${found.length} found` : tab === "watch" && !watch ? "Sign in to keep a watchlist" : "Sort"}</span>
        {found ? (
          <button type="button" className="text-[12px] text-muted hover:text-text" onClick={() => setFound(null)}>
            Clear
          </button>
        ) : (
          <span className="flex gap-0.5">
            {SORTS.map((s) => (
              <button key={s.id} type="button" onClick={() => setSort(s.id)} aria-pressed={sort === s.id} className={cx("rounded-md px-1.5 py-0.5 text-[12px]", sort === s.id ? "bg-[#202020] text-text" : "text-muted hover:text-text")}>
                {s.label}
              </button>
            ))}
          </span>
        )}
      </div>
      <ul tabIndex={0} aria-label="Tokens, scrollable" className="max-h-[22rem] min-h-0 flex-1 overflow-y-auto xl:max-h-none">
        {!list && <li className="px-3 py-6 text-center text-[12px] text-muted">Reading…</li>}
        {list && list.length === 0 && <li className="px-3 py-6 text-center text-[12px] text-muted">{tab === "watch" ? "Nothing watched yet. Use Watch on a token." : "Nothing here"}</li>}
        {list?.map((it) => {
          const on = it.address.toLowerCase() === current.toLowerCase();
          return (
            <li key={it.address}>
              <button type="button" onClick={() => onPick(it.address)} aria-current={on ? "true" : undefined} className={cx("relative flex w-full items-center gap-3 border-b border-line/60 px-3 py-2 text-left transition-colors hover:bg-surface", on && "bg-leaf/[0.07]")}>
                {on && <span aria-hidden className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-leaf" />}
                <TokenAvatar address={it.address} symbol={it.symbol} stock={it.stock} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-[13px] text-text">{it.symbol}</span>
                    {it.age && <span className="shrink-0 rounded bg-[#202020] px-1 font-mono text-[12px] text-muted">{it.age}</span>}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-[12px] text-muted">
                    {it.pad && <i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: launchpadTone(it.pad) }} />}
                    <span className="truncate">{it.pad ? `${it.name ? `${it.name} · ` : ""}${padName(it.pad)}` : it.name || short(it.address)}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {it.change != null && <span className={cx("block font-mono text-[12px]", it.change >= 0 ? "text-leaf" : "text-flesh")}>{`${it.change >= 0 ? "+" : ""}${it.change.toFixed(1)}%`}</span>}
                  {it.change != null && (
                    <span className="mt-0.5 ml-auto block h-[3px] w-16 overflow-hidden rounded-full bg-[#202020]">
                      <span className={cx("block h-full rounded-full", it.change >= 0 ? "ml-auto bg-leaf/70" : "bg-flesh/70")} style={{ width: `${(Math.abs(it.change) / maxMove) * 100}%` }} />
                    </span>
                  )}
                  <span className="block whitespace-nowrap font-mono text-[12px] text-muted">{it.note}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Pane>
  );
}

/* ------------------------------------------------------------------ ticket */
function Ticket({ m, quick }: { m: Market; quick?: { side: "buy" | "sell"; usd?: number; share?: number; n: number } | null }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("");
  const [held, setHeld] = useState<number | null>(null);
  const [res, setRes] = useState<{ out: number; impact: number | null; route: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { linked } = useLinked();
  // the linked wallet's balance of this token, for the sell shares
  useEffect(() => {
    if (!linked) return;
    let off = false;
    fetch(`/api/balance?address=${linked.address}&token=${m.token.address}`)
      .then((r) => r.json())
      .then((j: { amount?: number }) => !off && setHeld(j.amount ?? 0))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [linked, m.token.address]);
  // quick trade from the bar above the chart
  useEffect(() => {
    if (!quick) return;
    void Promise.resolve().then(() => {
      setSide(quick.side);
      setRes(null);
      if (quick.side === "buy" && quick.usd) {
        const k = m.base.usd || 1;
        setAmt(String(+(quick.usd / k).toPrecision(4)));
      } else if (quick.side === "sell" && quick.share && held) setAmt(String(+(held * quick.share).toPrecision(6)));
      else if (quick.side === "sell" && quick.share) setErr("Connect a wallet that holds this token to sell a share of it.");
    });
  }, [quick, m.base.usd, held]);
  const base = m.pool.base === "WETH" ? "WETH" : m.pool.base;
  const presets = side === "buy" ? (base === "USDG" ? ["10", "50", "100", "500"] : ["0.01", "0.05", "0.1", "0.5"]) : ["25%", "50%", "100%"];

  async function sim() {
    const a = Number(amt.replace(",", "."));
    if (!(a > 0)) return;
    setBusy(true);
    setErr(null);
    setRes(null);
    const [from, to] = side === "buy" ? [base, m.token.address] : [m.token.address, base];
    try {
      const r = await fetch(`/api/quote?from=${from}&to=${to}&amount=${a}`);
      const j = (await r.json()) as { error?: string; routes?: { ok: boolean; amountOut: string | null; hops: { venue: string }[] }[]; best?: number; impact?: number | null; to?: { decimals: number } };
      if (!r.ok || j.error) throw new Error(j.error ?? "No route");
      const best = j.routes?.[j.best ?? -1];
      if (!best?.ok || !best.amountOut) throw new Error("No route fills this size.");
      const dec = side === "buy" ? m.token.decimals : base === "USDG" ? 6 : 18;
      setRes({ out: Number(best.amountOut) / 10 ** dec, impact: j.impact ?? null, route: best.hops.map((h) => h.venue.toUpperCase()).join(" → ") });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const outSym = side === "buy" ? m.token.symbol : base;
  return (
    <Pane title="Ticket" status={<Led tone="off" label="Simulated" />} foot={<span>An eth_call at the latest block · nothing is signed</span>}>
      <div className="p-3">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[#181818] p-1">
          {(["buy", "sell"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={side === s} onClick={() => (setSide(s), setRes(null), setAmt(""))} className={cx("h-10 rounded-xl text-[14px] font-semibold capitalize", side === s ? (s === "buy" ? "bg-ui text-[#0b0b0b]" : "bg-flesh text-[#14060a]") : "bg-bg text-muted hover:text-text")}>
              {s}
            </button>
          ))}
        </div>
        <label htmlFor="tk-amt" className="mt-4 block font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
          You pay
        </label>
        <div className="ifield mt-1.5 h-12">
          <input id="tk-amt" value={amt} onChange={(e) => (setAmt(e.target.value), setRes(null))} inputMode="decimal" placeholder="0.0" autoComplete="off" className="px-3 font-display text-xl text-text" onKeyDown={(e) => e.key === "Enter" && void sim()} />
          <span className="flex items-center px-3 font-mono text-xs text-text">{side === "buy" ? base : m.token.symbol}</span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {presets.map((p) =>
            p.endsWith("%") ? (
              <span key={p} className="flex h-8 items-center justify-center border border-line font-mono text-[12px] text-muted" title="Needs a connected balance">
                {p}
              </span>
            ) : (
              <button key={p} type="button" onClick={() => (setAmt(p), setRes(null))} className="h-8 border border-line font-mono text-[12px] text-text transition-colors hover:border-ui/60 hover:text-leaf">
                {p}
              </button>
            ),
          )}
        </div>
        <button type="button" disabled={busy} onClick={() => void sim()} className={cx("mt-4 h-11 w-full font-medium text-xs uppercase tracking-[0.1em]", side === "buy" ? "ibtn" : "ibtn-ghost border-flesh text-flesh")}>
          {busy ? "Simulating…" : `Simulate ${side}`}
        </button>
        {!res && <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-3 text-[12.5px] text-muted">Pick an amount and simulate: what you get, the floor after slippage, the impact and the route appear here.</p>}
        <dl className={cx("mt-4 space-y-2 text-[13px]", !res && "hidden")}>
          {[
            ["You get", res ? `${fmtPx(res.out)} ${outSym}` : "—"],
            [`At least, ${SLIP * 100}% slippage`, res ? `${fmtPx(res.out * (1 - SLIP))} ${outSym}` : "—"],
            ["Price impact", res?.impact != null ? `${(res.impact * 100).toFixed(2)}%` : "—"],
            ["Route", res?.route ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="truncate font-mono text-text">{v}</dd>
            </div>
          ))}
        </dl>
        {err && <p className="mt-3 border border-flesh/40 bg-flesh-deep/40 px-3 py-2 text-[13px] text-text">{err}</p>}
        {res && <SwapButton from={side === "buy" ? (base === "WETH" ? "ETH" : base) : m.token.address} to={side === "buy" ? m.token.address : base === "WETH" ? "ETH" : base} amount={amt.replace(",", ".")} slippage={SLIP} />}
        <Link href={`/app/trade/quote?from=${side === "buy" ? base : m.token.address}&to=${side === "buy" ? m.token.address : base}&amount=${amt || "0.1"}`} className="mt-4 block font-medium text-[12px] uppercase tracking-[0.08em] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
          Every route in Quote →
        </Link>
      </div>
    </Pane>
  );
}

/* ------------------------------------------------------------------ exit plan */
/**
 * How to leave a position with the most kept: the full sale simulated now, the same bag in parts, the
 * pool move a full sale needs to break even, and (V2) how much buying the pool must see to get there.
 */
function ExitPlan({ m }: { m: Market }) {
  const [held, setHeld] = useState("");
  const [paid, setPaid] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [r, setR] = useState<{ all: number; part: number; impact: number | null } | null>(null);
  const base = m.pool.base;
  const k = m.base.usd || 1;
  const PARTS = 4;

  async function sell(amount: number) {
    const q = await fetch(`/api/quote?from=${m.token.address}&to=${base}&amount=${amount}`);
    const j = (await q.json()) as { error?: string; routes?: { ok: boolean; amountOut: string | null }[]; best?: number; impact?: number | null };
    if (!q.ok || j.error) throw new Error(j.error ?? "No route");
    const b = j.routes?.[j.best ?? -1];
    if (!b?.ok || !b.amountOut) throw new Error("No pool buys this size back right now.");
    return { out: Number(b.amountOut) / 10 ** (base === "USDG" ? 6 : 18), impact: j.impact ?? null };
  }

  async function run() {
    const h = Number(held.replace(",", "."));
    if (!(h > 0)) return;
    setBusy(true);
    setErr(null);
    setR(null);
    try {
      const [all, part] = await Promise.all([sell(h), sell(h / PARTS)]);
      setR({ all: all.out * k, part: part.out * PARTS * k, impact: all.impact });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const h = Number(held.replace(",", ".")) || 0;
  const cost = Number(paid.replace(",", ".")) || 0;
  // pace: sell no more than a share of what buyers bring each hour, so the pool refills between sells
  const span = m.trades.length ? Math.max(1, (m.trades[0]!.t - m.trades[m.trades.length - 1]!.t) / 3600) : 0;
  const buysPerHour = span ? (m.trades.filter((x) => x.side === "buy").reduce((s, x) => s + x.base, 0) * k) / span : 0;
  const mark = (m.price ?? 0) * k * h;
  const pnl = r && cost > 0 ? r.all - cost : null;
  const need = r && cost > 0 && r.all > 0 ? cost / r.all - 1 : null;
  // V2: buying the pool must absorb before the price is `need` higher, read from its own curve
  const lift = (() => {
    if (need === null || need <= 0 || !m.ladder) return null;
    const steps = m.ladder.up;
    const hit = steps.find((s) => s.move >= need);
    return hit ? { base: hit.base * k, move: hit.move } : null;
  })();

  return (
    <Pane title="Exit plan" status={<Led tone="off" label="Your bag" />} foot={<span>Simulated sells at the latest block · nothing is signed</span>}>
      <div className="grid grid-cols-2 gap-2 p-3">
        <div>
          <label htmlFor="xp-h" className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
            You hold
          </label>
          <div className="ifield mt-1 h-10">
            <input id="xp-h" value={held} onChange={(e) => (setHeld(e.target.value), setR(null))} inputMode="decimal" placeholder="0" autoComplete="off" className="px-2 font-mono text-sm text-text" onKeyDown={(e) => e.key === "Enter" && void run()} />
          </div>
          <p className="mt-1 truncate font-mono text-[12px] text-muted">{m.token.symbol}</p>
        </div>
        <div>
          <label htmlFor="xp-p" className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
            You paid
          </label>
          <div className="ifield mt-1 h-10">
            <input id="xp-p" value={paid} onChange={(e) => (setPaid(e.target.value), setR(null))} inputMode="decimal" placeholder="optional" autoComplete="off" className="px-2 font-mono text-sm text-text" onKeyDown={(e) => e.key === "Enter" && void run()} />
          </div>
          <p className="mt-1 font-mono text-[12px] text-muted">USD in total</p>
        </div>
      </div>
      <div className="px-3 pb-3">
        <button type="button" disabled={busy || !(h > 0)} onClick={() => void run()} className="ibtn h-10 w-full font-medium text-xs uppercase tracking-[0.1em]">
          {busy ? "Simulating sells…" : "Plan my exit"}
        </button>
        {err && <p className="mt-3 border border-flesh/40 bg-flesh-deep/40 px-3 py-2 text-[13px] text-text">{err}</p>}
        {!(h > 0) && <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-3 text-[12.5px] text-muted">Type how much you hold: the plan simulates selling it all now against selling it in parts.</p>}
        <dl className={cx("mt-3 space-y-2 text-[13px]", !(h > 0) && "hidden")}>
          {[
            ["Worth at pool price", h > 0 ? usdFmt(mark) : "—", ""],
            ["Sell all now", r ? usdFmt(r.all) : "press Plan my exit", r && mark > 0 ? `${(((r.all - mark) / mark) * 100).toFixed(1)}% vs pool price` : ""],
            [`Sell in ${PARTS} parts`, r ? usdFmt(r.part) : "press Plan my exit", r ? (r.part > r.all ? `+${usdFmt(r.part - r.all)} kept, if buyers refill the pool between parts` : "no gain from splitting at this size") : ""],
            ["Gain on a full sale now", pnl === null ? "add what you paid" : `${pnl >= 0 ? "+" : "−"}${usdFmt(Math.abs(pnl))}`, ""],
          ].map(([a, b, c]) => (
            <div key={a}>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{a}</dt>
                <dd className={cx("font-mono", String(a).startsWith("Gain") && pnl !== null ? (pnl >= 0 ? "text-leaf" : "text-flesh") : "text-text")}>{b}</dd>
              </div>
              {c && <p className="text-right tabular-nums text-[12px] text-muted">{c}</p>}
            </div>
          ))}
        </dl>
        {r && buysPerHour > 0 && (
          <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
            {`Buyers brought about ${usdFmt(buysPerHour)} an hour in this window. Selling no more than ${PACE * 100}% of that each hour, the bag takes about `}
            <b className="font-medium text-text">{Math.max(1, Math.ceil(mark / (buysPerHour * PACE)))} h</b> to sell without leaning on the price.
          </p>
        )}
        {need !== null && (
          <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
            {need <= 0 ? (
              <>A full sale already returns more than you paid.</>
            ) : (
              <>
                The pool price must rise <b className="font-medium text-[var(--lav)]">{(need * 100).toFixed(1)}%</b> before a full sale returns what you paid.
                {lift && <> On this pool&apos;s curve that takes about <b className="font-medium text-text">{usdFmt(lift.base)}</b> of net buying.</>}
              </>
            )}
          </p>
        )}
      </div>
    </Pane>
  );
}

/* ------------------------------------------------------------------ the terminal */
export function Terminal() {
  // column widths and chart height: dragged like the side rail, kept in this browser
  const [tl, setTl, tlDef] = useSize("term.left", 272, 200, 460);
  // the token list can be put away entirely, for the chart's room; remembered on this device
  const [hideList, setHideList] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("term.hideList") === "1") void Promise.resolve().then(() => setHideList(true));
    } catch {
      // storage off: shown
    }
  }, []);
  const toggleList = (v: boolean) => {
    setHideList(v);
    try {
      localStorage.setItem("term.hideList", v ? "1" : "0");
    } catch {
      // convenience only
    }
  };
  const [tr, setTr, trDef] = useSize("term.right", 336, 260, 560);
  const [chartH, setChartH, chartDef] = useSize("term.chart3", 680, 260, 1400);
  const [addr, setAddr] = useState<string>(DEFAULT);
  const [m, setM] = useState<Market | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none" | "error">("loading");
  const [msg, setMsg] = useState("");
  const [tf, setTf] = useState<(typeof TF)[number]["id"]>("900");
  const [mode, setMode] = useState<"candles" | "line">("candles");
  const [usd, setUsd] = useState(true);
  const [tab, setTab] = useState<"trades" | "holders" | "pulse" | "liquidity" | "checks">("trades");
  const [quick, setQuick] = useState<{ side: "buy" | "sell"; usd?: number; share?: number; n: number } | null>(null);
  // below the three-column width the ticket sits under the chart and the trades: a quick trade also brings it on screen
  const toTicket = (q: { side: "buy" | "sell"; usd?: number; share?: number; n: number }) => {
    setQuick(q);
    if (!matchMedia("(min-width: 1280px)").matches) requestAnimationFrame(() => document.getElementById("ticket")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [now, setNow] = useState(0);
  const [stock, setStock] = useState<{ issuer: Set<string>; fake: Map<string, string> } | null>(null);
  const [closes, setCloses] = useState<Map<string, { close: number; at: number }>>(new Map());

  // last market closes for issuer stock tokens (the weekend gap snapshot)
  useEffect(() => {
    let off = false;
    fetch("/api/gap")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: { token: string; close: number | null; closeAt: number | null }[] } | null) => {
        if (off || !j?.rows) return;
        setCloses(new Map(j.rows.filter((r) => r.close !== null).map((r) => [r.token.toLowerCase(), { close: r.close!, at: r.closeAt ?? 0 }])));
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);

  // the stock desk's lists: is this token the issuer's stock token, or a lookalike of one?
  useEffect(() => {
    let off = false;
    fetch("/api/stocks")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: { address: string }[]; lookalikes?: { address: string; symbol: string }[] } | null) => {
        if (off || !j?.rows) return;
        setStock({ issuer: new Set(j.rows.map((r) => r.address.toLowerCase())), fake: new Map((j.lookalikes ?? []).map((l) => [l.address.toLowerCase(), l.symbol])) });
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);

  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    const id = setInterval(tick, 15_000);
    void Promise.resolve().then(tick);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (t && /^0x[0-9a-fA-F]{40}$/.test(t)) void Promise.resolve().then(() => setAddr(t));
  }, []);

  const pick = useCallback((a: string) => {
    setAddr(a);
    const u = new URL(window.location.href);
    u.searchParams.set("token", a);
    window.history.replaceState(null, "", u);
  }, []);

  useEffect(() => {
    let off = false;
    const load = (quiet: boolean) => {
      if (!quiet) {
        setState("loading");
        setChecks(null);
      }
      const url = (w: number) => `/api/market?token=${addr}&w=${w}`;
      if (!quiet)
        fetch(url(4))
          .then((r) => (r.ok ? r.json() : null))
          .then((j: (Market & { none?: boolean }) | null) => {
            if (!off && j && !j.none && "token" in j) setM((cur) => (cur && cur.token.address.toLowerCase() === addr.toLowerCase() && cur.trades.length > j.trades.length ? cur : j)), setState((s) => (s === "loading" ? "ok" : s));
          })
          .catch(() => undefined);
      // busy (503) or over the rate (429): wait as the server asks and try again, the screen stays on "loading";
      // a failure of the day-long read never wipes what the short read already showed
      type DayRes = { ok: boolean; j: Market & { error?: string; none?: boolean } };
      const day = (tries: number): Promise<DayRes> =>
        fetch(url(36)).then(async (r): Promise<DayRes> => {
          if ((r.status === 503 || r.status === 429) && tries < 6 && !off) {
            const s = Math.min(15, Math.max(2, Number(r.headers.get("retry-after")) || 3));
            await new Promise((ok) => setTimeout(ok, s * 1000));
            return day(tries + 1);
          }
          return { ok: r.ok, j: (await r.json()) as Market & { error?: string; none?: boolean } };
        });
      day(0)
        .then(({ ok, j }) => {
          if (off) return;
          if (!ok || j.error) return setState((s) => (s === "ok" ? s : (setMsg(j.error ?? "The chain did not answer."), "error")));
          if (j.none) return setState("none");
          setM(j);
          setState("ok");
        })
        .catch(() => !off && setState((s) => (s === "ok" ? s : (setMsg("The chain did not answer."), "error"))));
    };
    load(false);
    const id = setInterval(() => !document.hidden && load(true), 30_000);
    return () => {
      off = true;
      clearInterval(id);
    };
  }, [addr]);

  useEffect(() => {
    if (checks) return;
    let off = false;
    fetch(`/api/token?q=${addr}`)
      .then((r) => r.json())
      .then((j: { checks?: Check[] }) => !off && setChecks(j.checks ?? []))
      .catch(() => !off && setChecks([]));
    return () => {
      off = true;
    };
  }, [addr, checks]);

  const live = state === "ok" && m && m.token.address.toLowerCase() === addr.toLowerCase() ? m : state === "ok" ? m : null;
  const k = live && usd ? live.base.usd || 1 : 1;
  const unit = live ? (usd ? "USD" : live.base.symbol) : "";
  const ticks: Tick[] = useMemo(() => (live ? live.trades.map((t) => ({ t: t.t, price: t.price * k, vol: t.base * k, side: t.side })) : []), [live, k]);
  // liquidity moves, and the developer's own buys and sells
  const devTrades = useMemo(() => (live?.dev ? live.trades.filter((x) => (x.from ?? x.who)?.toLowerCase() === live.dev!.address) : []), [live]);
  const markers: Marker[] = useMemo(
    () => (live ? [...live.lp.map((e) => ({ t: e.t, kind: e.kind })), ...devTrades.map((x) => ({ t: x.t, kind: x.side === "buy" ? ("devbuy" as const) : ("devsell" as const), usd: x.base * (live.base.usd || 1) }))] : []),
    [live, devTrades],
  );
  const bars = useMemo(() => toBars(ticks, Number(tf), now || undefined), [ticks, tf, now]);

  const stats = useMemo(() => {
    if (!live) return null;
    const end = Math.max(now, ...live.trades.map((t) => t.t));
    const win = (sec: number) => live.trades.filter((t) => t.t >= end - sec);
    const agg = (ts: Trade[]) => {
      const buys = ts.filter((t) => t.side === "buy"), sells = ts.filter((t) => t.side === "sell");
      const bv = buys.reduce((s, t) => s + t.base, 0) * live.base.usd, sv = sells.reduce((s, t) => s + t.base, 0) * live.base.usd;
      return { n: ts.length, buys: buys.length, sells: sells.length, bv, sv, net: bv - sv, takers: new Set(ts.map((t) => t.who)).size };
    };
    const day = live.trades;
    const first = day[day.length - 1]?.price, last = live.price ?? day[0]?.price;
    const pxUsd = (last ?? 0) * live.base.usd;
    const hours = Math.max(1, Math.round((end - live.since) / 3600));
    return {
      hours,
      pxUsd,
      change: first && last ? (last - first) / first : null,
      fdv: live.token.supply ? live.token.supply * pxUsd : null,
      liq: live.reserves ? live.reserves.base * 2 * live.base.usd : null,
      hi: day.length ? Math.max(...day.map((t) => t.price)) * live.base.usd : null,
      lo: day.length ? Math.min(...day.map((t) => t.price)) * live.base.usd : null,
      d: agg(day),
      w: { "5m": agg(win(300)), "1h": agg(win(3600)), "6h": agg(win(21600)), [`${hours}h`]: agg(day) } as Record<string, ReturnType<typeof agg>>,
    };
  }, [live, now]);

  // the developer's wallet and what it did in the window on the chart (marked D on the candles)
  const devSum = devTrades.reduce((s, x) => ({ b: s.b + (x.side === "buy" ? 1 : 0), s: s.s + (x.side === "sell" ? 1 : 0), bu: s.bu + (x.side === "buy" ? x.base : 0), su: s.su + (x.side === "sell" ? x.base : 0) }), { b: 0, s: 0, bu: 0, su: 0 });
  const devStrip = live && (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-4 py-1.5 text-[12px]">
      <span className="font-medium text-[12px] uppercase tracking-[0.1em] text-muted">Dev</span>
      {live.dev ? (
        <>
          <a href={`https://robinhoodchain.blockscout.com/address/${live.dev.address}`} target="_blank" rel="noreferrer" className="font-mono text-text underline decoration-line underline-offset-2 hover:decoration-leaf">
            {`${live.dev.address.slice(0, 6)}…${live.dev.address.slice(-4)}`}
          </a>
          <span className="text-muted">{live.dev.from === "launchpad" ? "created the token" : "made the pool"}</span>
          <a href={`/app/trust/creator?address=${live.dev.address}`} className="text-leaf underline decoration-leaf/30 underline-offset-2 hover:decoration-leaf">
            Everything they launched →
          </a>
          {devTrades.length ? (
            <>
              <span className="text-leaf">{`bought ${devSum.b}× · ${usdFmt(devSum.bu * (live.base.usd || 1))}`}</span>
              <span className="text-flesh">{`sold ${devSum.s}× · ${usdFmt(devSum.su * (live.base.usd || 1))}`}</span>
            </>
          ) : (
            <span className="text-muted">no trades by this wallet in the window on the chart</span>
          )}
          <span className="ml-auto flex items-center gap-1.5 text-muted">
            <i className="grid h-3.5 w-3.5 place-items-center rounded-full bg-ui text-[8px] font-bold not-italic text-[#0b0b0b]">D</i>
            marks on the chart
          </span>
        </>
      ) : (
        <span className="text-muted">No single developer wallet known for this token.</span>
      )}
    </div>
  );
  const venueStrip = live?.all && (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line bg-[color-mix(in_srgb,var(--lav-bg)_35%,transparent)] px-4 py-2 text-[13px]">
      <span className="font-medium text-[12px] uppercase tracking-[0.1em] text-[var(--lav)]">Across venues</span>
      <span className="text-muted">
        Price <b className="font-mono font-normal text-text">{live.all.price != null ? `$${fmtPx(live.all.price)}` : "—"}</b>
        {live.all.change != null && <span className={cx("ml-1.5 font-mono", live.all.change >= 0 ? "text-leaf" : "text-flesh")}>{`${live.all.change >= 0 ? "+" : ""}${live.all.change.toFixed(2)}%`}</span>}
      </span>
      <span className="text-muted">
        Liquidity <b className="font-mono font-normal text-text">{usdFmt(live.all.liquidity)}</b>
      </span>
      <span className="text-muted">
        Volume 24h <b className="font-mono font-normal text-text">{usdFmt(live.all.volume)}</b>
      </span>
      <span className="text-muted">
        Trades <b className="font-mono font-normal text-leaf">{live.all.buys}</b> / <b className="font-mono font-normal text-flesh">{live.all.sells}</b>
      </span>
      <span className="truncate text-muted">
        {live.all.pairs} pools on {live.all.venues.length} venue{live.all.venues.length === 1 ? "" : "s"}: {live.all.venues.join(", ")}
      </span>
    </div>
  );

  const head = live && stats && (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-mono text-[15px] text-text">
          <TokenAvatar address={live.token.address} symbol={live.token.symbol} stock={!!stock?.issuer.has(live.token.address.toLowerCase())} size={32} />
          {live.token.symbol} <span className="text-muted">/ {live.pool.base}</span>
          <WatchButton kind="token" value={live.token.address} label={live.token.symbol} />
          {stock?.issuer.has(live.token.address.toLowerCase()) && <span className="border border-leaf/50 px-1.5 font-medium text-[12px] uppercase tracking-[0.08em] text-leaf">✓ Issuer stock token</span>}
          {stock?.fake.has(live.token.address.toLowerCase()) && <span className="border border-flesh/60 bg-flesh-deep/50 px-1.5 font-medium text-[12px] uppercase tracking-[0.08em] text-flesh">✕ Lookalike · not the issuer</span>}
          <button type="button" onClick={() => setTab("checks")} className="flex items-center gap-2 border border-line px-1.5 font-medium text-[12px] uppercase tracking-[0.08em] text-muted hover:border-ui/60 hover:text-text">
            {!checks ? (
              "Checking…"
            ) : (
              (["pass", "warn", "fail", "unknown"] as const).map((k) => {
                const n = checks.filter((c) => c.result === k).length;
                return n ? (
                  <span key={k} className={MARK[k][1]}>
                    {MARK[k][0]} {n}
                  </span>
                ) : null;
              })
            )}
          </button>
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {live.token.name} · {short(live.token.address)}
        </p>
      </div>
      <div>
        <p className="font-display text-3xl tabular-nums">{stats.pxUsd ? `$${fmtPx(stats.pxUsd)}` : "—"}</p>
        <p className={cx("font-mono text-[12px]", stats.change === null ? "text-muted" : stats.change >= 0 ? "text-leaf" : "text-flesh")}>{stats.change === null ? "—" : `${stats.change >= 0 ? "+" : ""}${(stats.change * 100).toFixed(2)}% · ${stats.hours}h`}</p>
      </div>
      {[
        ["FDV", stats.fdv ? usdFmt(stats.fdv) : "—"],
        [`Vol ${stats.hours}h`, usdFmt(stats.d.bv + stats.d.sv)],
        ["Liquidity", stats.liq ? usdFmt(stats.liq) : "—"],
        ...(closes.has(live.token.address.toLowerCase())
          ? (() => {
              const c = closes.get(live.token.address.toLowerCase())!;
              const g = stats.pxUsd / c.close - 1;
              return [["Last close", `$${fmtPx(c.close)}`], ["Vs close", `${g >= 0 ? "+" : ""}${(g * 100).toFixed(2)}%`]] as [string, string][];
            })()
          : []),
        [`Exit at −${EXIT_MOVE * 100}%`, live.ladder ? usdFmt((live.ladder.down.find((s) => s.move === EXIT_MOVE)?.base ?? 0) * live.base.usd) : "—"],
        [`Swaps ${stats.hours}h`, stats.d.n.toLocaleString("en")],
        ["Takers", stats.d.takers.toLocaleString("en")],
        ["Pool", `${live.pool.kind === "v4" ? "v4" : "V2"}${live.pool.hooked ? " · hook" : ""}${live.pool.fee != null ? ` · ${live.pool.fee / 10000}%` : ""}`],
      ].map(([a, b]) => (
        <div key={a}>
          <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{a}</p>
          <p className="font-mono text-sm text-text">{b}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative mt-4 grid grid-cols-1 gap-3 xl:items-start xl:gap-x-0 xl:grid-cols-(--cols)" style={{ ["--cols" as string]: hideList ? `44px minmax(0,1fr) 12px ${tr}px` : `${tl}px 12px minmax(0,1fr) 12px ${tr}px` }}>
      <div className={cx("order-2 min-w-0 xl:sticky xl:top-20 xl:order-none xl:flex xl:h-[calc(100vh/var(--vz)-6rem)] xl:flex-col", hideList && "xl:hidden")}>
        <TokenList current={addr} onPick={pick} onHide={() => toggleList(true)} />
      </div>
      {hideList ? (
        <div className="hidden xl:block">
          <button type="button" onClick={() => toggleList(false)} title="Show the token list" aria-label="Show the token list" className="sticky top-20 grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-ui/60 hover:text-text">
            <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9.5 4.5v15" /></svg>
          </button>
        </div>
      ) : (
        <Gutter dir="x" value={tl} set={setTl} def={tlDef} label="Token list width" className="hidden h-full xl:flex" />
      )}

      <div className="order-1 min-w-0 space-y-3 xl:order-none">
        <Pane title="Market" busy={state === "loading"} status={<Led tone={state === "error" ? "bad" : state === "ok" ? "on" : "off"} live={state === "ok"} label={state === "ok" && live ? `Block #${live.head.toLocaleString("en")} · ${(live.ms / 1000).toFixed(1)} s` : state === "loading" ? "Reading swaps" : state === "none" ? "No pool" : "Paused"} />}>
          {state === "error" && <p className="bg-flesh-deep/50 px-4 py-3 text-sm text-text">{msg}</p>}
          {state === "none" && <Idle className="min-h-72">No V2 or v4 pool against ETH, WETH or USDG was found for this token.</Idle>}
          {state === "loading" && !live && <Idle className="min-h-72">Reading a day of swaps from the chain…</Idle>}
          {head}
          {live && <Verdict token={live.token.address} checks={checks} liq={live.all?.liquidity ?? null} onOpen={() => setTab("checks")} />}
          {venueStrip}
          {devStrip}
          {live && stats && stats.liq !== null && stats.liq < 1000 && (
            <p className="flex items-start gap-2 border-b border-line bg-flesh-deep/40 px-4 py-2.5 text-[13px] text-text">
              <span aria-hidden className="text-flesh">▲</span>
              Thin pool: {usdFmt(stats.liq)} of liquidity. The price above is what one tiny swap paid, not what a real order would get.
            </p>
          )}
          {live && (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2">
                <Seg label="Chart type" value={mode} options={[{ id: "candles", label: "Candles" }, { id: "line", label: "Line" }]} onChange={setMode} />
                <Seg label="Interval" value={tf} options={TF} onChange={setTf} />
                <Seg label="Unit" value={usd ? "usd" : "base"} options={[{ id: "usd", label: "USD" }, { id: "base", label: live.base.symbol }]} onChange={(v) => setUsd(v === "usd")} />
                <span className="ml-auto flex flex-wrap items-center gap-1 text-[12px]" title={`${live.trades.length} swaps since ${new Date(live.since * 1000).toISOString().slice(11, 16)} UTC; a click fills the ticket`}>
                  <span className="mr-1 text-muted">Quick</span>
                  {[10, 50, 100].map((u) => (
                    <button key={u} type="button" onClick={() => toTicket({ side: "buy", usd: u, n: Date.now() })} className="rounded-md border border-leaf/40 bg-leaf/10 px-2.5 py-1.5 sm:px-2 sm:py-0.5 font-mono text-leaf hover:bg-leaf/20">
                      {`$${u}`}
                    </button>
                  ))}
                  {[50, 100].map((s) => (
                    <button key={s} type="button" onClick={() => toTicket({ side: "sell", share: s / 100, n: Date.now() })} className="rounded-md border border-flesh/40 bg-flesh/10 px-2.5 py-1.5 sm:px-2 sm:py-0.5 font-mono text-flesh hover:bg-flesh/20">
                      {`Sell ${s}%`}
                    </button>
                  ))}
                </span>
              </div>
              <div className="px-2 pt-2">
                <Candles bars={bars} mode={mode} unit={unit} markers={markers} height={chartH} drawKey={live.token.address.toLowerCase()} />
              </div>
              <Gutter dir="y" value={chartH} set={setChartH} def={chartDef} label="Chart height" className="w-full" />
              {stats && (
                <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
                  {[
                    [`${stats.hours}h high`, stats.hi ? `$${fmtPx(stats.hi)}` : "—"],
                    [`${stats.hours}h low`, stats.lo ? `$${fmtPx(stats.lo)}` : "—"],
                    ["Buys / sells", `${stats.d.buys} / ${stats.d.sells}`],
                    [`Net flow ${stats.hours}h`, `${stats.d.net >= 0 ? "+" : "−"}${usdFmt(Math.abs(stats.d.net))}`],
                  ].map(([a, b]) => (
                    <div key={a} className="bg-bg px-4 py-2.5">
                      <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{a}</p>
                      <p className="font-mono text-sm text-text">{b}</p>
                    </div>
                  ))}
                </div>
              )}
              {stats && stats.d.bv + stats.d.sv > 0 && (
                <div className="flex h-1.5">
                  <div className="bg-leaf" style={{ width: `${(stats.d.bv / (stats.d.bv + stats.d.sv)) * 100}%` }} />
                  <div className="flex-1 bg-flesh" />
                </div>
              )}
            </>
          )}
        </Pane>

        {live && stats && (
          <Pane title="Activity" status={<Seg label="Activity view" value={tab} options={[{ id: "trades", label: "Activity" }, { id: "holders", label: "Holders" }, { id: "pulse", label: "Pulse" }, { id: "liquidity", label: "Liquidity" }, { id: "checks", label: "Checks" }]} onChange={setTab} />}>
            {tab === "trades" && <TerminalFeed live={live} now={now} />}
            {tab === "pulse" && (
              <div className="grid gap-px bg-line sm:grid-cols-4">
                {(Object.entries(stats.w) as [string, typeof stats.d][]).map(([w, a]) => (
                  <div key={w} className="bg-bg p-4">
                    <p className="font-medium text-[12px] uppercase tracking-[0.1em] text-leaf">{w}</p>
                    <p className="mt-2 font-display text-2xl">{a.n}</p>
                    <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">swaps · {a.takers} takers</p>
                    <div className="mt-3 flex h-1.5 bg-line">{a.bv + a.sv > 0 && <div className="bg-leaf" style={{ width: `${(a.bv / (a.bv + a.sv)) * 100}%` }} />}</div>
                    <p className="mt-2 flex justify-between font-mono text-[12px]">
                      <span className="text-leaf">{usdFmt(a.bv)}</span>
                      <span className="text-flesh">{usdFmt(a.sv)}</span>
                    </p>
                    <p className={cx("mt-1 font-mono text-[12px]", a.net >= 0 ? "text-leaf" : "text-flesh")}>net {a.net >= 0 ? "+" : "−"}{usdFmt(Math.abs(a.net))}</p>
                  </div>
                ))}
              </div>
            )}
            {tab === "liquidity" && live.lp.length > 0 && (
              <ul className="max-h-48 overflow-y-auto border-b border-line">
                {live.lp.slice(0, 30).map((e) => (
                  <li key={e.tx + e.block} className="grid grid-cols-[3.5rem_6rem_1fr_7rem] gap-3 border-b border-line/50 px-4 py-2 font-mono text-xs last:border-0">
                    <span className="text-muted">{ago(e.t, now)}</span>
                    <span className={e.kind === "add" ? "text-leaf" : "text-flesh"}>{e.kind === "add" ? "▲ added" : "▼ removed"}</span>
                    <span className="truncate text-text">{e.base !== null ? `${fmtPx(e.base)} ${live.base.symbol} + ${fmtPx(e.token ?? 0)} ${live.token.symbol}` : "range position changed"}</span>
                    <span className="text-right text-muted">{short(e.tx)}</span>
                  </li>
                ))}
              </ul>
            )}
            {tab === "liquidity" &&
              (live.ladder ? (
                <div>
                  <p className="border-b border-line px-4 py-2.5 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                    {live.reserves
                      ? `The pool's own curve: what it takes to move the price, before the 0.3% fee · reserves ${fmtPx(live.reserves.token)} ${live.token.symbol} / ${fmtPx(live.reserves.base)} ${live.base.symbol}`
                      : "The v4 pool's curve from the liquidity in range now, before fees: exact for a full-range pool, an estimate where a range ends inside the move"}
                  </p>
                  <div className="grid gap-px bg-line sm:grid-cols-2">
                    {(["up", "down"] as const).map((s) => (
                      <table key={s} className="w-full border-collapse bg-bg text-left text-[13px]">
                        <thead>
                          <tr className="border-b border-line">
                            {[s === "up" ? "Price up" : "Price down", s === "up" ? "Buys needed" : "Sells needed", "USD"].map((h) => (
                              <th key={h} scope="col" className="px-4 py-2.5 font-medium text-[12px] font-normal uppercase tracking-[0.08em] text-muted">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {live.ladder![s].map((x) => (
                            <tr key={x.move} className="border-b border-line/50 font-mono text-xs">
                              <td className={cx("px-4 py-2", s === "up" ? "text-leaf" : "text-flesh")}>
                                {s === "up" ? "+" : "−"}
                                {(x.move * 100).toFixed(1)}%
                              </td>
                              <td className="px-4 py-2 text-text">
                                {fmtPx(x.base)} {live.base.symbol}
                              </td>
                              <td className="px-4 py-2 text-muted">{usdFmt(x.base * live.base.usd)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ))}
                  </div>
                </div>
              ) : (
                <Idle>The pool&apos;s liquidity could not be read right now. Try again in a minute.</Idle>
              ))}
            {tab === "holders" && <HoldersPanel token={live.token.address} symbol={live.token.symbol} />}
            {tab === "checks" && (
              <div>
                {!checks && <Idle>Running seven checks on the live pool…</Idle>}
                {checks?.map((c) => (
                  <div key={c.id} className="grid grid-cols-[6rem_9rem_1fr] gap-3 border-b border-line/60 px-4 py-2.5 text-[13px] last:border-0">
                    <span className={cx("font-medium text-[12px] uppercase", MARK[c.result][1])}>
                      {MARK[c.result][0]} {c.result === "warn" ? "caution" : c.result}
                    </span>
                    <span className="text-text">{c.name}</span>
                    <span className="truncate text-muted">{c.reason}</span>
                  </div>
                ))}
                {checks && (
                  <Link href={`/app/trust/check?q=${live.token.address}`} className="block px-4 py-2.5 font-medium text-[12px] uppercase tracking-[0.08em] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                    Full report →
                  </Link>
                )}
              </div>
            )}
          </Pane>
        )}
      </div>

      <Gutter dir="x" value={tr} set={setTr} def={trDef} sign={-1} label="Ticket width" className="hidden h-full xl:flex" />
      <div id="ticket" className="order-3 min-w-0 scroll-mt-32 space-y-3 pb-16 xl:sticky xl:pb-0 xl:top-20 xl:order-none xl:max-h-[calc(100vh/var(--vz)-6rem)] xl:overflow-y-auto">
        {live ? <Ticket key={live.token.address} m={live} quick={quick} /> : <Pane title="Ticket"><Idle className="min-h-60">Pick a token</Idle></Pane>}
        {/* phones and tablets: the ticket is far below the chart, so Buy and Sell stay at hand at the bottom of the screen */}
        {live && (
          <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t border-line bg-[#0b0b0b] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] xl:hidden">
            <button type="button" onClick={() => toTicket({ side: "buy", n: Date.now() })} className="h-11 truncate rounded-xl bg-leaf px-2 font-medium text-[14px] text-[#07130c]">{`Buy ${live.token.symbol}`}</button>
            <button type="button" onClick={() => toTicket({ side: "sell", n: Date.now() })} className="h-11 truncate rounded-xl border border-flesh/60 px-2 font-medium text-[14px] text-flesh">{`Sell ${live.token.symbol}`}</button>
          </div>
        )}
        {live && <ExitPlan key={`x-${live.token.address}`} m={live} />}
        <MyRecent />
        {live && <TokenCard key={`i-${live.token.address}`} m={live} now={now} checks={checks} />}
        {live && (
          <p className="px-3 py-3 text-[12px] leading-relaxed text-muted">
            Prices come from this pool&apos;s swaps; dollars through the WETH/USDG pool. A thin pool moves on small trades. Read Checks before you buy.
          </p>
        )}
      </div>
      <Support />
    </div>
  );
}

/* ------------------------------------------------------------------ my swaps */
/** Your own recent swaps from Corbel, shown once there is at least one. */
function MyRecent() {
  const acts = useActs();
  if (!acts.length) return null;
  return (
    <Pane title="Your swaps">
      <MySwaps compact />
    </Pane>
  );
}

/* ------------------------------------------------------------------ token card */
const SCAN = "https://robinhoodchain.blockscout.com";
const since = (ms: number, nowS: number) => {
  const s = Math.max(0, nowS - Math.floor(ms / 1000));
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
};

/** What the token is and who made it: contract, network, venue, age, the pool maker and their record, links. */
function TokenCard({ m, now, checks }: { m: Market; now: number; checks: Check[] | null }) {
  const [copied, setCopied] = useState(false);
  const a = m.token.address, l = m.launcher, all = m.all;
  const copy = () => {
    void navigator.clipboard?.writeText(a).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200)));
  };
  const rows: [string, ReactNode][] = [
    [
      "Contract",
      <span key="c" className="inline-flex items-center gap-1.5">
        <a href={`${SCAN}/token/${a}`} target="_blank" rel="noreferrer noopener" className="font-mono text-text hover:text-leaf">
          {short(a)}
        </a>
        <button type="button" onClick={copy} aria-label="Copy contract address" title="Copy" className="rounded px-1 font-mono text-[12px] text-muted hover:bg-[#181818] hover:text-leaf">
          {copied ? "✓" : "⧉"}
        </button>
      </span>,
    ],
    ["Network", "Robinhood Chain"],
    ["Venue", `${all?.dex ?? (m.pool.kind === "v4" ? "Uniswap v4" : "Uniswap V2")}${all && all.pairs > 1 ? ` · ${all.pairs} pools` : ""}`],
    ["Launched", all?.created && now ? since(all.created, now) : "—"],
  ];
  if (m.token.supply) rows.push(["Supply", m.token.supply.toLocaleString("en", { maximumFractionDigits: 0 })]);
  if (all?.fdv) rows.push(["Fully diluted", usdFmt(all.fdv)]);
  if (l) {
    rows.push([
      "Pool maker",
      <a key="w" href={`/app/portfolio?address=${l.address}`} className="font-mono text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
        {short(l.address)}
      </a>,
    ]);
    rows.push([
      "Maker record",
      <span key="r" className={l.dead > 0 ? "text-flesh" : "text-text"}>
        {l.launches} pool{l.launches === 1 ? "" : "s"} this week · {l.dead} drained
      </span>,
    ]);
  }
  const links = [...(all?.links ?? []), { label: "Explorer", url: `${SCAN}/token/${a}` }];
  return (
    <Pane title="Token">
      <dl className="divide-y divide-line/60 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 truncate text-right text-text">{v}</dd>
          </div>
        ))}
        <div className="flex items-start justify-between gap-3 px-3 py-2">
          <dt className="text-muted">Links</dt>
          <dd className="flex flex-wrap justify-end gap-x-3 gap-y-1">
            {links.map((x) => (
              <a key={x.url} href={x.url} target="_blank" rel="noreferrer noopener nofollow" className="text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                {x.label} ↗
              </a>
            ))}
          </dd>
        </div>
      </dl>
      <a href={`/app/trade/check?q=${a}`} className="flex w-full items-center justify-between border-t border-line px-3 py-2.5 text-[13px] text-leaf hover:bg-[#181818]">
        <span>All checks of this token{checks ? ` (${checks.length})` : ""}</span>
        <span aria-hidden>→</span>
      </a>
    </Pane>
  );
}

/* ------------------------------------------------------------------ verdict */
const VTONE = (n: number) => (n >= 80 ? "text-leaf" : n >= 60 ? "text-text" : n >= 40 ? "text-[var(--lav)]" : "text-flesh");

/** The coin's verdict at a glance: Corbel Score with its parts, and who holds it. */
function Verdict({ token, checks, onOpen, liq }: { token: string; checks: Check[] | null; onOpen: () => void; liq?: number | null }) {
  const { d } = useHolders(token);
  const sc = checks && checks.length ? score(checks as ScoreCheck[], briefOf(d as Parameters<typeof briefOf>[0]), liq ? { liquidity: liq } : null) : null;
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 text-[13px]", !sc ? "bg-[#101010]" : sc.total >= 60 ? "bg-leaf/[0.06]" : sc.total >= 40 ? "bg-amber/[0.07]" : "bg-flesh/[0.08]")}>
        <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-muted">Market health</span>
        {sc ? (
          <button type="button" onClick={onOpen} className="flex items-baseline gap-1.5 hover:opacity-90">
            <b className={cx("font-display text-[24px] font-normal leading-none tabular-nums", VTONE(sc.total))}>{sc.total}</b>
            <span className="text-muted">/90</span>
            <span className={cx("font-mono text-[12px] tracking-[0.1em]", VTONE(sc.total))}>{sc.tag}</span>
          </button>
        ) : (
          <span className="caret font-mono text-muted">checking</span>
        )}
        {sc?.parts.map((p) => (
          <span key={p.id} className="text-muted">
            {p.label} <b className={cx("font-mono font-normal", VTONE(p.score))}>{p.score}</b>
          </span>
        ))}
        {sc && <span className="min-w-0 flex-1 truncate text-[14px] text-text" title={sc.why}>{sc.why}</span>}
        <button type="button" onClick={() => setOpen(true)} className="ml-auto shrink-0 text-muted hover:text-text">
          Details ▾
        </button>
      </div>
    );
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setOpen(false)} className="flex w-full justify-end bg-[#101010] px-4 py-1 text-[12px] text-muted hover:text-text">
        Hide ▴
      </button>
      <div className="flex flex-wrap items-stretch gap-px bg-line">
        <button type="button" onClick={onOpen} className="flex min-w-[11rem] flex-col justify-center bg-[#131313] px-4 py-3 text-left hover:bg-[#181818]">
          <span className="text-[12px] text-muted">Corbel Score</span>
          {sc ? (
            <span className="flex items-baseline gap-2">
              <span className={cx("font-display text-4xl leading-none", VTONE(sc.total))}>{sc.total}</span>
              <span className="text-[12px] text-muted">/90</span>
              <span className={cx("font-mono text-[12px] tracking-[0.1em]", VTONE(sc.total))}>{sc.tag}</span>
            </span>
          ) : (
            <span className="font-mono text-[13px] text-muted">checking…</span>
          )}
        </button>
        {sc?.parts.map((p) => (
          <div key={p.id} className="min-w-[7rem] flex-1 bg-[#131313] px-3 py-3">
            <p className="flex justify-between text-[12px] text-muted">
              {p.label} <span className={cx("font-mono", VTONE(p.score))}>{p.score}</span>
            </p>
            <div className="mt-2 flex h-1.5 gap-0.5">
              {[0, 20, 40, 60, 80].map((x) => (
                <span key={x} className={cx("flex-1 rounded-sm", p.score > x ? (p.score >= 60 ? "bg-leaf" : p.score >= 40 ? "bg-[var(--lav)]" : "bg-flesh") : "bg-[#242424]")} />
              ))}
            </div>
            <p className={cx("mt-1 font-mono text-[12px] tracking-[0.1em]", VTONE(p.score))}>{p.tag}</p>
          </div>
        ))}
      </div>
      {sc && <p className="bg-[#101010] px-4 py-2 text-[12px] text-text">{sc.why}</p>}
      {d && <InsiderStrip d={d} />}
    </div>
  );
}
