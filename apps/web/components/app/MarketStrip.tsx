"use client";

/**
 * Top bar · market strip. Three things people use there and nothing else: the ETH price, gas, and the visitor's own
 * last swap when there is one (from this browser). Read from /api/trending and /api/net; a cell flashes when it moves.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import { TokenAvatar } from "./TokenAvatar";
import { useActs } from "./activity";

type Row = { token: string; symbol: string | null; price?: number | null; change?: number | null; liquidity?: number; volume: number; created?: number | null };
type Stock = { token: string; symbol: string; price: number | null; change: number | null; volume: number };
type Snap = { at?: number; rows?: Row[]; stocks?: Stock[]; swaps?: number; from?: number; head?: number };

const px = (v: number | null | undefined) => (v == null ? "—" : v >= 1000 ? `$${v.toLocaleString("en", { maximumFractionDigits: 0 })}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toPrecision(3)}`);
const chg = (v: number | null | undefined) => (v == null ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

function Cell({ href, children, label, flash }: { href: string; children: React.ReactNode; label: string; flash?: number }) {
  return (
    <Link href={href} aria-label={label} className="group relative flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 transition-colors hover:bg-[#161616]">
      {flash ? <span key={flash} aria-hidden className="strip-flash absolute inset-0 rounded-xl" /> : null}
      {children}
    </Link>
  );
}

export function MarketStrip() {
  const [s, setS] = useState<Snap | null>(null);
  const [gas, setGas] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const last = useRef<string>("");
  const acts = useActs();
  useEffect(() => {
    let off = false;
    const load = () => {
      fetch("/api/trending")
        .then((r) => (r.status === 200 ? r.json() : null))
        .then((j: Snap | null) => {
          if (off || !j?.rows) return;
          const sig = j.rows.slice(0, 3).map((r) => r.price).join();
          if (last.current && sig !== last.current) setTick((n) => n + 1);
          last.current = sig;
          setS(j);
        })
        .catch(() => undefined);
      fetch("/api/net")
        .then((r) => r.json())
        .then((j: { gasPriceGwei?: string }) => !off && setGas(j.gasPriceGwei ?? null))
        .catch(() => undefined);
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, []);

  const rows = s?.rows ?? [];
  const eth = rows.find((r) => r.symbol === "ETH" || r.symbol === "WETH");
  const stock = [...(s?.stocks ?? [])].sort((a, b) => b.volume - a.volume)[0];
  // a token launched today can show thousands of percent; the mover is picked from tokens at least two days old
  const old = (r: Row) => r.created == null || (s?.at ?? 0) / 1000 - r.created > 2 * 86400;
  const mover = [...rows].filter((r) => r.change != null && (r.liquidity ?? 0) > 20_000 && r !== eth && old(r)).sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))[0];
  const mine = acts[0];

  return (
    <nav aria-label="Market" className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-2xl border border-[#242424] bg-[#101010]/80 p-1 [scrollbar-width:none]">
      {!s && <span className="px-3 text-[13px] text-muted">Reading the market…</span>}
      {eth && (
        <Cell href={`/app/trade/terminal?token=${eth.token}`} label={`ETH ${px(eth.price)}`} flash={tick}>
          <TokenAvatar address="0x0000000000000000000000000000000000000000" symbol="ETH" size={20} />
          <span className="font-mono text-[13px] text-text">{px(eth.price)}</span>
          <span className={cx("font-mono text-[12.5px]", (eth.change ?? 0) >= 0 ? "text-leaf" : "text-flesh")}>{chg(eth.change)}</span>
        </Cell>
      )}
      {stock && (
        <Cell href={`/app/trade/terminal?token=${stock.token}`} label={`${stock.symbol} ${px(stock.price)}`} flash={tick}>
          <TokenAvatar address={stock.token} symbol={stock.symbol} size={20} stock />
          <span className="text-[13px] font-semibold text-text">{stock.symbol}</span>
          <span className="font-mono text-[13px] text-text">{px(stock.price)}</span>
          <span className={cx("font-mono text-[12.5px]", (stock.change ?? 0) >= 0 ? "text-leaf" : "text-flesh")}>{chg(stock.change)}</span>
        </Cell>
      )}
      {mover && (
        <Cell href={`/app/trade/terminal?token=${mover.token}`} label={`Biggest move ${mover.symbol}`}>
          <span className="text-[12px] text-muted">Mover</span>
          <TokenAvatar address={mover.token} symbol={mover.symbol ?? "?"} size={20} />
          <span className="text-[13px] font-semibold text-text">{mover.symbol}</span>
          <span className={cx("rounded-md px-1.5 py-0.5 font-mono text-[12.5px]", (mover.change ?? 0) >= 0 ? "bg-leaf/15 text-leaf" : "bg-flesh/15 text-flesh")}>{chg(mover.change)}</span>
        </Cell>
      )}
      {s?.swaps != null && (
        <Cell href="/app/trust/radar" label="Swaps on the chain">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-leaf" />
          </span>
          <span className="font-mono text-[13px] text-text">{s.swaps.toLocaleString("en")}</span>
          <span className="text-[12px] text-muted">{s.head && s.from ? `swaps · ${Math.max(1, Math.round((s.head - s.from) / 3600 / 10) * 10)}h` : "swaps"}</span>
        </Cell>
      )}
      {gas && (
        <Cell href="/status" label="Gas price">
          <span className="text-[12px] text-muted">Gas</span>
          <span className="font-mono text-[13px] text-text">{gas}</span>
          <span className="text-[12px] text-muted">gwei</span>
        </Cell>
      )}
      {mine && (
        <Cell href="/app/trade/quote" label="Your last swap">
          <span className={cx("h-2 w-2 rounded-full", mine.status === "done" ? "bg-leaf" : mine.status === "failed" ? "bg-flesh" : "animate-pulse bg-[#f2c46d]")} />
          <span className="text-[12px] text-text">{`${mine.from} → ${mine.to}`}</span>
          <span className="text-[12px] text-muted">{mine.status === "done" ? "done" : mine.status === "failed" ? "failed" : "pending"}</span>
        </Cell>
      )}
    </nav>
  );
}
