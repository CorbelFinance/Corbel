"use client";

/**
 * Trade · Orders in escrow (CorbelOrders), live on the local test chain: place a limit, DCA or TWAP order into the CorbelOrders escrow, see each
 * order's floor against what the pool pays now, run the keeper that fills what is due, move the test clock forward to
 * let a DCA slice come due, cancel and get the rest back. Hidden when the test chain is off.
 */
import { useCallback, useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { short } from "./kit";

type O = { id: number; tokenIn: string; tokenOut: string; fillsLeft: number; amountPerFill: number; minOutPerFill: number; intervalMin: number; nextAt: number; due: boolean; quote: number };
type S = { mode: string; chain: { block: number; time: number }; contract: string; wallet: string; balances: Record<string, number>; orders: O[]; error?: string };
const KINDS = [
  { id: "limit", label: "Limit", fills: 1, interval: 0 },
  { id: "dca", label: "DCA", fills: 5, interval: 1440 },
  { id: "twap", label: "TWAP", fills: 6, interval: 10 },
] as const;
const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 6 : 2 });

export function OrdersEscrow() {
  const [s, setS] = useState<S | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("limit");
  const [f, setF] = useState({ tokenIn: "WETH", tokenOut: "USDG", amountPerFill: "0.1", fills: "1", intervalMin: "0", minOutPerFill: "" });

  const load = useCallback(async () => {
    const r = await fetch("/api/orders", { cache: "no-store" }).catch(() => null);
    if (!r) return;
    const j = (await r.json()) as S;
    if (r.status === 503) return setS(null);
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
      const r = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
    <section aria-label="Orders on the test chain" className="mb-6 overflow-hidden rounded-2xl border border-amber/40 bg-[#0e0e0e]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
        <p className="text-[15px] font-semibold text-text">Orders · local test chain</p>
        <span className="font-mono text-[12px] text-amber">{`a copy of Robinhood Chain on this machine · test money · block ${s.chain.block.toLocaleString("en-US")}`}</span>
      </header>
      <div className="grid gap-px bg-line lg:grid-cols-[22rem_minmax(0,1fr)]">
        <form
          className="space-y-3 bg-[#0e0e0e] p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: "place", ...f }, "place");
          }}
        >
          <div className="flex gap-1">
            {KINDS.map((k) => (
              <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => (setKind(k.id), setF({ ...f, fills: String(k.fills), intervalMin: String(k.interval) }))} className={cx("flex-1 rounded-lg border px-2 py-1.5 text-[13px]", kind === k.id ? "border-leaf text-text" : "border-line text-muted hover:text-text")}>
                {k.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["tokenIn", "tokenOut"] as const).map((k) => (
              <div key={k} className="flex gap-1">
                {["WETH", "USDG"].map((t) => (
                  <button key={t} type="button" aria-pressed={f[k] === t} onClick={() => setF({ ...f, [k]: t, ...(k === "tokenIn" ? { tokenOut: t === "WETH" ? "USDG" : "WETH" } : { tokenIn: t === "WETH" ? "USDG" : "WETH" }) })} className={cx("flex-1 rounded-lg border py-1 font-mono text-[12px]", f[k] === t ? "border-ui/60 text-text" : "border-line text-muted")}>
                    {`${k === "tokenIn" ? "sell" : "buy"} ${t}`}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <label className="block text-[12px] text-muted">{`${f.tokenIn} per slice`}<input className={field} value={f.amountPerFill} onChange={(e) => setF({ ...f, amountPerFill: e.target.value })} /></label>
          <label className="block text-[12px] text-muted">{`Least ${f.tokenOut} per slice (your floor)`}<input className={field} value={f.minOutPerFill} onChange={(e) => setF({ ...f, minOutPerFill: e.target.value })} placeholder="the order waits until the pool pays this" /></label>
          {kind !== "limit" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[12px] text-muted">Slices<input className={field} value={f.fills} onChange={(e) => setF({ ...f, fills: e.target.value })} /></label>
              <label className="block text-[12px] text-muted">Minutes apart<input className={field} value={f.intervalMin} onChange={(e) => setF({ ...f, intervalMin: e.target.value })} /></label>
            </div>
          )}
          <button type="submit" disabled={!!busy} className="h-10 w-full rounded-xl bg-leaf text-[14px] font-semibold text-[#0b0b0b] disabled:opacity-60">{busy === "place" ? "Placing…" : "Place the order"}</button>
          <p className="font-mono text-[12px] text-muted">{`Test wallet ${short(s.wallet)} · ${n(s.balances.WETH ?? 0)} WETH · ${n(s.balances.USDG ?? 0)} USDG`}</p>
          {err && <p className="text-[12.5px] text-flesh">{err}</p>}
        </form>
        <div className="bg-[#0e0e0e]">
          <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
            <button type="button" disabled={!!busy} onClick={() => void act({ action: "keeper" }, "keeper")} className="h-9 rounded-lg border border-leaf/50 px-3 text-[13px] text-text hover:bg-leaf/10 disabled:opacity-60">{busy === "keeper" ? "Filling…" : "Run the keeper"}</button>
            <button type="button" disabled={!!busy} onClick={() => void act({ action: "warp", minutes: 60 }, "warp")} className="h-9 rounded-lg border border-line px-3 text-[13px] text-muted hover:text-text disabled:opacity-60">Test clock +1 hour</button>
            <button type="button" disabled={!!busy} onClick={() => void act({ action: "warp", minutes: 1440 }, "warp")} className="h-9 rounded-lg border border-line px-3 text-[13px] text-muted hover:text-text disabled:opacity-60">+1 day</button>
            <button type="button" onClick={() => void load()} className="ml-auto h-9 px-2 font-mono text-[12px] text-muted hover:text-text">refresh</button>
          </div>
          {s.orders.length === 0 ? (
            <p className="px-5 py-4 text-[13.5px] text-muted">No orders yet. Place one on the left; it waits in the contract until the pool pays your floor.</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[12px] text-muted">
                  {["#", "Order", "Slices left", "Floor", "Pool pays now", ""].map((h) => (
                    <th key={h} scope="col" className="px-4 py-2 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.orders.map((o) => (
                  <tr key={o.id} className="border-b border-line/60 font-mono">
                    <td className="px-4 py-2 text-muted">{o.id}</td>
                    <td className="px-4 py-2 text-text">{`${n(o.amountPerFill)} ${o.tokenIn} → ${o.tokenOut}${o.intervalMin ? ` · every ${o.intervalMin >= 1440 ? `${o.intervalMin / 1440}d` : `${o.intervalMin}m`}` : ""}`}</td>
                    <td className="px-4 py-2 text-text">{o.fillsLeft || <span className="text-muted">done</span>}</td>
                    <td className="px-4 py-2 text-text">{n(o.minOutPerFill)}</td>
                    <td className={cx("px-4 py-2", o.fillsLeft === 0 ? "text-muted" : o.due ? "text-leaf" : "text-amber")}>{o.fillsLeft === 0 ? "—" : o.quote ? `${n(o.quote)}${o.due ? " · due" : " · waits"}` : "not yet due"}</td>
                    <td className="px-4 py-2 text-right">{o.fillsLeft > 0 && <button type="button" disabled={!!busy} onClick={() => void act({ action: "cancel", id: o.id }, "cancel")} className="text-[12px] text-muted hover:text-flesh">Cancel</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">{`CorbelOrders ${short(s.contract)} on the test chain. The keeper fills only slices whose floor the pool pays; a cancel returns every unfilled slice.`}</p>
        </div>
      </div>
    </section>
  );
}
