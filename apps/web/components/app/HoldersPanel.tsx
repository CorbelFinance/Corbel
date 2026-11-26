"use client";

/** Holders of one token: the insider summary on top, then the largest holders with what Corbel knows about each. */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { short } from "./kit";

type Tag = "pool" | "burn" | "contract" | "creator" | "minted" | "sniper" | "bundle" | "fresh" | "whale" | "dolphin" | "fish";
type Holder = { address: string; share: number; tags: Tag[]; bought: number; sold: number; txs: number | null };
export type HoldersData = {
  supply: number;
  holders: number;
  complete: boolean;
  top: Holder[];
  summary: { top10: number; creator: number; snipers: number; sniperCount: number; bundle: number; bundleCount: number; fresh: number; freshCount: number; pool: number; burned: number; insiders: number };
  retention?: { week: number; buyers: number; holding: number }[] | null;
};

/** Buyer retention: for each week since the pool opened, of the wallets that first bought then, the share holding now. */
function Retention({ r, symbol }: { r: { week: number; buyers: number; holding: number }[]; symbol: string }) {
  if (!r.length) return null;
  return (
    <div className="border-t border-line">
      <p className="flex flex-wrap items-baseline justify-between gap-2 px-3 pt-3">
        <span className="text-[13px] font-semibold text-text">Do buyers still hold?</span>
        <span className="text-[12px] text-muted">{`wallets by the week of their first ${symbol} buy, and how many hold any now`}</span>
      </p>
      <ul className="grid gap-px px-3 py-3 sm:grid-cols-2 xl:grid-cols-4">
        {r.map((c) => {
          const k = c.buyers ? c.holding / c.buyers : 0;
          return (
            <li key={c.week} className="grid grid-cols-[4.5rem_minmax(0,1fr)_4rem] items-center gap-2 py-1">
              <span className="font-mono text-[12px] text-muted">{c.week === 0 ? "Week 1" : `Week ${c.week + 1}`}</span>
              <span className="block h-2 overflow-hidden bg-[#242424]" role="img" aria-label={`${c.holding} of ${c.buyers} still hold`}>
                <span className={cx("block h-full", k >= 0.5 ? "bg-leaf" : k >= 0.25 ? "bg-[#c9a441]" : "bg-flesh")} style={{ width: `${k * 100}%` }} />
              </span>
              <span className="text-right font-mono text-[12px] tabular-nums text-text" title={`${c.holding} of ${c.buyers} wallets`}>{`${Math.round(k * 100)}%`}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Share thresholds, mirroring packages/data/src/holders.ts. */
const WHALE = 0.01;
const DOLPHIN = 0.001;

const TAG: Record<Tag, { label: string; cls: string; tip: string }> = {
  pool: { label: "Pool", cls: "border-[#383838] text-muted", tip: "A liquidity pool, not a person" },
  burn: { label: "Burned", cls: "border-[#383838] text-muted", tip: "Sent to a dead address" },
  contract: { label: "Contract", cls: "border-[#383838] text-muted", tip: "A contract, not a person: a vault, a router, a lock or a launch contract" },
  creator: { label: "Creator", cls: "border-flesh/60 text-flesh", tip: "The wallet that created the first pool" },
  minted: { label: "First mint", cls: "border-flesh/40 text-flesh", tip: "Received the tokens when they were minted" },
  sniper: { label: "Sniper", cls: "border-[var(--lav)]/60 text-[var(--lav)]", tip: "Bought within about 30 seconds of the pool opening" },
  bundle: { label: "Bundle", cls: "border-flesh/60 text-flesh", tip: "One of several wallets that bought in the pool's very first block" },
  fresh: { label: "Fresh", cls: "border-[var(--ice)]/50 text-[var(--ice)]", tip: "A wallet with three transactions or fewer" },
  whale: { label: "Whale", cls: "border-leaf/50 text-leaf", tip: `Holds ${WHALE * 100}% of supply or more` },
  dolphin: { label: "Dolphin", cls: "border-[#383838] text-text", tip: `Holds ${DOLPHIN * 100}% to ${WHALE * 100}% of supply` },
  fish: { label: "Fish", cls: "border-[#383838] text-muted", tip: `Holds under ${DOLPHIN * 100}% of supply` },
};
const pct = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;

export function useHolders(token: string | null) {
  const [d, setD] = useState<HoldersData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    // the example report on the check page carries a placeholder, not an address: nothing to read
    if (!token || !/^0x[0-9a-fA-F]{40}$/.test(token)) return;
    let off = false;
    void Promise.resolve().then(() => (setD(null), setErr(null)));
    fetch(`/api/holders?token=${token}`)
      .then((r) => r.json())
      .then((j: HoldersData & { error?: string }) => !off && (j.error ? setErr(j.error) : setD(j)))
      .catch(() => !off && setErr("Holders could not be read."));
    return () => {
      off = true;
    };
  }, [token]);
  return { d, err };
}

export function InsiderStrip({ d }: { d: HoldersData }) {
  const s = d.summary;
  const cells: [string, string, string, boolean][] = [
    ["Top 10", pct(s.top10), "of supply, pools excluded", s.top10 > 0.5],
    ["Insiders", pct(s.insiders), "creator, first mint, snipers, bundle", s.insiders > 0.2],
    ["Creator", pct(s.creator), "holds now", s.creator > 0.05],
    ["Snipers", `${pct(s.snipers)} · ${s.sniperCount}`, "bought in the first ~30 s", s.snipers > 0.1],
    ["Bundle", `${pct(s.bundle)} · ${s.bundleCount}`, "first-block buyers", s.bundleCount > 0],
    ["Fresh", `${pct(s.fresh)} · ${s.freshCount}`, "wallets with ≤3 txs", s.fresh > 0.1],
  ];
  return (
    <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 xl:grid-cols-6">
      {cells.map(([k, v, sub, bad]) => (
        <div key={k} className="bg-[#131313] px-3 py-2.5">
          <p className="text-[12px] text-muted">{k}</p>
          <p className={cx("font-mono text-[17px]", bad ? "text-flesh" : "text-text")}>{v}</p>
          <p className="truncate text-[12px] text-muted">{sub}</p>
        </div>
      ))}
    </div>
  );
}

export function HoldersPanel({ token, symbol }: { token: string; symbol: string }) {
  const { d, err } = useHolders(token);
  if (err) return <p className="px-4 py-6 text-center text-[13px] text-muted">{err}</p>;
  if (!d) return <p className="px-4 py-6 text-center text-[13px] text-muted">Reading transfers since the pool opened…</p>;
  return (
    <div>
      <InsiderStrip d={d} />
      <div tabIndex={0} role="region" aria-label="Holders, scrollable" className="max-h-96 overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="sticky top-0 border-b border-line bg-[#131313] text-[12px] text-muted">
              {["#", "Wallet", "Share", "", `Bought ${symbol}`, `Sold ${symbol}`, "Txs"].map((h, i) => (
                <th key={i} scope="col" className={cx("px-3 py-2 font-normal", i >= 4 && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.top.map((h, i) => (
              <tr key={h.address} className="border-b border-line/50 hover:bg-[#181818]">
                <td className="px-3 py-2 font-mono text-[12px] text-muted">{i + 1}</td>
                <td className="px-3 py-2">
                  <a href={`/app/portfolio?address=${h.address}`} className="font-mono text-text hover:text-leaf">
                    {short(h.address)}
                  </a>
                  <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                    {h.tags.filter((t) => t in TAG).map((t) => (
                      <span key={t} title={TAG[t].tip} className={cx("rounded-full border px-1.5 text-[12px]", TAG[t].cls)}>
                        {TAG[t].label}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-text">{pct(h.share)}</td>
                <td className="w-28 px-3 py-2">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-[#242424]">
                    <span className={cx("block h-full rounded-full", h.tags.some((t) => t === "creator" || t === "bundle" || t === "minted") ? "bg-flesh" : h.tags.includes("sniper") ? "bg-[var(--lav)]" : "bg-leaf")} style={{ width: `${Math.min(100, h.share * 100 * 2)}%` }} />
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{h.bought ? h.bought.toLocaleString("en", { maximumFractionDigits: 0 }) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{h.sold ? h.sold.toLocaleString("en", { maximumFractionDigits: 0 }) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{h.txs ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.retention && <Retention r={d.retention} symbol={symbol} />}
      <p className="border-t border-line px-3 py-2 text-[12px] text-muted">
        {d.holders.toLocaleString("en")} wallets received {symbol} in the window read{d.complete ? " (since the pool opened)" : "; older history was not read"}. Shares are of total supply.
      </p>
    </div>
  );
}
