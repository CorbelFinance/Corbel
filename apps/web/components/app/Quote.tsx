"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import { Idle, Instrument, Led, Meter, Readout, Seg, fmtNum, short } from "./kit";
import { TokenAvatar } from "./TokenAvatar";
import { SwapButton } from "./SwapButton";
import { ChainActivity, MySwaps, PairChart, PairToken, QuoteSummary, SizeLadder, subjectOf } from "./QuoteMarket";
import { useActs } from "./activity";

type Asset = { address: string; symbol: string; decimals: number };
type Hop = { venue: "v2" | "v4" | "unwrap"; pool: string; from: string; to: string; fee: number | null; hooked: boolean };
type Route = { hops: Hop[]; amountOut: string | null; gas: number | null; ok: boolean; reason: string | null };
type Q = { from: Asset; to: Asset; amountIn: string; block: string; routes: Route[]; best: number | null; impact: number | null; gasPriceWei: string; ms: number };
type Pick = { key: string; symbol: string; name?: string | null };

const PRESETS: Pick[] = [
  { key: "ETH", symbol: "ETH" },
  { key: "USDG", symbol: "USDG" },
  { key: "WETH", symbol: "WETH" },
];
const NATIVE = "0x0000000000000000000000000000000000000000";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const SLIPS = [
  { id: "0.005", label: "0.5%" },
  { id: "0.01", label: "1%" },
  { id: "0.03", label: "3%" },
] as const;
const REFRESH_MS = 15_000;

const units = (raw: string, d: number) => Number(raw) / 10 ** d;
const symFor = (addr: string, q: Q) => {
  const a = addr.toLowerCase();
  if (a === NATIVE) return "ETH";
  if (a === WETH) return "WETH";
  if (a === USDG) return "USDG";
  if (a === q.from.address.toLowerCase()) return q.from.symbol;
  if (a === q.to.address.toLowerCase()) return q.to.symbol;
  return short(addr);
};
// v4 fees are in hundredths of a basis point: 3000 = 0.30%, 45 = 0.0045%, 1 = 0.0001%
const feeText = (h: Hop) => (h.venue === "unwrap" ? "1:1" : h.fee === null ? "dyn. fee" : `${Number((h.fee / 10_000).toPrecision(2))}%`);

type Row = { address: string; symbol: string; name: string; price: number | null; change: number | null; volume: number | null; stock?: boolean };
const usdS = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
const pxS = (v: number) => (v >= 1000 ? `$${v.toLocaleString("en", { maximumFractionDigits: 2 })}` : v >= 1 ? `$${v.toFixed(4)}` : `$${v.toPrecision(3)}`);
const BASES: Row[] = [
  { address: NATIVE, symbol: "ETH", name: "Ether", price: null, change: null, volume: null },
  { address: USDG, symbol: "USDG", name: "Global Dollar", price: 1, change: null, volume: null },
  { address: WETH, symbol: "WETH", name: "Wrapped Ether", price: null, change: null, volume: null },
];
let cache: { at: number; rows: Row[] } | null = null;

/** Popular tokens for the picker: the trending list and the busiest stock tokens, read once per minute. */
async function loadPopular(): Promise<Row[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  const j = (await fetch("/api/trending").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))) as { rows?: { token: string; symbol: string | null; name: string | null; price?: number | null; change?: number | null; volume: number }[]; stocks?: { token: string; symbol: string; name: string; price: number | null; change: number | null; volume: number }[] };
  const rows: Row[] = [
    ...(j.stocks ?? []).map((s) => ({ address: s.token, symbol: s.symbol, name: s.name.replace(/ • Robinhood Token$/, ""), price: s.price, change: s.change, volume: s.volume, stock: true })),
    ...(j.rows ?? []).filter((r) => !["ETH", "WETH", "USDG"].includes((r.symbol ?? "").toUpperCase())).slice(0, 80).map((r) => ({ address: r.token, symbol: r.symbol ?? "?", name: r.name ?? "", price: r.price ?? null, change: r.change ?? null, volume: r.volume })),
  ];
  // ETH and WETH carry the price the trending list read for ether
  const eth = (j.rows ?? []).find((r) => (r.symbol ?? "").toUpperCase() === "ETH" || (r.symbol ?? "").toUpperCase() === "WETH");
  for (const b of BASES) if (b.symbol !== "USDG" && eth?.price) (b.price = eth.price), (b.change = eth.change ?? null);
  cache = { at: Date.now(), rows };
  return rows;
}

