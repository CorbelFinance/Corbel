"use client";

/**
 * Credits · your account: the balance, a top-up sent from your own wallet (a USDG transfer to the credits treasury,
 * credited once the chain shows it), model keys with a daily cap each, and every top-up and charge. Credits are spent
 * only, never paid back out: said before anything is sent.
 */
import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData } from "viem";
import { cx } from "@corbel/ui";
import { useSession } from "../app/session";
import { niceError, ready, send, waitReceipt, EXPLORER } from "../app/walletTx";

type Key = { id: string; label: string; tail: string; cap: number; spentToday: number; created: number };
type Data = {
  open: boolean;
  treasury: string | null;
  markup: number;
  minTopUp: number;
  maxCap: number;
  signedIn: boolean;
  balance?: number;
  deposited?: number;
  spent?: number;
  deposits?: { tx: string; usd: number; block: number; at: number }[];
  spends?: { kind: string; ref: string | null; usd: number; at: number }[];
  keys?: Key[];
};
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const TRANSFER = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`;
const when = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ");

export function CreditsAccount() {
  const auth = useSession();
  const [d, setD] = useState<Data | null>(null);
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const [label, setLabel] = useState("");
  const [cap, setCap] = useState("5");
  const [fresh, setFresh] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [capEdit, setCapEdit] = useState("");

  const load = useCallback(() => fetch("/api/credits", { cache: "no-store" }).then((r) => r.json()).then((j: Data) => setD(j)).catch(() => null), []);
  useEffect(() => {
    void Promise.resolve().then(load);
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load, auth.address]);

  async function topUp() {
    if (!d?.treasury || !auth.address) return;
    const a = Number(amount);
    if (!(a >= d.minTopUp)) return setMsg({ ok: false, text: `The smallest top-up is ${d.minTopUp} USDG.` });
    setBusy(true);
    setMsg(null);
    try {
      const p = await ready();
      const data = encodeFunctionData({ abi: TRANSFER, functionName: "transfer", args: [d.treasury as `0x${string}`, BigInt(Math.round(a * 1e6))] });
      const tx = await send(p, auth.address, USDG, data, "top-up");
      setMsg({ ok: true, text: "Sent. It shows on your balance once the chain confirms it, usually within a minute.", tx });
      await waitReceipt(p, tx).catch(() => null);
      void load();
    } catch (e) {
      setMsg({ ok: false, text: niceError(e, "The top-up did not go through.") });
    } finally {
      setBusy(false);
    }
  }
  async function keyCall(method: "POST" | "PATCH" | "DELETE", body?: object, id?: string) {
    const r = await fetch(`/api/credits${id ? `?id=${id}` : ""}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = (await r.json().catch(() => ({}))) as { key?: string; error?: string };
    if (j.key) setFresh(j.key);
    if (j.error) setMsg({ ok: false, text: j.error });
    void load();
  }

  const shell = (body: React.ReactNode) => (
    <section className="rounded-[28px] border border-[#3a2418] bg-[#120b08] p-6 sm:p-8">
      <p className="font-mono text-[12px] text-[#ff9a5c]">Credits · your account</p>
      {body}
    </section>
  );
  if (!d) return shell(<p className="mt-4 text-[14px] text-muted">Reading…</p>);
  if (!d.open) return shell(<p className="mt-4 text-[14px] text-text">Credits open soon.</p>);
  if (!d.signedIn || !auth.address) return shell(<p className="mt-4 text-[14px] text-text">Sign in with your wallet from the top bar to see your balance and top up.</p>);

  return shell(
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {([["Balance", d.balance ?? 0], ["Topped up", d.deposited ?? 0], ["Spent", d.spent ?? 0]] as const).map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-[#3a2418] bg-[#140d0a]/90 p-4">
            <p className="font-mono text-[12px] text-[#a8907f]">{k}</p>
            <p className="mt-1 font-mono text-2xl tabular-nums text-text">{usd(v)}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-[#3a2418] bg-[#0d0907] p-4">
        <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#ff9a5c]">Top up with USDG</p>
        <p className="mt-2 text-[14px] text-text">Credits are spent only. They are never paid back out, so top up what you will use.</p>
        <p className="mt-1 text-[13px] text-[#d8c2b4]">{`Models and GPUs are charged at the provider's price plus ${Math.round(d.markup * 100)}%. The transfer goes to ${d.treasury}, from your own wallet; you sign it.`}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[5, 10, 25, 100].map((v) => (
            <button key={v} type="button" onClick={() => setAmount(String(v))} aria-pressed={amount === String(v)} className={cx("rounded-full border px-3 py-1 font-mono text-[12.5px]", amount === String(v) ? "border-[#ff9a5c] text-text" : "border-[#3a2418] text-[#a8907f]")}>
              {v}
            </button>
          ))}
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="USDG to send" className="h-9 w-28 rounded-lg border border-[#3a2418] bg-[#140d0a] px-3 font-mono text-[13px] text-text" />
          <button type="button" disabled={busy} onClick={() => void topUp()} className="h-9 rounded-full bg-[#ff9a5c] px-5 text-[13.5px] font-semibold text-[#1a0d06] hover:bg-[#ffb07e] disabled:opacity-50">
            {busy ? "Sending…" : `Send ${amount || 0} USDG`}
          </button>
        </div>
        {msg && (
          <p className={cx("mt-3 text-[13px]", msg.ok ? "text-leaf" : "text-flesh")}>
            {msg.text}{" "}
            {msg.tx && (
              <a href={EXPLORER + msg.tx} target="_blank" rel="noreferrer" className="underline">
                View the transaction
              </a>
            )}
          </p>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-[#3a2418] bg-[#0d0907] p-4">
        <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#ff9a5c]">Model keys</p>
        <p className="mt-2 text-[13px] text-[#d8c2b4]">Call the models from your own code, paid from this balance. Each key stops itself at its daily cap.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name" aria-label="Key name" className="h-9 w-40 rounded-lg border border-[#3a2418] bg-[#140d0a] px-3 text-[13px] text-text" />
          <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" aria-label="Daily cap in USD" className="h-9 w-24 rounded-lg border border-[#3a2418] bg-[#140d0a] px-3 font-mono text-[13px] text-text" />
          <span className="text-[12px] text-[#a8907f]">$ a day</span>
          <button type="button" onClick={() => void keyCall("POST", { label, cap: Number(cap) })} className="h-9 rounded-full border border-[#ff9a5c]/70 px-4 text-[13px] text-[#ff9a5c] hover:bg-[#ff9a5c]/10">
            Make a key
          </button>
        </div>
        {fresh && (
          <div className="mt-3 rounded-xl border border-leaf/40 bg-leaf/5 p-3">
            <p className="text-[13px] text-text">Your key, shown once. Copy it now.</p>
            <code className="mt-1 block break-all font-mono text-[13px] text-leaf">{fresh}</code>
          </div>
        )}
        <ul className="mt-3 divide-y divide-[#3a2418]">
          {(d.keys ?? []).map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 py-2 font-mono text-[12.5px]">
              <span className="text-text">{k.label}</span>
              <span className="text-[#a8907f]">{`cm_…${k.tail}`}</span>
              <span className="text-[#a8907f]">{`${usd(k.spentToday)} of ${usd(k.cap)} today`}</span>
              {editing === k.id ? (
                <span className="ml-auto flex items-center gap-2">
                  <input value={capEdit} onChange={(e) => setCapEdit(e.target.value)} inputMode="decimal" aria-label={`Daily cap for ${k.label}, USD`} className="h-7 w-20 rounded-md border border-[#3a2418] bg-[#140d0a] px-2 text-text" />
                  <button type="button" onClick={() => { void keyCall("PATCH", { id: k.id, cap: Number(capEdit) }); setEditing(null); }} className="text-[#ff9a5c] hover:text-text">
                    Save
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => { setEditing(k.id); setCapEdit(String(k.cap)); }} className="ml-auto text-[#a8907f] hover:text-text">
                  Change cap
                </button>
              )}
              <button type="button" onClick={() => void keyCall("DELETE", undefined, k.id)} className="text-[#a8907f] hover:text-flesh">
                Revoke
              </button>
            </li>
          ))}
        </ul>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-[#140d0a] p-3 font-mono text-[12px] text-[#d8c2b4]">{`curl https://corbel.finance/api/v1/chat/completions \\
  -H "Authorization: Bearer cm_…" -H "content-type: application/json" \\
  -d '{"model":"auto:price","messages":[{"role":"user","content":"Hello"}]}'

# model: any id from /api/v1/models, or auto:price, auto:speed, auto:quality`}</pre>
      </div>

      {((d.deposits?.length ?? 0) > 0 || (d.spends?.length ?? 0) > 0) && (
        <div className="mt-6">
          <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#a8907f]">History</p>
          <ul className="mt-2 divide-y divide-[#3a2418] font-mono text-[12.5px]">
            {[...(d.deposits ?? []).map((x) => ({ at: x.at, what: "Top-up", amt: x.usd, plus: true })), ...(d.spends ?? []).map((x) => ({ at: x.at, what: `${x.kind === "gpu" ? "GPU" : "Model"}${x.ref ? ` · ${x.ref}` : ""}`, amt: x.usd, plus: false }))]
              .sort((a, b) => b.at - a.at)
              .slice(0, 40)
              .map((x, i) => (
                <li key={i} className="flex justify-between gap-3 py-1.5">
                  <span className="text-[#a8907f]">{when(x.at)}</span>
                  <span className="min-w-0 flex-1 truncate text-text">{x.what}</span>
                  <span className={x.plus ? "text-leaf" : "text-[#d8c2b4]"}>{`${x.plus ? "+" : "−"}${usd(x.amt)}`}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </>,
  );
}
