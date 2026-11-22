"use client";

/**
 * A wallet per agent. The agent gets its own wallet, made here in your browser: its key is encrypted with a passphrase
 * you choose and kept in this browser (and in a backup file you download); it never goes to Corbel. Fund it from your
 * wallet, then make it your mandate's agent: the mandate's caps and bond decide what it may do with that money.
 */
import { useEffect, useState } from "react";
import { encodeFunctionData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { cx } from "@corbel/ui";
import { Instrument } from "./kit";
import { useSession } from "./session";
import { EXPLORER, niceError, ready, send, waitReceipt } from "./walletTx";

const KEY = "corbel.agentwallet.v1";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
type Stored = { address: string; salt: string; iv: string; ct: string; created: number };
const TRANSFER = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
const SET_AGENT = [{ type: "function", name: "setAgent", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] }] as const;

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function keyFrom(pass: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: 310_000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function seal(pk: string, pass: string, address: string): Promise<Stored> {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, await keyFrom(pass, salt), new TextEncoder().encode(pk));
  return { address, salt: b64(salt), iv: b64(iv), ct: b64(ct), created: Date.now() };
}
async function open(s: Stored, pass: string) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(s.iv) as BufferSource }, await keyFrom(pass, unb64(s.salt)), unb64(s.ct) as BufferSource);
  return new TextDecoder().decode(pt);
}
const load = (): Stored | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") as Stored | null;
  } catch {
    return null;
  }
};

