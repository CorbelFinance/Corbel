"use client";

/**
 * App · Overview: the first page of the app, everything that matters on one screen, all read live.
 *
 *  1. The stage: Robinhood Chain as it moves. Each new block rolls onto a conveyor as a 3D cube with its number on
 *     top; the oldest one drops off the end. The corners hold the readings that change with it (gas, swaps in the
 *     last 30 hours, launches today, stock-token volume).
 *  2. The deck: one page per part of the app (Check, Trade, Stocks, Earn, Agents, AI), turned by the tabs or the
 *     arrow keys. Each page holds the few numbers that matter and one live instrument: the launch funnel and the
 *     agent's brief, a volume map of the busiest tokens, a heat grid of stock tokens, an APR ladder of pools, every
 *     agent run through the five gates, every model by price.
 *  3. The launch agent: what it read in the last day of launches, and what it flagged.
 *
 * Every number comes from the same APIs the tools use; what cannot be read shows a dash.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { LaunchBrief } from "./LaunchBrief";
import { TokenAvatar } from "./TokenAvatar";
import { NetScene } from "../site/NetScene";

type Net = { block: string | null; gasPriceGwei?: string };
type Trend = {
  swaps?: number;
  rows?: { token: string; symbol: string | null; volume: number; change?: number | null; swaps: number; buys?: number }[];
};
type Brief = {
  counts?: { day: number; hour: number; pads?: number };
  onCurve?: number;
  lines?: string[];
  flags?: { kind: string; title: string; note?: string; token?: string; creator?: string }[];
  near?: { token: string; symbol: string | null; pad: string; sold: number }[];
};
type SM = {
  totals?: { volume: number; stocks: number; venues: number };
  stocks?: {
    token: string;
    symbol: string;
    name?: string;
    change: number | null;
    volume: number;
    price?: number | null;
    liquidity?: number;
  }[];
  venues?: { id: string; volume: number; pools: number; stocks: number }[];
  breadth?: { up: number; down: number; flat: number };
};
type Earn = {
  rows?: {
    token: string;
    symbol: string;
    pair: string;
    days: { avgApr: number; paid: number; n: number } | null;
    doubt?: string | null;
    apr: number | null;
  }[];
};
type Mand = {
  totals?: { runs: number; traded: number; stopped: number } | null;
  entries?: { id: number; scenario: string; rule: string; traded: boolean; block: string; frozen: boolean }[];
};
type Pred = {
  count?: number;
  markets?: { id: number; state: string; kind: string; yesPot: string; noPot: string }[];
};
type Models = {
  rows?: {
    id?: string;
    name?: string;
    maker?: string;
    pin?: number;
    pout?: number;
    kind?: string;
    avail?: boolean;
  }[];
  provider?: boolean;
};
type D = {
  net: Net | null;
  trend: Trend | null;
  brief: Brief | null;
  sm: SM | null;
  earn: Earn | null;
  mand: Mand | null;
  pred: Pred | null;
  models: Models | null;
};

const get = <T,>(u: string) =>
  fetch(u)
    .then((r) => (r.status === 200 ? (r.json() as Promise<T>) : null))
    .catch(() => null);
const usd = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`;
const n0 = (v: number) => v.toLocaleString("en");
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

function useData(): D {
  const [d, setD] = useState<D>({
    net: null,
    trend: null,
    brief: null,
    sm: null,
    earn: null,
    mand: null,
    pred: null,
    models: null,
  });
  useEffect(() => {
    let off = false;
    const put =
      <K extends keyof D>(k: K) =>
      (v: D[K]) =>
        !off && setD((s) => ({ ...s, [k]: v }));
    const slow = () => {
      void get<Trend>("/api/trending").then(put("trend"));
      void get<Brief>("/api/pads/brief").then(put("brief"));
      void get<SM>("/api/stockmarket").then(put("sm"));
      void get<Earn>("/api/earn").then(put("earn"));
      void get<Mand>("/api/mandate?log").then(put("mand"));
      void get<Pred>("/api/predict").then(put("pred"));
      // a server just restarted may not have read the provider's list yet: keep the old figure and ask again soon
      const models = (n: number) =>
        void get<Models>("/api/compute?what=models").then((m) => {
          // the catalogue shows at once; the open ones are asked for again until the server has read them
          if (m?.rows) put("models")(m);
          if (!m?.provider && n < 6 && !off) setTimeout(() => models(n + 1), 8000);
        });
      models(0);
    };
    const fast = () => void get<Net>("/api/net").then(put("net"));
    slow();
    fast();
    const a = setInterval(fast, 4000),
      b = setInterval(slow, 60_000);
    return () => {
      off = true;
      clearInterval(a);
      clearInterval(b);
    };
  }, []);
  return d;
}

/* ───────────────────────────── 1 · the stage: the network over the range ───────────────────────────── */

function Stage({ d }: { d: D }) {
  const block = d.net?.block ? Number(d.net.block) : null;
  const corners = [
    { k: "Block", v: block === null ? null : `#${n0(block)}`, sub: "Robinhood Chain mainnet" },
    { k: "Gas", v: d.net?.gasPriceGwei ? `${d.net.gasPriceGwei} gwei` : null, sub: "price per unit now" },
    { k: "Swaps", v: d.trend?.swaps != null ? n0(d.trend.swaps) : null, sub: "in the last 30 hours" },
    {
      k: "Launches",
      v: d.brief?.counts ? n0(d.brief.counts.day) : null,
      sub: d.brief?.counts ? `today, ${d.brief.counts.hour} this hour` : "today",
    },
  ];
  return (
    <section className="relative h-[clamp(420px,58vh,620px)] overflow-hidden rounded-3xl border border-line bg-[radial-gradient(ellipse_80%_70%_at_50%_100%,#121212,#050807_70%)]">
      <div className="absolute inset-0">
        <NetScene story="overview" />
      </div>
      <div className="pointer-events-none relative grid grid-cols-2 gap-x-6 gap-y-4 px-6 pt-6 sm:px-8 lg:grid-cols-4">
        {corners.map((c, i) => (
          <div
            key={c.k}
            className={cx(
              "w-fit rounded-xl bg-[#070707]/80 px-3 py-2",
              i % 2 === 1 && "justify-self-end lg:justify-self-auto",
              i === 3 && "lg:justify-self-end",
            )}
          >
            <p className="font-medium text-[12px] uppercase tracking-[0.1em] text-muted">{c.k}</p>
            <p className="mt-0.5 text-[20px] tabular-nums text-text">
              {c.v ?? <span className="text-muted">···</span>}
            </p>
            <p className="text-[12px] text-muted">{c.sub}</p>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#070707] via-[#070707]/80 to-transparent px-6 pb-6 pt-16 sm:px-8">
        <h1 className="font-display text-[clamp(1.8rem,1rem+2.4vw,3.2rem)] leading-none tracking-tight text-text">
          The chain, read as it moves.
        </h1>
        <p className="mt-2 max-w-xl text-[14px] text-muted">
          Wallets, pools, agents and models, and the transactions between them. Every tool below reads the
          same chain.
        </p>
      </div>
    </section>
  );
}

/* ───────────────────────────── 2 · the deck: pages that turn ───────────────────────────── */

type Page = {
  id: string;
  label: string;
  href: string;
  cta: string;
  peek: (d: D) => string;
  render: (d: D) => React.ReactNode;
};

type Row = { k: React.ReactNode; v: string; tone?: "up" | "down"; href?: string };
const Rows = ({ rows }: { rows: Row[] }) => (
  <ul className="divide-y divide-[#1a1a1a] border-y border-[#1a1a1a]">
    {rows.map((r, i) => {
      const inner = (
        <>
          <span className="min-w-0 flex-1 truncate text-text">{r.k}</span>
          <span
            className={cx(
              "font-mono",
              r.tone === "up" ? "text-leaf" : r.tone === "down" ? "text-flesh" : "text-muted",
            )}
          >
            {r.v}
          </span>
          {r.href && (
            <span
              aria-hidden
              className="w-4 -translate-x-1 text-leaf opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
            >
              →
            </span>
          )}
        </>
      );
      return (
        <li key={i}>
          {r.href ? (
            <Link
              href={r.href}
              className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-[13.5px] transition-colors hover:bg-leaf/[0.05]"
            >
              {inner}
            </Link>
          ) : (
            <span className="flex items-center gap-3 py-2.5 text-[13.5px]">{inner}</span>
          )}
        </li>
      );
    })}
  </ul>
);
const Tok = ({ token, symbol, stock }: { token: string; symbol: string; stock?: boolean }) => (
  <span className="flex items-center gap-2">
    <TokenAvatar address={token} symbol={symbol} stock={stock} size={20} />
    <span className="font-mono">{symbol}</span>
  </span>
);

/* each page: a column of the few numbers that matter, and one live instrument beside it */
const Stat = ({ k, v, sub, tone }: { k: string; v: string | null; sub?: string; tone?: "up" | "down" | "ai" }) => (
  <div className="border-b border-[#1a1a1a] py-3 md:first:pt-0 md:last:border-b-0">
    <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{k}</p>
    <p
      className={cx(
        "mt-1 font-display text-[26px] leading-none tabular-nums",
        tone === "up" ? "text-leaf" : tone === "down" ? "text-flesh" : tone === "ai" ? "text-[var(--ai)]" : "text-text",
      )}
    >
      {v ?? <span className="text-muted">···</span>}
    </p>
    {sub && <p className="mt-1 text-[12px] text-muted">{sub}</p>}
  </div>
);
const Pane = ({ stats, title, hint, children }: { stats: React.ReactNode; title: string; hint: string; children: React.ReactNode }) => (
  <div className="grid gap-6 md:grid-cols-[13.5rem_minmax(0,1fr)] md:gap-8">
    <div className="grid grid-cols-2 gap-x-5 md:block">{stats}</div>
    <div className="min-w-0">
      <p className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] font-semibold text-text">{title}</span>
        <span className="font-mono text-[12px] text-muted">{hint}</span>
      </p>
      {children}
    </div>
  </div>
);
const Wait = ({ h = 240, what }: { h?: number; what: string }) => (
  <div style={{ height: h }} className="grid place-items-center rounded-2xl border border-dashed border-line">
    <p className="caret font-mono text-[12px] text-muted">{what}</p>
  </div>
);
/** A cell tinted by a move: green up, red down, deeper the bigger the move. */
const heat = (c: number | null | undefined) =>
  c == null
    ? "#121212"
    : `color-mix(in srgb, ${c >= 0 ? "var(--leaf)" : "var(--flesh)"} ${Math.round(8 + Math.min(42, Math.abs(c) * 5))}%, #0e0e0e)`;

/** The agent's own summary, typed out line by line. */
function Typed({ lines }: { lines: string[] }) {
  const all = lines.join("\n");
  const [n, setN] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const f = setTimeout(() => setN(all.length), 0);
      return () => clearTimeout(f);
    }
    let k = 0;
    const i = setInterval(() => {
      k = Math.min(all.length, k + 2);
      setN(k);
      if (k >= all.length) clearInterval(i);
    }, 16);
    return () => clearInterval(i);
  }, [all]);
  const shown = all.slice(0, n).split("\n");
  return (
    <div className="rounded-2xl border border-line bg-[#090909] p-4 font-mono text-[12.5px] leading-relaxed">
      {shown.map((l, i) => (
        <p key={i} className={cx("text-[#c9d6cf]", i === shown.length - 1 && n < all.length && "caret")}>
          <span className="mr-2 text-leaf">›</span>
          {l}
        </p>
      ))}
    </div>
  );
}

