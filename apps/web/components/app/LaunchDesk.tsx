"use client";

/**
 * Launch · protected launches, live on the local test chain: start a token (fixed supply, no owner) on a two-way curve
 * with a target and a deadline, buy and sell on it, graduate it into locked v4 liquidity when it sells out, or let the
 * deadline pass and sell back with no fee. Hidden when the test chain is off.
 */
import { useCallback, useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { short } from "./kit";

type L = { sale: string; token: string; name: string; symbol: string; state: "live" | "failed" | "graduated"; raised: number; target: number; sold: number; supply: number; deadline: number; lockedLiquidity: string; mine: number };
type S = { chain: { block: number; time: number }; launchpad: string; wallet: string; eth: number; launches: L[]; error?: string };
const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 4 : 2 });
const STATE = { live: ["Selling", "text-leaf"], failed: ["Deadline passed: sell back, no fee", "text-amber"], graduated: ["Graduated: liquidity locked in v4", "text-ui"] } as const;

export function LaunchDesk() {
  const [s, setS] = useState<S | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ name: "Test Coin", symbol: "TEST", targetEth: "1", hours: "24" });
  const [buy, setBuy] = useState("0.2");

  const load = useCallback(async () => {
    const r = await fetch("/api/launchpad", { cache: "no-store" }).catch(() => null);
    if (!r || r.status === 503) return setS(null);
    const j = (await r.json()) as S;
    if (j.error) setErr(j.error);
    else setS(j);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setErr(null);
    try {
      const r = await fetch("/api/launchpad", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json()) as S;
      if (!r.ok || j.error) setErr(j.error ?? "No answer.");
      else setS(j);
    } finally {
      setBusy(null);
    }
  }

  if (!s) return null;
  const field = "h-10 w-full border border-line bg-bg px-3 font-mono text-[13px] text-text focus:border-ui/60 focus:outline-none";
  return (
    <section aria-label="Launches on the test chain" className="mb-6 overflow-hidden rounded-2xl border border-amber/40 bg-[#0e0e0e]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
        <p className="text-[15px] font-semibold text-text">Protected launch · local test chain</p>
        <span className="font-mono text-[12px] text-amber">{`a copy of Robinhood Chain on this machine · test money · block ${s.chain.block.toLocaleString("en-US")}`}</span>
      </header>
      <div className="grid gap-px bg-line lg:grid-cols-[20rem_minmax(0,1fr)]">
        <form className="space-y-3 bg-[#0e0e0e] p-5" onSubmit={(e) => (e.preventDefault(), void act({ action: "launch", ...f }, "launch"))}>
          <label className="block text-[12px] text-muted">Name<input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="block text-[12px] text-muted">Ticker<input className={field} value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value.toUpperCase() })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[12px] text-muted">Target, ETH<input className={field} value={f.targetEth} onChange={(e) => setF({ ...f, targetEth: e.target.value })} /></label>
            <label className="block text-[12px] text-muted">Hours to sell<input className={field} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></label>
          </div>
          <button type="submit" disabled={!!busy} className="h-10 w-full rounded-xl bg-leaf text-[14px] font-semibold text-[#0b0b0b] disabled:opacity-60">{busy === "launch" ? "Launching…" : "Launch it"}</button>
          <p className="text-[12.5px] text-muted">Fixed supply, no owner, no mint, no tax. Sells out at the target: the raise becomes locked liquidity. Misses the deadline: everyone sells back with no fee.</p>
          <p className="font-mono text-[12px] text-muted">{`Test wallet ${short(s.wallet)} · ${n(s.eth)} ETH`}</p>
          {err && <p className="text-[12.5px] text-flesh">{err}</p>}
        </form>
        <div className="bg-[#0e0e0e]">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            <span className="text-[13px] text-muted">Buy with</span>
            <input value={buy} onChange={(e) => setBuy(e.target.value)} aria-label="ETH to buy with" className="h-9 w-24 border border-line bg-bg px-2 font-mono text-[13px] text-text" />
            <span className="text-[13px] text-muted">ETH</span>
            <button type="button" disabled={!!busy} onClick={() => void act({ action: "warp", minutes: 1440 }, "warp")} className="ml-auto h-9 rounded-lg border border-line px-3 text-[13px] text-muted hover:text-text disabled:opacity-60">Test clock +1 day</button>
          </div>
          {s.launches.length === 0 ? (
            <p className="px-5 py-4 text-[13.5px] text-muted">No launches yet. Start one on the left.</p>
          ) : (
            <ul className="divide-y divide-line">
              {s.launches.map((l) => (
                <li key={l.sale} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[15px] text-text">{`${l.name} · $${l.symbol}`}</span>
                    <span className={cx("font-mono text-[12px]", STATE[l.state][1])}>{STATE[l.state][0]}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#1d1d1d]">
                    <div className="h-full rounded-full bg-leaf" style={{ width: `${Math.min(100, (l.raised / l.target) * 100).toFixed(1)}%` }} />
                  </div>
                  <p className="font-mono text-[12.5px] text-muted">{`raised ${n(l.raised)} of ${n(l.target)} ETH · sold ${n(l.sold)} of ${n(l.supply)} · ends ${new Date(l.deadline * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC · you hold ${n(l.mine)}`}</p>
                  <div className="flex flex-wrap gap-2">
                    {l.state === "live" && <button type="button" disabled={!!busy} onClick={() => void act({ action: "buy", sale: l.sale, eth: buy }, "buy")} className="h-8 rounded-lg border border-leaf/50 px-3 text-[13px] text-text hover:bg-leaf/10 disabled:opacity-60">Buy</button>}
                    {l.state !== "graduated" && l.mine > 0 && <button type="button" disabled={!!busy} onClick={() => void act({ action: "sell", sale: l.sale, share: 0.5 }, "sell")} className="h-8 rounded-lg border border-line px-3 text-[13px] text-text hover:border-flesh disabled:opacity-60">Sell half</button>}
                    {l.state === "live" && l.raised >= l.target && <button type="button" disabled={!!busy} onClick={() => void act({ action: "graduate", sale: l.sale }, "graduate")} className="h-8 rounded-lg border border-ui/60 px-3 text-[13px] text-text disabled:opacity-60">Graduate to v4</button>}
                    <span className="ml-auto font-mono text-[12px] text-muted">{`sale ${short(l.sale)} · token ${short(l.token)}`}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
