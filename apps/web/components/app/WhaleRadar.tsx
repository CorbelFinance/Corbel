"use client";

/**
 * Trade · Big swaps. The largest single swaps of the last day in the tokens Corbel reads swap by swap
 * (/api/whales). Three views that each answer one question:
 *  Tape     - what just happened: the newest big swaps, one row each, size drawn as a bar, the new ones flash in;
 *  Tokens   - where the big money went: net flow per token, buys pushing right, sells left, from one centre line;
 *  Wallets  - who moved it: the signers behind the swaps (not the router the pool paid), ranked by volume.
 * The list refreshes every 20 seconds; a clear empty state says what is being read when nothing has come in yet.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import { Bay, CountUp, SubTabs } from "./Bay";
import { short } from "./kit";
import { TokenAvatar } from "./TokenAvatar";

type Row = { token: string; symbol: string; t: number; side: "buy" | "sell"; usd: number; amount: number; price: number; who: string; tx: string; signer?: boolean };
type Res = { rows: Row[]; tokens: number; since: number | null };
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
const ago = (s: number, now: number) => {
  const d = Math.max(0, now - s);
  return d < 60 ? "now" : d < 3600 ? `${Math.round(d / 60)}m` : `${(d / 3600).toFixed(1)}h`;
};
const MINS = [
  { id: "1000", label: "$1K+" },
  { id: "5000", label: "$5K+" },
  { id: "25000", label: "$25K+" },
] as const;
const VIEWS = [
  { id: "tape", label: "Tape" },
  { id: "tokens", label: "Tokens" },
  { id: "wallets", label: "Wallets" },
] as const;
const EXPLORER = "https://robinhoodchain.blockscout.com/tx/";

export function WhaleRadar() {
  const [min, setMin] = useState<(typeof MINS)[number]["id"]>("1000");
  const [side, setSide] = useState<"all" | "buy" | "sell">("all");
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("tape");
  const [res, setRes] = useState<Res | null>(null);
  const [now, setNow] = useState(0);
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    let off = false;
    const load = () =>
      fetch(`/api/whales?min=${min}`)
        .then((r) => r.json())
        .then((j: Res) => {
          if (off) return;
          const first = seen.current.size === 0;
          const nw = new Set<string>();
          for (const r of j.rows) {
            const k = `${r.tx}:${r.side}:${r.token}`;
            if (!seen.current.has(k)) {
              if (!first) nw.add(k);
              seen.current.add(k);
            }
          }
          setFresh(nw);
          setRes(j);
          setNow(Math.floor(Date.now() / 1000));
        })
        .catch(() => undefined);
    // a cheap market read keeps the server's warm-up of the busiest tokens going, which this list is built from
    fetch("/api/market?token=0x0bd7d308f8e1639fab988df18a8011f41eacad73&w=4").catch(() => undefined);
    void load();
    const t = setInterval(load, 20_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, [min]);

  const rows = useMemo(() => (res?.rows ?? []).filter((r) => side === "all" || r.side === side), [res, side]);
  const bought = rows.filter((r) => r.side === "buy").reduce((s, r) => s + r.usd, 0);
  const sold = rows.filter((r) => r.side === "sell").reduce((s, r) => s + r.usd, 0);
  const max = Math.max(1, ...rows.map((r) => r.usd));

  const tokens = useMemo(() => {
    const m = new Map<string, { token: string; symbol: string; b: number; s: number; n: number }>();
    for (const r of rows) {
      const x = m.get(r.token) ?? { token: r.token, symbol: r.symbol, b: 0, s: 0, n: 0 };
      if (r.side === "buy") x.b += r.usd;
      else x.s += r.usd;
      x.n++;
      m.set(r.token, x);
    }
    return [...m.values()].sort((a, b) => b.b + b.s - (a.b + a.s)).slice(0, 14);
  }, [rows]);
  const tmax = Math.max(1, ...tokens.map((x) => Math.max(x.b, x.s)));

  const wallets = useMemo(() => {
    const m = new Map<string, { who: string; b: number; s: number; n: number; signer: boolean; last: number; tokens: Set<string> }>();
    for (const r of rows) {
      const k = r.who.toLowerCase();
      const x = m.get(k) ?? { who: r.who, b: 0, s: 0, n: 0, signer: !!r.signer, last: 0, tokens: new Set<string>() };
      if (r.side === "buy") x.b += r.usd;
      else x.s += r.usd;
      x.n++;
      x.last = Math.max(x.last, r.t);
      x.tokens.add(r.symbol);
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => b.b + b.s - (a.b + a.s)).slice(0, 15);
  }, [rows]);
  const wmax = Math.max(1, ...wallets.map((x) => x.b + x.s));
  const net = bought - sold;

  return (
    <Bay
      tone="moss"
      kicker={res?.since ? `${res.tokens} busiest tokens, read swap by swap · last ${Math.max(1, Math.round((now - res.since) / 3600))} h` : "Reading the busiest tokens swap by swap"}
      title="Big swaps on Robinhood Chain"
      busy={!res}
      right={
        <div className="flex flex-wrap gap-2">
          <SubTabs label="Size" value={min} onChange={setMin} tabs={MINS} />
          <SubTabs label="Side" value={side} onChange={setSide} tabs={[{ id: "all", label: "All" }, { id: "buy", label: "Buys" }, { id: "sell", label: "Sells" }]} />
        </div>
      }
      foot={<span>Single swaps only. The wallet is the one that signed the transaction once read; before that, the address the pool paid.</span>}
    >
      <div className="grid gap-px border-y border-(--bay-edge) bg-(--bay-edge) sm:grid-cols-4">
        {(
          [
            ["Bought", bought, "text-leaf"],
            ["Sold", sold, "text-flesh"],
            ["Net", net, net >= 0 ? "text-leaf" : "text-flesh"],
          ] as const
        ).map(([k, v, c]) => (
          <div key={k} className="bg-(--bay-bg) px-5 py-3">
            <p className="text-[12px] text-muted">{`${k} in big swaps`}</p>
            <p className={cx("font-mono text-[22px]", c)}>
              <CountUp value={v} fmt={(x) => `${x < 0 ? "−" : ""}${usd(Math.abs(x))}`} />
            </p>
          </div>
        ))}
        <div className="bg-(--bay-bg) px-5 py-3">
          <p className="flex justify-between text-[12px] text-muted">
            Buy share <span className="font-mono">{`${rows.length} swaps`}</span>
          </p>
          <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-[#2a1416]">
            <span className="h-full rounded-full bg-leaf transition-[width] duration-700" style={{ width: `${bought + sold ? (bought / (bought + sold)) * 100 : 50}%` }} />
          </div>
          <p className="mt-1.5 font-mono text-[12px] text-muted">{bought + sold ? `${Math.round((bought / (bought + sold)) * 100)}% of the dollars are buys` : "—"}</p>
        </div>
      </div>

      <div className="px-5 pb-5 pt-4">
        <SubTabs label="View" value={view} onChange={setView} tabs={VIEWS.map((v) => ({ ...v, n: v.id === "tape" ? rows.length || undefined : v.id === "tokens" ? tokens.length || undefined : wallets.length || undefined }))} />

        {res && !rows.length && (
          <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-(--bay-edge) py-14 text-center">
            <p className="text-[14px] text-text">No swaps this size yet in the window.</p>
            <p className="mt-1 text-[12.5px] text-muted">Try a smaller size, or come back in a few minutes: the list fills as swaps happen.</p>
          </div>
        )}

        {view === "tape" && rows.length > 0 && (
          <ul key="tape" className="pane-in mt-4 divide-y divide-(--bay-edge) overflow-hidden rounded-2xl border border-(--bay-edge)">
            {[...rows]
              .sort((a, b) => b.t - a.t)
              .slice(0, 60)
              .map((r) => {
                const isNew = fresh.has(`${r.tx}:${r.side}:${r.token}`);
                return (
                  <li key={`${r.tx}:${r.side}:${r.token}`} className={cx("grid grid-cols-[3rem_minmax(0,9rem)_minmax(0,1fr)_6rem] items-center gap-3 px-4 py-2.5 text-[13px] sm:grid-cols-[3rem_9rem_4rem_minmax(0,1fr)_6.5rem_8rem_5.5rem]", isNew && "whale-new")}>
                    <span className="font-mono text-[12px] text-muted">{ago(r.t, now)}</span>
                    <Link href={`/app/trade/terminal?token=${r.token}`} className="flex min-w-0 items-center gap-2 hover:text-(--bay-acc)">
                      <TokenAvatar address={r.token} symbol={r.symbol} size={22} />
                      <span className="truncate font-mono text-text">{r.symbol}</span>
                    </Link>
                    <span className={cx("hidden rounded-md px-1.5 py-0.5 text-center font-mono text-[12px] sm:block", r.side === "buy" ? "bg-leaf/12 text-leaf" : "bg-flesh/12 text-flesh")}>{r.side}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-[#181818]">
                      <span className={cx("block h-full rounded-full", r.side === "buy" ? "bg-leaf" : "bg-flesh")} style={{ width: `${Math.max(3, Math.sqrt(r.usd / max) * 100)}%` }} />
                    </span>
                    <span className={cx("text-right tabular-nums", r.side === "buy" ? "text-leaf" : "text-flesh")}>{usd(r.usd)}</span>
                    <Link href={`/app/wallet/exposure?address=${r.who}`} className="hidden truncate font-mono text-[12px] text-muted hover:text-text sm:block" title={r.signer ? "Signer of the transaction" : "Address the pool paid"}>
                      {short(r.who)}
                    </Link>
                    <a href={`${EXPLORER}${r.tx}`} target="_blank" rel="noreferrer" className="hidden text-right tabular-nums text-[12px] text-muted hover:text-text sm:block">
                      {`${r.tx.slice(0, 6)}… ↗`}
                    </a>
                  </li>
                );
              })}
          </ul>
        )}

        {view === "tokens" && rows.length > 0 && (
          <ul key="tokens" className="pane-in mt-4 space-y-2">
            {tokens.map((x, i) => (
              <li key={x.token} className="grid grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_6rem] items-center gap-3 text-[13px]">
                <Link href={`/app/trade/terminal?token=${x.token}`} className="flex min-w-0 items-center gap-2 hover:text-(--bay-acc)">
                  <TokenAvatar address={x.token} symbol={x.symbol} size={22} />
                  <span className="truncate font-mono text-text">{x.symbol}</span>
                </Link>
                <span className="flex h-5 justify-end">
                  <span className="bar-grow h-full rounded-l-md bg-flesh/80" style={{ width: `${(x.s / tmax) * 100}%`, animationDelay: `${i * 0.03}s`, transformOrigin: "right" }} title={`Sold ${usd(x.s)}`} />
                </span>
                <span className="flex h-5 border-l border-(--bay-dim)">
                  <span className="bar-grow h-full rounded-r-md bg-leaf/85" style={{ width: `${(x.b / tmax) * 100}%`, animationDelay: `${i * 0.03}s` }} title={`Bought ${usd(x.b)}`} />
                </span>
                <span className={cx("text-right tabular-nums", x.b - x.s >= 0 ? "text-leaf" : "text-flesh")}>{`${x.b - x.s >= 0 ? "+" : "−"}${usd(Math.abs(x.b - x.s))}`}</span>
              </li>
            ))}
            <li className="grid grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_6rem] gap-3 pt-1 font-mono text-[12px] text-muted">
              <span />
              <span className="text-right">← sold</span>
              <span>bought →</span>
              <span className="text-right">net</span>
            </li>
          </ul>
        )}

        {view === "wallets" && rows.length > 0 && (
          <ul key="wallets" className="pane-in mt-4 space-y-1.5">
            {wallets.map((x, i) => (
              <li key={x.who}>
                <Link href={`/app/wallet/exposure?address=${x.who}`} className="grid grid-cols-[1.5rem_8rem_minmax(0,1fr)_6rem] items-center gap-3 rounded-xl px-2 py-2 text-[13px] transition-colors hover:bg-(--bay-bg2) sm:grid-cols-[1.5rem_8rem_minmax(0,1fr)_10rem_6rem]">
                  <span className="font-mono text-[12px] text-muted">{i + 1}</span>
                  <span className="font-mono text-text">{short(x.who)}</span>
                  <span className="flex h-3 overflow-hidden rounded-full bg-[#181818]" style={{ width: `${((x.b + x.s) / wmax) * 100}%` }}>
                    <span className="h-full bg-leaf" style={{ width: `${(x.b / (x.b + x.s)) * 100}%` }} />
                    <span className="h-full flex-1 bg-flesh" />
                  </span>
                  <span className="hidden truncate text-[12px] text-muted sm:block">{`${x.n} swaps · ${[...x.tokens].slice(0, 3).join(", ")}`}</span>
                  <span className="text-right tabular-nums text-text">{usd(x.b + x.s)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Bay>
  );
}
