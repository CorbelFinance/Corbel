"use client";

/**
 * Home · the row under the hero: four live instruments instead of three coloured dots. Each one reads the chain or
 * the app and draws it small, and each opens its part of the app.
 *  - Block: the latest block number, a tick per new block.
 *  - Trade: swaps in the last 30 hours; an equaliser of the twelve busiest tokens, bar height = their volume.
 *  - Agents: what the mandate contract decided, newest last, as a tape of glyphs.
 *  - AI: how many models are open to chat with, their names typed one after another.
 * Nothing is typed in by hand; a reading that cannot be had shows a dash.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";

type Data = {
  block: number | null;
  swaps: number | null;
  bars: number[];
  tape: boolean[];
  runs: number | null;
  stopped: number | null;
  models: string[];
  modelsOpen?: number;
  modelsAll?: number;
};
const get = <T,>(u: string) =>
  fetch(u)
    .then((r) => (r.status === 200 ? (r.json() as Promise<T>) : null))
    .catch(() => null);
const n0 = (v: number) => v.toLocaleString("en");

function Typed({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!words.length) return;
    const w = words[i % words.length]!;
    const t = setTimeout(
      () => {
        if (n < w.length) setN(n + 1);
        else {
          setN(0);
          setI(i + 1);
        }
      },
      n < w.length ? 45 : 1400,
    );
    return () => clearTimeout(t);
  }, [i, n, words]);
  const w = words.length ? words[i % words.length]! : "";
  return (
    <span className="block truncate normal-case tracking-normal text-text">
      {w.slice(0, n)}
      <span className="hud-caret">▍</span>
    </span>
  );
}

export function HeroHud({ scroll }: { scroll: string }) {
  const [d, setD] = useState<Data>({ block: null, swaps: null, bars: [], tape: [], runs: null, stopped: null, models: [] });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    const fast = () =>
      void get<{ block: string | null }>("/api/net").then((j) => {
        if (off || !j?.block) return;
        const b = Number(j.block);
        setD((s) => {
          if (s.block !== b) setTick((t) => t + 1);
          return { ...s, block: b };
        });
      });
    const slow = () => {
      void get<{ swaps?: number; rows?: { volume: number }[] }>("/api/trending").then((j) => {
        if (off || !j) return;
        const vols = [...(j.rows ?? [])].map((r) => r.volume).sort((a, b) => b - a).slice(0, 12);
        const top = vols[0] || 1;
        setD((s) => ({ ...s, swaps: j.swaps ?? null, bars: vols.map((v) => Math.max(0.08, Math.sqrt(v / top))) }));
      });
      void get<{ entries?: { traded: boolean }[]; totals?: { runs: number; stopped: number } | null }>("/api/mandate?log").then((j) => {
        if (off || !j) return;
        setD((s) => ({ ...s, tape: [...(j.entries ?? [])].reverse().slice(-14).map((e) => e.traded), runs: j.totals?.runs ?? null, stopped: j.totals?.stopped ?? null }));
      });
      void get<{ rows?: { name: string; avail?: boolean }[] }>("/api/compute?what=models").then((j) => {
        if (off || !j?.rows) return;
        const open = j.rows!.filter((r) => r.avail);
        setD((s) => ({ ...s, models: (open.length ? open : j.rows!).map((r) => r.name).slice(0, 12), modelsOpen: open.length, modelsAll: j.rows!.length }));
      });
    };
    fast();
    slow();
    const a = setInterval(fast, 5000), b = setInterval(slow, 90_000);
    return () => {
      off = true;
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  const cell = "group relative flex min-w-0 flex-col justify-between gap-2 border-l border-line/70 px-4 py-3.5 transition-colors hover:bg-leaf/[0.04]";
  return (
    <div className="grid grid-cols-2 rounded-2xl border border-line/70 bg-[#090909]/70 font-mono text-[12px] uppercase tracking-[0.08em] backdrop-blur md:grid-cols-4 md:px-4">
      <a href="#platform" className="group flex min-w-0 flex-col justify-between gap-2 px-4 py-3.5 text-text md:pl-0">
        <span className="flex items-center gap-3">
          {scroll}
          <span aria-hidden className="inline-block animate-bounce">
            ↓
          </span>
        </span>
        <span className="flex items-center gap-2 text-muted">
          <span key={tick} aria-hidden className="hud-blip h-1.5 w-1.5 rounded-full bg-leaf" />
          <span className="tabular-nums">{d.block ? `block ${n0(d.block)}` : "reading the chain"}</span>
        </span>
      </a>

      <a href="/app/trade/terminal" className={cell}>
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-muted group-hover:text-text">Trade</span>
          <span className="tabular-nums text-text">{d.swaps != null ? `${n0(d.swaps)} swaps` : "—"}</span>
        </span>
        <span aria-hidden className="flex h-6 items-end gap-[3px]">
          {(d.bars.length ? d.bars : Array.from({ length: 12 }, () => 0.1)).map((h, i) => (
            <span key={i} className="hud-bar flex-1 rounded-[1px] bg-leaf/70" style={{ height: `${h * 100}%`, animationDelay: `${i * 0.11}s` }} />
          ))}
        </span>
      </a>

      <a href="/app/agents/log" className={cx(cell, "hidden md:flex")}>
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-muted group-hover:text-text">Agents</span>
          <span className="tabular-nums text-text">{d.runs != null ? `${d.stopped} of ${d.runs} stopped` : "—"}</span>
        </span>
        <span aria-hidden className="flex h-6 items-center gap-1 text-[13px]">
          {d.tape.map((ok, i) => (
            <span key={i} className={cx("hud-tape", ok ? "text-leaf" : "text-flesh")} style={{ animationDelay: `${i * 0.07}s` }}>
              {ok ? "▮" : "×"}
            </span>
          ))}
          <span className="hud-caret text-muted">▏</span>
        </span>
      </a>

      <a href="/app/ai/chat" className={cx(cell, "hidden md:flex")}>
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-muted group-hover:text-[#ff9a5c]">AI</span>
          <span className="tabular-nums text-[#ff9a5c]">{d.modelsOpen ? `${d.modelsOpen} models open` : d.modelsAll ? `${d.modelsAll} models priced` : "—"}</span>
        </span>
        <span className="h-6 text-[12px] leading-6">{d.models.length ? <Typed words={d.models} /> : <span className="text-muted">—</span>}</span>
      </a>
    </div>
  );
}