export function AgentWallet() {
  const auth = useSession();
  const [w, setW] = useState<Stored | null>(null);
  const [pass, setPass] = useState("");
  const [bal, setBal] = useState<{ eth: number | null; usdg: number | null }>({ eth: null, usdg: null });
  const [fund, setFund] = useState("10");
  const [mandate, setMandate] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => setW(load()));
  }, []);
  useEffect(() => {
    if (!w) return;
    let off = false;
    const read = () =>
      // one read of the wallet: ETH and USDG side by side
      fetch(`/api/wallet?address=${w.address}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { balances?: { symbol: string; value: string }[] } | null) => {
          if (off || !j?.balances) return;
          const of = (s: string) => {
            const v = j.balances!.find((b) => b.symbol === s)?.value;
            return v != null ? Number(v) : null;
          };
          setBal({ eth: of("ETH"), usdg: of("USDG") });
        })
        .catch(() => undefined);
    void read();
    const t = setInterval(read, 30_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, [w]);

  async function create() {
    if (pass.length < 10) return setMsg({ ok: false, text: "Choose a passphrase of 10 characters or more. Without it the key can't be opened again." });
    const pk = generatePrivateKey();
    const acct = privateKeyToAccount(pk);
    const s = await seal(pk, pass, acct.address);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* kept only in the backup file */
    }
    setW(s);
    setPass("");
    setMsg({ ok: true, text: "Made. Download the backup now: lose this browser and the passphrase, and the wallet is gone." });
  }
  function backup() {
    if (!w) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ kind: "corbel-agent-wallet", ...w }, null, 1)], { type: "application/json" }));
    a.download = `agent-wallet-${w.address.slice(2, 8)}.json`;
    a.click();
  }
  async function reveal() {
    if (!w) return;
    try {
      setShown(await open(w, pass));
      setPass("");
    } catch {
      setMsg({ ok: false, text: "That passphrase does not open this wallet." });
    }
  }
  async function tx(kind: "fund" | "agent") {
    if (!w || !auth.address) return;
    setBusy(true);
    setMsg(null);
    try {
      const p = await ready();
      let hash: string;
      if (kind === "fund") {
        const a = Number(fund);
        if (!(a > 0)) throw new Error("Enter an amount above zero.");
        hash = await send(p, auth.address, USDG, encodeFunctionData({ abi: TRANSFER, functionName: "transfer", args: [w.address as `0x${string}`, BigInt(Math.round(a * 1e6))] }), "funding the agent");
      } else {
        if (!/^0x[0-9a-fA-F]{40}$/.test(mandate)) throw new Error("Paste your mandate's address (0x…).");
        hash = await send(p, auth.address, mandate, encodeFunctionData({ abi: SET_AGENT, functionName: "setAgent", args: [w.address as `0x${string}`] }), "setting the agent");
      }
      setMsg({ ok: true, text: kind === "fund" ? "Sent to the agent's wallet." : "Sent. Once confirmed, this wallet is your mandate's agent.", tx: hash });
      await waitReceipt(p, hash).catch(() => null);
    } catch (e) {
      setMsg({ ok: false, text: niceError(e, kind === "fund" ? "The transfer did not go through." : "Only the mandate's owner can set its agent.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Instrument code="G-12" title="A wallet for your agent" foot={<span>Made in this browser. The key is encrypted with your passphrase and never sent to Corbel; keep the backup file and the passphrase apart.</span>}>
      {!w ? (
        <div className="px-4 py-4">
          <p className="text-[14px] text-text">Give your agent its own wallet, so it never touches yours.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="A passphrase, 10+ characters" aria-label="Passphrase" autoComplete="new-password" className="h-10 w-72 rounded-lg border border-line bg-[#111] px-3 text-[13px] text-text placeholder:text-muted" />
            <button type="button" onClick={() => void create()} className="h-10 rounded-lg bg-leaf px-4 text-[13.5px] font-semibold text-[#06110b] hover:opacity-90">
              Make the wallet
            </button>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-line">
          <div className="flex flex-wrap items-center gap-3 px-4 py-4">
            <code className="break-all font-mono text-[13px] text-text">{w.address}</code>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(w.address)} className="rounded-full border border-line px-3 py-1 text-[12px] text-muted hover:text-text">
              Copy
            </button>
            <button type="button" onClick={backup} className="rounded-full border border-line px-3 py-1 text-[12px] text-muted hover:text-text">
              Download backup
            </button>
            <span className="ml-auto font-mono text-[12.5px] text-muted">{`${bal.usdg != null ? bal.usdg.toFixed(2) : "…"} USDG · ${bal.eth != null ? bal.eth.toFixed(5) : "…"} ETH`}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="text-[13px] text-muted">Fund it from your wallet</span>
            <input value={fund} onChange={(e) => setFund(e.target.value)} inputMode="decimal" aria-label="USDG to send to the agent" className="h-9 w-24 rounded-lg border border-line bg-[#111] px-3 font-mono text-[13px] text-text" />
            <button type="button" disabled={busy || !auth.address} onClick={() => void tx("fund")} className="h-9 rounded-full border border-leaf/60 px-4 text-[13px] text-text hover:bg-leaf/10 disabled:opacity-40">
              {`Send ${fund || 0} USDG`}
            </button>
            <span className="text-[12px] text-muted">It also needs a little ETH for gas.</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="text-[13px] text-muted">Make it your mandate&apos;s agent</span>
            <input value={mandate} onChange={(e) => setMandate(e.target.value)} placeholder="Mandate address 0x…" aria-label="Mandate address" spellCheck={false} className="h-9 w-80 rounded-lg border border-line bg-[#111] px-3 font-mono text-[13px] text-text placeholder:text-muted" />
            <button type="button" disabled={busy || !auth.address} onClick={() => void tx("agent")} className="h-9 rounded-full border border-leaf/60 px-4 text-[13px] text-text hover:bg-leaf/10 disabled:opacity-40">
              Set as agent
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="text-[13px] text-muted">Open the key to import it into a wallet app</span>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passphrase" aria-label="Passphrase to open the key" autoComplete="current-password" className="h-9 w-52 rounded-lg border border-line bg-[#111] px-3 text-[13px] text-text" />
            <button type="button" onClick={() => void reveal()} className="h-9 rounded-full border border-line px-4 text-[13px] text-muted hover:text-text">
              Show key
            </button>
          </div>
          {shown && (
            <div className="px-4 py-3">
              <p className="text-[12.5px] text-flesh">Anyone who sees this key controls the agent&apos;s wallet.</p>
              <code className="mt-1 block break-all font-mono text-[12.5px] text-text">{shown}</code>
              <button type="button" onClick={() => setShown(null)} className="mt-2 rounded-full border border-line px-3 py-1 text-[12px] text-muted hover:text-text">
                Hide
              </button>
            </div>
          )}
        </div>
      )}
      {msg && (
        <p className={cx("border-t border-line px-4 py-3 text-[13px]", msg.ok ? "text-leaf" : "text-flesh")}>
          {msg.text}{" "}
          {msg.tx && (
            <a href={EXPLORER + msg.tx} target="_blank" rel="noreferrer" className="underline">
              View the transaction
            </a>
          )}
        </p>
      )}
    </Instrument>
  );
}
