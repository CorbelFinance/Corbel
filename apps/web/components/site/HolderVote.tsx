"use client";

/**
 * Roadmap · holders vote on what ships first. Pick one item still to build and sign one message in your wallet (no
 * gas, nothing moves). Weight is the square root of the $CORBEL held through the last week, capped; linked wallets
 * vote once together. The tally is public and resets each Monday.
 */
import { useCallback, useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { useLinked } from "@/components/app/wallet";
import { ready } from "@/components/app/walletTx";

type Opt = { title: string; block: string; stage: string };
type V = { week: string; domain: Record<string, unknown>; types: Record<string, unknown>; capCoins: number; options: Opt[]; tally: { items: { item: string; weight: number; voters: number }[]; voters: number }; mine: { item: string; weight: number } | null };

export function HolderVote() {
  const { linked } = useLinked();
  const [v, setV] = useState<V | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(`/api/vote${linked?.address ? `?voter=${linked.address}` : ""}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<V>)
      .then(setV)
      .catch(() => undefined);
  }, [linked?.address]);
  useEffect(() => load(), [load]);
  if (!v) return null;

  async function vote() {
    if (!linked?.address || !pick) return;
    setBusy(true);
    setMsg(null);
    try {
      const p = await ready(linked.rdns);
      const typed = JSON.stringify({ domain: v!.domain, types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }], ...v!.types }, primaryType: "Vote", message: { week: v!.week, item: pick } });
      const signature = (await p.request({ method: "eth_signTypedData_v4", params: [linked.address, typed] })) as string;
      const r = await fetch("/api/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voter: linked.address, item: pick, signature }) });
      const j = (await r.json()) as { error?: string; weight?: number };
      setMsg(r.ok ? `Counted with weight ${j.weight?.toFixed(0)}.` : (j.error ?? "Not counted."));
      load();
    } catch {
      setMsg("The wallet did not sign.");
    } finally {
      setBusy(false);
    }
  }

  const max = Math.max(1, ...v.tally.items.map((i) => i.weight));
  return (
    <section aria-label="Holders vote" className="mt-16 overflow-hidden rounded-2xl border border-line bg-[#0f0f0f]">
      <header className="border-b border-line px-6 py-4">
        <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-leaf">{`Holders vote · ${v.week}`}</p>
        <p className="mt-1 text-[20px] text-text">What should ship first?</p>
        <p className="mt-1 max-w-3xl text-[13.5px] text-muted">{`One signed message a week, no gas. Weight is the square root of the $CORBEL you held through the last week, up to ${v.capCoins.toLocaleString("en-US")} coins, so a large holder counts more but cannot outvote everyone. Linked wallets vote once.`}</p>
      </header>
      <div className="grid gap-px bg-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="bg-[#0f0f0f] p-6">
          <p className="text-[14px] text-text">{`This week: ${v.tally.voters} voter${v.tally.voters === 1 ? "" : "s"}`}</p>
          {v.tally.items.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-muted">No votes yet this week.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {v.tally.items.slice(0, 10).map((i) => (
                <li key={i.item}>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-text">{i.item}</span>
                    <span className="font-mono text-muted">{`${i.voters} · ${i.weight.toFixed(0)}`}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#1d1d1d]">
                    <div className="h-full rounded-full bg-leaf" style={{ width: `${((i.weight / max) * 100).toFixed(1)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-[#0f0f0f] p-6">
          {v.mine && <p className="mb-3 text-[13px] text-leaf">{`Your vote this week: ${v.mine.item} (weight ${v.mine.weight.toFixed(0)}). A new vote replaces it.`}</p>}
          <div className="max-h-64 overflow-y-auto rounded-xl border border-line">
            {v.options.map((o) => (
              <button key={o.title} type="button" aria-pressed={pick === o.title} onClick={() => setPick(o.title)} className={cx("flex w-full items-center justify-between border-b border-line/60 px-3 py-2 text-left text-[13px] last:border-0", pick === o.title ? "bg-leaf/10 text-text" : "text-muted hover:text-text")}>
                <span>{o.title}</span>
                <span className="font-mono text-[11.5px] uppercase">{o.stage === "next" ? "building" : "planned"}</span>
              </button>
            ))}
          </div>
          <button type="button" disabled={busy || !pick || !linked?.address} onClick={() => void vote()} className="mt-3 h-10 w-full rounded-xl bg-leaf text-[14px] font-semibold text-[#0b0b0b] disabled:opacity-50">
            {!linked?.address ? "Link a wallet at the top right to vote" : busy ? "Sign in your wallet…" : pick ? `Vote for ${pick}` : "Pick an item"}
          </button>
          {msg && <p className="mt-2 text-[13px] text-muted">{msg}</p>}
        </div>
      </div>
    </section>
  );
}
