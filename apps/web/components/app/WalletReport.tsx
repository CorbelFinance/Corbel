"use client";

/**
 * Wallet · Report: what an address traded, what each trade was worth at the time, its gas, its result per token, and
 * the same rows as a file for an accountant. Read from the chain; a value that could not be read is left empty.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import type { ReportKind, ReportRow, WalletReport as Report } from "@corbel/data/chain";
import { isCopy, taxCsv } from "@/lib/taxCsv";
import { Instrument, Led, Readout, Seg, short } from "./kit";
import { WalletPick } from "./WalletPick";

const SCAN = "https://robinhoodchain.blockscout.com";
const NAME: Record<ReportKind, string> = { buy: "Buy", sell: "Sell", swap: "Swap", liquidity: "Liquidity", in: "Received", out: "Sent" };
const usd = (v: number | null) => {
  if (v === null) return "not read";
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  return a >= 1e6 ? `${s}$${(a / 1e6).toFixed(2)}M` : a >= 1e4 ? `${s}$${(a / 1e3).toFixed(1)}K` : `${s}$${a.toFixed(2)}`;
};
const num = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M` : Math.abs(v) >= 1 ? v.toLocaleString("en-US", { maximumFractionDigits: 3 }) : v.toLocaleString("en-US", { maximumSignificantDigits: 4 }));
const when = (t: number) => (t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") : "—");

/** Bought (up) and sold (down) per day, in dollars; a day with nothing keeps its place. */
function Days({ rows }: { rows: ReportRow[] }) {
  const d = useMemo(() => {
    const m = new Map<string, { b: number; s: number }>();
    for (const r of rows) {
      if (!r.at || r.usd === null || (r.kind !== "buy" && r.kind !== "sell")) continue;
      const k = new Date(r.at).toISOString().slice(0, 10);
      const e = m.get(k) ?? { b: 0, s: 0 };
      if (r.kind === "buy") e.b += r.usd;
      else e.s += r.usd;
      m.set(k, e);
    }
    const keys = [...m.keys()].sort();
    if (!keys.length) return [];
    const out: { k: string; b: number; s: number }[] = [];
    for (let t = Date.parse(keys[0]!); t <= Date.parse(keys.at(-1)!); t += 86_400_000) {
      const k = new Date(t).toISOString().slice(0, 10);
      out.push({ k, ...(m.get(k) ?? { b: 0, s: 0 }) });
    }
    return out.slice(-120);
  }, [rows]);
  const max = Math.max(1e-9, ...d.map((x) => Math.max(x.b, x.s)));
  if (!d.length) return null;
  const W = 1000, H = 150, w = Math.min(40, W / d.length), x0 = (W - w * d.length) / 2;
  return (
    <div className="bg-bg px-4 py-4">
      <div className="flex items-baseline justify-between text-[12px] uppercase tracking-[0.08em] text-muted">
        <span>Bought and sold per day</span>
        <span className="normal-case tracking-normal"><span className="text-leaf">▲ bought</span> <span className="ml-2 text-flesh">▼ sold</span></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-36 w-full" role="img" aria-label={`Bought and sold per day, ${d[0]!.k} to ${d.at(-1)!.k}`}>
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#2a2a2a" />
        {d.map((x, i) => (
          <g key={x.k}>
            <title>{`${x.k}: bought ${usd(x.b)}, sold ${usd(x.s)}`}</title>
            <rect x={x0 + i * w} y="0" width={w} height={H} fill="transparent" />
            <rect x={x0 + i * w + w * 0.15} width={Math.max(0.8, w * 0.7)} y={H / 2 - (x.b / max) * (H / 2 - 4)} height={(x.b / max) * (H / 2 - 4)} fill="#6fe7a8" />
            <rect x={x0 + i * w + w * 0.15} width={Math.max(0.8, w * 0.7)} y={H / 2} height={(x.s / max) * (H / 2 - 4)} fill="#ff4560" />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[11.5px] text-muted"><span>{d[0]!.k}</span><span>{d.at(-1)!.k}</span></div>
    </div>
  );
}

export function WalletReport() {
  const [r, setR] = useState<Report | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [view, setView] = useState<"trades" | "all">("trades");
  const turn = useRef(0);

  const read = useCallback(async (a: string) => {
    const me = ++turn.current;
    setR(null);
    setErr(null);
    setAll(false);
    setStep("Starting");
    try {
      for (let i = 0; i < 300; i++) {
        const x = await fetch(`/api/walletreport?a=${a}`, { cache: "no-store" });
        if (me !== turn.current) return;
        const j = (await x.json()) as Report & { step?: string; error?: string };
        if (x.status === 202) {
          setStep(j.step ?? "Reading");
          await new Promise((res) => setTimeout(res, 4_000));
          if (me !== turn.current) return;
          continue;
        }
        if (j.error) setErr(j.error);
        else setR(j);
        return;
      }
      setErr("Still reading this wallet. Come back in a few minutes: the report will be ready.");
    } catch {
      if (me === turn.current) setErr("No answer. Try again.");
    } finally {
      if (me === turn.current) setStep(null);
    }
  }, []);
  const pick = useCallback((a: string) => void read(a), [read]);

  function save() {
    if (!r) return;
    const url = URL.createObjectURL(new Blob([taxCsv(r.rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `corbel-trades-${r.address.slice(2, 8)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  const list = r ? (view === "all" ? r.rows : r.rows.filter((x) => x.kind === "buy" || x.kind === "sell" || x.kind === "swap" || x.kind === "liquidity")) : [];
  const shown = all ? list : list.slice(0, 25);
  const copies = r ? r.rows.filter((x) => isCopy(x.symbol, x.token)).length : 0;
  return (
    <Instrument
      code="W-08"
      title="Wallet report"
      busy={!!step}
      status={r ? <Led tone="on" label={`Block ${Number(r.head).toLocaleString("en-US")}`} /> : undefined}
      foot={<span>Tokens it holds, tokens it ever approved through Permit2 and tokens it moved in the last day are read from their first block. A token bought and sold out earlier without Permit2 can be missing, so compare with your own records. A sale&apos;s value is before any interface fee. This is data, not tax advice.</span>}
    >
      <div className="py-4"><WalletPick onPick={pick} busy={!!step} cta="Build report" /></div>
      {step && <p className="caret px-5 pb-5 font-mono text-[13px] text-muted">{step}</p>}
      {err && <p className="px-5 pb-5 text-[14px] text-flesh">{err}</p>}
      {!r && !step && !err && <p className="px-5 pb-5 text-[14px] text-muted">Every trade with its value at that moment, the gas paid, the result per token, and one file with all of it. A report takes about five minutes: leave the page open, or come back, it will be ready.</p>}
      {r && r.rows.length === 0 && <p className="px-5 pb-5 text-[14px] text-text">{`No token movements found for ${short(r.address)} in the ${r.tokensRead} tokens read.`}</p>}
      {r && r.rows.length > 0 && (
        <div className="space-y-px bg-line">
          <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
            <Readout label="Bought" value={usd(r.totals.spentUsd)} sub={`${r.totals.buys} buys`} />
            <Readout label="Sold" value={usd(r.totals.receivedUsd)} sub={`${r.totals.sells} sells`} />
            <Readout label="Result of what was sold" value={usd(r.totals.realizedUsd)} sub="average cost, known only" tone={r.totals.realizedUsd > 0 ? "good" : r.totals.realizedUsd < 0 ? "bad" : undefined} />
            <Readout label="Gas paid" value={usd(r.totals.gasUsd)} sub={`${num(r.totals.gasEth)} ETH, transactions found`} />
          </div>
          <Days rows={r.rows} />
          {r.tokens.length > 0 && (
            <div className="overflow-x-auto bg-bg">
              <table className="w-full min-w-[680px] border-collapse text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line text-[12px] uppercase tracking-[0.08em] text-muted">
                    {["Token", "Buys / sells", "Paid", "Got back", "Result", "Holds now"].map((h, i) => <th key={h} scope="col" className={cx("px-4 py-2.5 font-normal", i > 0 && "text-right")}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {r.tokens.slice(0, 20).map((t) => (
                    <tr key={t.token} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-2.5 font-semibold text-text"><a href={`/app/trust/check?q=${t.token}`} className="underline-offset-4 hover:underline">{t.symbol}</a><span className="ml-2 font-mono text-[12px] font-normal text-muted">{short(t.token)}</span></th>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text">{`${t.buys} / ${t.sells}`}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text">{usd(t.spentUsd)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text">{usd(t.receivedUsd)}</td>
                      <td className={cx("px-4 py-2.5 text-right font-mono tabular-nums", t.realizedUsd === null ? "text-muted" : t.realizedUsd > 0 ? "text-leaf" : t.realizedUsd < 0 ? "text-flesh" : "text-muted")}>{t.sells === 0 ? "not sold" : t.realizedUsd === null ? "cost unknown" : usd(t.realizedUsd)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text">{t.held ? num(t.held) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-bg px-4 py-4">
            <p className="text-[13.5px] text-muted">{`${r.rows.length} movements in ${r.totals.txs} transactions since ${when(r.firstAt ?? 0)} UTC, from ${r.tokensRead} of ${r.tokensFound} tokens found.${r.totals.unvalued ? ` ${r.totals.unvalued} trades have no value read and are left empty.` : ""}${copies ? ` ${copies} came from tokens that only wear the ticker of USDG, WETH or CORBEL: they are marked and are not money.` : ""}${r.capped ? " Only the newest transactions are in." : ""}`}</p>
            <button type="button" onClick={save} className="h-10 rounded-xl bg-leaf px-4 text-[14px] font-semibold text-[#0b0b0b]">Download tax file (CSV)</button>
          </div>
          <div className="bg-bg px-4 pt-4">
            <Seg label="Rows" value={view} onChange={setView} options={[{ id: "trades", label: "Trades" }, { id: "all", label: "Everything" }]} />
          </div>
          <div className="overflow-x-auto bg-bg">
            <table className="w-full min-w-[760px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.08em] text-muted">
                  {["Time, UTC", "Type", "Amount", "Other side", "Worth then", "Gas"].map((h, i) => <th key={h} scope="col" className={cx("px-4 py-2.5 font-normal", i > 1 && "text-right")}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((x, i) => (
                  <tr key={`${x.tx}${x.token}${i}`} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-muted"><a href={`${SCAN}/tx/${x.tx}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{when(x.at)} ↗</a></td>
                    <td className={cx("px-4 py-2", x.kind === "buy" ? "text-leaf" : x.kind === "sell" ? "text-flesh" : "text-text")}>{NAME[x.kind]}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums text-text">{`${x.amount > 0 ? "+" : "−"}${num(Math.abs(x.amount))} ${x.symbol}`}{isCopy(x.symbol, x.token) && <span className="ml-2 rounded border border-amber/50 bg-amber/10 px-1.5 py-px text-[10.5px] uppercase tracking-[0.06em] text-amber">copy</span>}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums text-muted">{x.counter ? `${num(x.counter.amount)} ${x.counter.symbol}` : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-text">{x.usd === null ? "—" : usd(x.usd)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-muted">{x.gasUsd === null ? "—" : x.gasUsd < 0.01 ? "<$0.01" : usd(x.gasUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.length > 25 && <button type="button" onClick={() => setAll((v) => !v)} className="w-full bg-bg px-4 py-3 text-[13.5px] text-muted hover:text-text">{all ? "Show the newest only" : `Show all ${list.length}`}</button>}
        </div>
      )}
    </Instrument>
  );
}
