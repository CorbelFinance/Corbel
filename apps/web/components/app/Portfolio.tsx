"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Idle, Instrument, Led, Meter, Readout, fmtNum, short } from "./kit";
import { LinkPanel, useLinked } from "./wallet";
import { loadPortfolio } from "./walletData";

type Holding = { token: string; symbol: string | null; name: string | null; decimals: number; raw: string; ethSpot: number | null; priceSource: string | null };
type P = {
  address: string;
  block: string;
  scanned: { from: string; to: string; windows: number; complete: boolean; index?: number; unread?: number };
  eth: string;
  weth: string;
  usdg: string;
  usdgPerEth: number | null;
  holdings: Holding[];
  ms: number;
  launches: { launches: number; dead: number; checked: number } | null;
};
type Exit = { state: "busy" } | { state: "done"; eth: number | null; reason: string | null } | { state: "error"; msg: string };
type Verdict = { state: "busy" } | { state: "done"; fail: number; warn: number; unknown: number } | { state: "error" };

const REAL: Record<string, string> = { USDG: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", WETH: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", ETH: "" };
const BLOCK_S = 1 / 9.5; // measured on 4663 (2026-11-18): ~9.5 blocks per second

/** raw integer string → decimal string without float loss */
function toDecimal(raw: string, decimals: number) {
  const s = raw.padStart(decimals + 1, "0");
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}
const n = (raw: string, d: number) => Number(toDecimal(raw, d));

function impostor(h: Holding) {
  const sym = (h.symbol ?? "").trim().toUpperCase();
  return Object.hasOwn(REAL, sym) && h.token.toLowerCase() !== REAL[sym];
}

