"use client";

/**
 * Radar · the busiest tokens of the last 30 hours as wide cards with their mark, price move and swaps, the way
 * launchpads show tokens. A click opens the token in the terminal. Read from /api/trending.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import { TokenAvatar } from "./TokenAvatar";

type Row = { token: string; symbol: string | null; volume: number; change?: number | null; swaps: number; buys?: number };
const SKIP = new Set(["WETH", "ETH", "USDG", "USDC"]);
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);

export function TokenShelf() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/trending")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: Row[] } | null) => !off && setRows((j?.rows ?? []).filter((r) => r.volume > 0 && !SKIP.has((r.symbol ?? "").toUpperCase())).sort((a, b) => b.volume - a.volume).slice(0, 12)))
      .catch(() => !off && setRows([]));
    return () => {
      off = true;
    };
  }, []);
  const move = (k: number) => strip.current?.scrollBy({ left: k * (strip.current.clientWidth * 0.8), behavior: "smooth" });
  if (rows && !rows.length) return null;
  return (
    <section aria-label="Busiest tokens" className="shelf">
      <header className="flex items-center justify-between gap-3 pb-2.5">
        <h2 className="text-[15px] font-semibold text-text">Busiest tokens, last 30 hours</h2>
        <span className="flex gap-1.5">
          {[-1, 1].map((k) => (
            <button key={k} type="button" onClick={() => move(k)} aria-label={k < 0 ? "Back" : "More"} className="grid h-8 w-8 place-items-center rounded-full border border-[#2a2a2a] text-muted transition-colors hover:border-[#3a3a3a] hover:text-text">
              {k < 0 ? "←" : "→"}
            </button>
          ))}
        </span>
      </header>
      <div ref={strip} className="shelf-strip flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {!rows &&
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="shelf-card shrink-0 animate-pulse">
              <span className="h-[88px] w-[88px] rounded-xl bg-[#1c1c1c]" />
              <span className="h-4 w-24 rounded bg-[#1c1c1c]" />
            </div>
          ))}
        {rows?.map((r, i) => {
          const buys = r.buys != null && r.swaps ? r.buys / r.swaps : null;
          return (
            <Link key={r.token} href={`/app/trade/terminal?token=${r.token}`} className="shelf-card group shrink-0 snap-start" style={{ animationDelay: `${i * 45}ms` }}>
              <span className="shelf-art">
                <TokenAvatar address={r.token} symbol={r.symbol ?? "?"} size={88} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <b className="truncate text-[16px] font-semibold text-text">{r.symbol ?? `${r.token.slice(0, 6)}…`}</b>
                  {r.change != null && <span className={cx("shrink-0 font-mono text-[12.5px]", r.change >= 0 ? "text-leaf" : "text-flesh")}>{`${r.change >= 0 ? "▲" : "▼"} ${Math.abs(r.change).toFixed(1)}%`}</span>}
                </span>
                <span className="mt-1 block font-mono text-[18px] text-text">{usd(r.volume)}</span>
                <span className="block text-[12px] text-muted">volume, 30h</span>
                <span className="mt-2.5 flex items-center justify-between font-mono text-[12px] text-muted">
                  <span>{`${r.swaps.toLocaleString("en-US")} swaps`}</span>
                  {buys != null && <span className={buys >= 0.5 ? "text-leaf" : "text-flesh"}>{`${Math.round(buys * 100)}% buys`}</span>}
                </span>
                {buys != null && (
                  <span aria-hidden className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-flesh/60">
                    <span className="bg-leaf" style={{ width: `${buys * 100}%` }} />
                  </span>
                )}
                <ShelfRisk token={r.token} delay={i * 350} />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

type Sum = { top10: number; creator: number; snipers: number; sniperCount: number; insiders: number };
const pc = (v: number) => `${Math.round(v * 100)}%`;

/** Who holds it, as small chips under the card: read once the card is on screen (the server keeps each read 30 min). */
function ShelfRisk({ token, delay }: { token: string; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [s, setS] = useState<Sum | null | undefined>(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let off = false;
    let t: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver((e) => {
      if (!e[0]?.isIntersecting) return;
      io.disconnect();
      t = setTimeout(() => {
        fetch(`/api/holders?token=${token}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { summary?: Sum } | null) => !off && setS(j?.summary ?? null))
          .catch(() => !off && setS(null));
      }, delay);
    });
    io.observe(el);
    return () => {
      off = true;
      io.disconnect();
      if (t) clearTimeout(t);
    };
  }, [token, delay]);
  const chips: [string, string, boolean][] = s
    ? [
        ["Top 10", pc(s.top10), s.top10 > 0.5],
        ["Dev", pc(s.creator), s.creator > 0.05],
        ["Snipers", String(s.sniperCount), s.snipers > 0.1],
        ["Insiders", pc(s.insiders), s.insiders > 0.2],
      ]
    : [];
  return (
    <span ref={ref} className="mt-2 flex min-h-[20px] flex-wrap gap-1">
      {s === undefined && <span className="h-[18px] w-36 animate-pulse rounded bg-[#1c1c1c]" />}
      {chips.map(([k, v, bad]) => (
        <span key={k} title={k} className={cx("rounded-md border px-1.5 font-mono text-[11px] leading-[18px]", bad ? "border-flesh/40 bg-flesh/10 text-flesh" : "border-[#2a2a2a] bg-[#1a1a1a] text-muted")}>
          {`${k} ${v}`}
        </span>
      ))}
    </span>
  );
}
