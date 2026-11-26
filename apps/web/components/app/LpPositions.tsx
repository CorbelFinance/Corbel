"use client";

/**
 * Earn · your positions. Any address (the linked wallet by default): its LP tokens in the pools on Earn, the share
 * of each pool, what that share holds now and its cut of the last day's fees. Read from the chain, nothing signed.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument, Led, short } from "./kit";
import { TokenAvatar } from "./TokenAvatar";
import { useLinked } from "./wallet";

type Pos = { token: string; symbol: string; base: string; pair: string; share: number; value: number; feesDay: number; apr: number | null };
type Res = { positions: Pos[]; total: number; feesDay: number; pools: number; error?: string; warming?: boolean };
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(2)}`);

export function LpPositions() {
  const { linked } = useLinked();
  const [addr, setAddr] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (linked?.address && !addr) void Promise.resolve().then(() => setAddr(linked.address));
  }, [linked, addr]);
  const read = async (a: string) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return setRes({ positions: [], total: 0, feesDay: 0, pools: 0, error: "Paste a 0x address." });
    setBusy(true);
    try {
      setRes((await fetch(`/api/lp?address=${a}`).then((r) => r.json())) as Res);
    } catch {
      setRes({ positions: [], total: 0, feesDay: 0, pools: 0, error: "No answer. Try again." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Instrument code="E-03" title="Your LP positions" busy={busy} status={<Led tone={res && !res.error ? "on" : "off"} label={res && !res.error ? `${res.positions.length} in ${res.pools} pools` : "Any address"} />} foot={<span>LP tokens held in the pools listed on Pools, valued at the pool now. Fees are your share of the last day. In these V2 pools every fee is added to the pool as it is paid, so your share grows by itself: there is nothing to collect and nothing to put back.</span>}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void read(addr.trim());
        }}
        className="flex gap-2 p-3"
      >
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Wallet address 0x…" aria-label="Wallet address" spellCheck={false} className="h-10 min-w-0 flex-1 rounded-lg border border-[#242424] bg-[#101010] px-3 font-mono text-[12px] text-text outline-none focus:border-ui/60" />
        <button type="submit" disabled={busy} className="ibtn h-10 px-5">
          {busy ? "Reading…" : "Read positions"}
        </button>
      </form>
      {!res && (
        <div className="border-t border-line">
          <p className="px-4 pt-3 text-[13px] text-muted">{linked ? "Press Read positions to see yours. A position looks like this:" : "Connect a wallet or paste any address. A position looks like this:"}</p>
          <div aria-hidden className="mx-4 my-3 grid grid-cols-[auto_1fr_6rem_6rem_6rem_auto] items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2.5 text-[13px]">
            <span className="h-[26px] w-[26px] rounded-full bg-[#1f1f1f]" />
            <span className="font-mono text-text">
              TOKEN <span className="text-muted">/ WETH</span>
            </span>
            <span className="text-right tabular-nums text-muted">{`${0.05}%`}</span>
            <span className="text-right tabular-nums text-text">{`$${120}`}</span>
            <span className="text-right tabular-nums text-leaf">{`$${0.42}/d`}</span>
            <span className="rounded-md border border-line px-1.5 text-[12px] text-muted">Example</span>
          </div>
        </div>
      )}
      {res?.error && <p className="border-t border-line px-4 py-3 text-[13px] text-muted">{res.error}</p>}
      {res?.warming && <p className="border-t border-line px-4 py-3 text-[13px] text-muted">The pools are still being read. Try again in a minute.</p>}
      {res && !res.error && !res.warming && (
        <>
          <div className="grid grid-cols-3 gap-px border-t border-line bg-line">
            {[
              ["Value in pools", usd(res.total)],
              ["Fees a day", usd(res.feesDay)],
              ["Positions", String(res.positions.length)],
            ].map(([k, v]) => (
              <div key={k} className="bg-[#131313] px-4 py-3">
                <p className="text-[12px] text-muted">{k}</p>
                <p className="mt-1 font-mono text-[16px] text-text">{v}</p>
              </div>
            ))}
          </div>
          {res.positions.length === 0 ? (
            <p className="border-t border-line px-4 py-4 text-[13px] text-muted">No LP tokens in these pools for {short(addr)}.</p>
          ) : (
            <ul className="divide-y divide-line/60 border-t border-line">
              {res.positions.map((p) => (
                <li key={p.pair} className="grid grid-cols-[auto_1fr_6rem_6rem_6rem] items-center gap-3 px-4 py-2.5 text-[13px]">
                  <TokenAvatar address={p.token} symbol={p.symbol} size={26} />
                  <span className="font-mono text-text">
                    {p.symbol} <span className="text-muted">/ {p.base}</span>
                  </span>
                  <span className="text-right tabular-nums text-muted">{`${(p.share * 100).toFixed(p.share < 0.001 ? 4 : 2)}%`}</span>
                  <span className="text-right tabular-nums text-text">{usd(p.value)}</span>
                  <span className={cx("text-right tabular-nums", p.feesDay > 0 ? "text-leaf" : "text-muted")}>{`${usd(p.feesDay)}/d`}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Instrument>
  );
}
