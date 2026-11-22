"use client";

/**
 * Agents · Learn · backtest. An exit rule for the agent (take profit, stop, longest hold, how often it enters) run on
 * one pool's real swaps from the chain (/api/market: about the last day). Shows the compounded result, the share of
 * winning trades, the deepest drawdown and every trade with why it closed. One pool and one day: a record, not a forecast.
 */
import { useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument, Led } from "./kit";
import { backtest, type BtResult, type Rule } from "@/lib/backtest";

type Opt = { token: string; symbol: string };
const pct = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(d)}%`;
const hhmm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);

function Choice({ label, value, options, unit, onChange }: { label: string; value: number; options: number[]; unit: string; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-muted">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)} className={cx("min-w-11 rounded-md border px-2 py-1.5 font-mono text-[12.5px]", value === o ? "border-leaf bg-leaf/10 text-text" : "border-line text-muted hover:text-text")}>
            {`${o}${unit}`}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AgentBacktest({ tokens }: { tokens: Opt[] }) {
  const [token, setToken] = useState(tokens[0]?.token ?? "");
  const [rule, setRule] = useState<Rule>({ tpPct: 10, slPct: 10, holdH: 4, everyH: 4 });
  const [res, setRes] = useState<(BtResult & { symbol: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Rule) => (v: number) => setRule((r) => ({ ...r, [k]: v }));

  async function run() {
    const t = token.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(t)) return setErr("Paste a token address (0x…) or pick one of yours.");
    setBusy(true);
    setErr(null);
    try {
      const j = (await (await fetch(`/api/market?token=${t}`)).json()) as { trades?: { t: number; price: number; side: string }[]; error?: string };
      if (!j.trades?.length) throw new Error(j.error ?? "No swaps found for this token in the last day.");
      setRes({ ...backtest(j.trades, rule), symbol: tokens.find((o) => o.token.toLowerCase() === t.toLowerCase())?.symbol ?? `${t.slice(0, 6)}…` });
    } catch (e) {
      setRes(null);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const closed = res?.trades.filter((x) => x.why !== "open") ?? [];
  return (
    <Instrument
      code="G-63"
      title="Backtest an exit rule"
      status={<Led tone={res ? (res.totalRet >= 0 ? "on" : "bad") : "off"} label={res ? `${res.trades.length} trades · ${res.swaps.toLocaleString("en-US")} swaps · ${res.spanH.toFixed(0)} h` : "pick a token and a rule"} />}
      foot={<span>Run on the pool&apos;s real swaps from the chain, about its last day, with pool fees on both sides. One pool and one day: a record, not a forecast.</span>}
    >
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div>
            <p className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-muted">Token</p>
            {tokens.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {tokens.slice(0, 8).map((o) => (
                  <button key={o.token} type="button" aria-pressed={token === o.token} onClick={() => setToken(o.token)} className={cx("rounded-full border px-2.5 py-1 text-[12.5px]", token === o.token ? "border-leaf text-leaf" : "border-line text-muted hover:text-text")}>
                    {`$${o.symbol}`}
                  </button>
                ))}
              </div>
            )}
            <input value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="or paste a token address 0x…" spellCheck={false} aria-label="Token address" className="mt-1.5 h-9 w-full rounded-lg border border-line bg-transparent px-3 font-mono text-[12.5px] text-text placeholder:text-muted" />
          </div>
          <Choice label="Take profit" value={rule.tpPct} options={[5, 10, 20, 50]} unit="%" onChange={set("tpPct")} />
          <Choice label="Stop" value={rule.slPct} options={[5, 10, 20, 30]} unit="%" onChange={set("slPct")} />
          <Choice label="Longest hold" value={rule.holdH} options={[1, 4, 12, 24]} unit=" h" onChange={set("holdH")} />
          <Choice label="Enter every" value={rule.everyH} options={[1, 4, 12]} unit=" h" onChange={set("everyH")} />
          <button type="button" disabled={busy} onClick={() => void run()} className="ibtn h-11 px-6 disabled:opacity-50">{busy ? "Reading the swaps…" : "Run the backtest"}</button>
          {err && <p className="text-[13px] text-flesh">{err}</p>}
        </div>
        <div>
          {res ? (
            <>
              <div className="grid grid-cols-3 gap-px rounded-xl border border-line bg-line">
                {(
                  [
                    ["Result", pct(res.totalRet), res.totalRet >= 0],
                    ["Winning trades", res.winRate == null ? "—" : `${Math.round(res.winRate * 100)}%`, (res.winRate ?? 0) >= 0.5],
                    ["Deepest drop", `${res.maxDrawdown > 0 ? "−" : ""}${(res.maxDrawdown * 100).toFixed(1)}%`, res.maxDrawdown < 0.1],
                  ] as const
                ).map(([k, v, good]) => (
                  <div key={k} className="bg-bg p-3">
                    <p className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-muted">{k}</p>
                    <p className={cx("mt-1 font-mono text-[18px]", good ? "text-leaf" : "text-flesh")}>{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[12.5px] text-muted">{`$${res.symbol} · ${closed.length} closed${res.trades.length > closed.length ? ", 1 still open at the last price" : ""}`}</p>
              <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[360px] border-collapse text-left font-mono text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line text-[11.5px] text-muted">
                      <th className="px-3 py-1.5 font-normal">in → out (UTC)</th>
                      <th className="px-3 py-1.5 font-normal">why</th>
                      <th className="px-3 py-1.5 text-right font-normal">result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.trades.map((x) => (
                      <tr key={x.inT} className="border-b border-line/50">
                        <td className="px-3 py-1.5 text-text">{`${hhmm(x.inT)} → ${hhmm(x.outT)}`}</td>
                        <td className="px-3 py-1.5 text-muted">{x.why}</td>
                        <td className={cx("px-3 py-1.5 text-right", x.ret >= 0 ? "text-leaf" : "text-flesh")}>{pct(x.ret)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-4 text-[13px] text-muted">Pick a token and a rule. The agent enters at the first swap of every period while it holds nothing, and leaves at the take profit, the stop, or when the hold time is up.</p>
          )}
        </div>
      </div>
    </Instrument>
  );
}
