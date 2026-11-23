"use client";

/**
 * Earn · pool page · Who holds this pool: the LP token's holders by kind (burned, locked, other contracts, wallets),
 * one bar for the whole pool, the dollars wallets could withdraw right now and the largest holders. Read from the
 * LP token's transfers since the pool's first block; a long first read keeps asking until it is in.
 */
import { useState } from "react";
import { cx } from "@corbel/ui";

type Kind = "burned" | "locked" | "contract" | "wallet";
type R = {
  base: "ETH" | "USDG";
  depthUsd: number;
  shares: Record<Kind, number>;
  withdrawableUsd: number;
  holders: number;
  top: { address: string; kind: Kind; label: string | null; share: number; usd: number }[];
  head: string;
  error?: string;
};
const SCAN = "https://robinhoodchain.blockscout.com/address/";
const COLOR: Record<Kind, string> = { burned: "#6fe7a8", locked: "#4fbfd3", contract: "#9b86e4", wallet: "#ff4560" };
const NAME: Record<Kind, string> = { burned: "Burned", locked: "Locked", contract: "Other contracts", wallet: "Wallets: can leave now" };
const ROW: Record<Kind, string> = { burned: "Burned", locked: "Locked", contract: "Contract", wallet: "Wallet" };
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function PoolHealth({ pair }: { pair: string }) {
  const [r, setR] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      for (let i = 0; i < 40; i++) {
        const x = await fetch(`/api/poolhealth?pair=${pair}`);
        if (x.status !== 202) return setR((await x.json()) as R);
        await new Promise((res) => setTimeout(res, 8_000));
      }
      setR({ error: "Still reading this pool. Try again in a few minutes." } as R);
    } catch {
      setR({ error: "No answer. Try again." } as R);
    } finally {
      setBusy(false);
    }
  }

  const order: Kind[] = ["burned", "locked", "contract", "wallet"];
  const top1 = r && !r.error ? r.top.find((t) => t.kind === "wallet") : undefined;

  return (
    <section aria-label="Who holds this pool" className="overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="text-[16px] font-semibold text-text">Who holds this pool</p>
          <p className="text-[13px] text-muted">Burned and locked liquidity stays. Liquidity in wallets can be pulled out at once.</p>
        </div>
        {!r && (
          <button type="button" onClick={() => void load()} disabled={busy} className="h-10 rounded-xl border border-line px-4 text-[13.5px] font-semibold text-text hover:border-leaf disabled:opacity-60">
            {busy ? "Reading every LP transfer…" : "Read the holders"}
          </button>
        )}
      </header>
      {r?.error && <p className="px-5 py-5 text-[14px] text-flesh">{r.error}</p>}
      {r && !r.error && (
        <div className="space-y-px bg-line">
          <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
            {[
              ["Pool depth", usd(r.depthUsd), "both sides"],
              ["Withdrawable now", usd(r.withdrawableUsd), `${pct(r.shares.wallet)} in wallets`],
              ["Burned or locked", pct(r.shares.burned + r.shares.locked), "cannot be pulled"],
              ["Largest wallet", top1 ? usd(top1.usd) : "—", top1 ? `${pct(top1.share)} in one move` : "no wallet holds LP"],
            ].map(([k, v, s], i) => (
              <div key={k} className="bg-bg p-4">
                <p className="text-[12px] uppercase tracking-[0.08em] text-muted">{k}</p>
                <p className={cx("mt-2 font-display text-[1.6rem] tabular-nums", i === 1 && r.shares.wallet > 0.5 ? "text-flesh" : "text-text")}>{v}</p>
                <p className="mt-1 text-[12px] uppercase tracking-[0.08em] text-muted">{s}</p>
              </div>
            ))}
          </div>
          <div className="bg-bg px-5 py-4">
            <div className="flex h-3 overflow-hidden rounded-full bg-[#1a1a1a]">
              {order.map((k) => <i key={k} style={{ width: `${r.shares[k] * 100}%`, background: COLOR[k] }} />)}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted">
              {order.map((k) => (
                <li key={k} className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: COLOR[k] }} />{`${NAME[k]} ${pct(r.shares[k])}`}</li>
              ))}
            </ul>
          </div>
          <div className="overflow-x-auto bg-bg">
            <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.08em] text-muted">
                  {["Holder", "Kind", "Share", "Worth"].map((h, i) => <th key={h} scope="col" className={cx("px-5 py-2.5 font-normal", i > 1 && "text-right")}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {r.top.map((t) => (
                  <tr key={t.address} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5"><a href={SCAN + t.address} target="_blank" rel="noreferrer" className="font-mono text-text underline-offset-4 hover:underline">{short(t.address)}</a></td>
                    <td className="px-5 py-2.5"><span className="inline-flex items-center gap-2 text-text"><i className="h-2 w-2 rounded-full" style={{ background: COLOR[t.kind] }} />{t.label ?? ROW[t.kind]}</span></td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-text">{pct(t.share)}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-text">{usd(t.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="bg-bg px-5 py-3 text-[12.5px] text-muted">{`${r.holders.toLocaleString("en-US")} holders of the LP token, read to block ${Number(r.head).toLocaleString("en-US")}. Worth is the share of both sides at the pool's own price.`}</p>
        </div>
      )}
    </section>
  );
}