/** Splits a rectangle by weight, alternating cuts along the longer side. */
type Tile = { x: number; y: number; w: number; h: number; i: number };
function treemap(vals: number[], x: number, y: number, w: number, h: number, off = 0, out: Tile[] = []): Tile[] {
  if (!vals.length) return out;
  if (vals.length === 1) {
    out.push({ x, y, w, h, i: off });
    return out;
  }
  const tot = vals.reduce((a, v) => a + v, 0);
  let acc = 0,
    cut = 0;
  while (cut < vals.length - 1 && acc + vals[cut]! <= tot / 2) acc += vals[cut++]!;
  if (cut === 0) acc = vals[cut++]!;
  const r = acc / tot;
  if (w >= h) {
    treemap(vals.slice(0, cut), x, y, w * r, h, off, out);
    treemap(vals.slice(cut), x + w * r, y, w * (1 - r), h, off + cut, out);
  } else {
    treemap(vals.slice(0, cut), x, y, w, h * r, off, out);
    treemap(vals.slice(cut), x, y + h * r, w, h * (1 - r), off + cut, out);
  }
  return out;
}

function TradeMap({ d }: { d: D }) {
  const rows = [...(d.trend?.rows ?? [])].filter((r) => r.volume > 0).sort((a, b) => b.volume - a.volume).slice(0, 16);
  if (!rows.length) return <Wait h={300} what="Reading the busiest tokens" />;
  // area by the square root of volume, so the smaller names stay readable next to ETH
  const tiles = treemap(rows.map((r) => Math.sqrt(r.volume)), 0, 0, 100, 100);
  return (
    <div className="relative h-[300px] overflow-hidden rounded-2xl">
      {tiles.map((t) => {
        const r = rows[t.i]!;
        const big = t.w * t.h > 260, mid = t.w * t.h > 90;
        return (
          <Link
            key={r.token}
            href={`/app/trade/terminal?token=${r.token}`}
            title={`${r.symbol ?? "?"} · ${usd(r.volume)} in 30h${r.change == null ? "" : ` · ${pct(r.change)}`}`}
            className="ov-pop group absolute p-[2px]"
            style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%`, animationDelay: `${t.i * 45}ms` }}
          >
            <span
              className="flex h-full w-full flex-col justify-between overflow-hidden rounded-lg p-2 ring-1 ring-inset ring-white/5 transition-[filter] group-hover:brightness-125"
              style={{ background: heat(r.change) }}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {mid && <TokenAvatar address={r.token} symbol={r.symbol} size={big ? 20 : 16} />}
                <span className={cx("truncate font-mono text-text", big ? "text-[14px]" : "text-[12px]")}>{r.symbol ?? "?"}</span>
              </span>
              {mid && (
                <span className="font-mono text-[12px] leading-tight">
                  <span className="block text-[#c9d6cf]">{usd(r.volume)}</span>
                  {r.change != null && <span className={r.change >= 0 ? "text-leaf" : "text-flesh"}>{pct(r.change)}</span>}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function StockHeat({ d }: { d: D }) {
  const s = [...(d.sm?.stocks ?? [])].sort((a, b) => b.volume - a.volume).slice(0, 24);
  if (!s.length) return <Wait h={300} what="Reading the stock tokens" />;
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
      {s.map((x, i) => (
        <Link
          key={x.token}
          href={`/app/trade/terminal?token=${x.token}`}
          title={`${x.name ?? x.symbol} · ${usd(x.volume)} today`}
          className="ov-pop group rounded-lg p-2 ring-1 ring-inset ring-white/5 transition-[filter] hover:brightness-125"
          style={{ background: heat(x.change), animationDelay: `${i * 25}ms` }}
        >
          <span className="flex items-center gap-1.5">
            <TokenAvatar address={x.token} symbol={x.symbol} stock size={16} />
            <span className="truncate font-mono text-[12px] text-text">{x.symbol}</span>
          </span>
          <span className="mt-1.5 flex items-baseline justify-between gap-1 font-mono text-[12px]">
            <span className="text-[#c9d6cf]">{x.price ? `$${x.price.toFixed(x.price < 10 ? 2 : 0)}` : "—"}</span>
            <span className={x.change == null ? "text-muted" : x.change >= 0 ? "text-leaf" : "text-flesh"}>
              {x.change == null ? "—" : pct(x.change)}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function LaunchFunnel({ d }: { d: D }) {
  const b = d.brief;
  if (!b?.counts) return <Wait h={300} what="Reading the launches" />;
  const steps = [
    { k: "Launched in the last day", v: b.counts.day, tone: "bg-[#2a9a60]" },
    { k: "Still on a launch curve", v: b.onCurve ?? 0, tone: "bg-leaf" },
    { k: "Close to graduating", v: (b.near ?? []).length, tone: "bg-[#7fe0a8]" },
    { k: "Flagged by the agent", v: (b.flags ?? []).length, tone: "bg-flesh" },
  ];
  const top = Math.log10(Math.max(10, steps[0]!.v) + 1);
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.k} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-[12.5px]">
            <span className="truncate text-muted">{s.k}</span>
            <span className="h-3 overflow-hidden rounded-full bg-[#161616]">
              <span
                className={cx("bar-grow block h-full rounded-full", s.tone)}
                style={{ width: `${Math.max(2, (Math.log10(s.v + 1) / top) * 100)}%`, animationDelay: `${i * 0.12}s` }}
              />
            </span>
            <span className="text-right tabular-nums text-text">{n0(s.v)}</span>
          </li>
        ))}
      </ul>
      {(b.lines ?? []).length > 0 && <Typed lines={b.lines!.slice(0, 4)} />}
    </div>
  );
}

function AprLadder({ d }: { d: D }) {
  const rows = [...(d.earn?.rows ?? [])].filter((r) => r.days && !r.doubt).sort((a, b) => b.days!.avgApr - a.days!.avgApr).slice(0, 7);
  if (!rows.length) return <Wait h={260} what="Reading the pools" />;
  const max = rows[0]!.days!.avgApr || 1;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.pair}>
          <Link href="/app/account/pools" className="group grid grid-cols-[7rem_minmax(0,1fr)_4rem_7.5rem] items-center gap-3 rounded-lg px-1 py-1 hover:bg-leaf/[0.05]">
            <Tok token={r.token} symbol={r.symbol} />
            <span className="relative h-5 overflow-hidden rounded-md bg-[#161616]">
              <span
                className="bar-grow absolute inset-y-0 left-0 rounded-md bg-gradient-to-r from-[#1f8a52] to-leaf"
                style={{ width: `${Math.max(1.5, (r.days!.avgApr / max) * 100)}%`, animationDelay: `${i * 0.08}s` }}
              />
            </span>
            <span className="text-right tabular-nums text-[13px] text-leaf">{`${(r.days!.avgApr * 100).toFixed(1)}%`}</span>
            <span className="text-right tabular-nums text-[12px] text-muted">{`${r.days!.paid}/${r.days!.n} days paid`}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const GATES = ["Assets", "Size", "Budget", "Price", "Window"];
function RulePath({ d }: { d: D }) {
  const e = d.mand?.entries ?? [];
  if (!d.mand) return <Wait h={260} what="Reading the contract's log" />;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,9rem)_repeat(5,minmax(0,1fr))_4.5rem] gap-1.5 font-medium text-[12px] uppercase tracking-[0.06em] text-muted">
        <span>Run</span>
        {GATES.map((g) => (
          <span key={g} className="text-center" title={g}>
            <span className="sm:hidden">{g.slice(0, 2)}</span>
            <span className="hidden sm:inline">{g}</span>
          </span>
        ))}
        <span className="text-right">Result</span>
      </div>
      {e.slice(0, 7).map((x, i) => {
        const stop = x.traded ? -1 : GATES.findIndex((g) => g.toLowerCase() === x.rule.toLowerCase());
        return (
          <div key={x.id} className="ov-pop grid grid-cols-[minmax(0,9rem)_repeat(5,minmax(0,1fr))_4.5rem] items-center gap-1.5" style={{ animationDelay: `${i * 70}ms` }}>
            <span className="truncate text-[12px] text-text">{x.scenario.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</span>
            {GATES.map((g, k) => (
              <span
                key={g}
                className={cx(
                  "h-2.5 rounded-sm",
                  stop === -1 || k < stop ? "bg-leaf/70" : k === stop ? "bg-flesh" : "bg-[#191919]",
                )}
              />
            ))}
            <span className={cx("text-right tabular-nums text-[12px]", x.traded ? "text-leaf" : x.frozen ? "text-[#c46a7a]" : "text-flesh")}>
              {x.traded ? "traded" : x.frozen ? "frozen" : "refused"}
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-[12px] text-muted">Each row is one Break it run on mainnet: green gates passed, red is the rule that stopped it.</p>
    </div>
  );
}

function PriceMap({ d }: { d: D }) {
  const all = (d.models?.rows ?? []).filter((r) => (r.pin ?? 0) > 0 && (r.pout ?? 0) > 0 && r.kind !== "image");
  if (!all.length) return <Wait h={300} what="Reading the model catalogue" />;
  const lx = (v: number) => Math.log10(v);
  const xs = all.map((r) => lx(r.pin!)), ys = all.map((r) => lx(r.pout!));
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  // positions in percent of the plot box
  const X = (v: number) => ((lx(v) - x0) / (x1 - x0 || 1)) * 100, Y = (v: number) => 100 - ((lx(v) - y0) / (y1 - y0 || 1)) * 100;
  const tick = (e: number) => (e < 0 ? `$${10 ** e}` : `$${(10 ** e).toLocaleString("en")}`);
  const open = all.filter((r) => r.avail), rest = all.filter((r) => !r.avail);
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  return (
    <div className="relative h-[300px] pb-6 pl-12" role="img" aria-label="Model prices: input against output, per million tokens">
      <div className="relative h-full">
        {range(x0, x1).map((e) => (
          <span key={`x${e}`} className="absolute inset-y-0 border-l border-[#1c1c1c]" style={{ left: `${X(10 ** e)}%` }}>
            <span className="absolute -bottom-5 -translate-x-1/2 font-mono text-[12px] text-muted">{tick(e)}</span>
          </span>
        ))}
        {range(y0, y1).map((e) => (
          <span key={`y${e}`} className="absolute inset-x-0 border-t border-[#1c1c1c]" style={{ top: `${Y(10 ** e)}%` }}>
            <span className="absolute -left-2 -translate-x-full -translate-y-1/2 font-mono text-[12px] text-muted">{tick(e)}</span>
          </span>
        ))}
        {rest.map((r) => (
          <span
            key={r.id}
            title={`${r.name} · $${r.pin!.toFixed(2)} in / $${r.pout!.toFixed(2)} out`}
            className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4d5a52]/70"
            style={{ left: `${X(r.pin!)}%`, top: `${Y(r.pout!)}%` }}
          />
        ))}
        {open.map((r, i) => (
          <Link
            key={r.id}
            href="/app/ai/chat"
            aria-label={r.name}
            title={`${r.name} · open in the chat · $${r.pin!.toFixed(2)} in / $${r.pout!.toFixed(2)} out`}
            className="ov-pop absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--ai)] ring-2 ring-[#1a0b03] hover:ring-[var(--ai)]"
            style={{ left: `${X(r.pin!)}%`, top: `${Y(r.pout!)}%`, animationDelay: `${Math.min(i, 40) * 25}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

const ALL_PAGES: Page[] = [
  {
    id: "check",
    peek: (d) => (d.brief?.counts ? `${n0(d.brief.counts.day)} launches` : "…"),
    label: "Check",
    href: "/app/trust/radar",
    cta: "Open the radar",
    render: (d) => (
      <Pane
        title="What the launch agent read"
        hint="last 24 hours, log scale"
        stats={
          <>
            <Stat k="Launches" v={d.brief?.counts ? n0(d.brief.counts.day) : null} sub="in the last day" />
            <Stat k="This hour" v={d.brief?.counts ? n0(d.brief.counts.hour) : null} sub={d.brief?.counts ? `on ${d.brief.counts.pads ?? "—"} launchpads` : undefined} />
            <Stat k="Flagged" v={d.brief ? n0((d.brief.flags ?? []).length) : null} sub="copies, drains, serial creators" tone="down" />
          </>
        }
      >
        <LaunchFunnel d={d} />
      </Pane>
    ),
  },
  {
    id: "trade",
    peek: (d) => (d.trend?.swaps != null ? `${n0(d.trend.swaps)} swaps` : "…"),
    label: "Trade",
    href: "/app/trade/terminal",
    cta: "Open the terminal",
    render: (d) => {
      const rows = d.trend?.rows ?? [];
      const buys = rows.reduce((a, r) => a + (r.buys ?? 0), 0), swaps = rows.reduce((a, r) => a + r.swaps, 0);
      const best = [...rows].filter((r) => r.change != null && r.volume > 5000).sort((a, b) => b.change! - a.change!)[0];
      return (
        <Pane
          title="Where the volume is"
          hint="size by volume, colour by 24h move · click to trade"
          stats={
            <>
              <Stat k="Swaps" v={d.trend?.swaps != null ? n0(d.trend.swaps) : null} sub="in the last 30 hours" />
              <Stat k="Volume" v={rows.length ? usd(rows.reduce((a, r) => a + r.volume, 0)) : null} sub={`across ${rows.length} busiest tokens`} />
              <Stat k="Buys" v={swaps ? `${Math.round((buys / swaps) * 100)}%` : null} sub="of those swaps bought the token" tone={swaps && buys / swaps >= 0.5 ? "up" : "down"} />
              <Stat k="Top mover" v={best ? `${best.symbol ?? "?"} ${pct(best.change!)}` : null} sub={`among tokens over ${usd(5000)} volume`} tone="up" />
            </>
          }
        >
          <TradeMap d={d} />
        </Pane>
      );
    },
  },
  {
    id: "stocks",
    peek: (d) => (d.sm?.totals ? `${usd(d.sm.totals.volume)} today` : "…"),
    label: "Stocks",
    href: "/app/stocks/market",
    cta: "Open the market map",
    render: (d) => {
      const br = d.sm?.breadth;
      const tot = br ? br.up + br.down + br.flat : 0;
      return (
        <Pane
          title="Stock tokens, busiest first"
          hint="colour by move against yesterday · click to trade"
          stats={
            <>
              <Stat k="Volume today" v={d.sm?.totals ? usd(d.sm.totals.volume) : null} sub={d.sm?.totals ? `${d.sm.totals.stocks} tokens on ${d.sm.totals.venues} venues` : undefined} />
              <Stat k="Rising" v={br ? `${br.up} of ${tot}` : null} sub={br ? `${br.down} falling, ${br.flat} flat` : undefined} tone={br && br.up >= br.down ? "up" : "down"} />
              {br && tot > 0 && (
                <div className="mt-1 flex h-2 overflow-hidden rounded-full">
                  <span className="bar-grow bg-leaf/80" style={{ width: `${(br.up / tot) * 100}%` }} />
                  <span className="bg-[#2e2e2e]" style={{ width: `${(br.flat / tot) * 100}%` }} />
                  <span className="bg-flesh/80" style={{ width: `${(br.down / tot) * 100}%` }} />
                </div>
              )}
            </>
          }
        >
          <StockHeat d={d} />
        </Pane>
      );
    },
  },
  {
    id: "earn",
    peek: (d) => `${(d.earn?.rows ?? []).length} pools`,
    label: "Earn",
    href: "/app/account/pools",
    cta: "Open the pools",
    render: (d) => {
      const rows = (d.earn?.rows ?? []).filter((r) => r.days);
      const best = [...rows].sort((a, b) => b.days!.avgApr - a.days!.avgApr)[0];
      const steady = [...rows].sort((a, b) => b.days!.paid - a.days!.paid)[0];
      return (
        <Pane
          title="What each pool paid"
          hint="average APR over 30 days · the past, not a promise"
          stats={
            <>
              <Stat k="Pools listed" v={d.earn ? n0(rows.length) : null} sub="that passed the checks" />
              <Stat k="Best APR" v={best ? `${(best.days!.avgApr * 100).toFixed(1)}%` : null} sub={best ? `${best.symbol}, 30-day average` : undefined} tone="up" />
              <Stat k="Steadiest" v={steady ? `${steady.days!.paid}/${steady.days!.n}` : null} sub={steady ? `days ${steady.symbol} paid fees` : undefined} />
            </>
          }
        >
          <AprLadder d={d} />
        </Pane>
      );
    },
  },
  {
    id: "agents",
    peek: (d) => (d.mand?.totals ? `${d.mand.totals.runs} decisions` : "…"),
    label: "Agents",
    href: "/app/agents/log",
    cta: "Open the decision log",
    render: (d) => {
      const t = d.mand?.totals;
      return (
        <Pane
          title="Every run through the five gates"
          hint="read from the mandate contract"
          stats={
            <>
              <Stat k="Decisions" v={t ? n0(t.runs) : null} sub="made by the contract, not by us" />
              <Stat k="Refused" v={t ? n0(t.stopped) : null} sub="each one slashed the agent's bond" tone="down" />
              <Stat k="Traded" v={t ? n0(t.traded) : null} sub="inside every rule" tone="up" />
            </>
          }
        >
          <RulePath d={d} />
        </Pane>
      );
    },
  },
  {
    id: "predict",
    peek: (d) => (d.pred?.count != null ? `${d.pred.count} markets` : "…"),
    label: "Predict",
    href: "/app/predict",
    cta: "Open the markets",
    render: () => null,
  },
  {
    id: "ai",
    peek: (d) => (d.models?.rows?.some((r) => r.avail) ? `${d.models.rows.filter((r) => r.avail).length} models open` : "…"),
    label: "AI & GPUs",
    href: "/app/ai/chat",
    cta: "Open the chat",
    render: (d) => {
      const all = d.models?.rows ?? [];
      const open = all.filter((r) => r.avail);
      const cheap = [...open].filter((r) => (r.pin ?? 0) > 0).sort((a, b) => a.pin! - b.pin!)[0];
      return (
        <Pane
          title="Every model by price"
          hint="$ per million tokens, in against out · orange: open in the chat"
          stats={
            <>
              <Stat k="Open now" v={open.length ? n0(open.length) : null} sub="models you can chat with" tone="ai" />
              <Stat k="Catalogue" v={all.length ? n0(all.length) : null} sub="models priced live" />
              <Stat k="Cheapest open" v={cheap ? `$${cheap.pin!.toFixed(2)}` : null} sub={cheap ? `${cheap.name}, per 1M in` : undefined} tone="ai" />
            </>
          }
        >
          <PriceMap d={d} />
        </Pane>
      );
    },
  },
];
// Predict is closed for now ("soon"), so it has no page in the deck
const PAGES = ALL_PAGES.filter((p) => p.id !== "predict");

function Deck({ d, i, setI }: { d: D; i: number; setI: (n: number) => void }) {
  const [dir, setDir] = useState(1);
  const go = (n: number) => {
    setDir(n > i || (i === PAGES.length - 1 && n === 0) ? 1 : -1);
    setI((n + PAGES.length) % PAGES.length);
  };
  const p = PAGES[i]!;
  return (
    <section
      className="overflow-hidden rounded-3xl border border-line bg-[#0e0e0e]"
      onKeyDown={(e) => (e.key === "ArrowRight" ? go(i + 1) : e.key === "ArrowLeft" ? go(i - 1) : undefined)}
    >
      <div
        role="tablist"
        aria-label="Parts of the app"
        className="flex overflow-x-auto border-b border-line [scrollbar-width:none]"
      >
        {PAGES.map((x, k) => (
          <button
            key={x.id}
            role="tab"
            type="button"
            aria-selected={k === i}
            aria-controls="ov-page"
            onClick={() => go(k)}
            className={cx(
              "relative min-w-[8.5rem] flex-1 shrink-0 px-5 py-3 text-left transition-colors",
              k === i ? "bg-[#151515]" : "hover:bg-[#111111]",
              x.id === "ai" && "[--leaf:var(--ai)]",
            )}
          >
            <span
              className={cx(
                "block text-[14px]",
                x.id === "ai" ? "text-[var(--ai)]" : k === i ? "text-text" : "text-muted",
              )}
            >
              <span className="mr-2 font-mono text-[12px] text-muted">{String(k + 1).padStart(2, "0")}</span>
              {x.label}
            </span>
            <span className="mt-0.5 block truncate font-mono text-[12px] text-muted">{x.peek(d)}</span>
            {k === i && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-leaf" />
            )}
          </button>
        ))}
      </div>
      <div className="ov-stage-3d relative min-h-[330px] px-6 py-8 sm:px-10">
        <div
          id="ov-page"
          role="tabpanel"
          key={p.id}
          className={cx("ov-page", dir > 0 ? "ov-page-next" : "ov-page-prev")}
        >
          {p.render(d)}
          <div className="mt-8 flex items-center justify-between">
            <Link
              href={p.href}
              className={cx(
                "rounded-xl px-4 py-2.5 text-[14px] font-semibold hover:brightness-110",
                p.id === "ai" ? "bg-[var(--ai)] text-[#1a0b03]" : "bg-ui text-[#0b0b0b]",
              )}
            >
              {`${p.cta} →`}
            </Link>
            {/* every figure on the page is a snapshot: say which block it was read at */}
            {d.net?.block && <span className="hidden font-mono text-[12px] text-muted sm:block">{`read at block #${n0(Number(d.net.block))}`}</span>}
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => go(i - 1)}
                aria-label="Previous page"
                className="grid h-9 w-9 place-items-center rounded-full border border-line text-text hover:border-ui/60"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => go(i + 1)}
                aria-label="Next page"
                className="grid h-9 w-9 place-items-center rounded-full border border-line text-text hover:border-ui/60"
              >
                →
              </button>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 2b · the toolbox: small tools that work right here ───────────────────────────── */

type Check = {
  checks?: { id: string; name: string; result: "pass" | "warn" | "fail" | "unknown"; reason: string }[];
  meta?: { symbol: string | null; name: string | null };
  error?: string;
  candidates?: { address: string; symbol: string }[];
};
const TRIES = ["TSLA", "NVDA", "USDG", "WETH"];
const READS = [
  "Buy and sell simulated",
  "Buy and sell tax",
  "Owner powers",
  "Liquidity lock",
  "Ticker copies",
  "Creator's history",
];
function QuickCheck({ bare }: { bare?: boolean } = {}) {
  const [q, setQ] = useState("");
  const [r, setR] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  // the six reads light up one after another while the chain is read, so the wait shows what is happening
  useEffect(() => {
    if (!busy) return;
    void Promise.resolve().then(() => setStep(0));
    const id = setInterval(() => setStep((x) => Math.min(READS.length - 1, x + 1)), 900);
    return () => clearInterval(id);
  }, [busy]);
  // a ticker answers with candidates: the busiest is checked in the same run, so busy stays on from the first
  // click to the last answer and the panel never swaps its content in between
  const run = async (v: string, depth = 0): Promise<void> => {
    const s = v.trim();
    if (!s) return;
    if (depth === 0) {
      setBusy(true);
      setR(null);
    }
    try {
      const res = await fetch(`/api/token?q=${encodeURIComponent(s)}`);
      const j = (await res.json()) as Check;
      if (j.candidates?.[0] && depth < 1) return await run(j.candidates[0].address, depth + 1);
      if (j.candidates && !j.checks) setR({ error: `No indexed token uses the ticker ${s}.` });
      else setR(j.error || j.checks ? j : { error: "No answer. Try again." });
    } catch {
      setR({ error: "No answer. Try again." });
    } finally {
      if (depth === 0) setBusy(false);
    }
  };
  const c = r?.checks ?? [];
  const n = (k: string) => c.filter((x) => x.result === k).length;
  const worst = c.find((x) => x.result === "fail") ?? c.find((x) => x.result === "warn");
  return (
    <Tool bare={bare} title={bare ? "Is this token safe to buy?" : "Check a token"} hint="Address or ticker">
      <form onSubmit={(e) => (e.preventDefault(), void run(q))} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="0x… or a ticker"
          spellCheck={false}
          aria-label="Token to check"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-[#090909] px-3 font-mono text-[13px] text-text outline-none focus:border-ui/60"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-xl bg-ui px-4 text-[13px] font-semibold text-[#0b0b0b] disabled:opacity-60"
        >
          {busy ? "…" : "Check"}
        </button>
      </form>
      {!r && (
        <div className="mt-4 min-h-[172px]">
          <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{busy ? "Reading the chain" : "Try one"}</p>
          <div className="mt-2 flex min-h-[30px] flex-wrap gap-1.5">
            {TRIES.map((x) => (
              <button
                key={x}
                type="button"
                disabled={busy}
                onClick={() => (setQ(x), void run(x))}
                className="rounded-full border border-line px-3 py-1 font-mono text-[12px] text-text hover:border-ui/60 disabled:opacity-50"
              >
                {x}
              </button>
            ))}
          </div>
          <p className="mt-4 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">What it runs</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] text-muted">
            {READS.map((x, i) => (
              <li key={x} className={cx("flex items-center gap-2 transition-colors", busy && i <= step ? "text-text" : "")}>
                <span className={cx("h-1 w-1 rounded-full bg-leaf", busy && i === step && "animate-pulse")} />
                {x}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r?.error && <p className="mt-3 text-[12.5px] text-flesh">{r.error}</p>}
      {c.length > 0 && (
        <div className="ov-page ov-page-next mt-3">
          <p className="flex items-center gap-3 text-[13px]">
            <span className="font-mono text-text">{r?.meta?.symbol ?? "token"}</span>
            <span className="font-mono text-leaf">{`${n("pass")} pass`}</span>
            <span className="font-mono text-[#e3b341]">{`${n("warn")} warn`}</span>
            <span className="font-mono text-flesh">{`${n("fail")} fail`}</span>
          </p>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-[#1f1f1f]">
            <span className="bg-leaf" style={{ width: `${(n("pass") / c.length) * 100}%` }} />
            <span className="bg-[#e3b341]" style={{ width: `${(n("warn") / c.length) * 100}%` }} />
            <span className="bg-flesh" style={{ width: `${(n("fail") / c.length) * 100}%` }} />
          </div>
          {worst && (
            <p className="mt-2 line-clamp-2 text-[12px] text-muted">{`${worst.name}: ${worst.reason}`}</p>
          )}
          <Link
            href={`/app/trust/check?q=${encodeURIComponent(q.trim())}`}
            className="mt-2 inline-block text-[12.5px] text-leaf underline underline-offset-2"
          >
            Full report →
          </Link>
        </div>
      )}
    </Tool>
  );
}

type QuoteR = {
  to?: { decimals: number; symbol: string };
  routes?: { amountOut: string | null; label?: string }[];
  best?: number | null;
  impact?: number | null;
  error?: string;
};
const PAIRS = [
  { from: "ETH", to: "USDG" },
  { from: "USDG", to: "ETH" },
  { from: "USDG", to: "WETH" },
] as const;
function QuickQuote() {
  const [pi, setPi] = useState(0);
  const [amt, setAmt] = useState("1");
  const [r, setR] = useState<QuoteR | null>(null);
  const pair = PAIRS[pi]!;
  useEffect(() => {
    let off = false;
    const v = Number(amt);
    if (!(v > 0)) return;
    const t = setTimeout(() => {
      fetch(`/api/quote?from=${pair.from}&to=${pair.to}&amount=${encodeURIComponent(amt)}`)
        .then((x) => x.json() as Promise<QuoteR>)
        .then((j) => !off && setR(j))
        .catch(() => !off && setR({ error: "No answer." }));
    }, 350);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [amt, pair.from, pair.to]);
  const best = r?.best != null && r.routes ? r.routes[r.best] : null;
  const out = best?.amountOut && r?.to ? Number(best.amountOut) / 10 ** r.to.decimals : null;
  return (
    <Tool title="Quote a swap" hint="Every route, at the latest block">
      <div className="flex gap-2">
        <input
          value={amt}
          onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))}
          inputMode="decimal"
          aria-label="Amount"
          className="h-10 w-24 rounded-xl border border-line bg-[#090909] px-3 text-right tabular-nums text-[14px] text-text outline-none focus:border-ui/60"
        />
        <button
          type="button"
          onClick={() => setPi((i) => (i + 1) % PAIRS.length)}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-line font-mono text-[13px] text-text hover:border-ui/60"
        >
          {`${pair.from} → ${pair.to}`}
          <span aria-hidden className="text-muted">
            ⇄
          </span>
        </button>
      </div>
      <p className="mt-4 font-display text-3xl tabular-nums text-text">
        {out != null ? (
          out.toLocaleString("en", { maximumFractionDigits: out < 1 ? 6 : 2 })
        ) : (
          <span className="text-muted">···</span>
        )}
      </p>
      <p className="mt-1 text-[12.5px] text-muted">
        {r?.error
          ? r.error
          : out != null
            ? `${pair.to} out on the best of ${r?.routes?.length ?? 0} routes${r?.impact != null ? `, impact ${(r.impact * 100).toFixed(2)}%` : ""}`
            : "Simulating every route"}
      </p>
      <Link
        href="/app/trade/quote"
        className="mt-2 inline-block text-[12.5px] text-leaf underline underline-offset-2"
      >
        Swap in the quote tool →
      </Link>
    </Tool>
  );
}

const WATCH_KEY = "corbel.overview.watch";
function Watch({ d }: { d: D }) {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(WATCH_KEY) ?? "[]") as string[];
      void Promise.resolve().then(() => setList(v));
    } catch {
      // storage off: an empty list
    }
  }, []);
  const save = (v: string[]) => {
    setList(v);
    try {
      localStorage.setItem(WATCH_KEY, JSON.stringify(v));
    } catch {
      // convenience only
    }
  };
  const all = [
    ...(d.trend?.rows ?? []).map((r) => ({
      token: r.token,
      symbol: r.symbol ?? "?",
      change: r.change ?? null,
      stock: false,
    })),
    ...(d.sm?.stocks ?? []).map((s) => ({ token: s.token, symbol: s.symbol, change: s.change, stock: true })),
  ];
  const mine = list
    .map((a) => all.find((x) => x.token.toLowerCase() === a))
    .filter((x): x is (typeof all)[number] => !!x);
  const offer = all.filter((x) => !list.includes(x.token.toLowerCase())).slice(0, 6);
  return (
    <Tool title="Your watchlist" hint="Kept in this browser">
      {mine.length ? (
        <ul className="space-y-1">
          {mine.map((x) => (
            <li key={x.token} className="group flex items-center gap-2 text-[13px]">
              <Link
                href={`/app/trade/terminal?token=${x.token}`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 hover:bg-leaf/[0.05]"
              >
                <TokenAvatar address={x.token} symbol={x.symbol} stock={x.stock} size={20} />
                <span className="truncate font-mono text-text">{x.symbol}</span>
                <span
                  className={cx(
                    "ml-auto font-mono",
                    x.change == null ? "text-muted" : x.change >= 0 ? "text-leaf" : "text-flesh",
                  )}
                >
                  {x.change == null ? "—" : pct(x.change)}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => save(list.filter((a) => a !== x.token.toLowerCase()))}
                aria-label={`Remove ${x.symbol}`}
                className="px-1 text-muted opacity-0 transition-opacity hover:text-flesh group-hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted">Pin tokens to follow their 24h move here.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {offer.map((x) => (
          <button
            key={x.token}
            type="button"
            onClick={() => save([...list, x.token.toLowerCase()].slice(-8))}
            className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2 text-[12px] text-muted hover:border-ui/60 hover:text-text"
          >
            <TokenAvatar address={x.token} symbol={x.symbol} stock={x.stock} size={16} />
            {`+ ${x.symbol}`}
          </button>
        ))}
      </div>
    </Tool>
  );
}

function Tool({ title, hint, children, bare }: { title: string; hint: string; children: React.ReactNode; bare?: boolean }) {
  if (bare)
    return (
      <section className="flex min-w-0 flex-col px-5 py-4">
        <p className="text-[14px] font-medium text-text">{title}</p>
        <p className="mt-0.5 font-mono text-[12px] text-muted">{hint}</p>
        <div className="mt-3 flex-1">{children}</div>
      </section>
    );
  return (
    <section className="flex flex-col rounded-3xl border border-line bg-[#0e0e0e] p-5">
      <p className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold text-text">{title}</span>
        <span className="font-mono text-[12px] text-muted">{hint}</span>
      </p>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

/* ───────────────────────────── 4 · the board: every block under the deck follows its page ───────────────────────────── */

function Movers({ d }: { d: D }) {
  const [up, setUp] = useState(true);
  const rows = [...(d.trend?.rows ?? [])]
    .filter((r) => r.change != null && r.volume > 500)
    .sort((a, b) => (up ? b.change! - a.change! : a.change! - b.change!))
    .slice(0, 6);
  return (
    <Tool title="Movers, 24h" hint="busiest tokens only">
      <div className="mb-2 flex gap-1">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => setUp(v)}
            aria-pressed={up === v}
            className={cx(
              "rounded-full px-3 py-1 text-[12px]",
              up === v
                ? v
                  ? "bg-leaf/15 text-leaf"
                  : "bg-flesh/15 text-flesh"
                : "text-muted hover:text-text",
            )}
          >
            {v ? "Rising" : "Falling"}
          </button>
        ))}
      </div>
      <Rows
        rows={rows.map((r) => ({
          k: <Tok token={r.token} symbol={r.symbol ?? "?"} />,
          v: pct(r.change!),
          tone: r.change! >= 0 ? "up" : "down",
          href: `/app/trade/terminal?token=${r.token}`,
        }))}
      />
    </Tool>
  );
}

function NearGrad({ d, bare }: { d: D; bare?: boolean }) {
  const near = d.brief?.near ?? [];
  return (
    <Tool bare={bare} title={bare ? "Which curves are about to graduate?" : "Near graduation"} hint="share of the curve sold">
      {!near.length && <p className="caret text-[12.5px] text-muted">Reading the curves</p>}
      <ul className="space-y-2.5">
        {near.slice(0, 8).map((n, k) => (
          <li key={n.token}>
            <Link
              href={`/app/trust/check?q=${n.token}`}
              className="block rounded-lg px-1 py-0.5 hover:bg-leaf/[0.05]"
            >
              <span className="flex items-center gap-2 text-[13px]">
                <TokenAvatar address={n.token} symbol={n.symbol} size={18} />
                <span className="font-mono text-text">{n.symbol ?? "?"}</span>
                <span className="text-[12px] text-muted">{n.pad}</span>
                <span className="ml-auto font-mono text-leaf">{`${Math.round(n.sold * 100)}%`}</span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#1f1f1f]">
                <span
                  className="bar-grow block h-full rounded-full bg-leaf"
                  style={{ width: `${n.sold * 100}%`, animationDelay: `${k * 0.06}s` }}
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Tool>
  );
}

const FLAG_TAG: Record<string, string> = {
  serial: "serial creator",
  lookalike: "copies money",
  clone: "same ticker",
  drained: "drained",
};
function Flags({ d, bare }: { d: D; bare?: boolean }) {
  const f = d.brief?.flags ?? [];
  return (
    <Tool bare={bare} title={bare ? "Who should you avoid?" : "What the agent flagged"} hint="flagged by the launch agent, last 24 hours">
      {!d.brief && <p className="caret text-[12.5px] text-muted">Reading the launches</p>}
      {d.brief && !f.length && <p className="text-[13px] text-muted">Nothing out of line in the last day.</p>}
      <ul className="divide-y divide-[#1a1a1a]">
        {f.slice(0, 7).map((x, k) => (
          <li key={k}>
            <Link
              href={x.token ? `/app/trust/check?q=${x.token}` : "/app/trust/radar"}
              className="flex items-start gap-3 rounded-lg px-1 py-2.5 hover:bg-leaf/[0.04]"
            >
              <span
                className={cx(
                  "mt-0.5 w-[6.6rem] shrink-0 rounded-md px-1.5 py-0.5 text-center font-mono text-[12px]",
                  x.kind === "drained" || x.kind === "lookalike"
                    ? "bg-flesh/10 text-flesh"
                    : "bg-[#1f1f1f] text-[#c9d6cf]",
                )}
              >
                {FLAG_TAG[x.kind] ?? x.kind}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-text">{x.title}</span>
                {x.note && <span className="block truncate text-[12px] text-muted">{x.note}</span>}
              </span>
              <span className="shrink-0 text-[12px] text-leaf">{x.token ? "Check →" : "Radar →"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Tool>
  );
}

function StockMovers({ d }: { d: D }) {
  const s = [...(d.sm?.stocks ?? [])]
    .filter((x) => x.change != null && x.volume > 1000 && (x.price ?? 0) >= 0.01)
    .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))
    .slice(0, 7);
  return (
    <Tool title="Stock tokens moving" hint="against yesterday">
      <Rows
        rows={s.map((x) => ({
          k: <Tok token={x.token} symbol={x.symbol} stock />,
          v: `${x.price ? `$${x.price.toFixed(2)}  ` : ""}${pct(x.change!)}`,
          tone: x.change! >= 0 ? "up" : "down",
          href: `/app/trade/terminal?token=${x.token}`,
        }))}
      />
    </Tool>
  );
}

function nextUs(now: number) {
  for (let i = 0; i < 8; i++) {
    const day = new Date(now + i * 86_400_000);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    const at = (h: number, m: number) =>
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m);
    if (now < at(13, 30)) return { k: "opens", at: at(13, 30), open: false };
    if (now < at(20, 0)) return { k: "closes", at: at(20, 0), open: true };
  }
  return { k: "opens", at: now + 86_400_000, open: false };
}
function MarketClock() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const f = setTimeout(tick, 0);
    const i = setInterval(tick, 1000);
    return () => (clearTimeout(f), clearInterval(i));
  }, []);
  const n = now ? nextUs(now) : null;
  const left = n ? Math.max(0, n.at - now) : 0;
  const pad = (v: number) => String(v).padStart(2, "0");
  return (
    <Tool title="The real market" hint="US session, UTC">
      <p className={cx("font-mono text-[12px]", n?.open ? "text-leaf" : "text-[#d9a441]")}>
        {n ? (n.open ? "● open now · tokens track the share" : "● closed · tokens trade alone") : "…"}
      </p>
      <p className="mt-3 text-[40px] leading-none tabular-nums text-text">
        {n
          ? `${pad(Math.floor(left / 3_600_000))}:${pad(Math.floor((left % 3_600_000) / 60_000))}:${pad(Math.floor((left % 60_000) / 1000))}`
          : "··:··:··"}
      </p>
      <p className="mt-1 text-[12.5px] text-muted">{n ? `until it ${n.k}` : ""}</p>
      <Link
        href="/app/stocks/market"
        className="mt-3 inline-block text-[12.5px] text-leaf underline underline-offset-2"
      >
        Stock market →
      </Link>
    </Tool>
  );
}

function Venues({ d }: { d: D }) {
  const v = (d.sm?.venues ?? []).slice(0, 6);
  const top = v[0]?.volume || 1;
  return (
    <Tool title="Where stocks trade" hint="24h volume by venue">
      <ul className="space-y-2">
        {v.map((x, k) => (
          <li key={x.id} className="text-[12.5px]">
            <span className="flex justify-between">
              <span className="text-text">{x.id}</span>
              <span className="font-mono text-muted">{usd(x.volume)}</span>
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#1f1f1f]">
              <span
                className="bar-grow block h-full rounded-full bg-leaf/80"
                style={{ width: `${(x.volume / top) * 100}%`, animationDelay: `${k * 0.06}s` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </Tool>
  );
}

function FindStock({ d }: { d: D }) {
  const [q, setQ] = useState("");
  const s = (d.sm?.stocks ?? [])
    .filter(
      (x) =>
        !q ||
        (x.symbol ?? "").toLowerCase().includes(q.toLowerCase()) ||
        (x.name ?? "").toLowerCase().includes(q.toLowerCase()),
    )
    .slice(0, 6);
  return (
    <Tool title="Find a stock token" hint="by ticker or name">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="NVDA, Tesla…"
        aria-label="Find a stock token"
        className="h-10 w-full rounded-xl border border-line bg-[#090909] px-3 font-mono text-[13px] text-text outline-none focus:border-ui/60"
      />
      <div className="mt-2">
        <Rows
          rows={s.map((x) => ({
            k: <Tok token={x.token} symbol={x.symbol} stock />,
            v: x.price ? `$${x.price.toFixed(2)}` : "—",
            href: `/app/trade/terminal?token=${x.token}`,
          }))}
        />
      </div>
    </Tool>
  );
}

function YieldCalc({ d }: { d: D }) {
  const rows = (d.earn?.rows ?? []).filter((r) => r.days);
  const [pick, setPick] = useState(0);
  const [amt, setAmt] = useState(1000);
  const r = rows[Math.min(pick, Math.max(0, rows.length - 1))];
  const apr = r?.days?.avgApr ?? 0;
  return (
    <Tool title="What a pool paid" hint="last 30 days, not a promise">
      <div className="flex flex-wrap gap-1">
        {rows.slice(0, 5).map((x, k) => (
          <button
            key={x.pair}
            type="button"
            onClick={() => setPick(k)}
            aria-pressed={pick === k}
            className={cx(
              "flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[12px]",
              pick === k ? "border-leaf text-text" : "border-line text-muted hover:text-text",
            )}
          >
            <TokenAvatar address={x.token} symbol={x.symbol} size={16} />
            {x.symbol}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-[12px] text-muted">
        <span className="flex justify-between">
          If you had put in <span className="font-mono text-text">{usd(amt)}</span>
        </span>
        <input
          type="range"
          min={100}
          max={20000}
          step={100}
          value={amt}
          onChange={(e) => setAmt(Number(e.target.value))}
          className="mt-1.5 w-full accent-[var(--ui)]"
          aria-label="Amount"
        />
      </label>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["a day", (amt * apr) / 365],
            ["30 days", (amt * apr * 30) / 365],
            ["a year", amt * apr],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-[#090909] py-2">
            <dd className="font-mono text-[15px] text-leaf">{usd(v)}</dd>
            <dt className="text-[12px] text-muted">{k}</dt>
          </div>
        ))}
      </dl>
    </Tool>
  );
}

function Steady({ d }: { d: D }) {
  const rows = [...(d.earn?.rows ?? [])]
    .filter((r) => r.days)
    .sort((a, b) => b.days!.paid - a.days!.paid)
    .slice(0, 5);
  return (
    <Tool title="Steadiest pools" hint="days that paid, of 30">
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.pair}>
            <Link href="/app/account/pools" className="block rounded-lg px-1 py-0.5 hover:bg-leaf/[0.05]">
              <span className="flex items-center gap-2 text-[13px]">
                <Tok token={r.token} symbol={r.symbol} />
                <span className="ml-auto font-mono text-[12px] text-text">{`${r.days!.paid}/${r.days!.n}`}</span>
              </span>
              <span className="mt-1 flex gap-[2px]">
                {Array.from({ length: r.days!.n }, (_, k) => (
                  <i
                    key={k}
                    className={cx(
                      "h-2 flex-1 rounded-[1px]",
                      k < r.days!.paid ? "bg-leaf/80" : "bg-[#242424]",
                    )}
                  />
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Tool>
  );
}

type GuardR = {
  verdict?: "allow" | "deny";
  symbol?: string | null;
  score?: { total: number };
  rules?: { name: string; ok: boolean; detail: string }[];
  error?: string;
};
function GuardRun() {
  const [token, setToken] = useState("");
  const [amt, setAmt] = useState("100");
  const [r, setR] = useState<GuardR | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(token.trim())) return setR({ error: "Paste a token address." });
    setBusy(true);
    setR(null);
    fetch(
      `/api/guard?token=${token.trim()}&side=buy&pay=USDG&amount=${encodeURIComponent(amt)}&minScore=60&maxImpact=0.02`,
    )
      .then((x) => x.json() as Promise<GuardR>)
      .then(setR)
      .catch(() => setR({ error: "No answer." }))
      .finally(() => setBusy(false));
  };
  return (
    <Tool title="Ask the guard" hint="may an agent make this trade?">
      <form onSubmit={(e) => (e.preventDefault(), run())} className="space-y-2 lg:flex lg:items-center lg:gap-2 lg:space-y-0">
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Token 0x…"
          spellCheck={false}
          aria-label="Token for the guard"
          className="h-10 w-full rounded-xl border border-line bg-[#090909] px-3 font-mono text-[12.5px] text-text outline-none focus:border-ui/60 lg:flex-1"
        />
        <div className="flex gap-2 lg:shrink-0">
          <input
            value={amt}
            onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))}
            aria-label="USDG to spend"
            className="h-10 w-24 rounded-xl border border-line bg-[#090909] px-3 text-right tabular-nums text-[13px] text-text outline-none focus:border-ui/60"
          />
          <span className="self-center text-[12px] text-muted">USDG</span>
          <button
            type="submit"
            disabled={busy}
            className="ml-auto h-10 rounded-xl bg-ui px-4 text-[13px] font-semibold text-[#0b0b0b] disabled:opacity-60"
          >
            {busy ? "…" : "Run the gate"}
          </button>
        </div>
      </form>
      {r?.error && <p className="mt-2 text-[12.5px] text-flesh">{r.error}</p>}
      {r?.verdict && (
        <div className="ov-page ov-page-next mt-3">
          <p
            className={cx("font-mono text-[15px]", r.verdict === "allow" ? "text-leaf" : "text-flesh")}
          >{`${r.verdict === "allow" ? "✓ allow" : "✕ deny"} · ${r.symbol ?? "token"} · score ${r.score?.total ?? "—"}`}</p>
          <ul className="mt-1.5 space-y-0.5 text-[12px]">
            {(r.rules ?? []).slice(0, 6).map((x) => (
              <li
                key={x.name}
                className={x.ok ? "text-muted" : "text-flesh"}
              >{`${x.ok ? "✓" : "✕"} ${x.name}`}</li>
            ))}
          </ul>
        </div>
      )}
    </Tool>
  );
}

function Decisions({ d }: { d: D }) {
  const e = d.mand?.entries ?? [];
  const tape = [...e].reverse().slice(-40);
  return (
    <Tool title="The contract decided" hint="Break it runs, newest last">
      <p className="break-all font-mono text-[18px] leading-tight tracking-[0.14em]">
        {tape.map((x) => (
          <span key={x.id} className={x.traded ? "text-leaf" : x.frozen ? "text-[#8f3341]" : "text-flesh"}>
            {x.traded ? "▮" : x.frozen ? "#" : "×"}
          </span>
        ))}
      </p>
      <div className="mt-3">
        <Rows
          rows={e
            .slice(0, 4)
            .map((x) => ({
              k: x.traded ? "traded inside the rules" : `stopped by ${x.rule}`,
              v: `#${Number(x.block).toLocaleString("en")}`,
              tone: x.traded ? "up" : "down",
              href: "/app/agents/log",
            }))}
        />
      </div>
    </Tool>
  );
}

function Gates({ d }: { d: D }) {
  const stops = new Map<string, number>();
  for (const x of d.mand?.entries ?? []) if (!x.traded) stops.set(x.rule, (stops.get(x.rule) ?? 0) + 1);
  const RULES: [string, string][] = [
    ["Assets", "only what the owner listed"],
    ["Size", "a cap on every trade"],
    ["Budget", "a cap per day"],
    ["Price", "slippage and pool fee limits"],
    ["Window", "trading hours"],
  ];
  return (
    <Tool title="Five gates per trade" hint="and what each has stopped">
      <ol className="space-y-1.5">
        {RULES.map(([k, line], i) => (
          <li key={k} className="flex items-center gap-3 rounded-lg bg-[#090909] px-3 py-2 text-[12.5px]">
            <span className="font-mono text-[12px] text-[#9b86e4]">{`0${i + 1}`}</span>
            <span className="text-text">{k}</span>
            <span className="truncate text-muted">{line}</span>
            <span className={cx("ml-auto font-mono", stops.get(k) ? "text-flesh" : "text-muted")}>
              {stops.get(k) ?? 0}
            </span>
          </li>
        ))}
      </ol>
    </Tool>
  );
}

function Markets({ d }: { d: D }) {
  const ms = d.pred?.markets ?? [];
  return (
    <Tool title="Markets" hint="stake YES or NO in USDG">
      {!ms.length && <p className="text-[12.5px] text-muted">No market open right now.</p>}
      <ul className="space-y-2">
        {ms.slice(0, 4).map((m) => {
          const y = Number(m.yesPot) / 1e6,
            n = Number(m.noPot) / 1e6,
            pot = y + n;
          return (
            <li key={m.id} className="rounded-xl bg-[#090909] p-3">
              <p className="text-[13px] text-text">{`#${m.id} · ${m.kind === "survival" ? "does the pool keep its liquidity" : "price line"} · ${m.state}`}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link
                  href="/app/predict"
                  className="rounded-lg border border-leaf/30 bg-leaf/10 py-1.5 text-center text-[13px] font-semibold text-leaf hover:bg-leaf/20"
                >{`Yes ${pot ? Math.round((y / pot) * 100) : 50}%`}</Link>
                <Link
                  href="/app/predict"
                  className="rounded-lg border border-flesh/30 bg-flesh/10 py-1.5 text-center text-[13px] font-semibold text-flesh hover:bg-flesh/20"
                >{`No ${pot ? Math.round((n / pot) * 100) : 50}%`}</Link>
              </div>
            </li>
          );
        })}
      </ul>
    </Tool>
  );
}

function Settle() {
  const STEPS = [
    "Someone opens a market on a real pool",
    "Stakes go in, YES or NO, in USDG",
    "During the watch, anyone records the reserve",
    "After it, the chain decides; winners claim",
  ];
  return (
    <Tool title="How it settles" hint="no oracle, no vote">
      <ol className="space-y-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex gap-3 text-[13px]">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-leaf/50 font-mono text-[12px] text-leaf">
              {i + 1}
            </span>
            <span className="text-text">{s}</span>
          </li>
        ))}
      </ol>
    </Tool>
  );
}

function Pots({ d }: { d: D }) {
  const ms = d.pred?.markets ?? [];
  const tot = ms.reduce((a, m) => a + (Number(m.yesPot) + Number(m.noPot)) / 1e6, 0);
  return (
    <Tool title="On CorbelPredict" hint="read from the contract">
      <dl className="grid grid-cols-2 gap-2">
        {(
          [
            ["Markets", String(d.pred?.count ?? "—")],
            ["Open", String(ms.filter((m) => m.state === "open").length)],
            ["In the pots", usd(tot)],
            ["Fee", `${1}% of the losing pot`],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-[#090909] px-3 py-2.5">
            <dt className="text-[12px] text-muted">{k}</dt>
            <dd className="font-mono text-[16px] text-text">{v}</dd>
          </div>
        ))}
      </dl>
    </Tool>
  );
}

function AskModel() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <Tool title="Ask a model" hint="sign in with your wallet">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/app/ai/chat${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
        }}
        className="lg:flex lg:items-stretch lg:gap-3"
      >
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          rows={2}
          placeholder="Explain a token's sell tax in one line…"
          aria-label="Your question"
          className="w-full resize-none rounded-xl border border-line bg-[#090909] p-3 text-[13px] text-text outline-none focus:border-[var(--ai)]"
        />
        <button
          type="submit"
          className="mt-2 h-10 w-full rounded-xl bg-[var(--ai)] px-6 text-[13px] font-semibold text-[#1a0b03] lg:mt-0 lg:h-auto lg:w-auto lg:shrink-0"
        >
          Open the chat →
        </button>
      </form>
    </Tool>
  );
}

function CheapModels({ d }: { d: D }) {
  const rows = (d.models?.rows ?? [])
    .filter((r) => (r.pin ?? 0) > 0 && r.kind === "text")
    .sort((a, b) => (a.pin ?? 0) - (b.pin ?? 0))
    .slice(0, 6);
  return (
    <Tool title="Cheapest text models" hint="$ per million tokens, in / out">
      <Rows
        rows={rows.map((r) => ({
          k: <span className="truncate">{r.name}</span>,
          v: `$${(r.pin ?? 0).toFixed(2)} / $${(r.pout ?? 0).toFixed(2)}`,
          href: "/app/ai/models",
        }))}
      />
    </Tool>
  );
}

type Gpu = { name: string; vram: number; secure: number | null; community: number | null };
function GpuFit() {
  const [b, setB] = useState(70);
  const [gpus, setGpus] = useState<Gpu[] | null>(null);
  useEffect(() => {
    let off = false;
    void get<{ rows?: Gpu[] }>("/api/compute?what=gpus").then((j) => !off && setGpus(j?.rows ?? []));
    return () => {
      off = true;
    };
  }, []);
  const need = Math.ceil(b * 2 * 1.2);
  const fit = (gpus ?? [])
    .filter((g) => g.vram >= need)
    .sort(
      (x, y) => Math.min(x.community ?? 1e9, x.secure ?? 1e9) - Math.min(y.community ?? 1e9, y.secure ?? 1e9),
    )
    .slice(0, 3);
  return (
    <Tool title="Which GPU fits" hint="FP16 weights plus headroom">
      <label className="block text-[12px] text-muted">
        <span className="flex justify-between">
          Model size <span className="font-mono text-[var(--ai)]">{`${b}B · ${need} GB`}</span>
        </span>
        <input
          type="range"
          min={1}
          max={200}
          value={b}
          onChange={(e) => setB(Number(e.target.value))}
          className="mt-1.5 w-full accent-[var(--ai)]"
          aria-label="Model size in billions"
        />
      </label>
      <ul className="mt-2 space-y-1.5">
        {fit.map((g) => (
          <li key={g.name} className="flex justify-between rounded-lg bg-[#090909] px-3 py-2 text-[12.5px]">
            <span className="text-text">{`${g.name} · ${g.vram} GB`}</span>
            <span className="font-mono text-[var(--ai)]">{`$${Math.min(g.community ?? 1e9, g.secure ?? 1e9).toFixed(2)}/h`}</span>
          </li>
        ))}
        {gpus && !fit.length && (
          <li className="text-[12.5px] text-muted">No single GPU holds it; split across several.</li>
        )}
      </ul>
    </Tool>
  );
}

/** The check page's lead: the check itself, as a band with no card around it (the day's figure is in the deck above). */
function CheckHead({ d }: { d: D }) {
  void d;
  return (
    <div className="border-b border-line pb-4 [&>section]:px-0">
      <QuickCheck bare />
    </div>
  );
}

type Cell = [React.ReactNode, string];
function Board({ id, d }: { id: string; d: D }) {
  // spans per cell on wide screens; every row adds up to 12 so nothing is left empty
  const sets: Record<string, Cell[]> = {
    check: [
      [<CheckHead key="a" d={d} />, "lg:col-span-12"],
      [
        <div key="b" className="grid grid-cols-1 divide-y divide-line rounded-2xl border border-line md:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] md:divide-x md:divide-y-0">
          <Flags d={d} bare />
          <NearGrad d={d} bare />
        </div>,
        "lg:col-span-12",
      ],
      [<LaunchBrief key="c" logOnly />, "lg:col-span-12"],
    ],
    trade: [
      [<QuickQuote key="a" />, "lg:col-span-4"],
      [
        <Tool key="b" title="Largest swaps right now" hint="the wallets behind them">
          <BigSwaps />
        </Tool>,
        "lg:col-span-8 lg:row-span-2",
      ],
      [<Movers key="c" d={d} />, "lg:col-span-4"],
      [<Watch key="d" d={d} />, "lg:col-span-12"],
    ],
    stocks: [
      [<StockMovers key="a" d={d} />, "lg:col-span-5 lg:row-span-2"],
      [<MarketClock key="b" />, "lg:col-span-7"],
      [<Venues key="c" d={d} />, "lg:col-span-4"],
      [<FindStock key="d" d={d} />, "lg:col-span-3"],
    ],
    earn: [
      [<YieldCalc key="a" d={d} />, "lg:col-span-5"],
      [<Steady key="b" d={d} />, "lg:col-span-7"],
    ],
    agents: [
      [<Decisions key="b" d={d} />, "lg:col-span-7"],
      [<Gates key="c" d={d} />, "lg:col-span-5"],
      [<GuardRun key="a" />, "lg:col-span-12"],
    ],
    predict: [
      [<Pots key="b" d={d} />, "lg:col-span-5"],
      [<Settle key="c" />, "lg:col-span-7"],
      [<Markets key="a" d={d} />, "lg:col-span-12"],
    ],
    ai: [
      [<AskModel key="a" />, "lg:col-span-12"],
      [<CheapModels key="b" d={d} />, "lg:col-span-6"],
      [<GpuFit key="c" />, "lg:col-span-6"],
    ],
  };
  const s = sets[id] ?? [];
  return (
    <div key={id} className="ov-board grid grid-flow-row-dense grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      {s.map(([node, span], k) => (
        <div key={k} className={cx("grid min-w-0 grid-cols-1 [&>*]:h-full [&>*]:min-w-0", span)}>
          {node}
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────── 3 · signals: a second deck that turns on its own ───────────────────────────── */

type Whale = {
  token: string;
  symbol: string;
  side: "buy" | "sell";
  usd: number;
  who: string;
  tx: string;
  t: number;
};
function BigSwaps() {
  const [rows, setRows] = useState<Whale[] | null>(null);
  useEffect(() => {
    let off = false;
    void get<{ rows?: Whale[] }>("/api/whales").then((j) => !off && setRows(j?.rows?.slice(0, 8) ?? []));
    return () => {
      off = true;
    };
  }, []);
  return (
    <ul className="divide-y divide-[#1a1a1a]">
      {!rows && <li className="caret py-6 font-mono text-[12px] text-muted">Reading the largest swaps</li>}
      {rows?.map((r) => (
        <li
          key={r.tx}
          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 py-2.5 text-[13.5px]"
        >
          <Tok token={r.token} symbol={r.symbol} />
          <span
            className={cx("font-mono", r.side === "buy" ? "text-leaf" : "text-flesh")}
          >{`${r.side} ${usd(r.usd)}`}</span>
          <a
            href={`https://robinhoodchain.blockscout.com/tx/${r.tx}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[12px] text-muted underline underline-offset-2"
          >
            {`${r.who.slice(0, 6)}…${r.who.slice(-4)}`}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Overview() {
  const d = useData();
  const [page, setPage] = useState(0);
  return (
    <div className="space-y-6">
      <Stage d={d} />
      <Deck d={d} i={page} setI={setPage} />
      <Board id={PAGES[page]!.id} d={d} />
      <p className="text-center text-[13px] text-muted">
        Everything else lives in the menu on the left, or{" "}
        <Link href="/app/tools" className="text-leaf underline underline-offset-2">
          every tool on one screen
        </Link>
        .
      </p>
    </div>
  );
}
