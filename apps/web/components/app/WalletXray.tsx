"use client";

/**
 * Wallet · X-ray. What a wallet is worth at spot against what selling each holding would really pay right now:
 * every whole balance is sold into ETH in a simulation on every route at the latest block. Read-only.
 */
import { useCallback, useState } from "react";
import { cx } from "@corbel/ui";
import { Bay } from "./Bay";
import { Verdict, short } from "./kit";
import { WalletPick } from "./WalletPick";

type Row = { token: string; symbol: string | null; copy: boolean; amount: number; spot: number | null; exit: number | null; impact: number | null; route: string | null; reason: string | null; kind: "ok" | "none" | "unread" };
type R = { address: string; block: string; eth: number; usdgPerEth: number | null; rows: Row[]; more: number; totals: { spot: number; exit: number; stuck: number; unread: number }; at: number; error?: string };

const SCAN = "https://robinhoodchain.blockscout.com";
const eth = (v: number) => (v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(3) : v >= 0.0001 ? v.toFixed(4) : v >= 0.000001 ? v.toFixed(6) : v > 0 ? "<0.000001" : "0");
const amt = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toLocaleString("en-US", { maximumFractionDigits: 4 }));

export function WalletXray() {
  const [r, setR] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (a: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/xray?address=${a}`, { cache: "no-store" });
      const j = (await res.json()) as R;
      if (!res.ok || j.error) return setErr(j.error ?? "The chain did not answer.");
      setR(j);
    } catch {
      setErr("No answer. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const t = r?.totals;
  const kept = t && t.spot > 0 ? t.exit / t.spot : null;
  const usd = (v: number) => {
    if (!r?.usdgPerEth) return "";
    const d = v * r.usdgPerEth;
    return ` · ${d >= 100 ? `$${d.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : d >= 0.01 ? `$${d.toFixed(2)}` : "under a cent"}`;
  };
  return (
    <div className="space-y-4">
      <Bay
        tone="violet"
        kicker="X-ray · read-only"
        title="What this wallet could really sell for"
        busy={busy}
        foot={<span>Each holding is sold whole into ETH in a simulation at the latest block, on every route. Nothing is signed. Takes up to two minutes.</span>}
      >
        <div className="py-4">
          <WalletPick onPick={(a) => void load(a)} busy={busy} cta="X-ray it" />
          {err && <p className="mx-5 mt-3 text-[13px] text-flesh">{err}</p>}
        </div>
      </Bay>

      {r && t && (
        <Verdict
          kicker={kept === null ? "Nothing to sell" : kept >= 0.9 ? "Mostly sellable" : kept >= 0.5 ? "Thin exits" : "Worth far less than it shows"}
          tone={kept === null ? "good" : kept >= 0.9 ? "good" : kept >= 0.5 ? "caution" : "bad"}
          value={kept === null ? "—" : `${Math.round(kept * 100)}%`}
          valueLabel="of the spot value a sale pays today"
          source={`chain · block ${Number(r.block).toLocaleString("en-US")} · ${new Date(r.at).toUTCString().slice(17, 22)} UTC`}
          facts={[
            ["Tokens at spot", `${eth(t.spot)} ETH${usd(t.spot)}`],
            ["A sale pays", `${eth(t.exit)} ETH${usd(t.exit)}`],
            ["No exit at all", t.unread ? `${t.stuck} · ${t.unread} not simulated` : String(t.stuck)],
            ["ETH and WETH held", `${eth(r.eth)} ETH`],
          ]}
        >
          {kept === null
            ? "This wallet holds no token with a pool price, only ETH or nothing."
            : `Spot prices say the tokens are worth ${eth(t.spot)} ETH. Selling each one whole would pay ${eth(t.exit)} ETH: the rest is price impact${t.stuck ? `, and ${t.stuck} token${t.stuck === 1 ? " has" : "s have"} no route out` : ""}.`}
        </Verdict>
      )}

      {r && r.rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.08em] text-muted">
                  {["Token", "Held", "Spot, ETH", "A sale pays, ETH", "Kept", "Route"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.rows.map((x) => {
                  const k = x.spot && x.exit !== null ? x.exit / x.spot : null;
                  return (
                    <tr key={x.token} className="border-b border-line/60 align-top">
                      <td className="px-4 py-3">
                        <a href={`/app/trust/check?q=${x.token}`} className="font-mono text-text hover:underline">{x.symbol ?? short(x.token)}</a>
                        {x.copy && <span className="ml-2 rounded-full border border-flesh/50 px-1.5 py-px text-[11.5px] text-flesh" title={`Not the real ${x.symbol}: another contract, ${short(x.token)}`}>copy</span>}
                        <span className="block font-mono text-[12px] text-muted">{short(x.token)}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-text">{amt(x.amount)}</td>
                      <td className="px-4 py-3 font-mono text-text">{x.spot === null ? "—" : eth(x.spot)}</td>
                      <td className={cx("px-4 py-3 font-mono", x.kind === "none" ? "text-flesh" : x.kind === "unread" ? "text-muted" : "text-text")}>{x.kind === "none" ? "No exit" : x.kind === "unread" ? "Not read" : eth(x.exit ?? 0)}</td>
                      <td className={cx("px-4 py-3 font-mono", k === null ? "text-muted" : k >= 0.9 ? "text-leaf" : k >= 0.5 ? "text-amber" : "text-flesh")}>{k === null ? "—" : `${Math.round(Math.min(k, 9.99) * 100)}%`}</td>
                      <td className="px-4 py-3 text-[12.5px] text-muted">{x.route ?? x.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-3 text-[12.5px] text-muted">
            {`Pool math only: a token that taxes or blocks its own sells pays less than this; open it in the token check. ${r.more ? `${r.more} smaller holding${r.more === 1 ? " is" : "s are"} not shown. ` : ""}`}
            <a href={`${SCAN}/address/${r.address}`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-text">The wallet on the explorer ↗</a>
          </p>
        </section>
      )}
    </div>
  );
}
