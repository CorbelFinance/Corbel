"use client";

/**
 * Stocks · issuer reserves: what the issuer's stock tokens on this chain are worth now (supply read from each contract
 * times the chain price), next to what the issuer's own quarterly filing says backs every public stock token. Two
 * measures, two dates: shown side by side, never subtracted.
 */
import { useEffect, useState } from "react";

type Row = { token: string; symbol: string; name: string; supply: number; price: number | null; value: number | null };
type R = {
  block: string;
  onChain: { tokens: number; priced: number; value: number };
  filing: { issuer: string; backing: string; asOf: string; says: string; url: string };
  rows: Row[];
  error?: string;
};

const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M` : `$${Math.round(v).toLocaleString("en-US")}`);
const num = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 4 : 0 });
const SCAN = "https://robinhoodchain.blockscout.com/token/";

export function IssuerReserves() {
  const [r, setR] = useState<R | null>(null);
  useEffect(() => {
    fetch("/api/stocks/reserves")
      .then((x) => x.json() as Promise<R>)
      .then(setR)
      .catch(() => setR({ error: "Not answering." } as R));
  }, []);
  return (
    <div className="space-y-1.5">
      <div className="grid gap-1.5 md:grid-cols-2">
        <section className="rounded-lg border border-[#242424] bg-[#141414] p-4">
          <p className="text-[12.5px] text-muted">On this chain now</p>
          <p className="mt-1 font-mono text-[28px] text-text">{r && !r.error ? usd(r.onChain.value) : "…"}</p>
          <p className="mt-1 text-[12.5px] text-muted">{r && !r.error ? `${r.onChain.priced} of ${r.onChain.tokens} issuer stock tokens with a chain price · supply read at block ${Number(r.block).toLocaleString("en-US")}` : "Reading every token's supply"}</p>
        </section>
        <section className="rounded-lg border border-[#242424] bg-[#141414] p-4">
          <p className="text-[12.5px] text-muted">Held by the issuer to back them, by its own filing</p>
          <p className="mt-1 font-mono text-[28px] text-text">{r?.filing?.backing ?? "…"}</p>
          <p className="mt-1 text-[12.5px] text-muted">
            {r?.filing ? `${r.filing.issuer} · as of ${r.filing.asOf} · every public stock token, not only this chain · ` : ""}
            {r?.filing && (
              <a href={r.filing.url} target="_blank" rel="noreferrer noopener" className="text-text underline underline-offset-4">
                Read the filing ↗
              </a>
            )}
          </p>
        </section>
      </div>
      {r?.error ? (
        <p className="rounded-lg border border-[#242424] bg-[#141414] px-4 py-4 text-[13px] text-flesh">{r.error}</p>
      ) : (
        <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#141414]">
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-[#141414]">
                <tr className="border-b border-line text-[12px] text-muted">
                  {["Token", "Supply on chain", "Chain price", "Worth now"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-2 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(r?.rows ?? []).map((x) => (
                  <tr key={x.token} className="border-b border-line/60 font-mono">
                    <td className="px-4 py-2">
                      <a href={SCAN + x.token} target="_blank" rel="noreferrer noopener" className="text-text hover:underline">{`${x.symbol} ↗`}</a>
                      <span className="ml-2 font-sans text-[12px] text-muted">{x.name}</span>
                    </td>
                    <td className="px-4 py-2 text-text">{num(x.supply)}</td>
                    <td className="px-4 py-2 text-muted">{x.price !== null ? `$${x.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}</td>
                    <td className="px-4 py-2 text-text">{x.value !== null ? usd(x.value) : "—"}</td>
                  </tr>
                ))}
                {!r && <tr><td colSpan={4} className="h-40 animate-pulse bg-[#161616]" /></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="px-1 text-[12px] text-muted">
        The filing says the issuer must buy the underlying shares and hold them as collateral, and that a token pays cash at the share&apos;s market price on redemption, with no shareholder rights. It is the issuer&apos;s own statement, not an outside audit, and it is dated: the chain figure moves every block.
      </p>
    </div>
  );
}
