"use client";

/**
 * Predict · price markets on the local test chain: up or down rounds, a grid of price lines on one date, and Monday's
 * open against Friday's close, all on CorbelPredict's price markets (a 30-minute pool average decides). Two test
 * wallets take sides; the clock can be moved forward to reach the window, start the average, settle and claim.
 * Hidden when the test chain is off.
 */
import { useCallback, useEffect, useState } from "react";
import { cx } from "@corbel/ui";

type Side = { yes: number; no: number; claimable: number };
type M = { id: number; question: string; state: "open" | "proposed" | "settled" | "void"; outcome: boolean; closeAt: number; expiry: number; line: number; now: number; yesPot: number; noPot: number; twapStarted: boolean; mine: { a: Side; b: Side } };
type S = { chain: { block: number; time: number }; wallets: { a: { usdg: number }; b: { usdg: number } }; markets: M[]; error?: string };
const t = (s: number) => new Date(s * 1000).toISOString().slice(5, 16).replace("T", " ");
const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 4 : 2 });

export function PredictTestDesk() {
  const [s, setS] = useState<S | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mon, setMon] = useState({ token: "", line: "", gap: "" });
  const load = useCallback(async () => {
    const r = await fetch("/api/predict/test", { cache: "no-store" }).catch(() => null);
    if (!r || r.status === 503) return setS(null);
    const j = (await r.json()) as S;
    if (j.error) setErr(j.error);
    else setS(j);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/predict/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json()) as S;
      if (!r.ok || j.error) setErr(j.error ?? "No answer.");
      else setS(j);
    } finally {
      setBusy(false);
    }
  }
  if (!s) return null;
  const btn = "h-8 rounded-lg border px-2.5 text-[12.5px] disabled:opacity-50";
  return (
    <section aria-label="Price markets on the test chain" className="overflow-hidden rounded-2xl border border-amber/40 bg-[#0e0e0e]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
        <p className="text-[15px] font-semibold text-text">Price markets · local test chain</p>
        <span className="font-mono text-[12px] text-amber">{`test money · wallet A ${n(s.wallets.a.usdg)} USDG · wallet B ${n(s.wallets.b.usdg)} USDG · now ${t(s.chain.time)} UTC`}</span>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <button type="button" disabled={busy} onClick={() => void act({ action: "create", preset: "updown", minutes: 60 })} className={cx(btn, "border-leaf/50 text-text")}>Up or down · 60 min</button>
        <button type="button" disabled={busy} onClick={() => void act({ action: "create", preset: "grid", minutes: 120 })} className={cx(btn, "border-leaf/50 text-text")}>Price grid · 5 lines · 2 h</button>
        <span className="mx-2 h-6 w-px bg-line" />
        <input value={mon.token} onChange={(e) => setMon({ ...mon, token: e.target.value.trim() })} placeholder="stock token 0x…" aria-label="Stock token" className="h-8 w-56 border border-line bg-bg px-2 font-mono text-[12px] text-text" />
        <input value={mon.line} onChange={(e) => setMon({ ...mon, line: e.target.value.trim() })} placeholder="Friday close, USD" aria-label="Friday close" className="h-8 w-36 border border-line bg-bg px-2 font-mono text-[12px] text-text" />
        <input value={mon.gap} onChange={(e) => setMon({ ...mon, gap: e.target.value.trim() })} placeholder="cover gap %" aria-label="Weekend cover gap in percent" className="h-8 w-28 border border-line bg-bg px-2 font-mono text-[12px] text-text" />
        <button type="button" disabled={busy} onClick={() => void act({ action: "create", preset: "monday", ...mon })} className={cx(btn, "border-leaf/50 text-text")}>{mon.gap ? "Weekend cover" : "Monday open"}</button>
        <span className="ml-auto flex gap-2">
          {[30, 60, 1440].map((m) => (
            <button key={m} type="button" disabled={busy} onClick={() => void act({ action: "warp", minutes: m })} className={cx(btn, "border-line text-muted hover:text-text")}>{`clock +${m >= 1440 ? "1 day" : `${m} min`}`}</button>
          ))}
        </span>
      </div>
      {err && <p className="border-b border-line px-5 py-2 text-[12.5px] text-flesh">{err}</p>}
      {s.markets.length === 0 ? (
        <p className="px-5 py-4 text-[13.5px] text-muted">No price markets yet. Start a round, a grid or a Monday market above.</p>
      ) : (
        <ul className="divide-y divide-line">
          {s.markets.map((m) => {
            const total = m.yesPot + m.noPot;
            const phase = m.state !== "open" ? m.state : s.chain.time < m.closeAt ? "taking stakes" : s.chain.time < m.expiry ? (m.twapStarted ? "averaging" : "window open: start the average") : "ready to settle";
            return (
              <li key={m.id} className="grid gap-2 px-5 py-3 text-[13px] lg:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <p className="text-text">{`#${m.id} · ${m.question}`}</p>
                  <p className="font-mono text-[12px] text-muted">{`line ${n(m.line)} · price now ${n(m.now)} · stakes close ${t(m.closeAt)} · decided ${t(m.expiry)} UTC · YES ${n(m.yesPot)} / NO ${n(m.noPot)}${total ? ` (${Math.round((m.yesPot / total) * 100)}% YES)` : ""}`}</p>
                  <p className={cx("font-mono text-[12px]", m.state === "settled" ? "text-leaf" : m.state === "void" ? "text-amber" : "text-text")}>{m.state === "settled" ? `${m.outcome ? "YES" : "NO"} won · A can claim ${n(m.mine.a.claimable)} · B can claim ${n(m.mine.b.claimable)}` : m.state === "void" ? "void: every stake goes back" : phase}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {m.state === "open" && s.chain.time < m.closeAt && (
                    <>
                      <button type="button" disabled={busy} onClick={() => void act({ action: "bet", id: m.id, yes: true, amount: 10, who: "a" })} className={cx(btn, "border-leaf/50 text-leaf")}>A: YES 10</button>
                      <button type="button" disabled={busy} onClick={() => void act({ action: "bet", id: m.id, yes: false, amount: 10, who: "b" })} className={cx(btn, "border-flesh/50 text-flesh")}>B: NO 10</button>
                    </>
                  )}
                  {m.state === "open" && !m.twapStarted && s.chain.time >= m.closeAt && s.chain.time < m.expiry && <button type="button" disabled={busy} onClick={() => void act({ action: "start", id: m.id })} className={cx(btn, "border-ui/60 text-text")}>Start the average</button>}
                  {m.state === "open" && s.chain.time >= m.expiry && <button type="button" disabled={busy} onClick={() => void act({ action: "settle", id: m.id })} className={cx(btn, "border-ui/60 text-text")}>Settle</button>}
                  {(["a", "b"] as const).map((w) => m.mine[w].claimable > 0 && <button key={w} type="button" disabled={busy} onClick={() => void act({ action: "claim", id: m.id, who: w })} className={cx(btn, "border-leaf/50 text-text")}>{`${w.toUpperCase()}: claim`}</button>)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
