"use client";

/**
 * Check · Fair launch. What a fair launch shows its buyers, for any token, live from the chain: who made it and what
 * became of their other tokens, which wallets were waived from the launch fee and how much they took, who holds the
 * supply now, and whether the first week's buyers stayed. Each part is read on its own; nothing is scored here.
 */
import { useState } from "react";
import { BuyerRetention } from "./BuyerRetention";
import { HoldersPanel } from "./HoldersPanel";
import { LaunchWaivers, type WaiversIn } from "./LaunchWaivers";

type Check = { id: string; result: string; reason: string };
type Report = { token: string; checks: Check[]; meta?: { symbol: string | null; block: string }; waivers?: WaiversIn; error?: string };
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const TONE: Record<string, string> = { pass: "text-leaf", warn: "text-amber", fail: "text-flesh", unknown: "text-muted" };

export function FairLaunch() {
  const [q, setQ] = useState("");
  const [r, setR] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const a = q.trim();
    if (!ADDR.test(a)) return setErr("Paste the token's 0x address.");
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/token?q=${a}`);
      const j = (await res.json()) as Report;
      if (!res.ok || j.error) return setErr(j.error ?? "No answer.");
      setR(j);
    } catch {
      setErr("No answer. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const creator = r?.checks.find((c) => c.id === "creator");
  const liq = r?.checks.find((c) => c.id === "liquidity");
  const sym = r?.meta?.symbol ?? "the token";
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="flex flex-wrap gap-2 rounded-2xl border border-[#242424] bg-[#131313] p-4"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Token address 0x…" aria-label="Token address" spellCheck={false} className="h-11 min-w-60 flex-1 rounded-xl border border-[#2a2a2a] bg-[#0b0b0b] px-3 font-mono text-[13px] text-text outline-none focus:border-leaf" />
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-leaf px-5 text-[14px] font-semibold text-[#0b0b0b] disabled:opacity-60">
          {busy ? "Reading the launch…" : "Show the launch"}
        </button>
        {err && <p className="w-full text-[13px] text-flesh">{err}</p>}
      </form>

      {r && (
        <>
          <section aria-label="Creator and liquidity" className="grid gap-px overflow-hidden rounded-2xl border border-[#242424] bg-line md:grid-cols-2">
            {[
              ["Who made it", creator],
              ["Where the liquidity sits", liq],
            ].map(([k, c]) => (
              <div key={k as string} className="bg-[#131313] p-4">
                <p className="text-[13px] text-muted">{k as string}</p>
                <p className={`mt-1 text-[14px] ${TONE[(c as Check | undefined)?.result ?? "unknown"]}`}>{(c as Check | undefined)?.reason ?? "Not read."}</p>
              </div>
            ))}
          </section>
          {r.waivers ? <LaunchWaivers w={r.waivers} /> : <p className="rounded-2xl border border-[#242424] bg-[#131313] px-4 py-3 text-[13.5px] text-muted">{`Launch-fee waivers · ${sym} was not born on a launchpad we read, so there is no launch list to show.`}</p>}
          <BuyerRetention token={r.token} />
          <section aria-label="Holders" className="overflow-hidden rounded-2xl border border-[#242424] bg-[#131313]">
            <p className="border-b border-[#242424] px-4 py-3 text-[15px] font-semibold text-text">Who holds it now</p>
            <HoldersPanel token={r.token} symbol={r.meta?.symbol ?? ""} />
          </section>
          <p className="px-1 text-[12.5px] text-muted">{`Read from the chain at block ${Number(r.meta?.block ?? 0).toLocaleString("en-US")}. The full token check, with the sell test and the score, is one click away in Check.`}</p>
        </>
      )}
    </div>
  );
}
