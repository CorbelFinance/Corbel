"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MANDATE_DEMO } from "@corbel/config";
import { cx } from "@corbel/ui";
import { Idle } from "./kit";

type Entry = { id: number; minute: number; scenario: string; block: string; rule: string; traded: boolean; slashed: string; strikes: number; frozen: boolean };
type Log = { entries: Entry[]; totals: { runs: number; traded: number; stopped: number; frozen: number } | null; chain?: { ok: boolean; checked: number; brokenAt: number | null; head: string | null } };

const title = (id: string) => (MANDATE_DEMO.scenarios as Record<string, { title: string }>)[id]?.title ?? id;
const usdg = (raw: string) => (Number(raw) / 1e6).toLocaleString("en", { maximumFractionDigits: 2 });
const ago = (minute: number) => {
  const m = Math.max(0, Math.round((Date.now() / 1000 - minute) / 60));
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

/** Agents → Decision log: what the real mandate contract decided in recent Break it runs. */
export function DecisionLog() {
  const [log, setLog] = useState<Log | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/mandate?log")
        .then((r) => r.json() as Promise<Log & { error?: string }>)
        .then((j) => alive && (j.error ? setErr(j.error) : (setLog(j), setErr(null))))
        .catch(() => alive && setErr("No answer. Try again."));
    void load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const t = log?.totals;
  const share = t && t.runs ? t.stopped / t.runs : 0;
  // which rule stopped the agent, and how much bond each one took
  const byRule = (() => {
    const m = new Map<string, { n: number; slashed: number }>();
    for (const e of log?.entries ?? []) {
      if (e.traded) continue;
      const r = m.get(e.rule) ?? { n: 0, slashed: 0 };
      r.n += 1;
      r.slashed += Number(e.slashed) / 1e6;
      m.set(e.rule, r);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  })();

  const tape = [...(log?.entries ?? [])].reverse().slice(-96);
  const SEG = ["#ff6a78", "#c94b5a", "#8f3341", "#5e2530"];
  const stopsTotal = byRule.reduce((s, [, r]) => s + r.n, 0) || 1;

  return (
    <div className="space-y-6">
      {/* 1 · the tape: every recent decision as one glyph, oldest left, as a terminal would print it */}
      <section className="overflow-hidden rounded-2xl border border-line bg-[#0a0a0a]">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 pt-4">
          <p className="text-[15px] text-text">
            {t ? (
              <>
                The contract decided <span className="font-mono text-leaf">{t.runs}</span> times: it let <span className="font-mono text-leaf">{t.traded}</span> trades through and stopped{" "}
                <span className="font-mono text-flesh">{t.stopped}</span>.
              </>
            ) : (
              <span className="caret text-muted">Reading the contract&apos;s decisions</span>
            )}
          </p>
          <p className="ml-auto font-mono text-[12px] text-muted">{t && t.runs ? `${Math.round(share * 100)}% stopped · last 500 kept` : ""}</p>
        </div>
        <div className="px-5 pb-4 pt-3" role="img" aria-label={t ? `${t.traded} traded, ${t.stopped} stopped` : "No decisions yet"}>
          <p className="break-all font-mono text-[15px] leading-[1.15] tracking-[0.12em]">
            {tape.length
              ? tape.map((e) => (
                  <span key={e.id} className={e.traded ? "text-leaf/80" : e.frozen ? "text-[#8f3341]" : "text-flesh"}>
                    {e.traded ? "▮" : e.frozen ? "#" : "×"}
                  </span>
                ))
              : <span aria-hidden className="inline-block w-full border-t border-dotted border-[#2a2a2a] align-middle" />}
          </p>
          <p className="mt-2 flex gap-4 font-mono text-[12px] text-muted">
            <span><span className="text-leaf/80">▮</span> traded</span>
            <span><span className="text-flesh">×</span> stopped, bond slashed</span>
            <span><span className="text-[#8f3341]">#</span> agent frozen</span>
            <span className="ml-auto">oldest → newest</span>
          </p>
        </div>
      </section>

      {/* 2 · what stopped it: one bar split by rule, a legend under it */}
      {byRule.length > 0 && (
        <section className="rounded-2xl border border-line px-5 py-4">
          <p className="text-[13px] text-muted">What stopped the agent</p>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[#242424]">
            {byRule.map(([rule, r], i) => (
              <span key={rule} title={rule} style={{ width: `${(r.n / stopsTotal) * 100}%`, background: SEG[i % SEG.length] }} />
            ))}
          </div>
          <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            {byRule.map(([rule, r], i) => (
              <div key={rule} className="flex items-baseline gap-2">
                <dt className="flex min-w-0 items-center gap-2 font-mono text-[12.5px] text-text">
                  <i className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: SEG[i % SEG.length] }} />
                  <span className="truncate">{rule}</span>
                </dt>
                <dd className="ml-auto font-mono text-[12px] text-muted">{`${r.n} · ${r.slashed.toLocaleString("en", { maximumFractionDigits: 2 })} USDG`}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* 3 · the log itself: a timeline down a rail, newest first */}
      <section>
        <header className="flex items-baseline justify-between px-1 pb-3">
          <h2 className="text-[15px] text-text">Decision log</h2>
          <Link href="/app/agents/break" className="text-[13px] text-leaf underline underline-offset-2">
            Run an attack →
          </Link>
        </header>
        {err ? (
          <Idle>{err}</Idle>
        ) : !log ? (
          <Idle>Reading the log.</Idle>
        ) : !log.entries.length ? (
          <Idle>No decisions yet. Run an attack on Break it and it lands here.</Idle>
        ) : (
          <ol className="relative ml-2 border-l border-line">
            {log.entries.slice(0, 60).map((e) => (
              <li key={e.id} className="relative grid gap-x-4 py-2.5 pl-6 sm:grid-cols-[4rem_minmax(0,1fr)_9rem_8rem]">
                <i className={cx("absolute -left-[5px] top-[15px] h-[9px] w-[9px] rounded-full ring-4 ring-bg", e.traded ? "bg-leaf" : "bg-flesh")} />
                <span className="text-[12px] tabular-nums text-muted">{ago(e.minute)}</span>
                <span className="min-w-0 text-[13.5px] text-text">
                  {title(e.scenario)}
                  <span className={cx("ml-2 font-mono text-[12px]", e.traded ? "text-leaf" : "text-flesh")}>{e.traded ? "traded" : e.frozen ? `frozen · ${e.rule}` : `stopped · ${e.rule}`}</span>
                </span>
                <span className="text-[12px] tabular-nums text-muted">
                  {e.slashed !== "0" ? <span className="text-flesh">{`−${usdg(e.slashed)} USDG`}</span> : "no slash"}
                  <span className="ml-2" aria-label={`${e.strikes} of 3 strikes`} role="img">
                    {[0, 1, 2].map((i) => (i < e.strikes ? "●" : "○")).join("")}
                  </span>
                </span>
                <span className="text-[12px] tabular-nums text-muted sm:text-right">#{Number(e.block).toLocaleString("en")}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 px-1 text-[12px] text-muted">Each line is a real CorbelMandate run inside one eth_call against live pools. No visitor data is kept.</p>
        {log?.chain && log.chain.checked > 0 && (
          <p className="mt-1.5 break-all px-1 font-mono text-[12px] text-muted">
            {log.chain.ok
              ? <>Chained by hash: each entry carries the sha256 of the one before. {log.chain.checked} entries check out · head <span className="text-text">{log.chain.head!.slice(0, 16)}…</span></>
              : <span className="text-flesh">{`The hash chain breaks at entry ${log.chain.brokenAt}: an entry was changed or removed.`}</span>}
          </p>
        )}
      </section>
    </div>
  );
}
