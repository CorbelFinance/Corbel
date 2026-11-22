"use client";

/**
 * Human vs bot volume, last 24 hours: the share of DEX volume made by wallets that trade like bots, by a rule stated
 * on the page (more than N swaps a day, or a swap less than a minute apart on median), the busiest bot wallets and the
 * bot share per token. From the swaps Corbel already reads; no chain call.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument } from "./kit";

type Data = {
  rule: { swaps: number; gapSeconds: number; maxSwapUsd: number; dropped: number; counted: number; signedShare: number };
  wallets: { total: number; bots: number };
  volume: { bot: number; human: number };
  swaps: { bot: number; human: number };
  topBots: { wallet: string; swaps: number; usd: number }[];
  tokens: { token: string; symbol: string | null; bot: number; human: number }[];
};
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function BotVolume() {
  const [d, setD] = useState<Data | null>(null);
  const [state, setState] = useState<"load" | "warm" | "err" | "ok">("load");
  useEffect(() => {
    let off = false;
    fetch("/api/bots")
      .then(async (r) => (r.status === 202 ? "warm" : r.ok ? ((await r.json()) as Data) : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (off) return;
        if (j === "warm") setState("warm");
        else {
          setD(j);
          setState("ok");
        }
      })
      .catch(() => !off && setState("err"));
    return () => {
      off = true;
    };
  }, []);
  const total = d ? d.volume.bot + d.volume.human : 0;
  const share = d && total ? d.volume.bot / total : 0;

  return (
    <Instrument
      code="L-02"
      title="Human vs bot volume, last 24 hours"
      foot={d && <span>{`A wallet counts as a bot when it made more than ${d.rule.swaps} swaps in the day, or its swaps came less than ${d.rule.gapSeconds} s apart on median (5 swaps or more). Counted over the ${d.rule.counted.toLocaleString("en-US")} swaps whose signing wallet is known (${Math.round(d.rule.signedShare * 100)}% of the volume): the address a pool sees is usually a router, not a person. A rule, not a verdict: a busy person can look like a bot.${d.rule.dropped ? ` ${d.rule.dropped} swaps over $${Math.round(d.rule.maxSwapUsd / 1000)}K are left out: no pool on the chain is that deep, so their price read is broken.` : ""}`}</span>}
    >
      {state === "load" && <p className="caret px-4 py-6 font-mono text-xs text-muted">Reading the day&apos;s swaps</p>}
      {state === "warm" && <p className="px-4 py-6 font-mono text-xs text-muted">The day&apos;s swaps are still being read. Back in a few minutes.</p>}
      {state === "err" && <p className="px-4 py-6 font-mono text-xs text-muted">Not answering right now.</p>}
      {d && (
        <>
          <div className="grid gap-px bg-line sm:grid-cols-3">
            <div className="bg-bg px-4 py-4">
              <p className="font-mono text-[12px] text-muted">Volume from bots</p>
              <p className="mt-1 font-mono text-3xl tabular-nums text-text">{`${(share * 100).toFixed(0)}%`}</p>
              <p className="mt-1 font-mono text-[12px] text-muted">{`${usd(d.volume.bot)} of ${usd(total)}`}</p>
            </div>
            <div className="bg-bg px-4 py-4">
              <p className="font-mono text-[12px] text-muted">Wallets that trade like bots</p>
              <p className="mt-1 font-mono text-3xl tabular-nums text-text">{d.wallets.bots.toLocaleString("en-US")}</p>
              <p className="mt-1 font-mono text-[12px] text-muted">{`of ${d.wallets.total.toLocaleString("en-US")} wallets that swapped`}</p>
            </div>
            <div className="bg-bg px-4 py-4">
              <p className="font-mono text-[12px] text-muted">Swaps by bots</p>
              <p className="mt-1 font-mono text-3xl tabular-nums text-text">{d.swaps.bot.toLocaleString("en-US")}</p>
              <p className="mt-1 font-mono text-[12px] text-muted">{`${d.swaps.human.toLocaleString("en-US")} by everyone else`}</p>
            </div>
          </div>
          <div className="grid gap-px border-t border-line bg-line lg:grid-cols-2">
            <div className="bg-bg">
              <p className="px-4 pt-3 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Bot share by token</p>
              <ul className="divide-y divide-line">
                {d.tokens.map((t) => {
                  const s = t.bot / (t.bot + t.human || 1);
                  return (
                    <li key={t.token} className="grid grid-cols-[7rem_minmax(0,1fr)_4rem] items-center gap-3 px-4 py-2">
                      <Link href={`/app/trade/terminal?token=${t.token}`} className="truncate font-mono text-[13px] text-text hover:underline">
                        {t.symbol ?? short(t.token)}
                      </Link>
                      <div className="flex h-2 overflow-hidden bg-[#2a2f2c]" role="img" aria-label={`${Math.round(s * 100)}% of its volume from bots`}>
                        <span className="bg-flesh" style={{ width: `${s * 100}%` }} />
                      </div>
                      <span className={cx("text-right font-mono text-[12.5px] tabular-nums", s > 0.5 ? "text-flesh" : "text-muted")}>{`${Math.round(s * 100)}%`}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="bg-bg">
              <p className="px-4 pt-3 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Busiest bot wallets</p>
              <ul className="divide-y divide-line">
                {d.topBots.map((b) => (
                  <li key={b.wallet} className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-3 px-4 py-2 font-mono text-[12.5px]">
                    <Link href={`/app/portfolio?address=${b.wallet}`} className="truncate text-text hover:underline">
                      {short(b.wallet)}
                    </Link>
                    <span className="text-right tabular-nums text-muted">{`${b.swaps.toLocaleString("en-US")} swaps`}</span>
                    <span className="text-right tabular-nums text-text">{usd(b.usd)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </Instrument>
  );
}
