"use client";

/**
 * Check · Failed sell: paste a transaction that reverted and see what stopped it. The call is run again on the chain
 * and its revert read layer by layer: the router, the pool, then the token or hook that really refused, the function
 * it was in, the reason in plain words and, when the contract's source is verified, the exact line that raised it.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import type { Replay } from "@/lib/replay";
import { Instrument, Readout } from "./kit";

type R = Replay | { error: string };
const SCAN = "https://robinhoodchain.blockscout.com";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const Addr = ({ a }: { a: string }) => (
  <a href={`${SCAN}/address/${a}`} target="_blank" rel="noreferrer" className="font-mono text-leaf underline-offset-4 hover:underline">
    {short(a)}
  </a>
);

export function SellReplay() {
  const [q, setQ] = useState("");
  const [r, setR] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);

  // a link like ?tx=0x… opens with that transaction replayed
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tx");
    if (t && /^0x[0-9a-fA-F]{64}$/.test(t)) void Promise.resolve().then(() => (setQ(t), run(undefined, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(e?: React.FormEvent, given?: string) {
    e?.preventDefault();
    const t = (given ?? q).trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(t)) return setR({ error: "Paste a transaction hash: 0x and 64 characters." });
    setBusy(true);
    setR(null);
    try {
      const x = await fetch(`/api/replay?tx=${t}`, { cache: "no-store" });
      setR((await x.json()) as R);
    } catch {
      setR({ error: "No answer. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const f = r && !("error" in r) && r.status === "failed" ? r : null;
  const last = f?.layers.at(-1);

  return (
    <Instrument
      code="C-09"
      title="Replay a failed sell"
      foot={
        <span>
          {f
            ? f.replayedOn === "trace"
              ? "Read from the transaction's own execution, call by call: exactly what happened in that block."
              : f.replayedOn === "block-before"
                ? `Run again on the state of block ${Number(f.block) - 1}, just before it.`
                : "The node no longer keeps the state of that block, so it was run on the state now."
            : "Run again on the chain. Nothing is sent and nothing is signed."}
        </span>
      }
    >
      <form onSubmit={run} className="flex flex-wrap gap-2 px-4 py-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="0x… the hash of a transaction that failed" spellCheck={false} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-[#0b0b0b] px-3 font-mono text-[13.5px] text-text outline-none focus:border-leaf" />
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-leaf px-5 text-[14px] font-semibold text-[#0b0b0b] disabled:opacity-60">
          {busy ? "Replaying…" : "Replay"}
        </button>
      </form>
      {busy && <p className="caret px-4 pb-5 font-mono text-[13px] text-muted">Running the call again</p>}
      {r && "error" in r && <p className="px-4 pb-5 text-[14px] text-flesh">{r.error}</p>}
      {r && !("error" in r) && r.status === "ok" && (
        <p className="px-4 pb-5 text-[14px] text-text">This transaction went through in block {Number(r.block).toLocaleString("en-US")}. There is nothing to replay.</p>
      )}

      {f && (
        <div className="space-y-px bg-line">
          {/* the verdict */}
          <div className="bg-bg px-4 py-5 sm:px-5">
            <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Failed in block {Number(f.block).toLocaleString("en-US")} · sent by <Addr a={f.from} /> to <Addr a={f.to} /></p>
            {f.reproduced && last ? (
              <>
                <p className="mt-3 font-mono text-[22px] leading-tight text-flesh sm:text-[26px]">{last.error === "no reason" ? "Stopped without a reason" : last.error}</p>
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-text">{last.explain}</p>
                {f.replayedOn === "now" && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#ffb27a]">Read on the state now, not at the moment it failed: the reason then may have been different.</p>}
              </>
            ) : f.outOfGas && last ? (
              <>
                <p className="mt-3 font-mono text-[22px] leading-tight text-flesh">Out of gas</p>
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-text">{last.explain}</p>
              </>
            ) : (
              <>
                <p className="mt-3 font-mono text-[22px] leading-tight text-[#ffb27a]">It goes through when run again</p>
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-text">
                  {f.replayedOn === "block-before"
                    ? "On the state just before its block this call succeeds, so something earlier in the same block changed things first: another trade moved the price, or the same wallet's other transaction spent the coins. It lost a race, the sell itself is not blocked."
                    : "On the state now this call succeeds: what stopped it then has changed since. The sell is not blocked now."}
                </p>
              </>
            )}
          </div>

          {/* the readings */}
          <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
            <Readout label="Block" value={Number(f.block).toLocaleString("en-US")} sub="where it failed" />
            <Readout label="Read from" value={f.replayedOn === "trace" ? "Its own run" : f.replayedOn === "block-before" ? "Block before" : "State now"} sub={f.replayedOn === "trace" ? "a trace, call by call" : f.replayedOn === "block-before" ? "the exact moment" : "older state is not kept"} />
            <Readout label="Stopped by" value={f.stoppedBy ? short(f.stoppedBy.contract) : "—"} sub={f.stoppedBy ? (f.stoppedBy.name ?? (f.layers.length > 1 ? "reached through the pool" : "the contract called")) : "nothing stopped it"} tone={f.stoppedBy ? "bad" : undefined} />
            <Readout label="Source" value={f.stoppedBy ? (f.stoppedBy.verified ? "Verified" : "Not verified") : "—"} sub={f.code.length ? `line ${f.code[0]!.line}` : f.stoppedBy?.verified ? "reason not in text" : "no line to show"} tone={f.stoppedBy?.verified ? "good" : undefined} />
          </div>

          {/* the calls from the sender down to the one that failed (from the trace) */}
          {f.path.length > 1 && (
            <div className="bg-bg px-4 py-4 sm:px-5">
              <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">The calls, down to the one that failed</p>
              <ol className="mt-3 space-y-1.5">
                {f.path.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-3 text-[14px]" style={{ paddingLeft: `${Math.min(i, 8) * 14}px` }}>
                    <span className={cx("font-mono text-[12px]", c.failed ? "text-flesh" : "text-muted")}>{c.failed ? "✕" : "↳"}</span>
                    <Addr a={c.contract} />
                    {c.fn && <span className="font-mono text-[13px] text-muted">{c.fn.startsWith("0x") ? c.fn : `${c.fn}()`}</span>}
                    {c.failed && <span className="text-flesh">failed here</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* the path from the router to the contract that refused */}
          {f.layers.length > 0 && (
            <div className="bg-bg px-4 py-4 sm:px-5">
              <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Where it stopped</p>
              <ol className="mt-3 space-y-2">
                {f.layers.map((l, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
                    <span className={cx("font-mono text-[12px]", i === f.layers.length - 1 ? "text-flesh" : "text-muted")}>{String(i + 1).padStart(2, "0")}</span>
                    <Addr a={l.contract} />
                    {l.fn && <span className="font-mono text-[13px] text-muted">in {l.fn}()</span>}
                    <span className={i === f.layers.length - 1 ? "text-text" : "text-muted"}>{i === f.layers.length - 1 ? l.error : "passed the error on"}</span>
                    {l.args.length > 0 && i === f.layers.length - 1 && <span className="font-mono text-[12px] text-muted">({l.args.map((a) => (a.length > 20 ? short(a) : a)).join(", ")})</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* the line of source */}
          {f.stoppedBy && (
            <div className="bg-bg px-4 py-4 sm:px-5">
              <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                The code {f.stoppedBy.name ? `· ${f.stoppedBy.name}` : ""} · <Addr a={f.stoppedBy.contract} />
              </p>
              {f.code.length > 0 ? (
                f.code.map((c) => (
                  <div key={`${c.file}:${c.line}`} className="mt-3 overflow-x-auto rounded-xl border border-line bg-[#0b0b0b]">
                    <p className="border-b border-line px-3 py-2 font-mono text-[12px] text-muted">
                      {c.file} · line {c.line}
                    </p>
                    <pre className="py-2 font-mono text-[12.5px] leading-[1.6]">
                      {c.lines.map((l) => (
                        <div key={l.n} className={cx("flex gap-4 px-3", l.n === c.line && "bg-[#ff6b5a]/12")}>
                          <span className="w-10 shrink-0 select-none text-right text-muted">{l.n}</span>
                          <span className={l.n === c.line ? "text-text" : "text-muted"}>{l.text || " "}</span>
                        </div>
                      ))}
                    </pre>
                  </div>
                ))
              ) : (
                <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
                  {f.stoppedBy.verified
                    ? "The source is verified, but this reason is not written in it as text: it comes from a library or is built at run time."
                    : "This contract's source is not verified, so the exact line cannot be shown. The reason above is read from what the contract returned."}
                </p>
              )}
            </div>
          )}

          {f.raw && f.raw !== "0x" && (
            <details className="bg-bg px-4 py-3 sm:px-5">
              <summary className="cursor-pointer font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Raw revert data</summary>
              <p className="mt-2 break-all font-mono text-[12px] text-muted">{f.raw}</p>
            </details>
          )}
        </div>
      )}
    </Instrument>
  );
}