/** One side picker: a dialog with search, popular tokens and a list with prices. */
function AssetPicker({ value, onChange, label, id }: { value: Pick; onChange: (p: Pick) => void; label: string; id: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Row[] | null>(null);
  const [popular, setPopular] = useState<Row[]>([]);
  const [kind, setKind] = useState<"all" | "base" | "stocks" | "tokens">("all");

  useEffect(() => {
    if (!open) return;
    void loadPopular().then(setPopular);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  useEffect(() => {
    const v = q.trim();
    if (!v) {
      void Promise.resolve().then(() => setFound(null));
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/assets?q=${encodeURIComponent(v)}`);
        const j = (await r.json()) as { items?: { address: string; symbol: string | null; name: string | null }[] };
        setFound((j.items ?? []).map((it) => ({ address: it.address, symbol: it.symbol ?? short(it.address), name: it.name ?? "", price: null, change: null, volume: null })));
      } catch {
        setFound([]);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const choose = (r: Row) => {
    const key = r.address === NATIVE ? "ETH" : r.address === USDG ? "USDG" : r.address === WETH ? "WETH" : r.address;
    onChange({ key, symbol: r.symbol, name: r.name });
    setOpen(false);
    setQ("");
  };
  const seen = new Set<string>();
  const every = [...BASES, ...popular].filter((r) => (seen.has(r.address.toLowerCase()) ? false : (seen.add(r.address.toLowerCase()), true)));
  const list = found ?? (kind === "base" ? BASES : kind === "stocks" ? every.filter((r) => r.stock) : kind === "tokens" ? every.filter((r) => !r.stock && !BASES.includes(r)) : every);
  const isOn = (r: Row) => value.key.toLowerCase() === r.address.toLowerCase() || value.key === r.symbol;

  return (
    <>
      <button type="button" id={id} aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${value.symbol}`} onClick={() => setOpen(true)} className="m-1.5 flex items-center gap-2 rounded-full border border-[#242424] bg-[#181818] py-1.5 pl-1.5 pr-3 text-[15px] font-semibold text-text hover:border-ui/60">
        <TokenAvatar address={/^0x/.test(value.key) ? value.key : value.key === "USDG" ? USDG : value.key === "ETH" ? NATIVE : WETH} symbol={value.symbol} size={26} />
        <span className="max-w-[8rem] truncate">{value.symbol}</span>
        <span aria-hidden className="text-[12px] text-muted">▾</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 px-4 pt-[10vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-label={`Choose ${label.toLowerCase()}`} className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#242424] bg-[#101010] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
            <div className="flex items-center gap-3 border-b border-[#242424] px-5 py-4">
              <span aria-hidden className="text-muted">⌕</span>
              <label htmlFor={`${id}-q`} className="sr-only">Search by name, ticker or contract address</label>
              <input id={`${id}-q`} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, ticker or contract address" spellCheck={false} autoComplete="off" className="min-w-0 flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-muted" />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full bg-[#181818] text-muted hover:text-text">×</button>
            </div>
            {!found && (
              <div className="px-5 pt-4">
                <p className="text-[13px] text-muted"><span className="font-semibold text-text">Popular</span> tokens</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...BASES, ...popular.filter((r) => !r.stock && (r.volume ?? 0) > 0).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 5), ...popular.filter((r) => r.stock).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 6)].map((r) => (
                    <button key={r.address} type="button" onClick={() => choose(r)} className={cx("flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[14px] font-medium", isOn(r) ? "border-leaf/60 bg-leaf/10 text-text" : "border-[#242424] bg-[#181818] text-text hover:border-ui/60")}>
                      <TokenAvatar address={r.address} symbol={r.symbol} stock={r.stock} size={24} />
                      {r.symbol}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <p className="text-[13px] text-muted"><span className="font-semibold text-text">{list.length}</span> {found ? "found" : "tokens"}{!found && popular.length === 0 ? " · loading the market…" : ""}</p>
              {!found && (
                <div className="flex gap-1 rounded-full bg-[#181818] p-[3px] text-[12px]">
                  {(
                    [
                      ["all", "All"],
                      ["base", "Base"],
                      ["stocks", "Stocks"],
                      ["tokens", "Tokens"],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setKind(k)} className={cx("rounded-full px-2.5 py-1", kind === k ? "bg-[#282828] text-text" : "text-muted hover:text-text")}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ul className="max-h-[50vh] overflow-y-auto px-2 pb-2">
              {found && found.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">Nothing indexed under that. Paste the full contract address.</li>}
              {list.map((r) => (
                <li key={r.address}>
                  <div className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5", isOn(r) ? "bg-[#181818]" : "hover:bg-[#161616]")}>
                    <button type="button" onClick={() => choose(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <TokenAvatar address={r.address} symbol={r.symbol} stock={r.stock} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-text">{r.symbol}</span>
                        <span className="block truncate text-[12px] text-muted">{r.name || short(r.address)}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-[14px] text-text">{r.price ? pxS(r.price) : "—"}</span>
                        <span className={cx("block font-mono text-[12px]", r.change == null ? "text-muted" : r.change >= 0 ? "text-leaf" : "text-flesh")}>{r.change == null ? (r.volume ? usdS(r.volume) : "—") : `${r.change >= 0 ? "+" : ""}${r.change.toFixed(1)}%`}</span>
                      </span>
                      {isOn(r) && <span aria-hidden className="text-leaf">✓</span>}
                    </button>
                    {r.address !== NATIVE && (
                      <Link href={`/app/trade/terminal?token=${r.address}`} aria-label={`${r.symbol} chart`} title="Open the chart" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-[#202020] hover:text-leaf">↗</Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function RoutePath({ r, q }: { r: Route; q: Q }) {
  const nodes = [r.hops[0]!.from, ...r.hops.map((h) => h.to)];
  return (
    <ol className="flex flex-wrap items-center gap-y-2 font-mono text-[12px]">
      {nodes.map((n, i) => (
        <li key={`${n}-${i}`} className="flex items-center">
          <span className={cx("border px-2 py-1", i === 0 || i === nodes.length - 1 ? "border-leaf/50 text-text" : "border-line text-muted")}>{symFor(n, q)}</span>
          {i < r.hops.length && (
            <span className="flex items-center px-1.5 text-muted">
              <span aria-hidden>─</span>
              <span className="mx-1 whitespace-nowrap uppercase">
                {r.hops[i]!.venue === "unwrap" ? "unwrap" : `${r.hops[i]!.venue === "v2" ? "V2" : "v4"} ${feeText(r.hops[i]!)}`}
                {r.hops[i]!.hooked && " · hook"}
              </span>
              <span aria-hidden>→</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Trade → Quote. The browser only calls /api/quote; every route is simulated with eth_call. */
export function Quote() {
  const [from, setFrom] = useState<Pick>(PRESETS[0]!);
  const [to, setTo] = useState<Pick>(PRESETS[1]!);
  const [amount, setAmount] = useState("0.1");
  const [slip, setSlip] = useState<(typeof SLIPS)[number]["id"]>("0.01");
  const [q, setQ] = useState<Q | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [age, setAge] = useState(0);
  const [side, setSide] = useState<"routes" | "size" | "chart" | "token" | "activity">("routes");
  const acts = useActs();
  const stamp = useRef(0);
  const live = useRef(false);

  const run = useCallback(async (f: Pick, t: Pick, a: string, quiet = false) => {
    if (!a || Number(a) <= 0) return;
    if (!quiet) setBusy(true);
    try {
      const url = `/api/quote?from=${encodeURIComponent(f.key)}&to=${encodeURIComponent(t.key)}&amount=${encodeURIComponent(a)}`;
      let r = await fetch(url, { cache: "no-store" });
      if (r.status === 502) {
        // one quiet retry: a busy RPC usually answers the second time
        await new Promise((res) => setTimeout(res, 1200));
        r = await fetch(url, { cache: "no-store" });
      }
      const j = await r.json();
      if (!r.ok) throw new Error((j as { error: string }).error);
      const res = j as Q;
      setQ(res);
      setErr(null);
      // a side picked by address (shared link, pasted) gets its on-chain ticker
      if (f.symbol.startsWith("0x")) setFrom((p) => (p.key === f.key ? { ...p, symbol: res.from.symbol } : p));
      if (t.symbol.startsWith("0x")) setTo((p) => (p.key === t.key ? { ...p, symbol: res.to.symbol } : p));
      stamp.current = Date.now();
      live.current = true;
      try {
        const u = new URL(window.location.href);
        u.searchParams.set("from", f.key);
        u.searchParams.set("to", t.key);
        u.searchParams.set("amount", a);
        window.history.replaceState(null, "", u);
      } catch {
        /* fine */
      }
    } catch (e) {
      setErr((e as Error).message || "No answer. Try again.");
      live.current = false;
    } finally {
      if (!quiet) setBusy(false);
    }
  }, []);

  // shared links: ?from=&to=&amount=
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const f = p.get("from"),
      t = p.get("to"),
      a = p.get("amount");
    if (!f || !t) {
      // no shared link: show a live quote for the default pair, so the panel is never empty
      void Promise.resolve().then(() => run(PRESETS[0]!, PRESETS[1]!, "0.1"));
      return;
    }
    const pick = (k: string): Pick => PRESETS.find((x) => x.key === k.toUpperCase()) ?? { key: k, symbol: short(k) };
    void Promise.resolve().then(() => {
      setFrom(pick(f));
      setTo(pick(t));
      if (a) setAmount(a);
      void run(pick(f), pick(t), a ?? "0.1");
    });
  }, [run]);

  // live: re-quote quietly every 15 s while the inputs stay put
  useEffect(() => {
    const id = setInterval(() => {
      setAge(stamp.current ? Math.round((Date.now() - stamp.current) / 1000) : 0);
      if (live.current && !document.hidden && Date.now() - stamp.current > REFRESH_MS) void run(from, to, amount, true);
    }, 1000);
    return () => clearInterval(id);
  }, [from, to, amount, run]);

  const invalidate = () => {
    live.current = false;
    setQ(null);
  };
  // edits re-quote by themselves after a short pause, so the panel never sits idle
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => void run(from, to, amount), 600);
    return () => clearTimeout(id);
  }, [from, to, amount, run]);
  const flip = () => {
    setFrom(to);
    setTo(from);
    invalidate();
  };

  const best = q && q.best !== null ? q.routes[q.best]! : null;
  const outN = best && q ? units(best.amountOut!, q.to.decimals) : null;
  const inN = q ? units(q.amountIn, q.from.decimals) : null;
  const minOut = outN !== null ? outN * (1 - Number(slip)) : null;
  const gasEth = best?.gas && q ? (best.gas * Number(q.gasPriceWei)) / 1e18 : null;
  const others = q ? q.routes.filter((_, i) => i !== q.best) : [];
  const impactTone = q?.impact == null ? undefined : q.impact < 0.01 ? "good" : q.impact < 0.05 ? "mid" : "bad";

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      <Instrument
        code="T-01"
        title="Ticket"
        busy={busy}
        status={<Led tone={err ? "bad" : q ? "on" : "off"} live={(!!q || busy) && !err} label={err ? "Paused" : q ? `Live · ${age}s` : busy ? "Simulating" : "Idle"} />}
        foot={
          <>
            <span>Simulated · nothing signed</span>
            <span>
              <kbd className="k">Enter</kbd> quote
            </span>
          </>
        }
      >
        <form
          className="space-y-px bg-line"
          onSubmit={(e) => {
            e.preventDefault();
            void run(from, to, amount);
          }}
        >
          <div className="bg-bg p-4">
            <label htmlFor="q-amt" className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
              You pay
            </label>
            <div className="ifield mt-2 h-16">
              <input
                id="q-amt"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""));
                  invalidate();
                }}
                className="px-4 font-display text-3xl tabular-nums text-text"
                autoComplete="off"
              />
              <AssetPicker
                id="q-from"
                label="Pay with"
                value={from}
                onChange={(p) => {
                  setFrom(p);
                  invalidate();
                }}
              />
            </div>
          </div>
          <div className="relative flex h-0 items-center justify-center">
            <button type="button" onClick={flip} aria-label="Swap sides" className="absolute z-10 grid size-9 place-items-center border border-line bg-surface font-mono text-sm text-text transition-colors hover:border-ui/60 hover:text-leaf">
              ⇅
            </button>
          </div>
          <div className="bg-bg p-4">
            <span className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">You get</span>
            <div className="ifield mt-2 h-16">
              <output htmlFor="q-amt q-from q-to" aria-live="polite" className={cx("flex min-w-0 flex-1 items-center truncate px-4 font-display text-3xl tabular-nums", outN === null ? "text-muted" : "text-text")}>
                {outN === null ? "—" : fmtNum(outN)}
              </output>
              <AssetPicker
                id="q-to"
                label="Receive"
                value={to}
                onChange={(p) => {
                  setTo(p);
                  invalidate();
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-bg p-4">
            <span className="flex items-center gap-3">
              <span className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Slippage</span>
              <Seg label="Slippage" value={slip} options={SLIPS} onChange={setSlip} />
            </span>
            <button type="submit" disabled={busy} className="ibtn h-10 px-6">
              {busy ? "Simulating…" : "Quote"}
            </button>
          </div>
        </form>

        {err && <p className="border-t border-line bg-flesh-deep/50 px-4 py-3 text-sm text-text">{err}</p>}

        <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
          <Readout label="Minimum received" value={minOut === null ? "—" : fmtNum(minOut)} sub={q ? `${q.to.symbol} at ${Number(slip) * 100}% slippage` : "after a quote"} dim={minOut === null} />
          <Readout label="Rate" value={outN !== null && inN ? fmtNum(outN / inN) : "—"} sub={q ? `${q.to.symbol} per ${q.from.symbol}` : "—"} dim={outN === null} />
          <div className="min-w-0 bg-bg p-4 sm:p-5">
            <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Price impact</p>
            <p className={cx("mt-2.5 font-display text-xl tabular-nums sm:text-[1.75rem]", q?.impact == null ? "text-muted" : impactTone === "bad" ? "text-flesh" : "text-text")}>{q?.impact == null ? "—" : `${(q.impact * 100).toFixed(2)}%`}</p>
            <div className="mt-3">
              <Meter label="Price impact" value={q?.impact == null ? 0 : Math.min(1, q.impact / 0.1)} tone={impactTone} />
            </div>
          </div>
          <Readout label="Network cost" value={gasEth === null ? "—" : fmtNum(gasEth)} sub={best?.gas ? `ETH · ${best.gas.toLocaleString("en")} gas` : "—"} dim={gasEth === null} />
        </div>
        {q && amount && (
          <div className="border-t border-line px-4 pb-4">
            <SwapButton from={from.key} to={to.key} amount={amount} slippage={Number(slip)} />
          </div>
        )}
      </Instrument>

      <Instrument
        code="T-02"
        title={q ? `${q.from.symbol} → ${q.to.symbol}` : "Market"}
        busy={busy}
        status={q && <Led label={`Block #${Number(q.block).toLocaleString("en")} · ${(q.ms / 1000).toFixed(1)} s`} />}
        foot={
          <>
            <span>Direct, and through ETH or USDG. V2 and v4.</span>
            {q && q.to.address.toLowerCase() !== NATIVE && q.to.address.toLowerCase() !== USDG && q.to.address.toLowerCase() !== WETH && (
              <Link href={`/app/trade/check?q=${q.to.address}`} className="text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                Check {q.to.symbol} before you buy →
              </Link>
            )}
          </>
        }
      >
        {q && <QuoteSummary q={q} />}
        <div role="tablist" aria-label="Market views" className="flex gap-1 border-b border-line px-3 py-2">
          {(
            [
              ["routes", "Routes", q ? String(q.routes.length) : null],
              ["size", "Size impact", null],
              ["chart", "Chart", q ? subjectOf(q).symbol : null],
              ["token", "Token", q ? subjectOf(q).symbol : null],
              ["activity", "Activity", acts.length ? String(acts.length) : null],
            ] as const
          ).map(([id, label, badge]) => (
            <button key={id} type="button" role="tab" aria-selected={side === id} onClick={() => setSide(id)} className={cx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium", side === id ? "bg-[#202020] text-text" : "text-muted hover:text-text")}>
              {label}
              {badge && <span className="rounded-full bg-[#181818] px-1.5 font-mono text-[12px] text-muted">{badge}</span>}
            </button>
          ))}
        </div>
        {side === "size" && q && <SizeLadder q={q} from={from.key} to={to.key} amount={amount} />}
        {side === "chart" && q && <PairChart key={subjectOf(q).address} token={subjectOf(q).address} symbol={subjectOf(q).symbol} />}
        {side === "token" && q && <PairToken key={subjectOf(q).address} token={subjectOf(q).address} symbol={subjectOf(q).symbol} />}
        {side === "activity" && (
          <div className="divide-y divide-line">
            <MySwaps />
            {q && <ChainActivity key={subjectOf(q).address} token={subjectOf(q).address} symbol={subjectOf(q).symbol} />}
          </div>
        )}
        {side !== "routes" && side !== "activity" && !q && <Idle>{busy ? "Simulating every route…" : "Pick two assets and an amount."}</Idle>}
        {side === "routes" && (
          <>
        {!q && !busy && <Idle>Pick two assets and an amount. Each route runs as a real swap inside a simulation.</Idle>}
        {!q && busy && <Idle>Simulating every route…</Idle>}
        {q && q.routes.length === 0 && <Idle>No pool connects these two, directly or through ETH or USDG.</Idle>}
        {q && q.routes.length > 0 && (
          <ul className="max-h-[32rem] divide-y divide-line overflow-auto">
            {[...(best ? [best] : []), ...others].map((r, i) => {
              const isBest = r === best;
              const out = r.amountOut ? units(r.amountOut, q.to.decimals) : null;
              const vsBest = out !== null && outN ? out / outN - 1 : null;
              return (
                <li key={i} className={cx("irow grid gap-2 px-4 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center", isBest && "bg-[color-mix(in_oklab,var(--leaf)_7%,transparent)]")}>
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2 font-medium text-[12px] uppercase tracking-[0.08em]">
                      {isBest ? <span className="bg-leaf px-1.5 py-0.5 text-bg">Best</span> : r.ok ? <span className="text-muted">Alt</span> : <span className="text-flesh">No fill</span>}
                      <span className="text-muted">
                        {r.hops.filter((h) => h.venue !== "unwrap").length} hop{r.hops.filter((h) => h.venue !== "unwrap").length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <RoutePath r={r} q={q} />
                    {!r.ok && r.reason && <p className="mt-2 text-xs text-muted">{r.reason}</p>}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className={cx("text-[15px] tabular-nums", r.ok ? "text-text" : "text-muted")}>{out === null ? "—" : fmtNum(out)}</p>
                    <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                      {isBest ? q.to.symbol : vsBest !== null ? `${(vsBest * 100).toFixed(2)}% vs best` : q.to.symbol}
                      {r.gas ? ` · ${r.gas.toLocaleString("en")} gas` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
          </>
        )}
      </Instrument>
    </div>
  );
}
