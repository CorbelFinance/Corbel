"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument, Led, Meter, Readout, Seg } from "./kit";
import { Pick } from "./Pick";

type Priced = { address: string; symbol: string; name: string; price: number; keep10: number | null };

const num = (s: string) => {
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
};
const money = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const SHOCKS = [5, 10, 15, 20, 30, 40, 50];
// "By token" prices from the Stock tokens desk, which is closed for now: only "By value" is offered
const MODES = [{ id: "value", label: "By value" }] as const;

/**
 * Stocks → Loan. Arithmetic on numbers the visitor types; the LLTV is never pre-filled. In "by token" mode the
 * collateral value is quantity × the chain price from the desk (a simulated one-token sale), shown with its depth.
 */
export function LoanCalc() {
  const [mode, setMode] = useState<"value" | "token">("value");
  const [collateral, setCollateral] = useState("");
  const [qty, setQty] = useState("");
  const [token, setToken] = useState("");
  const [borrow, setBorrow] = useState("");
  const [lltv, setLltv] = useState("");
  const [desk, setDesk] = useState<Priced[] | null>(null);
  const ids = { c: useId(), q: useId(), t: useId(), b: useId(), l: useId() };

  useEffect(() => {
    if (mode !== "token" || desk) return;
    let alive = true;
    fetch("/api/stocks")
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((j: { rows?: (Priced & { price: number | null })[] } | null) => {
        if (!alive || !j?.rows) return;
        setDesk(j.rows.filter((r): r is Priced => r.price !== null && r.price > 0));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [mode, desk]);

  const picked = desk?.find((d) => d.address === token) ?? null;
  const c = mode === "value" ? num(collateral) : picked && num(qty) ? picked.price * num(qty)! : null;
  const b = num(borrow);
  const l = num(lltv);
  const ltv = c && b ? (b / c) * 100 : null;
  const over = ltv !== null && l !== null && ltv >= l;
  const liqDrop = c && b && l && !over ? (1 - b / ((c * l) / 100)) * 100 : null;
  const liqValue = b && l ? (b / l) * 100 : null;

  const stress = useMemo(
    () =>
      SHOCKS.map((s) => {
        if (!c || !b || !l) return { s, ltv: null as number | null, liq: false };
        const v = c * (1 - s / 100);
        const x = (b / v) * 100;
        return { s, ltv: x, liq: x >= l };
      }),
    [c, b, l],
  );

  const field = (id: string, label: string, v: string, set: (s: string) => void, unit: string) => (
    <div>
      <label htmlFor={id} className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
        {label}
      </label>
      <div className="mt-2 flex border border-line focus-within:border-ui/60">
        <input id={id} inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm text-text focus:outline-none" />
        <span className="flex items-center px-3 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Instrument code="K-21" title="Position" status={<Seg label="Collateral input" value={mode} options={MODES} onChange={setMode} />} foot={<span>Check the LLTV on the market page. It is never pre-filled.</span>}>
          <div className="space-y-5 p-5">
            {mode === "value" ? (
              field(ids.c, "Collateral value", collateral, setCollateral, "USD")
            ) : (
              <>
                <div>
                  <label htmlFor={ids.t} className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                    Stock token
                  </label>
                  <Pick id={ids.t} label="Stock token" className="mt-2" value={token} onChange={setToken} placeholder={desk ? "Pick a priced token" : "Loading the desk…"} options={(desk ?? []).map((d) => ({ value: d.address, label: d.symbol, hint: `${money(d.price)} USDG` }))} />
                </div>
                {field(ids.q, "Quantity", qty, setQty, picked?.symbol ?? "tokens")}
                {picked && (
                  <p className={cx("font-medium text-[12px] uppercase tracking-[0.08em]", picked.keep10 !== null && picked.keep10 < 0.5 ? "text-flesh" : "text-muted")}>
                    {picked.keep10 !== null && picked.keep10 < 0.5 ? "Thin pool: this price does not hold for size" : "Chain price, one-token sale"}
                  </p>
                )}
              </>
            )}
            {field(ids.b, "Borrow", borrow, setBorrow, "USDG")}
            {field(ids.l, "Liquidation LTV of the market", lltv, setLltv, "%")}
          </div>
        </Instrument>

        <Instrument code="K-22" title="Health" status={<Led tone={over ? "bad" : ltv !== null ? "on" : "off"} label={over ? "Liquidatable now" : ltv !== null ? "Open" : "Waiting for numbers"} />}>
          <div aria-live="polite">
            <div className="grid gap-px bg-line sm:grid-cols-3">
              <Readout label="Collateral" value={c ? money(c) : "—"} dim={!c} sub={mode === "token" ? "quantity × chain price" : "as typed"} />
              <Readout label="Your LTV" value={ltv === null ? "—" : `${ltv.toFixed(1)}%`} dim={ltv === null} tone={over ? "bad" : undefined} sub={l ? `limit ${l}%` : "limit not set"} />
              <Readout label="Drop to liquidation" value={over ? "Now" : liqDrop === null ? "—" : `▼ ${liqDrop.toFixed(1)}%`} dim={!over && liqDrop === null} tone={over ? "bad" : liqDrop !== null && liqDrop < 15 ? "bad" : undefined} sub={liqValue ? `at ${money(liqValue)} collateral` : "needs all three"} />
            </div>
            <div className="border-t border-line p-5">
              <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">LTV against the limit</p>
              <div className="mt-3">
                <Meter label="Loan to value as a share of the liquidation limit" value={ltv !== null && l ? ltv / l : 0} cells={24} tone={over ? "bad" : ltv !== null && l && ltv / l > 0.8 ? "mid" : "good"} />
              </div>
            </div>
          </div>
        </Instrument>
      </div>

      <Instrument code="K-23" title="Weekend stress" foot={<span>Mint and burn are shut on weekends: a gap can open in one move and nothing pulls the token back.</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <caption className="sr-only">Loan to value after a drop in the collateral price</caption>
            <thead>
              <tr className="border-b border-line">
                {["Price drop", "LTV after", "Against the limit", "State"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-medium text-[12px] font-normal uppercase tracking-[0.08em] text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stress.map((r) => (
                <tr key={r.s} className="irow border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-2.5 font-mono text-xs font-normal text-text">
                    ▼ {r.s}%
                  </th>
                  <td className={cx("px-4 py-2.5 text-xs tabular-nums", r.liq ? "text-flesh" : "text-text")}>{r.ltv === null ? "—" : `${r.ltv.toFixed(1)}%`}</td>
                  <td className="px-4 py-2.5">
                    <div className="w-40">
                      <Meter label={`LTV after a ${r.s} percent drop, against the limit`} value={r.ltv !== null && l ? r.ltv / l : 0} cells={16} tone={r.liq ? "bad" : r.ltv !== null && l && r.ltv / l > 0.8 ? "mid" : "good"} />
                    </div>
                  </td>
                  <td className={cx("px-4 py-2.5 font-medium text-[12px] uppercase tracking-[0.08em]", r.ltv === null ? "text-muted" : r.liq ? "text-flesh" : "text-leaf")}>{r.ltv === null ? "—" : r.liq ? "Liquidated" : "Holds"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Instrument>
    </div>
  );
}
