"use client";

/**
 * Wallet · Exposure. What anyone can read about an address on Robinhood Chain without asking: what it holds,
 * how concentrated it is, its big swaps (from the Big swaps store), its LP positions and the tokens it launched.
 * Each finding says why it matters and what to do. A visibility score adds the findings up by a stated rule.
 */
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { Bay, CountUp, Gauge, SubTabs } from "./Bay";
import { Verdict, short } from "./kit";
import { TokenAvatar } from "./TokenAvatar";
import { WalletPick } from "./WalletPick";
import { ExposureIdle, TryWallets } from "./WalletIdle";
import { linesOf, usd, usePortfolio } from "./walletData";
import { useEffect } from "react";

type Swap = { token: string; symbol: string; t: number; side: "buy" | "sell"; usd: number; tx: string; who: string };
type Lp = { positions: { symbol: string; base: string; value: number; share: number }[]; total: number };
const COL = ["#6cc0d0", "#6fe7a8", "#9b86e4", "#f2c46d", "#ff9a5c", "#93a6ff"];

export function Exposure() {
  const [addr, setAddr] = useState<string | null>(null);
  const [tab, setTab] = useState<"findings" | "holdings" | "trail">("findings");
  const { p, err, busy } = usePortfolio(addr ? `/api/portfolio?address=${addr}` : null);
  const [swaps, setSwaps] = useState<Swap[] | null>(null);
  const [lp, setLp] = useState<Lp | null>(null);
  const pick = useCallback((a: string) => setAddr(a), []);

  useEffect(() => {
    if (!addr) return;
    let off = false;
    void Promise.resolve().then(() => (setSwaps(null), setLp(null)));
    fetch("/api/whales?min=25")
      .then((r) => r.json())
      .then((j: { rows?: Swap[] }) => !off && setSwaps((j.rows ?? []).filter((r) => r.who.toLowerCase() === addr.toLowerCase())))
      .catch(() => !off && setSwaps([]));
    fetch(`/api/lp?address=${addr}`)
      .then((r) => r.json())
      .then((j: Lp) => !off && setLp(j))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [addr]);

  const v = useMemo(() => (p ? linesOf(p) : null), [p]);
  const f = useMemo(() => {
    if (!v) return null;
    const top = v.lines[0];
    const share = top && v.total > 0 ? top.usd / v.total : 0;
    const big = (swaps ?? []).filter((s) => s.usd >= 1000);
    const launched = p?.launches?.launches ?? 0;
    const lpN = lp?.positions?.length ?? 0;
    // the rule: each finding adds what it gives away, capped at 100
    const parts = [
      { k: "Size", pts: v.total >= 100_000 ? 35 : v.total >= 10_000 ? 20 : v.total >= 1_000 ? 8 : 0, bad: v.total >= 10_000, line: v.total >= 10_000 ? `Holds ${usd(v.total)}. Wallets this size get watched and copied.` : `Holds ${usd(v.total)}. Small enough to blend in.`, fix: "Keep long-term funds on a different address from the one you trade with." },
      { k: "Concentration", pts: share > 0.6 ? 15 : share > 0.35 ? 8 : 0, bad: share > 0.6, line: top ? `${top.symbol} is ${(share * 100).toFixed(0)}% of the wallet.` : "Nothing held.", fix: "A wallet that is mostly one token is easy to link to that token's news." },
      { k: "Big swaps", pts: Math.min(25, big.length * 8 + (swaps?.length ? 5 : 0)), bad: big.length > 0, line: swaps === null ? "Reading the big-swap store…" : swaps.length ? `${swaps.length} swaps seen in the last day, ${big.length} over $1K.` : "No swaps of note in the last day.", fix: "Split large trades over time and size: Sell in parts shows the cost." },
      { k: "Liquidity", pts: lpN ? 10 : 0, bad: lpN > 0, line: lpN ? `LP in ${lpN} ${lpN === 1 ? "pool" : "pools"}, ${usd(lp!.total)}.` : "No LP positions in the pools Corbel lists.", fix: "LP tokens show exactly which pairs you back and how much." },
      { k: "Launches", pts: launched ? 15 : 0, bad: launched > 0, line: launched ? `Launched ${launched} ${launched === 1 ? "pool" : "pools"} from this address.` : "No launches from this address.", fix: "Launch from a fresh address so your holdings are not tied to the token." },
    ];
    return { parts, score: Math.min(100, parts.reduce((s, x) => s + x.pts, 0)), top, share };
  }, [v, swaps, lp, p]);

  return (
    <Bay
      tone="ice"
      kicker="Public by default on any chain"
      title="How others see this wallet"
      busy={busy}
      right={v ? <SubTabs label="View" value={tab} onChange={setTab} tabs={[{ id: "findings", label: "Findings", n: f?.parts.filter((x) => x.bad).length || undefined }, { id: "holdings", label: "Holdings", n: v.lines.length }, { id: "trail", label: "Swap trail", n: swaps?.length || undefined }]} /> : undefined}
      foot={<span>Read from Robinhood Chain only. Swaps come from the tokens Corbel reads swap by swap, so the trail can miss some.</span>}
    >
      <WalletPick onPick={pick} busy={busy} cta="See it as others do" />
      {err && <p className="mx-5 mt-3 rounded-xl border border-flesh/40 bg-flesh/10 px-4 py-3 text-[13px] text-text">{err}</p>}
      {!addr && <TryWallets onPick={pick} />}
      {!addr && <ExposureIdle />}
      {addr && !v && !err && <p className="caret px-5 py-14 text-center font-mono text-[13px] text-muted">Scanning transfers for {short(addr)}</p>}

      {v && f && (
        <div className="mx-5 mt-4">
          <Verdict
            kicker={`${short(addr ?? "")} · how others see it`}
            tone={f.score >= 60 ? "bad" : f.score >= 30 ? "caution" : "good"}
            value={f.score}
            valueLabel="visibility, of 100"
            facts={[
              ["Value seen", usd(v.total)],
              ["Assets", v.lines.length],
              ["Top holding", f.top ? `${f.top.symbol} ${(f.share * 100).toFixed(0)}%` : "—"],
              ["Findings", `${f.parts.filter((x) => x.bad).length} to fix`],
            ]}
          >
            {f.score >= 60
              ? `Anyone can see ${usd(v.total)} here, and this wallet is easy to single out: ${f.parts.filter((x) => x.bad).length} findings give it away.`
              : f.score >= 30
                ? `Anyone can see ${usd(v.total)} here. It is noticeable: ${f.parts.filter((x) => x.bad).length} findings give it away.`
                : `Anyone can see ${usd(v.total)} here, but this wallet blends in.`}
          </Verdict>
        </div>
      )}
      {v && f && (
        <div className="mt-4 grid border-t border-(--bay-edge) lg:grid-cols-[19rem_minmax(0,1fr)]">
          {/* the card a watcher builds */}
          <aside className="space-y-4 border-b border-(--bay-edge) bg-[color-mix(in_srgb,var(--bay-bg2)_60%,transparent)] px-5 py-5 lg:border-b-0 lg:border-r">
            <div className="flex justify-center">
              <Gauge value={f.score / 100} label="Visibility" sub={f.score >= 60 ? "Easy to single out" : f.score >= 30 ? "Noticeable" : "Blends in"} size={150} />
            </div>
            <div className="rounded-xl bg-(--bay-bg) p-3">
              <p className="text-[12px] text-muted">Value anyone can see</p>
              <p className="font-mono text-[24px] text-text">
                <CountUp value={v.total} fmt={usd} />
              </p>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-(--bay-edge)">
                {v.lines.slice(0, 6).map((l, i) => (
                  <span key={l.token} title={`${l.symbol} ${usd(l.usd)}`} className="bar-grow h-full" style={{ width: `${v.total ? (l.usd / v.total) * 100 : 0}%`, background: COL[i], animationDelay: `${i * 0.06}s` }} />
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-muted">{`${v.lines.length} assets · top ${f.top?.symbol ?? "—"} ${(f.share * 100).toFixed(0)}%`}</p>
            </div>
            <ul className="space-y-1 text-[12px]">
              {f.parts.map((x) => (
                <li key={x.k} className="flex items-center gap-2">
                  <span className="w-24 text-muted">{x.k}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--bay-edge)">
                    <span className="bar-grow block h-full rounded-full bg-(--bay-acc)" style={{ width: `${(x.pts / 35) * 100}%` }} />
                  </span>
                  <span className="w-6 text-right tabular-nums text-muted">{x.pts}</span>
                </li>
              ))}
            </ul>
          </aside>

          <div key={tab} className="pane-in min-w-0 px-5 py-5">
            {tab === "findings" && (
              <ul className="space-y-2">
                {f.parts.map((x, i) => (
                  <li key={x.k} className={cx("tile-in rounded-xl border px-4 py-3", x.bad ? "border-[#f2c46d]/35 bg-[#f2c46d]/[0.05]" : "border-(--bay-edge)")} style={{ animationDelay: `${i * 0.05}s` }}>
                    <p className="flex items-center gap-2 text-[13px]">
                      <span className={cx("grid h-5 w-5 place-items-center rounded-md text-[12px]", x.bad ? "bg-[#f2c46d]/20 text-[#f2c46d]" : "bg-leaf/15 text-leaf")}>{x.bad ? "!" : "✓"}</span>
                      <span className="font-medium text-text">{x.k}</span>
                      <span className="text-muted">{x.line}</span>
                    </p>
                    {x.bad && <p className="mt-1 pl-7 text-[12px] text-muted">{x.fix}</p>}
                  </li>
                ))}
              </ul>
            )}
            {tab === "holdings" && (
              <ul className="space-y-1">
                {v.lines.map((l, i) => (
                  <li key={l.token} className="grid grid-cols-[auto_1fr_7rem_6rem] items-center gap-3 rounded-xl px-2 py-1.5 text-[12.5px] hover:bg-(--bay-bg2)">
                    <TokenAvatar address={l.token} symbol={l.symbol} size={22} stock={l.kind === "stock"} />
                    <span className="min-w-0">
                      <span className="block text-text">{l.symbol}</span>
                      <span className="block truncate text-[12px] text-muted">{l.name}</span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-(--bay-edge)">
                      <span className="bar-grow block h-full rounded-full" style={{ width: `${v.total ? (l.usd / v.total) * 100 : 0}%`, background: COL[i % COL.length] }} />
                    </span>
                    <span className="text-right tabular-nums text-text">{usd(l.usd)}</span>
                  </li>
                ))}
              </ul>
            )}
            {tab === "trail" &&
              (swaps && swaps.length ? (
                <ul className="space-y-1">
                  {swaps.slice(0, 40).map((s, i) => (
                    <li key={s.tx + i} className="grid grid-cols-[auto_6rem_4rem_1fr_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-[12.5px] hover:bg-(--bay-bg2)">
                      <TokenAvatar address={s.token} symbol={s.symbol} size={20} />
                      <span className="text-text">{s.symbol}</span>
                      <span className={s.side === "buy" ? "text-leaf" : "text-flesh"}>{s.side === "buy" ? "Buy" : "Sell"}</span>
                      <span className="font-mono text-text">{usd(s.usd)}</span>
                      <a href={`https://robinhoodchain.blockscout.com/tx/${s.tx}`} target="_blank" rel="noreferrer" className="text-[12px] text-muted hover:text-(--bay-acc)">
                        tx ↗
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-10 text-center text-[13px] text-muted">{swaps === null ? "Reading…" : "No swaps from this address in the last day of the store."}</p>
              ))}
            <p className="mt-4 text-[12px] text-muted">
              Want less of this public?{" "}
              <Link href="/app/trade/split" className="bay-acc hover:underline">
                Sell in parts
              </Link>{" "}
              ·{" "}
              <Link href="/app/wallet/share" className="bay-acc hover:underline">
                Share without the address
              </Link>
            </p>
          </div>
        </div>
      )}
    </Bay>
  );
}
