"use client";

/**
 * Wallet · Before you sign. Paste a transaction (or its fields) and see what it would move: the signer's balances,
 * who receives them, and any approval it grants. Simulated at the latest block; nothing is signed or sent.
 */
import { useState } from "react";
import { formatUnits } from "viem";
import { cx } from "@corbel/ui";
import { Bay } from "./Bay";
import { Verdict, short } from "./kit";
import { useLinked } from "./wallet";

type Change = { asset: string; symbol: string; decimals: number; amount: string; nft: boolean };
type Grant = { token: string; symbol: string; decimals: number; spender: string; amount: string | null; unlimited: boolean; all: boolean; revoke: boolean };
type P = { ok: boolean; reason: string | null; gas: number | null; block: string; changes: Change[]; receivers: { address: string; asset: string; symbol: string; amount: string }[]; grants: Grant[]; error?: string };

const SCAN = "https://robinhoodchain.blockscout.com";
const amt = (raw: string, dec: number) => {
  const v = Number(formatUnits(BigInt(raw), dec));
  const a = Math.abs(v);
  return a >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v.toLocaleString("en-US", { maximumFractionDigits: a < 1 ? 8 : 4 });
};

/** Accepts a pasted JSON transaction ({from,to,value,data} as wallets and dapps show it) and fills the fields. */
function fromJson(text: string): { from?: string; to?: string; value?: string; data?: string } | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const t = (Array.isArray(j.params) ? j.params[0] : j) as Record<string, unknown>;
    return { from: t.from as string, to: t.to as string, value: t.value === undefined ? "" : String(t.value), data: (t.data ?? t.input) as string };
  } catch {
    return null;
  }
}

