"use client";

/**
 * Trade · Sell many. Clear several small holdings into ETH from your own wallet: pick them, quote each at the latest
 * block, then sell them one after another, each on its best route through the Uniswap V2 router with min out = quote −
 * slippage. Every approval and every sale is a transaction you sign; Corbel never holds anything. A token whose best
 * route goes through a v4 pool is skipped with the reason (sell it in Swap).
 */
import { useMemo, useState } from "react";
import { encodeFunctionData, formatUnits, type Hex } from "viem";
import { cx } from "@corbel/ui";
import { Instrument, Led, Seg } from "./kit";
import { linesOf, usePortfolio } from "./walletData";
import { useLinked } from "./wallet";
import { EXPLORER, approveIfNeeded, niceError, ready, send } from "./walletTx";

const ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const NATIVE = "0x0000000000000000000000000000000000000000";
const DUST_USD = 10;
const SLIPS = [
  { id: "0.01", label: "1%" },
  { id: "0.03", label: "3%" },
  { id: "0.05", label: "5%" },
] as const;
const SELL = [{ type: "function", name: "swapExactTokensForETH", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "address[]" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256[]" }] }] as const;

type Hop = { venue: string; from: string; to: string };
type Q = { routes: { hops: Hop[]; amountOut: string | null; ok: boolean; reason?: string | null }[]; best: number | null; impact: number | null; error?: string };
type Row = { token: string; symbol: string; raw: string; decimals: number; amount: number; usd: number };
type St = { quote?: { out: bigint; path: Hex[]; impact: number | null } | { skip: string }; sell?: { state: "busy" | "done" | "error"; hash?: string; msg?: string } };

const eth = (wei: bigint) => Number(formatUnits(wei, 18)).toLocaleString("en-US", { maximumFractionDigits: 6 });

export function SellMany() {
  const { linked } = useLinked();
  const addr = linked?.via === "wallet" ? linked.address : null;
  const { p, err, busy } = usePortfolio(addr ? `/api/portfolio?address=${addr}` : null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [st, setSt] = useState<Record<string, St>>({});
  const [slip, setSlip] = useState<(typeof SLIPS)[number]["id"]>("0.03");
  const [phase, setPhase] = useState<"idle" | "quoting" | "selling">("idle");

  const rows: Row[] = useMemo(() => {
    if (!p) return [];
    const raw = new Map(p.holdings.map((h) => [h.token.toLowerCase(), h]));
    return linesOf(p)
      .lines.filter((l) => l.kind !== "base" && raw.has(l.token.toLowerCase()))
      .map((l) => {
        const h = raw.get(l.token.toLowerCase())!;
        return { token: h.token, symbol: l.symbol, raw: h.raw, decimals: h.decimals, amount: l.amount, usd: l.usd };
      })
      .sort((a, b) => a.usd - b.usd);
  }, [p]);
  const set = (t: string, s: Partial<St>) => setSt((x) => ({ ...x, [t]: { ...x[t], ...s } }));
  const toggle = (t: string) => setPick((x) => { const n = new Set(x); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  async function quoteAll() {
    setPhase("quoting");
    for (const r of rows.filter((x) => pick.has(x.token))) {
      try {
        const q = (await (await fetch(`/api/quote?from=${r.token}&to=ETH&amount=${formatUnits(BigInt(r.raw), r.decimals)}`)).json()) as Q;
        const best = q.best !== null && !q.error ? q.routes[q.best] : null;
        if (!best?.ok || !best.amountOut) set(r.token, { quote: { skip: q.error ?? "No route fills it right now." } });
        else if (best.hops.some((h) => h.venue !== "v2")) set(r.token, { quote: { skip: "Best route is a v4 pool: sell it in Swap." } });
        else set(r.token, { quote: { out: BigInt(best.amountOut), path: [r.token as Hex, ...best.hops.map((h) => (h.to === NATIVE ? WETH : h.to) as Hex)], impact: q.impact } });
      } catch {
        set(r.token, { quote: { skip: "The quote did not answer." } });
      }
    }
    setPhase("idle");
  }

  async function sellAll() {
    if (!addr) return;
    setPhase("selling");
    let p0;
    try {
      p0 = await ready(linked?.rdns);
    } catch (e) {
      setPhase("idle");
      return alert(niceError(e, "No wallet."));
    }
    for (const r of rows.filter((x) => pick.has(x.token))) {
      const q = st[r.token]?.quote;
      if (!q || "skip" in q || st[r.token]?.sell?.state === "done") continue;
      set(r.token, { sell: { state: "busy" } });
      try {
        const amountIn = BigInt(r.raw);
        await approveIfNeeded(p0, addr, r.token, ROUTER, amountIn);
        const minOut = (q.out * BigInt(Math.round((1 - Number(slip)) * 10_000))) / 10_000n;
        const data = encodeFunctionData({ abi: SELL, functionName: "swapExactTokensForETH", args: [amountIn, minOut, q.path, addr as Hex, BigInt(Math.floor(Date.now() / 1000) + 600)] });
        const hash = await send(p0, addr, ROUTER, data, "The sale");
        set(r.token, { sell: { state: "done", hash } });
      } catch (e) {
        set(r.token, { sell: { state: "error", msg: niceError(e, "Not sold.") } });
      }
    }
    setPhase("idle");
  }

  const chosen = rows.filter((r) => pick.has(r.token));
  const ready2 = chosen.filter((r) => { const q = st[r.token]?.quote; return q && !("skip" in q) && st[r.token]?.sell?.state !== "done"; });
  const expect = ready2.reduce((s, r) => s + ((st[r.token]?.quote as { out: bigint }).out ?? 0n), 0n);
  const sold = rows.filter((r) => st[r.token]?.sell?.state === "done").length;

  return (
    <Instrument
      code="T-41"
      title="Sell many at once"
      busy={busy || phase !== "idle"}
      status={<Led tone={addr ? "on" : "off"} label={addr ? (sold ? `${sold} sold` : `${rows.length} tokens held`) : "Connect a wallet"} />}
      foot={<span>Each sale is its own transaction in your wallet, on the Uniswap V2 router, min out = quote − slippage. Tokens whose best route is a v4 pool are skipped. Not audited: start small.</span>}
    >
      {!addr ? (
        <p className="p-5 text-[14px] text-muted">Connect your wallet from the top bar: the list of what you hold appears here.</p>
      ) : err ? (
        <p className="p-5 text-[14px] text-flesh">{err}</p>
      ) : !p ? (
        <p className="caret p-5 font-mono text-[13px] text-muted">Reading your holdings</p>
      ) : rows.length === 0 ? (
        <p className="p-5 text-[14px] text-muted">No tokens to sell besides ETH and USDG in what Corbel read this week.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
            <button type="button" onClick={() => setPick(new Set(rows.filter((r) => r.usd < DUST_USD).map((r) => r.token)))} className="ibtn-ghost h-9 px-3">{`Pick all under $${DUST_USD}`}</button>
            <button type="button" onClick={() => setPick(new Set())} className="ibtn-ghost h-9 px-3">Clear</button>
            <span className="ml-auto text-[12px] text-muted">Slippage</span>
            <Seg label="Slippage" value={slip} options={SLIPS} onChange={setSlip} />
          </div>
          <div className="max-h-[30rem] overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[13.5px]">
              <thead className="sticky top-0 bg-bg">
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.08em] text-muted">
                  {["", "Token", "You hold", "Value", "You get", ""].map((h, i) => (
                    <th key={i} scope="col" className="px-4 py-2.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = st[r.token];
                  const q = s?.quote;
                  return (
                    <tr key={r.token} className={cx("border-b border-line/50", pick.has(r.token) && "bg-[color-mix(in_oklab,var(--leaf)_5%,transparent)]")}>
                      <td className="px-4 py-2.5">
                        <input type="checkbox" aria-label={`Sell ${r.symbol}`} checked={pick.has(r.token)} onChange={() => toggle(r.token)} disabled={phase !== "idle"} className="h-4 w-4 accent-[var(--leaf)]" />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-text">{r.symbol}</td>
                      <td className="px-4 py-2.5 font-mono text-muted">{r.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                      <td className="px-4 py-2.5 font-mono text-text">{`$${r.usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</td>
                      <td className="px-4 py-2.5 font-mono">
                        {!q ? <span className="text-muted">—</span> : "skip" in q ? <span className="text-[12.5px] text-amber">{q.skip}</span> : <span className="text-text">{`${eth(q.out)} ETH`}{q.impact != null && <span className="ml-2 text-[12px] text-muted">{`${(q.impact * 100).toFixed(1)}% impact`}</span>}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[12.5px]">
                        {s?.sell?.state === "busy" && <span className="text-text">Confirm in wallet…</span>}
                        {s?.sell?.state === "done" && <a href={EXPLORER + s.sell.hash} target="_blank" rel="noreferrer" className="text-leaf underline underline-offset-4">Sold ↗</a>}
                        {s?.sell?.state === "error" && <span className="text-flesh">{s.sell.msg}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
            <button type="button" disabled={!chosen.length || phase !== "idle"} onClick={() => void quoteAll()} className="ibtn-ghost h-11 px-5">
              {phase === "quoting" ? "Quoting…" : `Quote ${chosen.length || ""}`.trim()}
            </button>
            <button type="button" disabled={!ready2.length || phase !== "idle"} onClick={() => void sellAll()} className="ibtn h-11 px-5">
              {phase === "selling" ? "Selling one by one…" : ready2.length ? `Sell ${ready2.length} for ~${eth(expect)} ETH` : "Sell"}
            </button>
            <p className="text-[12.5px] text-muted">Your wallet asks once per token to approve (if needed) and once to sell.</p>
          </div>
        </>
      )}
    </Instrument>
  );
}
