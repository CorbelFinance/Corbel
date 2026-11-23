"use client";

/**
 * Check · Creator dossier. Paste a wallet and see every token it launched on Robinhood Chain (on a launchpad or by
 * opening a pool) and what became of each: still on its curve, trading, or drained. From Corbel's own index.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument, Led, Verdict, short } from "./kit";

type T = { token: string; symbol: string | null; name: string | null; pad: string | null; block: number; pools: number; state: "trading" | "drained" | "curve" | "unknown" };
type D = { address: string; bulk: boolean; total: number; trading: number; drained: number; curve: number; unknown: number; tokens: T[]; error?: string };
const SCAN = "https://robinhoodchain.blockscout.com";
const STATE = { trading: ["Trading", "text-leaf"], drained: ["Drained", "text-flesh"], curve: ["On its curve", "text-amber"], unknown: ["Not read yet", "text-muted"] } as const;

export function CreatorDossier() {
  const [q, setQ] = useState("");
  const [d, setD] = useState<D | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(a: string) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return setErr("Paste a wallet address: 0x and 40 characters.");
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/creator?address=${a}`);
      const j = (await r.json()) as D;
      if (!r.ok || j.error) return setErr(j.error ?? "No answer.");
      setD(j);
      history.replaceState(null, "", `?address=${a}`);
    } catch {
      setErr("No answer. Try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const a = new URLSearchParams(location.search).get("address");
    if (a) void Promise.resolve().then(() => (setQ(a), run(a)));
  }, []);

  const known = d ? d.trading + d.drained : 0;
  const rate = d && known ? Math.round((d.drained / known) * 100) : null;
  return (
    <div className="space-y-4">
      <Instrument code="C-31" title="Creator dossier" busy={busy} status={<Led tone={d ? "on" : "off"} label={d ? `${d.total} tokens found` : "Paste a wallet"} />} foot={<span>From Corbel&apos;s index of every pool and launchpad launch on Robinhood Chain. A pool counts as drained when its liquidity was pulled or left as dust.</span>}>
        <form
          className="flex flex-col gap-px bg-line sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(q.trim());
          }}
        >
          <label htmlFor="cr-q" className="sr-only">Creator wallet</label>
          <input id="cr-q" value={q} onChange={(e) => setQ(e.target.value.trim())} placeholder="Creator wallet 0x… (from a token check or the radar)" spellCheck={false} className="min-w-0 flex-1 bg-bg px-4 py-3.5 font-mono text-[13px] text-text placeholder:text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-leaf" />
          <button type="submit" disabled={busy} className="bg-leaf px-6 py-3.5 font-medium text-xs uppercase tracking-[0.08em] text-bg disabled:opacity-60">
            {busy ? "Reading…" : "Read the record"}
          </button>
        </form>
        {err && <p className="px-4 py-3 text-[13px] text-flesh">{err}</p>}
      </Instrument>

      {d && (
        <Verdict
          kicker={d.bulk ? "A machine, not a person" : d.total === 0 ? "No record" : rate != null && rate >= 50 ? "Most of them died" : "Record"}
          tone={d.total === 0 ? "info" : rate != null && rate >= 50 ? "bad" : d.drained > 0 ? "caution" : "good"}
          value={rate != null ? `${rate}%` : d.total}
          valueLabel={rate != null ? `of ${known} tokens with a known fate were drained` : "tokens launched"}
          source="index · every launch and pool this wallet made in the indexed window"
          facts={[
            ["Tokens", String(d.total)],
            ["Trading", String(d.trading)],
            ["Drained", String(d.drained)],
            ["On a curve", String(d.curve)],
          ]}
        >
          {d.bulk
            ? "This wallet opens pools for many tokens: a launchpad's migrator or a market maker. Its record says little about any one token."
            : d.total === 0
              ? "This wallet has not launched a token or opened a pool that Corbel has seen."
              : `${short(d.address)} launched ${d.total} token${d.total === 1 ? "" : "s"}. ${d.drained ? `${d.drained} lost ${d.drained === 1 ? "its" : "their"} liquidity.` : "None lost its liquidity so far."}`}
        </Verdict>
      )}

      {d && d.tokens.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-[13.5px]">
              <thead className="sticky top-0 bg-[#0e0e0e]">
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.08em] text-muted">
                  {["Token", "Where", "Pools", "Now", ""].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.tokens.map((t) => (
                  <tr key={t.token} className="border-b border-line/60">
                    <td className="px-4 py-3">
                      <span className="font-mono text-text">{t.symbol ?? short(t.token)}</span>
                      {t.name && <span className="ml-2 text-[12.5px] text-muted">{t.name}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">{t.pad ?? "Direct pool"}</td>
                    <td className="px-4 py-3 font-mono text-text">{t.pools}</td>
                    <td className={cx("px-4 py-3 font-mono text-[12px] uppercase tracking-[0.08em]", STATE[t.state][1])}>{STATE[t.state][0]}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/app/trust/check?q=${t.token}`} className="text-[12.5px] text-leaf underline underline-offset-4">Check</Link>
                      <a href={`${SCAN}/token/${t.token}`} target="_blank" rel="noreferrer" className="ml-3 text-[12.5px] text-muted hover:text-text">↗</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
