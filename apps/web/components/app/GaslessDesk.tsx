"use client";

/** Trade · Swap without ETH: a wallet with USDG and no ETH swaps by signing two messages; a relayer pays the gas. */
import { useCallback, useEffect, useState } from "react";

type Bal = { eth: string; usdg: string; weth: string };
type State = { mode: "fork" | "off"; contract?: string; wallet?: string; fee?: string; balances?: Bal; error?: string };
type Done = { tx: string; before: Bal; after: Bal; fee: string; minOut: string };

const n = (v: string, d = 4) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function GaslessDesk() {
  const [s, setS] = useState<State | null>(null);
  const [amt, setAmt] = useState("5");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/gasless", { cache: "no-store" }).then((r) => r.json()).then(setS).catch(() => setS({ mode: "off", error: "Not answering." })), []);
  useEffect(() => void load(), [load]);
  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/gasless", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: Number(amt) }) }).then((x) => x.json()).catch(() => ({ error: "Not answering." }));
    setBusy(false);
    if (r.error) setErr(r.error);
    else {
      setDone(r);
      void load();
    }
  };
  const b = done?.after ?? s?.balances;
  return (
    <div className="space-y-1.5">
      <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#141414]">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
          <span className="text-[14px] font-semibold text-text">Swap without ETH</span>
          <span className="rounded-md bg-[#c9a441]/15 px-2 py-0.5 text-[12px] text-[#e0c46a]">Test fork: no real money</span>
          {s?.contract && <span className="ml-auto font-mono text-[12px] text-muted">{`contract ${short(s.contract)}`}</span>}
        </header>
        {s?.mode === "off" ? (
          <p className="px-4 py-6 text-[13px] text-muted">{s.error}</p>
        ) : (
          <div className="grid gap-px bg-[#242424] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="space-y-4 bg-[#141414] p-4">
              <p className="text-[13px] text-muted">{`A test wallet ${s?.wallet ? short(s.wallet) : ""} holds USDG and exactly 0 ETH. It signs a USDG permit and a swap intent; the relayer submits both and pays the gas, earning ${s?.fee ?? "…"} USDG.`}</p>
              <label className="block">
                <span className="text-[12px] text-muted">Sell USDG for WETH</span>
                <span className="mt-1 flex h-11 items-center rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3">
                  <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="w-full bg-transparent font-mono text-[16px] text-text outline-none" />
                  <span className="font-mono text-[12px] text-muted">USDG</span>
                </span>
              </label>
              <button type="button" disabled={busy || !s?.balances} onClick={go} className="h-11 w-full rounded-lg bg-leaf font-medium text-[14px] text-[#07130c] disabled:opacity-50">
                {busy ? "Signing and relaying…" : "Sign and swap, no ETH"}
              </button>
              {err && <p className="text-[12.5px] text-flesh">{err}</p>}
            </div>
            <div className="bg-[#141414] p-4">
              <p className="text-[12px] text-muted">The wallet</p>
              <dl className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-[#242424]">
                {[["ETH", b?.eth, done?.before.eth], ["USDG", b?.usdg, done?.before.usdg], ["WETH", b?.weth, done?.before.weth]].map(([k, v, was]) => (
                  <div key={k} className="bg-[#101010] p-3">
                    <dt className="text-[12px] text-muted">{k}</dt>
                    <dd className="mt-1 font-mono text-[18px] text-text">{v ? n(v, 6) : "…"}</dd>
                    {was !== undefined && <dd className="font-mono text-[11.5px] text-muted">{`was ${n(was, 6)}`}</dd>}
                  </div>
                ))}
              </dl>
              {done && (
                <p className="mt-3 text-[12.5px] text-[#c9ccca]">
                  {`Done with 0 ETH in the wallet. Floor was ${n(done.minOut, 8)} WETH; the relayer took ${done.fee} USDG. `}
                  <span className="font-mono text-muted">{`tx ${short(done.tx)} on the fork`}</span>
                </p>
              )}
            </div>
          </div>
        )}
      </section>
      <p className="px-1 text-[12px] text-muted">The relayer cannot change the path, the floor or the fee: all three are signed. A nonce works once. Not audited. On the live site your own wallet signs once the contract is deployed.</p>
    </div>
  );
}
