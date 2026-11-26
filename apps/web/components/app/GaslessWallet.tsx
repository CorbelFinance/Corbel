"use client";

/**
 * Trade · swap without ETH, from your own wallet: sell USDG for WETH with an empty ETH balance. Your wallet signs two
 * messages (a USDG permit for exactly the amount, and the swap: path, floor, relayer fee, deadline); the relayer sends
 * them and pays the gas, and the contract pays it the signed fee. Nothing here can change the path, floor or fee.
 */
import { useEffect, useState } from "react";
import { decodeFunctionResult, encodeFunctionData, encodePacked, formatUnits, keccak256, parseUnits, type Hex } from "viem";
import { call, niceError, ready, EXPLORER } from "./walletTx";
import { useSession } from "./session";

const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Hex;
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73" as Hex;
const ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba" as Hex;
const QUOTE = [{ type: "function", name: "getAmountsOut", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address[]" }], outputs: [{ type: "uint256[]" }] }] as const;
const NONCES = [{ type: "function", name: "nonces", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;
type Cfg = { mode: "live" | "off"; contract?: Hex; minFee?: string | null; relayer?: boolean; error?: string };

export function GaslessWallet() {
  const auth = useSession();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [amt, setAmt] = useState("5");
  const [quote, setQuote] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  useEffect(() => {
    fetch("/api/gasless/relay", { cache: "no-store" }).then((r) => r.json()).then(setCfg).catch(() => setCfg({ mode: "off", error: "Not answering." }));
  }, []);
  const fee = cfg?.minFee ? BigInt(cfg.minFee) : 0n;
  const amountIn = (() => {
    try {
      return parseUnits(amt || "0", 6);
    } catch {
      return 0n;
    }
  })();

  async function go() {
    if (!auth.address || !cfg?.contract) return setMsg({ ok: false, text: "Sign in with your wallet first." });
    setBusy(true);
    setMsg(null);
    try {
      const p = await ready();
      const me = auth.address as Hex;
      const path = [USDG, WETH] as Hex[];
      // the quote and the floor come from the pool through your wallet's own connection, at this moment
      const q = decodeFunctionResult({ abi: QUOTE, functionName: "getAmountsOut", data: await call(p, ROUTER, encodeFunctionData({ abi: QUOTE, functionName: "getAmountsOut", args: [amountIn - fee, path] })) }) as readonly bigint[];
      const minOut = (q[1]! * 99n) / 100n;
      setQuote(q[1]!);
      const nonce = decodeFunctionResult({ abi: NONCES, functionName: "nonces", data: await call(p, USDG, encodeFunctionData({ abi: NONCES, functionName: "nonces", args: [me] })) }) as bigint;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      const intentNonce = BigInt(Date.now());
      const pathHash = keccak256(encodePacked(["address[]"], [path]));
      const intent = { owner: me, tokenIn: USDG, amountIn, pathHash, minOut, fee, deadline, nonce: intentNonce };
      const typed = (domain: object, types: object, primaryType: string, message: object) =>
        JSON.stringify({ domain, types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], ...types }, primaryType, message }, (_, v) => (typeof v === "bigint" ? v.toString() : v));
      const permitSig = (await p.request({
        method: "eth_signTypedData_v4",
        params: [me, typed({ name: "Global Dollar", version: "1", chainId: 4663, verifyingContract: USDG }, { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] }, "Permit", { owner: me, spender: cfg.contract, value: amountIn, nonce, deadline })],
      })) as Hex;
      const intentSig = (await p.request({
        method: "eth_signTypedData_v4",
        params: [me, typed({ name: "Corbel gasless", version: "1", chainId: 4663, verifyingContract: cfg.contract }, { Intent: [{ name: "owner", type: "address" }, { name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "pathHash", type: "bytes32" }, { name: "minOut", type: "uint256" }, { name: "fee", type: "uint256" }, { name: "deadline", type: "uint256" }, { name: "nonce", type: "uint256" }] }, "Intent", intent)],
      })) as Hex;
      const split = (s: Hex) => ({ r: `0x${s.slice(2, 66)}`, s: `0x${s.slice(66, 130)}`, v: parseInt(s.slice(130, 132), 16) < 27 ? parseInt(s.slice(130, 132), 16) + 27 : parseInt(s.slice(130, 132), 16) });
      const a = split(intentSig), b = split(permitSig);
      const body = JSON.stringify({ intent: { ...intent, amountIn: amountIn.toString(), minOut: minOut.toString(), fee: fee.toString(), deadline: deadline.toString(), nonce: intentNonce.toString() }, path, v: a.v, r: a.r, s: a.s, pv: b.v, pr: b.r, ps: b.s });
      const r = await fetch("/api/gasless/relay", { method: "POST", headers: { "content-type": "application/json" }, body });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; tx?: string; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "The relayer refused it.");
      setMsg({ ok: true, text: `Swapped with no ETH. At least ${formatUnits(minOut, 18)} WETH reached your wallet; the relayer took ${formatUnits(fee, 6)} USDG.`, tx: j.tx });
    } catch (e) {
      setMsg({ ok: false, text: niceError(e, "The swap did not go through.") });
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <div className="h-40 animate-pulse rounded-lg bg-[#161616]" />;
  if (cfg.mode !== "live") return null;
  return (
    <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#141414]">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <span className="text-[14px] font-semibold text-text">Swap without ETH</span>
        <span className={`rounded-md px-2 py-0.5 text-[12px] ${cfg.relayer ? "bg-leaf/15 text-leaf" : "bg-[#1f1f1f] text-muted"}`}>{cfg.relayer ? "Relayer online" : "Relayer offline"}</span>
      </header>
      <div className="space-y-3 p-4">
        <label className="block">
          <span className="text-[12px] text-muted">Sell USDG for WETH</span>
          <span className="mt-1 flex h-11 items-center rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3">
            <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="w-full bg-transparent font-mono text-[16px] text-text outline-none" />
            <span className="font-mono text-[12px] text-muted">USDG</span>
          </span>
        </label>
        <p className="text-[12.5px] text-muted">{`Relayer fee ${formatUnits(fee, 6)} USDG, taken from the amount. Floor: 1% under the pool's quote at the moment you sign.${quote ? ` Last quote ${formatUnits(quote, 18)} WETH.` : ""}`}</p>
        <button type="button" disabled={busy || !cfg.relayer || !(amountIn > fee)} onClick={() => void go()} className="h-11 w-full rounded-lg bg-leaf font-medium text-[14px] text-[#07130c] disabled:opacity-50">
          {busy ? "Sign the two messages in your wallet…" : !auth.address ? "Sign in to swap" : "Sign and swap, no ETH needed"}
        </button>
        {msg && (
          <p className={`text-[12.5px] ${msg.ok ? "text-[#c9ccca]" : "text-flesh"}`}>
            {msg.text}{" "}
            {msg.tx && (
              <a href={EXPLORER + msg.tx} target="_blank" rel="noreferrer noopener" className="text-muted hover:text-text">
                View ↗
              </a>
            )}
          </p>
        )}
        <p className="text-[12px] text-muted">Two signatures, no transaction from you. The relayer cannot change the path, the floor or the fee: they are signed. Not audited: start small.</p>
      </div>
    </section>
  );
}
