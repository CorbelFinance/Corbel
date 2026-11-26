"use client";

/**
 * Agents · Pay per call (x402). The paid tools and their prices, how an agent pays (ask, sign, call again), the wallet
 * that is paid, and every settled paid call with its transaction. All from GET /api/x402; nothing here takes money.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";

type Tool = { id: string; usdg: number; method: string; ask: string; what: string };
type Call = { payer: string; tool: string; usdg: number; tx: string; at: number };
type X = { open: boolean; network: string; asset: string; payTo: string | null; tools: Tool[]; paid?: { calls: Call[]; count: number; usdg: number } };

const SCAN = "https://robinhoodchain.blockscout.com";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const NAMES: Record<string, string> = { token: "Token check", preview: "Before you sign", replay: "Failed sell replay", ledger: "Ledger" };
const ago = (t: number) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86_400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86_400)}d ago`;
};

const STEPS: [string, string, string][] = [
  ["01", "Ask", "Call the tool with no payment. The answer is 402 with the price, the wallet to pay and what to sign."],
  ["02", "Sign", "Sign a USDG transfer authorization for that price. The agent pays no gas."],
  ["03", "Call again", "Send the same request with the signature in X-PAYMENT. Corbel checks it, runs the tool, settles on chain."],
  ["04", "Get the answer", "It comes once the payment is in a block, with the transaction in X-PAYMENT-RESPONSE. A failed tool is never charged."],
];

export function PayPerCall() {
  const [x, setX] = useState<X | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let off = false;
    const load = () =>
      fetch("/api/x402", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: X) => !off && setX(j))
        .catch(() => !off && setErr(true));
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      off = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-1.5">
      <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#141414]">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
          <span className="text-[14px] font-semibold text-text">x402 paid tools</span>
          <span className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px]", x?.open ? "bg-[#9b86e4]/15 text-[#c3b5f2]" : "bg-[#1f1f1f] text-muted")}>
            <i className={cx("h-1.5 w-1.5 rounded-full", x?.open ? "bg-[#9b86e4]" : "bg-[#555]")} />
            {x ? (x.open ? "Open: agents can pay now" : "Not open yet") : err ? "Not answering" : "Reading"}
          </span>
          {x?.payTo && (
            <a href={`${SCAN}/address/${x.payTo}`} target="_blank" rel="noreferrer noopener" className="ml-auto font-mono text-[12px] text-muted hover:text-text">
              {`Paid to ${short(x.payTo)} ↗`}
            </a>
          )}
        </header>
        <div className="grid gap-px bg-[#242424] sm:grid-cols-2 xl:grid-cols-4">
          {(x?.tools ?? []).map((t) => (
            <div key={t.id} className="bg-[#141414] p-4">
              <p className="text-[13px] text-muted">{NAMES[t.id] ?? t.id}</p>
              <p className="mt-1 font-mono text-[26px] leading-tight text-text">
                {`$${t.usdg}`}
                <span className="ml-1.5 text-[12px] text-muted">USDG a call</span>
              </p>
              <p className="mt-2 text-[12.5px] leading-snug text-[#c9ccca]">{t.what}</p>
              <p className="mt-2 truncate font-mono text-[11.5px] text-[#9b86e4]" title={`${t.method} ${t.ask}`}>{`${t.method} ${t.ask}`}</p>
            </div>
          ))}
          {!x && Array.from({ length: 4 }, (_, i) => <div key={i} className="h-36 animate-pulse bg-[#161616]" />)}
        </div>
      </section>

      <div className="grid gap-1.5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#141414]">
          <header className="border-b border-line px-4 py-2.5 text-[14px] font-semibold text-text">How an agent pays</header>
          <ol className="divide-y divide-line/60">
            {STEPS.map(([n, k, v]) => (
              <li key={n} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 px-4 py-3">
                <span className="font-mono text-[13px] text-[#9b86e4]">{n}</span>
                <span>
                  <span className="block text-[14px] font-medium text-text">{k}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{v}</span>
                </span>
              </li>
            ))}
          </ol>
          <pre className="overflow-x-auto border-t border-line bg-[#101010] px-4 py-3 font-mono text-[12px] leading-relaxed text-[#c9ccca]">{`# 1. ask: 402 with the price and what to sign
curl -i "https://corbel.finance/api/x402/token?q=<token>"

# 2-3. sign the USDG authorization, then call again
curl "https://corbel.finance/api/x402/token?q=<token>" \\
  -H "X-PAYMENT: <base64 of the signed payment>"`}</pre>
          <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-muted">
            Network {x?.network ?? "eip155:4663"} (Robinhood Chain) · asset USDG · the full list for agents is at{" "}
            <a href="/api/x402" className="text-[#c3b5f2] hover:underline">
              /api/x402
            </a>
          </p>
        </section>

        <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#141414]">
          <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
            <span className="text-[14px] font-semibold text-text">Paid calls</span>
            {x?.paid && <span className="ml-auto font-mono text-[12px] text-muted">{`${x.paid.count} calls · $${x.paid.usdg.toFixed(3)} USDG`}</span>}
          </header>
          <ul className="max-h-[26rem] divide-y divide-line/60 overflow-y-auto">
            {x?.paid?.calls.map((c) => (
              <li key={c.tx} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="min-w-0">
                  <span className="block text-text">{NAMES[c.tool] ?? c.tool}</span>
                  <span className="block font-mono text-[11.5px] text-muted">{`agent ${short(c.payer)} · ${ago(c.at)}`}</span>
                </span>
                <span className="text-right">
                  <span className="block font-mono text-[#c3b5f2]">{`$${c.usdg}`}</span>
                  <a href={`${SCAN}/tx/${c.tx}`} target="_blank" rel="noreferrer noopener" className="block font-mono text-[11.5px] text-muted hover:text-text">
                    {`${short(c.tx)} ↗`}
                  </a>
                </span>
              </li>
            ))}
            {x?.paid && x.paid.calls.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-muted">No paid calls yet.</li>}
            {!x && <li className="h-40 animate-pulse bg-[#161616]" />}
          </ul>
        </section>
      </div>
    </div>
  );
}
