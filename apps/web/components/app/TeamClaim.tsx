"use client";

/**
 * Token check · "Said by the team": a token's creator claimed this page by burning $CORBEL, and added links, team
 * wallets and a note. Shown next to the burn that paid for it, never mixed into the checks. The creator's own wallet
 * also sees the form here: burn with the token's burn(), then save.
 */
import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData } from "viem";
import { useSession } from "../app/session";
import { niceError, ready, send, waitReceipt, EXPLORER } from "../app/walletTx";
import { short } from "./kit";

type Claim = { wallet: string; tx: string; coins: number; website: string | null; x: string | null; telegram: string | null; team: string[]; note: string | null; at: number };
type R = { open: boolean; claim: Claim | null; price: { usd: number; coins: number } | null; mine: boolean };
const CORBEL = "0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1";
const BURN = [{ type: "function", name: "burn", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] }] as const;
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export function TeamClaim({ token }: { token: string }) {
  const auth = useSession();
  const [r, setR] = useState<R | null>(null);
  const [f, setF] = useState({ website: "", x: "", telegram: "", team: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(
    () =>
      fetch(`/api/claim?token=${token}`, { cache: "no-store" })
        .then((x) => x.json())
        .then((j: R) => {
          setR(j);
          if (j.claim) setF({ website: j.claim.website ?? "", x: j.claim.x ?? "", telegram: j.claim.telegram ?? "", team: j.claim.team.join("\n"), note: j.claim.note ?? "" });
        })
        .catch(() => null),
    [token],
  );
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load, auth.address]);

  async function save(tx: string | null) {
    const res = await fetch("/api/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, tx, website: f.website, x: f.x, telegram: f.telegram, team: f.team.split(/[\s,]+/).filter(Boolean), note: f.note }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (j.error) throw new Error(j.error);
  }

  async function claim() {
    if (!auth.address || !r?.price) return;
    setBusy(true);
    setMsg(null);
    try {
      let tx: string | null = null;
      if (!r.claim) {
        if (!window.confirm(`Burn ${n0(r.price.coins)} $CORBEL to claim this page? The coins are destroyed for good.`)) return;
        const p = await ready();
        const data = encodeFunctionData({ abi: BURN, functionName: "burn", args: [BigInt(r.price.coins) * 10n ** 18n] });
        tx = await send(p, auth.address, CORBEL, data, "claim burn");
        await waitReceipt(p, tx);
      }
      await save(tx);
      setMsg({ ok: true, text: r.claim ? "Saved." : "Claimed. The page now shows what you added, marked as said by the team." });
      setEditing(false);
      void load();
    } catch (e) {
      setMsg({ ok: false, text: niceError(e, "That did not go through.") });
    } finally {
      setBusy(false);
    }
  }

  if (!r || (!r.claim && !(r.open && r.mine))) return null;
  const c = r.claim;
  const showForm = r.mine && r.open && (!c || editing);
  return (
    <section className="mt-6 rounded-2xl border border-[#2c4a39] bg-[#08100c] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-leaf">Said by the team</p>
        {c && (
          <a href={EXPLORER + c.tx} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-[#a9c9b6] underline-offset-4 hover:underline">
            {`Claimed by the creator ${short(c.wallet)} · ${n0(c.coins)} $CORBEL burned`}
          </a>
        )}
      </div>
      <p className="mt-1 text-[12.5px] text-[#a9c9b6]">The team wrote this, not Corbel. It changes no check and no score.</p>
      {c && !showForm && (
        <div className="mt-3 grid gap-3 text-[14px] sm:grid-cols-2">
          <ul className="space-y-1">
            {c.website && (
              <li>
                <a href={c.website} target="_blank" rel="noreferrer nofollow" className="text-leaf underline-offset-4 hover:underline">{c.website.replace(/^https:\/\//, "")}</a>
              </li>
            )}
            {c.x && <li><a href={`https://x.com/${c.x}`} target="_blank" rel="noreferrer nofollow" className="text-leaf underline-offset-4 hover:underline">@{c.x}</a></li>}
            {c.telegram && <li><a href={`https://t.me/${c.telegram}`} target="_blank" rel="noreferrer nofollow" className="text-leaf underline-offset-4 hover:underline">t.me/{c.telegram}</a></li>}
            {c.note && <li className="text-muted">{c.note}</li>}
          </ul>
          {c.team.length > 0 && (
            <div>
              <p className="font-mono text-[12px] text-[#8fb5a0]">Team wallets, as the team says</p>
              <ul className="mt-1 space-y-1 font-mono text-[13px]">
                {c.team.map((a) => (
                  <li key={a}>
                    <a href={`/app/trust/address?a=${a}`} className="text-text underline-offset-4 hover:underline">{short(a)}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.mine && r.open && (
            <button type="button" onClick={() => setEditing(true)} className="h-9 w-fit rounded-full border border-leaf px-4 text-[13px] text-leaf">
              Edit
            </button>
          )}
        </div>
      )}
      {showForm && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(["website", "x", "telegram"] as const).map((k) => (
            <input key={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={{ website: "https://your.site", x: "@yourproject", telegram: "t.me/yourgroup" }[k]} aria-label={k} className="h-10 rounded-lg border border-[#1f3a2c] bg-[#0b140f] px-3 text-[14px] text-text" />
          ))}
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={200} placeholder="One line about the project" aria-label="Note" className="h-10 rounded-lg border border-[#1f3a2c] bg-[#0b140f] px-3 text-[14px] text-text" />
          <textarea value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} placeholder="Team wallets, one per line (up to 5)" aria-label="Team wallets" rows={3} className="rounded-lg border border-[#1f3a2c] bg-[#0b140f] p-3 font-mono text-[13px] text-text sm:col-span-2" />
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="button" disabled={busy} onClick={() => void claim()} className="h-10 rounded-full bg-leaf px-5 text-[13.5px] font-semibold text-[#04120a] disabled:opacity-50">
              {busy ? "Working…" : c ? "Save" : `Burn ${r.price ? n0(r.price.coins) : "…"} $CORBEL and claim`}
            </button>
            {!c && r.price && <span className="text-[12.5px] text-[#a9c9b6]">{`About $${r.price.usd} at the lower of the pool price and its 30-minute average. Paid once.`}</span>}
          </div>
        </div>
      )}
      {msg && <p className={msg.ok ? "mt-3 text-[13px] text-leaf" : "mt-3 text-[13px] text-flesh"}>{msg.text}</p>}
    </section>
  );
}
