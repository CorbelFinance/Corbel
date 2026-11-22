"use client";

/**
 * Check · model panel. Several AI models from different makers read the same facts (the token check at the latest
 * block) and each says buy, wait or avoid, with a score from −100 to 100 and the fact that decided it. Shows every
 * answer, the majority and how far they agree. A second opinion, not advice. From /api/consensus, for holders.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument, Led } from "./kit";

type Ok = { model: string; verdict: "buy" | "wait" | "avoid"; score: number; reason: string };
type Ans = Ok | { model: string; error: string };
type Res = { answers: Ans[]; majority: "buy" | "wait" | "avoid" | null; agreement: number | null; meanScore: number | null; count: Record<string, number>; at: number; error?: string };
const V = {
  buy: { label: "Buy", cls: "text-leaf", bar: "bg-leaf", sign: "▲" },
  wait: { label: "Wait", cls: "text-amber", bar: "bg-amber", sign: "■" },
  avoid: { label: "Avoid", cls: "text-flesh", bar: "bg-flesh", sign: "▼" },
} as const;

export function ModelConsensus({ initial = "" }: { initial?: string }) {
  const [token, setToken] = useState(initial);
  // on the check page the token being checked is in the address bar: start from it
  useEffect(() => {
    if (initial) return;
    const q = new URLSearchParams(location.search).get("q") ?? "";
    if (/^0x[0-9a-fA-F]{40}$/.test(q)) void Promise.resolve().then(() => setToken(q));
  }, [initial]);
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/consensus", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: token.trim() }) });
      const j = (await r.json()) as Res;
      if (!r.ok || j.error) throw new Error(j.error ?? "The panel did not answer.");
      setRes(j);
    } catch (e) {
      setRes(null);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ok = (res?.answers ?? []).filter((a): a is Ok => "verdict" in a);
  return (
    <Instrument
      code="C-40"
      title="Ask the model panel"
      status={<Led tone={res?.majority ? (res.majority === "buy" ? "on" : "bad") : "off"} label={res?.majority ? `${V[res.majority].label} · ${Math.round((res.agreement ?? 0) * 100)}% agree` : "holders"} />}
      foot={<span>Each model reads only the token check at the latest block and answers alone. A second opinion, not advice; the models can be wrong together.</span>}
    >
      <div className="p-4">
        <div className="flex flex-wrap gap-2">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token address 0x…" spellCheck={false} aria-label="Token address" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3 font-mono text-[13px] text-text placeholder:text-muted" />
          <button type="button" disabled={busy || !/^0x[0-9a-fA-F]{40}$/.test(token.trim())} onClick={() => void ask()} className="ibtn h-11 px-5 disabled:opacity-40">{busy ? "Asking the panel…" : "Ask the panel"}</button>
        </div>
        {err && <p className="mt-3 text-[13px] text-flesh">{err}</p>}
        {res && (
          <div className="mt-4">
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
              <div className="bg-bg p-3">
                <p className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-muted">Majority</p>
                <p className={cx("mt-1 font-mono text-[18px]", res.majority ? V[res.majority].cls : "text-muted")}>{res.majority ? `${V[res.majority].sign} ${V[res.majority].label}` : "—"}</p>
              </div>
              <div className="bg-bg p-3">
                <p className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-muted">Agreement</p>
                <p className="mt-1 font-mono text-[18px] text-text">{res.agreement == null ? "—" : `${Math.round(res.agreement * 100)}%`}</p>
              </div>
              <div className="bg-bg p-3">
                <p className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-muted">Mean score</p>
                <p className={cx("mt-1 font-mono text-[18px]", (res.meanScore ?? 0) >= 0 ? "text-leaf" : "text-flesh")}>{res.meanScore == null ? "—" : `${res.meanScore > 0 ? "+" : ""}${res.meanScore}`}</p>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {res.answers.map((a) => (
                <li key={a.model} className="grid gap-2 px-4 py-3 text-[13px] sm:grid-cols-[11rem_5.5rem_9rem_minmax(0,1fr)] sm:items-center">
                  <span className="truncate text-text">{a.model}</span>
                  {"verdict" in a ? (
                    <>
                      <span className={cx("font-mono", V[a.verdict].cls)}>{`${V[a.verdict].sign} ${V[a.verdict].label}`}</span>
                      <span className="relative h-2 rounded-full bg-[#1b1b1b]" aria-label={`score ${a.score}`}>
                        <i className="absolute inset-y-[-3px] left-1/2 w-px bg-text/50" />
                        <i className={cx("absolute inset-y-0 rounded-full", V[a.verdict].bar)} style={a.score >= 0 ? { left: "50%", width: `${a.score / 2}%` } : { right: "50%", width: `${-a.score / 2}%` }} />
                      </span>
                      <span className="text-muted">{a.reason}</span>
                    </>
                  ) : (
                    <span className="text-muted sm:col-span-3">{`No answer this time (${a.error}).`}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 font-mono text-[11.5px] text-muted">{`${ok.length} of ${res.answers.length} answered · ${new Date(res.at).toISOString().slice(11, 16)} UTC · kept 10 min`}</p>
          </div>
        )}
      </div>
    </Instrument>
  );
}
