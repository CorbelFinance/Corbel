"use client";

/**
 * Trade · orders on the chain, from your own wallet (CorbelOrders): limit, DCA or TWAP between WETH and USDG. The input
 * waits in the contract until a slice is due and the pool pays your floor; a keeper fills it and takes a small tip from
 * that slice, the output goes straight to you, and you can cancel any time for what is left.
 */
import { useCallback, useEffect, useState } from "react";
import { decodeFunctionResult, encodeFunctionData, formatUnits, parseUnits, type Hex } from "viem";
import { cx } from "@corbel/ui";
import { approveIfNeeded, call, EXPLORER, niceError, ready, send } from "./walletTx";
import { useSession } from "./session";

const T = { WETH: { a: "0x0bd7d308f8e1639fab988df18a8011f41eacad73" as Hex, d: 18 }, USDG: { a: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Hex, d: 6 } };
type Sym = keyof typeof T;
const ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba" as Hex;
const QUOTE = [{ type: "function", name: "getAmountsOut", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address[]" }], outputs: [{ type: "uint256[]" }] }] as const;
const ABI = [
  { type: "function", name: "place", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint96" }, { type: "uint128" }, { type: "uint128" }, { type: "uint32" }, { type: "uint32" }, { type: "uint16" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
] as const;
type O = { id: number; tokenIn: string; tokenOut: string; fillsLeft: number; fills: number; perFill: string; floor: string; interval: number; nextAt: number; tx: string };
type Cfg = { mode: "live" | "off"; contract?: Hex; tipBps?: number; orders?: O[]; error?: string };
const KINDS = { limit: { fills: 1, every: 0, label: "Limit" }, dca: { fills: 7, every: 86_400, label: "DCA, daily" }, twap: { fills: 6, every: 600, label: "TWAP, 10 min" } } as const;
type Kind = keyof typeof KINDS;

export function OrdersWallet() {
  const auth = useSession();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [mine, setMine] = useState<O[]>([]);
  const [sell, setSell] = useState<Sym>("USDG");
  const [kind, setKind] = useState<Kind>("limit");
  const [amount, setAmount] = useState("10");
  const [premium, setPremium] = useState("2");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const buy: Sym = sell === "USDG" ? "WETH" : "USDG";
  const load = useCallback(async () => {
    const base = (await fetch("/api/orders/mine", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ mode: "off" }))) as Cfg;
    setCfg(base);
    if (base.mode === "live" && auth.address) {
      const m = (await fetch(`/api/orders/mine?owner=${auth.address}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null)) as Cfg | null;
      setMine(m?.orders ?? []);
    }
  }, [auth.address]);
  useEffect(() => void load(), [load]);

  async function place() {
    if (!auth.address || !cfg?.contract) return setMsg({ ok: false, text: "Sign in with your wallet first." });
    setBusy(true);
    setMsg(null);
    try {
      const k = KINDS[kind];
      const total = parseUnits(amount || "0", T[sell].d);
      if (!(total > 0n)) throw new Error("Enter an amount above zero.");
      const per = total / BigInt(k.fills);
      const p = await ready();
      const me = auth.address as Hex;
      const tip = BigInt(cfg.tipBps ?? 0);
      const net = per - (per * tip) / 10_000n;
      // the floor: what the pool pays now for one slice, plus the premium you ask (a limit above the market)
      const q = decodeFunctionResult({ abi: QUOTE, functionName: "getAmountsOut", data: await call(p, ROUTER, encodeFunctionData({ abi: QUOTE, functionName: "getAmountsOut", args: [net, [T[sell].a, T[buy].a]] })) }) as readonly bigint[];
      const prem = BigInt(Math.round(Number(premium || "0") * 100));
      const floor = (q[1]! * (10_000n + prem)) / 10_000n;
      await approveIfNeeded(p, me, T[sell].a, cfg.contract, per * BigInt(k.fills));
      const tx = await send(p, me, cfg.contract, encodeFunctionData({ abi: ABI, functionName: "place", args: [T[sell].a, T[buy].a, BigInt(k.fills), per, floor, k.every, 0, Number(tip)] }), "Placing the order");
      setMsg({ ok: true, text: `Placed: ${k.fills} slice${k.fills > 1 ? "s" : ""} of ${formatUnits(per, T[sell].d)} ${sell}, each only at ${formatUnits(floor, T[buy].d)} ${buy} or more.`, tx });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: niceError(e, "The order did not go through.") });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: number) {
    if (!auth.address || !cfg?.contract) return;
    setBusy(true);
    try {
      const p = await ready();
      const tx = await send(p, auth.address, cfg.contract, encodeFunctionData({ abi: ABI, functionName: "cancel", args: [BigInt(id)] }), "Cancelling");
      setMsg({ ok: true, text: `Order ${id} cancelled; what was left is back in your wallet.`, tx });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: niceError(e, "Only the order's owner can cancel it.") });
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <div className="h-40 animate-pulse rounded-lg bg-[#161616]" />;
  if (cfg.mode !== "live") return null;
  return (
    <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#141414]">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <span className="text-[14px] font-semibold text-text">Orders on the chain</span>
        <span className="font-mono text-[12px] text-muted">{`keeper tip ${(cfg.tipBps ?? 0) / 100}% of each slice`}</span>
      </header>
      <div className="grid gap-px bg-[#242424] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-3 bg-[#141414] p-4">
          <div className="flex gap-1">
            {(Object.keys(KINDS) as Kind[]).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cx("h-8 rounded-md border px-3 text-[12.5px]", kind === k ? "border-leaf text-text" : "border-line text-muted")}>
                {KINDS[k].label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(["USDG", "WETH"] as Sym[]).map((s) => (
              <button key={s} type="button" onClick={() => setSell(s)} className={cx("h-8 rounded-md border px-3 font-mono text-[12.5px]", sell === s ? "border-leaf text-text" : "border-line text-muted")}>
                {`Sell ${s}`}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-[12px] text-muted">{`Total ${sell}`}</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="mt-1 h-10 w-full rounded-lg border border-[#2a2a2a] bg-[#0b0b0b] px-3 font-mono text-[14px] text-text outline-none" />
          </label>
          <label className="block">
            <span className="text-[12px] text-muted">{`Fill only when the pool pays at least this much more than now, %`}</span>
            <input value={premium} onChange={(e) => setPremium(e.target.value.replace(/[^0-9.-]/g, ""))} inputMode="decimal" className="mt-1 h-10 w-full rounded-lg border border-[#2a2a2a] bg-[#0b0b0b] px-3 font-mono text-[14px] text-text outline-none" />
          </label>
          <button type="button" disabled={busy} onClick={() => void place()} className="h-11 w-full rounded-lg bg-leaf text-[14px] font-medium text-[#07130c] disabled:opacity-50">
            {busy ? "Waiting for your wallet…" : !auth.address ? "Sign in to place an order" : `Place: sell ${amount || 0} ${sell} for ${buy}`}
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
        </div>
        <ul className="max-h-[26rem] divide-y divide-line/60 overflow-y-auto bg-[#141414]">
          {mine.length === 0 && <li className="px-4 py-6 text-[13px] text-muted">{auth.address ? "No orders from this wallet yet." : "Sign in to see your orders."}</li>}
          {mine.map((o) => (
            <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="min-w-0">
                <span className="block text-text">{`#${o.id} · ${o.fills > 1 ? `${o.fills - o.fillsLeft} of ${o.fills} slices` : "limit"} · ${o.perFill} ${o.tokenIn} → ${o.tokenOut}`}</span>
                <span className="block font-mono text-[11.5px] text-muted">{`floor ${o.floor} ${o.tokenOut}${o.fillsLeft ? ` · next from ${new Date(o.nextAt * 1000).toISOString().slice(5, 16).replace("T", " ")} UTC` : " · done"}`}</span>
              </span>
              {o.fillsLeft > 0 && (
                <button type="button" disabled={busy} onClick={() => void cancel(o.id)} className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:text-flesh">
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-[12px] text-muted">Your input waits in the contract; only a fill at your floor or better can move it, and only you can take it back. Not audited: start small.</p>
    </section>
  );
}
