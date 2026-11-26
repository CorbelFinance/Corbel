"use client";

/**
 * Agents · hire one: the visitor's own wallet makes a mandate for the chosen agent on the mandate factory (v5), sets a
 * cap per trade and per day for USDG, an end date, and sends the budget. Four signatures, nothing held by Corbel: the
 * money sits in the mandate, only its owner withdraws, and the contract refuses any trade outside the rules.
 */
import { useState } from "react";
import { decodeEventLog, encodeFunctionData, parseAbiItem, type Hex } from "viem";
import { EXPLORER, niceError, ready, send, type Provider } from "./walletTx";
import { useSession } from "./session";
import { MANDATES_V5 } from "@/lib/predict";

const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Hex;
const CREATED = parseAbiItem("event Created(address indexed mandate, address indexed owner, address indexed agent)");
const FACTORY = [
  {
    type: "function", name: "create", stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "rules", type: "tuple", components: [
        { name: "maxSlippageBps", type: "uint16" }, { name: "hourFrom", type: "uint8" }, { name: "hourTo", type: "uint8" }, { name: "weekdaysOnly", type: "bool" },
        { name: "cooldown", type: "uint32" }, { name: "minBond", type: "uint128" }, { name: "slashBps", type: "uint16" }, { name: "strikesToFreeze", type: "uint8" },
      ] },
    ],
    outputs: [{ type: "address" }],
  },
] as const;
const MANDATE = [
  { type: "function", name: "setLimit", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "bool" }, { type: "uint128" }, { type: "uint128" }], outputs: [] },
  { type: "function", name: "setEnd", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
] as const;
const TRANSFER = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
/** Safe defaults for a hired agent; the note under the form is written from these same numbers. */
const RULES = { maxSlippageBps: 100, hourFrom: 0, hourTo: 0, weekdaysOnly: false, cooldown: 600, minBond: 1_000_000n, slashBps: 2000, strikesToFreeze: 3 };
const u6 = (v: string) => BigInt(Math.round(Number(v.replace(/,/g, "")) * 1e6));

async function createdMandate(p: Provider, hash: string): Promise<Hex | null> {
  const r = (await p.request({ method: "eth_getTransactionReceipt", params: [hash] })) as { logs: { address: string; topics: Hex[]; data: Hex }[] } | null;
  for (const l of r?.logs ?? []) {
    if (l.address.toLowerCase() !== MANDATES_V5.factory.toLowerCase()) continue;
    try {
      const e = decodeEventLog({ abi: [CREATED], topics: l.topics as [Hex, ...Hex[]], data: l.data });
      return e.args.mandate as Hex;
    } catch {
      // another event of the factory
    }
  }
  return null;
}

export function AgentHire({ agent, onClose }: { agent: string; onClose: () => void }) {
  const auth = useSession();
  const [budget, setBudget] = useState("50");
  const [perTrade, setPerTrade] = useState("10");
  const [perDay, setPerDay] = useState("25");
  const [days, setDays] = useState("30");
  const [step, setStep] = useState(0);
  const [mandate, setMandate] = useState<Hex | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const bad = !(Number(perTrade) > 0 && Number(perDay) >= Number(perTrade) && Number(budget) > 0 && Number(days) >= 1 && Number(days) <= 90);

  async function next() {
    if (!auth.address) return setMsg({ ok: false, text: "Sign in with your wallet first: the mandate is made by your own wallet and belongs to it." });
    setBusy(true);
    setMsg(null);
    try {
      const p = await ready();
      const me = auth.address;
      if (step === 0) {
        const hash = await send(p, me, MANDATES_V5.factory, encodeFunctionData({ abi: FACTORY, functionName: "create", args: [agent as Hex, RULES] }), "Making the mandate");
        const m = await createdMandate(p, hash);
        if (!m) throw new Error("The mandate was made, but its address did not come back. Open the transaction to find it.");
        setMandate(m);
        setStep(1);
        setMsg({ ok: true, text: "Mandate made. Next: the caps.", tx: hash });
      } else if (step === 1 && mandate) {
        const hash = await send(p, me, mandate, encodeFunctionData({ abi: MANDATE, functionName: "setLimit", args: [USDG, true, u6(perTrade), u6(perDay)] }), "Setting the caps");
        setStep(2);
        setMsg({ ok: true, text: "Caps set. Next: the end date.", tx: hash });
      } else if (step === 2 && mandate) {
        const at = BigInt(Math.floor(Date.now() / 1000) + Math.round(Number(days)) * 86_400);
        const hash = await send(p, me, mandate, encodeFunctionData({ abi: MANDATE, functionName: "setEnd", args: [at] }), "Setting the end date");
        setStep(3);
        setMsg({ ok: true, text: "End date set. Last: the budget.", tx: hash });
      } else if (step === 3 && mandate) {
        const hash = await send(p, me, USDG, encodeFunctionData({ abi: TRANSFER, functionName: "transfer", args: [mandate, u6(budget)] }), "Sending the budget");
        setStep(4);
        setMsg({ ok: true, text: "Done. The agent can trade within your caps once it has posted its bond. Only you withdraw.", tx: hash });
      }
    } catch (e) {
      setMsg({ ok: false, text: niceError(e, "That step did not go through.") });
    } finally {
      setBusy(false);
    }
  }

  const steps = ["Make the mandate", "Set the caps", "Set the end date", "Send the budget", "Hired"];
  return (
    <div className="space-y-3 border-t border-line bg-[#101010] px-5 py-4">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-mono text-muted">{`Hire ${agent.slice(0, 6)}…${agent.slice(-4)}`}</span>
        {steps.map((s, i) => (
          <span key={s} className={i < step ? "text-leaf" : i === step ? "text-text" : "text-muted"}>{`${i + 1}. ${s}`}</span>
        ))}
        <button type="button" onClick={onClose} className="ml-auto text-muted hover:text-text">Close</button>
      </div>
      {step === 0 && (
        <div className="grid gap-2 sm:grid-cols-4">
          {[["Budget, USDG", budget, setBudget], ["Most per trade", perTrade, setPerTrade], ["Most per day", perDay, setPerDay], ["Days, up to 90", days, setDays]].map(([k, v, set]) => (
            <label key={k as string} className="block">
              <span className="text-[12px] text-muted">{k as string}</span>
              <input value={v as string} onChange={(e) => (set as (x: string) => void)(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="mt-1 h-10 w-full rounded-lg border border-[#2a2a2a] bg-[#0b0b0b] px-3 font-mono text-[14px] text-text outline-none" />
            </label>
          ))}
        </div>
      )}
      {step < 4 && (
        <button type="button" disabled={busy || (step === 0 && bad)} onClick={() => void next()} className="h-10 rounded-lg bg-leaf px-4 text-[13.5px] font-medium text-[#07130c] disabled:opacity-50">
          {busy ? "Waiting for your wallet…" : steps[step]}
        </button>
      )}
      {mandate && <p className="font-mono text-[12px] text-muted">{`Your mandate: ${mandate}`}</p>}
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
      <p className="text-[12px] text-muted">{`Defaults: ${RULES.maxSlippageBps / 100}% slippage, ${RULES.cooldown / 60} minutes between trades, a ${Number(RULES.minBond) / 1e6} USDG bond, ${RULES.slashBps / 100}% of the bond taken per broken rule, frozen after ${RULES.strikesToFreeze}. Not audited: start small.`}</p>
    </div>
  );
}
