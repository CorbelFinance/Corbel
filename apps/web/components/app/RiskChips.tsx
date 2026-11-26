"use client";

/**
 * Who holds a token, as small chips under its name in a list: top 10, dev, snipers, insiders. From /api/risk, which
 * only returns reads the server already keeps (the busiest tokens are read in the background), so a long list never
 * reads the chain row by row. A token with no read yet shows nothing.
 */
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";

export type Risk = { top10: number; creator: number; snipers: number; sniperCount: number; insiders: number; holders: number };

export function useRisk(tokens: string[]) {
  const key = useMemo(() => [...new Set(tokens.map((t) => t.toLowerCase()))].slice(0, 80).join(","), [tokens]);
  const [rows, setRows] = useState<Record<string, Risk>>({});
  useEffect(() => {
    if (!key) return;
    let off = false;
    const load = () =>
      fetch(`/api/risk?tokens=${key}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { rows?: Record<string, Risk> } | null) => !off && j?.rows && setRows((cur) => ({ ...cur, ...j.rows })))
        .catch(() => undefined);
    void load();
    const id = setInterval(load, 120_000);
    return () => {
      off = true;
      clearInterval(id);
    };
  }, [key]);
  return rows;
}

const pc = (v: number) => `${Math.round(v * 100)}%`;

export function RiskChips({ r, className }: { r?: Risk | null; className?: string }) {
  if (!r) return null;
  const chips: [string, string, boolean][] = [
    ["Top 10 holders' share of supply", `T10 ${pc(r.top10)}`, r.top10 > 0.5],
    ["What the creator holds", `Dev ${pc(r.creator)}`, r.creator > 0.05],
    ["Wallets that bought in the first ~30 s", `Sn ${r.sniperCount}`, r.snipers > 0.1],
    ["Creator, first mint, snipers and bundle together", `In ${pc(r.insiders)}`, r.insiders > 0.2],
  ];
  return (
    <span className={cx("flex flex-wrap gap-1", className)}>
      {chips.map(([title, v, bad]) => (
        <span key={title} title={title} className={cx("rounded px-1 font-mono text-[10.5px] leading-4", bad ? "bg-flesh/15 text-flesh" : "bg-[#1f1f1f] text-muted")}>
          {v}
        </span>
      ))}
    </span>
  );
}