export function TxPreview() {
  const { linked } = useLinked();
  const [f, setF] = useState({ from: "", to: "", value: "", data: "" });
  const [p, setP] = useState<P | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, from: f.from || linked?.address || "" }) });
      const j = (await r.json()) as P;
      if (!r.ok || j.error) return setErr(j.error ?? "No answer.");
      setP(j);
    } catch {
      setErr("No answer. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const out = p?.changes.filter((c) => c.amount.startsWith("-")) ?? [];
  const inn = p?.changes.filter((c) => !c.amount.startsWith("-")) ?? [];
  const risky = p ? p.grants.filter((g) => !g.revoke && (g.all || g.unlimited)).length : 0;
  const field = "h-11 w-full rounded-xl border border-[#2a2a2a] bg-[#0b0b0b] px-3 font-mono text-[13px] text-text outline-none focus:border-leaf";

  return (
    <div className="space-y-4">
      <Bay tone="violet" kicker="Before you sign · read-only" title="What this transaction would move" busy={busy} foot={<span>Run at the latest block in a simulation. Nothing is signed, sent or kept. Paste the request a site sends to your wallet, or fill the fields.</span>}>
        <form
          className="grid gap-3 px-5 py-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <textarea
            aria-label="Paste a transaction as JSON"
            placeholder='Paste a transaction, e.g. {"from":"0x…","to":"0x…","value":"0x0","data":"0x…"}'
            rows={2}
            onChange={(e) => {
              const j = fromJson(e.target.value);
              if (j) setF((x) => ({ from: j.from ?? x.from, to: j.to ?? x.to, value: j.value ?? x.value, data: j.data ?? x.data }));
            }}
            className="md:col-span-2 w-full rounded-xl border border-[#2a2a2a] bg-[#0b0b0b] p-3 font-mono text-[13px] text-text outline-none focus:border-leaf"
          />
          <input aria-label="Signer (from)" placeholder={linked?.address ? `Signer: ${short(linked.address)} (yours)` : "Signer (from) 0x…"} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value.trim() })} className={field} spellCheck={false} />
          <input aria-label="Calls (to)" placeholder="Calls (to) 0x…" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value.trim() })} className={field} spellCheck={false} />
          <input aria-label="Value in wei" placeholder="Value in wei (0 if none)" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.trim() })} className={field} spellCheck={false} />
          <input aria-label="Data" placeholder="Data 0x…" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value.trim() })} className={field} spellCheck={false} />
          <button type="submit" disabled={busy} className="md:col-span-2 h-11 rounded-xl bg-leaf text-[14px] font-semibold text-[#0b0b0b] disabled:opacity-60">
            {busy ? "Simulating…" : "Show what it moves"}
          </button>
          {err && <p className="md:col-span-2 text-[13px] text-flesh">{err}</p>}
        </form>
      </Bay>

      {p && (
        <Verdict
          kicker={!p.ok ? "It would fail" : risky ? "Grants control of your tokens" : out.length ? "Money leaves this wallet" : "Moves nothing out"}
          tone={!p.ok ? "caution" : risky ? "bad" : out.length ? "caution" : "good"}
          value={!p.ok ? "Revert" : risky ? `${risky}` : `${out.length}`}
          valueLabel={!p.ok ? "the chain would refuse it" : risky ? "unlimited or all-token approvals" : "assets leave the signer"}
          source={`simulation · block ${Number(p.block).toLocaleString("en-US")}${p.gas ? ` · ${p.gas.toLocaleString("en-US")} gas` : ""}`}
          facts={[
            ["Leaves", String(out.length)],
            ["Arrives", String(inn.length)],
            ["Approvals", String(p.grants.length)],
            ["Receivers", String(new Set(p.receivers.map((r) => r.address)).size)],
          ]}
        >
          {!p.ok
            ? `Signed now, it would revert: ${p.reason}`
            : risky
              ? "It lets another address move your tokens later, without asking again. Sign only if you trust that address."
              : out.length
                ? "Check that what leaves matches what you meant to do, and that the receiver is who you expect."
                : "Nothing leaves this wallet in this transaction."}
        </Verdict>
      )}

      {p?.ok && (p.changes.length > 0 || p.grants.length > 0) && (
        <section className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
          <div className="bg-[#0e0e0e] p-5">
            <p className="text-[14px] font-semibold text-text">Your balances</p>
            <ul className="mt-3 space-y-2">
              {p.changes.map((c) => (
                <li key={c.asset} className="flex items-center justify-between gap-3 font-mono text-[13.5px]">
                  <a href={`${SCAN}/token/${c.asset}`} target="_blank" rel="noreferrer" className="text-text hover:underline">{c.symbol}</a>
                  <span className={c.amount.startsWith("-") ? "text-flesh" : "text-leaf"}>{`${c.amount.startsWith("-") ? "" : "+"}${c.nft ? `${c.amount} NFT` : amt(c.amount, c.decimals)}`}</span>
                </li>
              ))}
              {!p.changes.length && <li className="text-[13px] text-muted">No balance changes.</li>}
            </ul>
            {p.receivers.length > 0 && (
              <>
                <p className="mt-4 text-[13px] text-muted">Sent to</p>
                <ul className="mt-1 space-y-1">
                  {p.receivers.map((r) => (
                    <li key={r.address + r.asset} className="flex justify-between gap-3 font-mono text-[12.5px]">
                      <a href={`${SCAN}/address/${r.address}`} target="_blank" rel="noreferrer" className="text-text hover:underline">{short(r.address)} ↗</a>
                      <span className="text-muted">{r.symbol}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="bg-[#0e0e0e] p-5">
            <p className="text-[14px] font-semibold text-text">Approvals it grants</p>
            <ul className="mt-3 space-y-2">
              {p.grants.map((g, i) => (
                <li key={i} className="text-[13px]">
                  <span className={cx("font-mono", g.revoke ? "text-leaf" : g.all || g.unlimited ? "text-flesh" : "text-amber")}>
                    {g.revoke ? "Revokes" : g.all ? "All tokens of" : g.unlimited ? "Unlimited" : `${amt(g.amount ?? "0", g.decimals)} of`}
                  </span>{" "}
                  <span className="font-mono text-text">{g.symbol}</span> <span className="text-muted">to</span>{" "}
                  <a href={`${SCAN}/address/${g.spender}`} target="_blank" rel="noreferrer" className="font-mono text-text hover:underline">{short(g.spender)} ↗</a>
                </li>
              ))}
              {!p.grants.length && <li className="text-[13px] text-muted">None.</li>}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