export function Portfolio() {
  const { linked: mine } = useLinked();
  // ?address=0x… views any address (from Radar, Analytics) without touching the linked one
  const [viewing, setViewing] = useState<string | null>(null);
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("address");
    if (a && /^0x[0-9a-fA-F]{40}$/.test(a)) void Promise.resolve().then(() => setViewing(a));
  }, []);
  const linked = viewing ? { address: viewing, via: "watch" as const } : mine;
  const [p, setP] = useState<P | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exits, setExits] = useState<Record<string, Exit>>({});
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [scanAll, setScanAll] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async (addr: string, force = false) => {
    setBusy(true);
    setErr(null);
    setP(null);
    setExits({});
    setVerdicts({});
    try {
      const j = (await loadPortfolio(`/api/portfolio?address=${addr}`, force)) as unknown as P & { error?: string };
      if (j.error) throw new Error(j.error);
      setP(j as P);
    } catch (e) {
      setErr((e as Error).message || "No answer. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const addr = linked?.address ?? null;
  useEffect(() => {
    if (!addr) return;
    void Promise.resolve().then(() => load(addr));
  }, [addr, load]);

  async function exit(h: Holding) {
    setExits((x) => ({ ...x, [h.token]: { state: "busy" } }));
    try {
      const r = await fetch(`/api/quote?from=${h.token}&to=ETH&amount=${toDecimal(h.raw, h.decimals)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error((j as { error: string }).error);
      const q = j as { best: number | null; routes: { amountOut: string | null; reason: string | null }[] };
      const best = q.best !== null ? q.routes[q.best]! : null;
      setExits((x) => ({ ...x, [h.token]: { state: "done", eth: best ? n(best.amountOut!, 18) : null, reason: best ? null : (q.routes[0]?.reason ?? "No route to ETH.") } }));
    } catch (e) {
      setExits((x) => ({ ...x, [h.token]: { state: "error", msg: (e as Error).message } }));
    }
  }

  async function check(h: Holding) {
    setVerdicts((x) => ({ ...x, [h.token]: { state: "busy" } }));
    try {
      const r = await fetch(`/api/token?q=${h.token}`);
      const j = await r.json();
      if (!r.ok) throw new Error();
      const c = (j as { checks: { result: string }[] }).checks;
      setVerdicts((x) => ({ ...x, [h.token]: { state: "done", fail: c.filter((k) => k.result === "fail").length, warn: c.filter((k) => k.result === "warn").length, unknown: c.filter((k) => k.result === "unknown").length } }));
    } catch {
      setVerdicts((x) => ({ ...x, [h.token]: { state: "error" } }));
    }
  }

  async function checkAll() {
    if (!p) return;
    const list = p.holdings.slice(0, 12);
    setScanAll({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      await check(list[i]!);
      setScanAll({ done: i + 1, total: list.length });
    }
    setScanAll(null);
  }

  if (!linked)
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
        <Instrument code="P-00" title="Link an address" status={<Led tone="off" label="Not linked" />}>
          <LinkPanel />
        </Instrument>
        <Instrument code="P-01" title="What you will see">
          <ul className="grid gap-px bg-line sm:grid-cols-2">
            {[
              ["Holdings", "Every token this address received in the indexed week, with its balance now."],
              ["Spot value", "Priced from the token's own pool against ETH or USDG, at one block."],
              ["Exit quote", "What a sell would actually pay right now, simulated route by route."],
              ["Trust", "Honeypot, owner powers, liquidity lock and clones for each token, on demand."],
            ].map(([k, v]) => (
              <li key={k} className="bg-bg p-5">
                <p className="text-[13px] font-semibold text-text">{k}</p>
                <p className="mt-1 text-[13px] text-muted">{v}</p>
              </li>
            ))}
          </ul>
          {/* the shape of the answer, marked as an example */}
          <div aria-hidden className="border-t border-line p-4">
            <p className="mb-2 flex items-center gap-2 text-[12px] text-muted">
              <span className="rounded-md border border-line px-1.5">Example</span> a linked wallet reads like this
            </p>
            <div className="divide-y divide-line rounded-xl border border-dashed border-line">
              {(
                [
                  ["ETH", `$${1240}`, `${62}%`, "pass"],
                  ["NVDA", `$${510}`, `${26}%`, "pass"],
                  ["TOKEN", `$${238}`, `${12}%`, "fail"],
                ] as const
              ).map(([s, v, w, r]) => (
                <div key={s} className="grid grid-cols-[2rem_minmax(0,1fr)_5rem_4rem_4.5rem] items-center gap-3 px-3 py-2.5 text-[13px]">
                  <span className="h-6 w-6 rounded-full bg-[#1f1f1f]" />
                  <span className="font-mono text-text">{s}</span>
                  <span className="text-right tabular-nums text-text">{v}</span>
                  <span className="text-right tabular-nums text-muted">{w}</span>
                  <span className={r === "pass" ? "text-right text-[12px] text-leaf" : "text-right text-[12px] text-flesh"}>{r === "pass" ? "✓ sells" : "✕ check"}</span>
                </div>
              ))}
            </div>
          </div>
        </Instrument>
      </div>
    );

  const eth = p ? n(p.eth, 18) : 0;
  const weth = p ? n(p.weth, 18) : 0;
  const usdg = p ? n(p.usdg, 6) : 0;
  const tokensEth = p ? p.holdings.reduce((a, h) => a + (h.ethSpot ?? 0), 0) : 0;
  const usdgInEth = p?.usdgPerEth ? usdg / p.usdgPerEth : 0;
  const total = eth + weth + usdgInEth + tokensEth;
  const days = p ? ((Number(p.scanned.to) - Number(p.scanned.from)) * BLOCK_S) / 86_400 : 0;

  return (
    <div className="space-y-6">
      <Instrument
        code="P-01"
        title={`${viewing ? "Viewing" : "Holdings"} · ${short(linked.address)}`}
        busy={busy}
        status={
          <>
            <Led tone={err ? "bad" : p ? "on" : "off"} label={err ? "Error" : p ? `Block #${Number(p.block).toLocaleString("en")}` : "Reading"} />
            <button type="button" onClick={() => void load(linked.address, true)} disabled={busy} className="ibtn-ghost">
              Refresh
            </button>
          </>
        }
      >
        {err && (
          <p className="flex flex-wrap items-center justify-between gap-3 bg-flesh-deep/50 px-4 py-3 text-sm text-text">
            {err}
            <button type="button" onClick={() => void load(linked.address, true)} className="font-medium text-ui underline underline-offset-2">Try again</button>
          </p>
        )}
        {busy && !p && !err && <p className="border-b border-line px-4 py-3 text-sm text-muted">Reading this address from the chain: balances and every token it received. A full scan takes about half a minute.</p>}
        <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-5">
          <Readout className="col-span-2 lg:col-span-1" label="Total, spot" value={p ? `${fmtNum(total)} ETH` : "—"} sub={p?.usdgPerEth ? `≈ ${fmtNum(total * p.usdgPerEth, 2)} USDG` : "—"} dim={!p} />
          <Readout label="ETH" value={p ? fmtNum(eth) : "—"} dim={!p || eth === 0} />
          <Readout label="WETH" value={p ? fmtNum(weth) : "—"} dim={!p || weth === 0} />
          <Readout label="USDG" value={p ? fmtNum(usdg, 2) : "—"} dim={!p || usdg === 0} />
          <Readout label="Other tokens" value={p ? p.holdings.length : "—"} sub={p ? `${fmtNum(tokensEth)} ETH spot` : "—"} dim={!p} />
        </div>
      </Instrument>

      <Instrument
        code="P-02"
        title="Tokens"
        busy={busy || !!scanAll}
        status={
          p &&
          p.holdings.length > 0 && (
            <button type="button" onClick={() => void checkAll()} disabled={!!scanAll} className="ibtn-ghost">
              {scanAll ? `Checking ${scanAll.done}/${scanAll.total}` : "Check all"}
            </button>
          )
        }
        foot={
          p && (
            <>
              <span>
                {p.scanned.index ? `${p.scanned.index.toLocaleString("en")} indexed tokens asked · ` : "Partial: the index read failed, only recent tokens are listed · "}{p.scanned.unread ? `${p.scanned.unread} balances not read · ` : ""}Scanned {days.toFixed(1)} days · blocks {Number(p.scanned.from).toLocaleString("en")}–{Number(p.scanned.to).toLocaleString("en")} · {(p.ms / 1000).toFixed(1)} s
              </span>
              <span>Spot is not a sell price. Use exit.</span>
            </>
          )
        }
      >
        {busy && !p && <Idle>Reading Transfer logs for this address across the indexed week…</Idle>}
        {p && p.holdings.length === 0 && <Idle>{p.scanned.index ? "No indexed token is held, and none arrived in the scanned window." : "Not all of this wallet could be read. Refresh in a minute."}</Idle>}
        {p && p.holdings.length > 0 && (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
              <caption className="sr-only">Tokens held, by spot value</caption>
              <thead>
                <tr className="border-b border-line">
                  {["Token", "Balance", "Spot value", "Share", "Exit now", "Trust"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium text-[12px] font-normal uppercase tracking-[0.08em] text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.holdings.map((h) => {
                  const ex = exits[h.token];
                  const vd = verdicts[h.token];
                  const bad = impostor(h);
                  const share = total > 0 && h.ethSpot ? h.ethSpot / total : 0;
                  return (
                    <tr key={h.token} className="irow border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-3 font-normal">
                        <span className="flex items-center gap-2">
                          <span className="max-w-[10rem] truncate font-mono text-text">{h.symbol ?? "?"}</span>
                          {bad && <span className="bg-flesh px-1.5 py-0.5 font-medium text-[12px] uppercase tracking-[0.08em] text-bg">Fake ticker</span>}
                        </span>
                        <span className="block max-w-[14rem] truncate text-xs text-muted">
                          {h.name ? `${h.name} · ` : ""}
                          {short(h.token)}
                        </span>
                      </th>
                      <td className="px-4 py-3 text-xs tabular-nums text-text">{fmtNum(n(h.raw, h.decimals))}</td>
                      <td className="px-4 py-3">
                        <span className={cx("text-xs tabular-nums", h.ethSpot === null ? "text-muted" : "text-text")}>{h.ethSpot === null ? "no pool" : `${fmtNum(h.ethSpot)} ETH`}</span>
                        {h.priceSource && <span className="block font-mono text-[12px] text-muted">{h.priceSource}</span>}
                      </td>
                      <td className="w-36 px-4 py-3">
                        <Meter label={`${h.symbol ?? "token"} share of total`} value={share} cells={12} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {!ex && (
                          <button type="button" className="ibtn-ghost" onClick={() => void exit(h)}>
                            Quote exit
                          </button>
                        )}
                        {ex?.state === "busy" && <span className="text-muted">Simulating…</span>}
                        {ex?.state === "error" && <span className="text-flesh">{ex.msg}</span>}
                        {ex?.state === "done" &&
                          (ex.eth === null ? (
                            <span className="text-flesh" title={ex.reason ?? undefined}>
                              Can&apos;t sell now
                            </span>
                          ) : (
                            <span>
                              <span className="text-text">{fmtNum(ex.eth)} ETH</span>
                              {h.ethSpot ? <span className={cx("block text-[12px]", ex.eth / h.ethSpot < 0.5 ? "text-flesh" : "text-muted")}>{((ex.eth / h.ethSpot) * 100).toFixed(1)}% of spot</span> : null}
                            </span>
                          ))}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {!vd && (
                          <button type="button" className="ibtn-ghost" onClick={() => void check(h)}>
                            Check
                          </button>
                        )}
                        {vd?.state === "busy" && <span className="text-muted">Checking…</span>}
                        {vd?.state === "error" && <span className="text-muted">Could not check</span>}
                        {vd?.state === "done" && (
                          <Link href={`/app/trust/check?q=${h.token}`} className="hover:underline">
                            {vd.fail ? <span className="text-flesh">✕ {vd.fail} fail</span> : vd.warn ? <span className="text-text">▲ {vd.warn} caution</span> : vd.unknown ? <span className="text-muted">? {vd.unknown} unknown</span> : <span className="text-leaf">✓ clean</span>}
                            <span className="text-muted"> →</span>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Instrument>

      {p?.launches && p.launches.launches > 0 && (
        <Instrument code="P-03" title="Launch history" status={<Led tone={p.launches.launches > 5 ? "bad" : "on"} label={p.launches.launches > 5 ? "Serial launcher" : "Launcher"} />}>
          <div className="grid grid-cols-3 gap-px bg-line">
            <Readout label="Pools launched" value={p.launches.launches} sub="in the indexed week" tone={p.launches.launches > 5 ? "bad" : undefined} />
            <Readout label="Liveness known" value={p.launches.checked} />
            <Readout label="Drained" value={p.launches.dead} tone={p.launches.dead > 0 ? "bad" : undefined} />
          </div>
        </Instrument>
      )}
    </div>
  );
}
