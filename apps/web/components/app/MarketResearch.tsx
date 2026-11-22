"use client";

/**
 * Predict · research for one survival market: the facts that bear on "does this pool keep its liquidity", read from
 * the chain and our index. How often pools like it were drained this week (all, and on the same launchpad), the
 * creator's record, who holds the token (top ten, creator, snipers, insiders), the pool's age and its cushion over
 * the line, and other tokens using the same ticker. Each row says which way it leans; nothing here is a forecast.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";

type R = {
  base?: boolean;
  launchpad: string;
  ageSec: number | null;
  creator: { address: string; launches: number; drained: number; checked: number } | null;
  baseRate: { all: { checked: number; drained: number }; pad: { name: string; checked: number; drained: number } | null };
  twins: number;
};
type H = { holders: number; summary: { top10: number; creator: number; snipers: number; insiders: number; pool: number } };
const BASES = new Set(["0x0bd7d308f8e1639fab988df18a8011f41eacad73", "0x5fc5360d0400a0fd4f2af552add042d716f1d168"]);
type Lean = "yes" | "no" | "flat";
const pct = (v: number) => `${Math.round(v * 100)}%`;
const age = (s: number) => (s < 3600 ? `${Math.round(s / 60)} min` : s < 86_400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86_400)} days`);

export function MarketResearch({ token, cushion }: { token: string; cushion: number | null }) {
  const [r, setR] = useState<R | null>(null);
  const [h, setH] = useState<H | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let off = false;
    fetch(`/api/predict/research?token=${token}`)
      .then((x) => (x.ok ? (x.json() as Promise<R>) : null))
      .then((j) => !off && (j ? setR(j) : setErr(true)))
      .catch(() => !off && setErr(true));
    if (!BASES.has(token.toLowerCase()))
      fetch(`/api/holders?token=${token}`)
      .then((x) => (x.ok ? (x.json() as Promise<H>) : null))
      .then((j) => !off && j?.summary && setH(j))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [token]);

  const rows: { k: string; v: string; why: string; lean: Lean }[] = [];
  if (r?.base) rows.push({ k: "A base asset", v: "WETH and USDG", why: "The chain's money, not a launch: no creator to pull it; the pool empties only if its LPs leave", lean: "yes" });
  if (r && !r.base) {
    const a = r.baseRate.all;
    if (a.checked) rows.push({ k: "Pools drained this week", v: `${pct(a.drained / a.checked)} of ${a.checked.toLocaleString("en")}`, why: "How often a new pool on this chain lost its liquidity", lean: a.drained / a.checked > 0.5 ? "no" : "yes" });
    const p = r.baseRate.pad;
    if (p && p.checked) rows.push({ k: `Drained on ${p.name}`, v: `${pct(p.drained / p.checked)} of ${p.checked.toLocaleString("en")}`, why: "The same, for the launchpad this token came from", lean: p.drained / p.checked > a.drained / Math.max(1, a.checked) ? "no" : "yes" });
    if (r.creator) {
      const c = r.creator;
      rows.push({ k: "Creator's record", v: c.checked ? `${c.drained} drained of ${c.checked} known` : `${c.launches} launches, none settled yet`, why: `${c.launches} pools from ${c.address.slice(0, 6)}…${c.address.slice(-4)}`, lean: c.checked && c.drained / c.checked > 0.3 ? "no" : c.launches > 5 ? "no" : "flat" });
    }
    if (r.ageSec !== null) rows.push({ k: "Pool age", v: age(r.ageSec), why: "Most drains happen in the first hours", lean: r.ageSec > 86_400 ? "yes" : r.ageSec < 3 * 3600 ? "no" : "flat" });
    if (r.twins) rows.push({ k: "Same ticker elsewhere", v: `${r.twins} other tokens`, why: "Copies split the buyers and confuse the price", lean: r.twins > 3 ? "no" : "flat" });
  }
  if (cushion !== null) rows.push({ k: "Cushion over the line", v: `${Math.round(cushion * 100)}%`, why: "Reserve now against the line YES needs", lean: cushion > 1.5 ? "yes" : cushion < 1.1 ? "no" : "flat" });
  if (h) {
    const s = h.summary;
    rows.push({ k: "Top ten holders", v: pct(s.top10), why: `${h.holders.toLocaleString("en")} holders; the pool itself holds ${pct(s.pool)}`, lean: s.top10 > 0.6 ? "no" : s.top10 < 0.35 ? "yes" : "flat" });
    rows.push({ k: "Creator and insiders", v: `${pct(s.creator)} · ${pct(s.insiders)}`, why: "What the creator and linked wallets still hold", lean: s.creator + s.insiders > 0.2 ? "no" : "yes" });
    if (s.snipers) rows.push({ k: "Snipers", v: pct(s.snipers), why: "Bought in the first blocks; they sell first", lean: s.snipers > 0.15 ? "no" : "flat" });
  }
  const yes = rows.filter((x) => x.lean === "yes").length, no = rows.filter((x) => x.lean === "no").length;

  return (
    <div className="mt-4 rounded-xl bg-(--bay-bg) p-3">
      <p className="flex items-baseline justify-between text-[12.5px] text-text">
        Research
        {rows.length > 0 && (
          <span className="font-mono text-[12px]">
            <span className="text-leaf">{`${yes} lean YES`}</span>
            <span className="text-muted"> · </span>
            <span className="text-flesh">{`${no} lean NO`}</span>
          </span>
        )}
      </p>
      {rows.length > 0 && (
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-[#1f1f1f]">
          <span className="bg-leaf" style={{ width: `${(yes / rows.length) * 100}%` }} />
          <span className="ml-auto bg-flesh" style={{ width: `${(no / rows.length) * 100}%` }} />
        </div>
      )}
      {!rows.length && <p className={cx("mt-2 text-[12px] text-muted", !err && "caret")}>{err ? "The index is not available right now." : "Reading the pool, its creator and its holders"}</p>}
      <ul className="mt-2 divide-y divide-[#1f1f1f]">
        {rows.map((x) => (
          <li key={x.k} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-2">
            <span className="text-[12.5px] text-text">{x.k}</span>
            <span className={cx("text-right tabular-nums text-[12.5px]", x.lean === "yes" ? "text-leaf" : x.lean === "no" ? "text-flesh" : "text-text")}>{x.v}</span>
            <span className="col-span-2 text-[12px] text-muted">{x.why}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-[#7d8a83]">Read from the chain and our index. Each row leans one way; none of it is a forecast.</p>
    </div>
  );
}
