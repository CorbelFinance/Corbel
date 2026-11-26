"use client";

/** Stocks · Baskets: several stock tokens in one transaction, weighted by the buyer, each with its own floor. */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";

type Tok = { token: string; symbol: string; name: string; per001: string };
type Row = { symbol: string; weightBps: number; floor: string; got: string | null };

const n = (v: string | number, d = 4) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d });

export function BasketDesk() {
  const [toks, setToks] = useState<Tok[] | null>(null);
  const [off, setOff] = useState<string | null>(null);
  const [w, setW] = useState<Record<string, number>>({});
  const [weth, setWeth] = useState("0.05");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ tx: string; rows: Row[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/basket", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.mode !== "fork") return setOff(j.error ?? "Not open.");
        setToks(j.tokens);
        const first = (j.tokens as Tok[]).slice(0, 3);
        setW(Object.fromEntries(first.map((t, i) => [t.token, [50, 30, 20][i]!])));
      })
      .catch(() => setOff("Not answering."));
  }, []);
  const picked = Object.entries(w).filter(([, v]) => v > 0);
  const sum = picked.reduce((a, [, v]) => a + v, 0);
  const buy = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/basket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ weth: Number(weth), picks: picked.map(([token, weight]) => ({ token, weight })) }) }).then((x) => x.json()).catch(() => ({ error: "Not answering." }));
    setBusy(false);
    if (r.error) setErr(r.error);
    else setRes(r);
  };
  return (
    <div className="space-y-1.5">
      <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#141414]">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
          <span className="text-[14px] font-semibold text-text">Stock basket</span>
          <span className="rounded-md bg-[#c9a441]/15 px-2 py-0.5 text-[12px] text-[#e0c46a]">Test fork: no real money</span>
          <span className="ml-auto font-mono text-[12px] text-muted">{`${picked.length} tokens · weights ${sum || 0}`}</span>
        </header>
        {off ? (
          <p className="px-4 py-6 text-[13px] text-muted">{off}</p>
        ) : (
          <div className="grid gap-px bg-[#242424] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <ul className="max-h-[30rem] divide-y divide-line/60 overflow-y-auto bg-[#141414]">
              {!toks && <li className="h-40 animate-pulse bg-[#161616]" />}
              {toks?.length === 0 && <li className="px-4 py-6 text-[13px] text-muted">No stock token has a V2 pool against WETH right now.</li>}
              {toks?.map((t) => {
                const v = w[t.token] ?? 0;
                return (
                  <li key={t.token} className="grid grid-cols-[minmax(0,1fr)_10rem_3rem] items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-[14px] text-text">{t.symbol}</span>
                      <span className="block truncate text-[12px] text-muted">{`${t.name} · ${n(t.per001, 6)} per 0.01 WETH`}</span>
                    </span>
                    <input type="range" min={0} max={100} value={v} onChange={(e) => setW((o) => ({ ...o, [t.token]: Number(e.target.value) }))} className="accent-[#3ee08f]" aria-label={`${t.symbol} weight`} />
                    <span className={cx("text-right font-mono text-[13px]", v ? "text-leaf" : "text-muted")}>{sum && v ? `${Math.round((v / sum) * 100)}%` : "0%"}</span>
                  </li>
                );
              })}
            </ul>
            <div className="space-y-4 bg-[#141414] p-4">
              <label className="block">
                <span className="text-[12px] text-muted">Spend</span>
                <span className="mt-1 flex h-11 items-center rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3">
                  <input value={weth} onChange={(e) => setWeth(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="w-full bg-transparent font-mono text-[16px] text-text outline-none" />
                  <span className="font-mono text-[12px] text-muted">WETH</span>
                </span>
              </label>
              <button type="button" disabled={busy || picked.length < 2} onClick={buy} className="h-11 w-full rounded-lg bg-leaf font-medium text-[14px] text-[#07130c] disabled:opacity-50">
                {busy ? "Buying…" : picked.length < 2 ? "Pick at least two" : `Buy ${picked.length} in one transaction`}
              </button>
              {err && <p className="text-[12.5px] text-flesh">{err}</p>}
              {res && (
                <div className="overflow-hidden rounded-lg border border-[#242424]">
                  {res.rows.map((r) => (
                    <p key={r.symbol} className="flex justify-between border-b border-line/60 px-3 py-2 text-[13px] last:border-0">
                      <span className="text-text">{`${r.symbol} · ${(r.weightBps / 100).toFixed(1)}%`}</span>
                      <span className="font-mono text-leaf">{r.got ? n(r.got, 6) : "…"}</span>
                    </p>
                  ))}
                  <p className="px-3 py-2 font-mono text-[11.5px] text-muted">{`tx ${res.tx.slice(0, 10)}… on the fork · each token had its own floor`}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
      <p className="px-1 text-[12px] text-muted">Every output goes straight to the buyer. The contract keeps nothing between calls: no fee, no owner, no admin. Not audited.</p>
    </div>
  );
}
