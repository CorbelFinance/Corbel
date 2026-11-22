"use client";

/**
 * Earn · put money into a pool, and take it out. One coin in (ETH for a WETH pool, USDG for a USDG pool): half is
 * swapped for the pool's token, then both halves go into the pool through the Uniswap V2 router, from your own wallet.
 * Your position (LP tokens) is read from the pair; Withdraw returns both sides to your wallet. Corbel holds nothing
 * and adds no fee. Each step is a transaction you confirm; minimums protect each one by 1%.
 *
 * Before the first step the token check runs on the pool's token; red flags must be read and confirmed. The estimate
 * uses the pool's own last 30 days (not a promise), and a price-move slider shows the pool against simply holding,
 * which is the main risk of providing liquidity. Every finished step leaves a receipt with its block.
 */
import { useCallback, useEffect, useState } from "react";
import { decodeFunctionResult, encodeFunctionData, formatUnits, parseUnits, type Hex } from "viem";
import { cx } from "@corbel/ui";
import { useLinked } from "./wallet";
import { ERC20, EXPLORER, approveIfNeeded, call, niceError, ready, send, waitReceipt, type Provider } from "./walletTx";

const ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const SLIP = 0.01;

const R = [
  { type: "function", name: "swapExactETHForTokensSupportingFeeOnTransferTokens", stateMutability: "payable", inputs: [{ type: "uint256" }, { type: "address[]" }, { type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "swapExactTokensForTokensSupportingFeeOnTransferTokens", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "address[]" }, { type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "addLiquidityETH", stateMutability: "payable", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "addLiquidity", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "removeLiquidityETHSupportingFeeOnTransferTokens", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "removeLiquidity", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "getAmountsOut", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address[]" }], outputs: [{ type: "uint256[]" }] },
] as const;
const PAIR = [
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const dl = () => BigInt(Math.floor(Date.now() / 1000) + 1200);
const pct = (v: bigint, keep: number) => (v * BigInt(Math.round(keep * 10_000))) / 10_000n;
async function sendValue(p: Provider, from: string, to: string, data: Hex, value: bigint, what: string) {
  const hash = (await p.request({ method: "eth_sendTransaction", params: [{ from, to, data, value: `0x${value.toString(16)}` }] })) as string;
  if (!(await waitReceipt(p, hash))) throw new Error(`${what} reverted.`);
  return hash;
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A step right after an approval can reach a node that has not seen it yet: wait, and try once more on a revert. */
async function twice<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (/reject|denied|cancel/i.test(String((e as Error).message))) throw e;
    await pause(4000);
    return f();
  }
}
/** The block a transaction landed in, for the receipt. */
async function blockOf(p: Provider, hash: string): Promise<number | null> {
  try {
    const r = (await p.request({ method: "eth_getTransactionReceipt", params: [hash] })) as { blockNumber?: string } | null;
    return r?.blockNumber ? Number(r.blockNumber) : null;
  } catch {
    return null;
  }
}
/** Value of a 50/50 V2 position against holding the same two halves, when the token's price moves by `move` (0.2 = +20%). */
export function poolVsHold(usd: number, move: number) {
  const r = Math.max(0.0001, 1 + move);
  const hold = (usd / 2) * r + usd / 2;
  const pool = usd * Math.sqrt(r);
  return { hold, pool, diff: pool - hold };
}
type Check = { checks?: { name: string; result: string }[]; error?: string };
const bal = async (p: Provider, token: string, who: string) => BigInt(await call(p, token, encodeFunctionData({ abi: ERC20, functionName: "balanceOf", args: [who as Hex] })));

export function EarnDeposit({ pair, token, symbol, base, apr }: { pair: string; token: string; symbol: string; base: string; apr: number }) {
  const { linked } = useLinked();
  const me = linked?.via === "wallet" ? linked : null;
  const isEth = base.toLowerCase() === WETH;
  const pay = isEth ? "ETH" : "USDG";
  const dec = isEth ? 18 : 6;
  const [amt, setAmt] = useState(isEth ? "0.01" : "10");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string; block?: number | null } | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [okFlags, setOkFlags] = useState(false);
  const [move, setMove] = useState(0);
  const [days, setDays] = useState(30);
  const [pos, setPos] = useState<{ lp: bigint; share: number; baseSide: number } | null>(null);
  const [price, setPrice] = useState<number | null>(null); // dollars per unit of the coin paid

  const readPos = useCallback(async () => {
    if (!me) return setPos(null);
    try {
      const p = await ready(me.rdns);
      const [lp, ts, rs, t0] = await Promise.all([
        bal(p, pair, me.address),
        call(p, pair, encodeFunctionData({ abi: PAIR, functionName: "totalSupply" })).then((x) => decodeFunctionResult({ abi: PAIR, functionName: "totalSupply", data: x })),
        call(p, pair, encodeFunctionData({ abi: PAIR, functionName: "getReserves" })).then((x) => decodeFunctionResult({ abi: PAIR, functionName: "getReserves", data: x })),
        call(p, pair, encodeFunctionData({ abi: PAIR, functionName: "token0" })).then((x) => decodeFunctionResult({ abi: PAIR, functionName: "token0", data: x })),
      ]);
      const baseRes = t0.toLowerCase() === base.toLowerCase() ? rs[0] : rs[1];
      const share = ts > 0n ? Number((lp * 1_000_000n) / ts) / 1_000_000 : 0;
      setPos({ lp, share, baseSide: Number(formatUnits(baseRes, dec)) * share });
    } catch {
      setPos(null);
    }
  }, [me, pair, base, dec]);
  useEffect(() => {
    void Promise.resolve().then(readPos);
  }, [readPos]);
  useEffect(() => {
    let off = false;
    if (!isEth) return void Promise.resolve().then(() => setPrice(1));
    fetch(`/api/quote?from=ETH&to=USDG&amount=1`)
      .then((r) => r.json())
      .then((j: { routes?: { amountOut: string | null }[]; best?: number | null }) => {
        const o = j.best != null ? j.routes?.[j.best]?.amountOut : null;
        if (!off && o) setPrice(Number(o) / 1e6);
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [isEth]);

  // the token check on the pool's token, before anything is signed
  useEffect(() => {
    let off = false;
    fetch(`/api/token?q=${token}`)
      .then((r) => r.json())
      .then((j: Check) => !off && setCheck(j))
      .catch(() => !off && setCheck({ error: "The check did not answer." }));
    return () => {
      off = true;
    };
  }, [token]);
  const fails = check?.checks?.filter((c) => c.result === "fail") ?? [];

  const usdIn = (Number(amt) || 0) * (price ?? 0);
  const perDay = (usdIn * apr) / 365;
  const pv = poolVsHold(usdIn, move);
  const fees = perDay * days;

  const deposit = async () => {
    if (!me) return setMsg({ ok: false, text: "Connect a wallet first (top right)." });
    if (fails.length && !okFlags) return setMsg({ ok: false, text: `The check found ${fails.length} red flag${fails.length > 1 ? "s" : ""} on ${symbol}. Read them and tick the box to go on.` });
    setMsg(null);
    try {
      const total = parseUnits(amt || "0", dec);
      if (total <= 0n) throw new Error("Type an amount above zero.");
      const p = await ready(me.rdns);
      const half = total / 2n, rest = total - half;
      const path = [base as Hex, token as Hex];
      const quoted = decodeFunctionResult({ abi: R, functionName: "getAmountsOut", data: await call(p, ROUTER, encodeFunctionData({ abi: R, functionName: "getAmountsOut", args: [half, path] })) });
      const minOut = pct(quoted[quoted.length - 1]!, 1 - SLIP);
      const before = await bal(p, token, me.address);
      setBusy(`1 of ${isEth ? 3 : 4} · buying ${symbol} with half`);
      if (isEth) await sendValue(p, me.address, ROUTER, encodeFunctionData({ abi: R, functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens", args: [minOut, path, me.address as Hex, dl()] }), half, "The swap");
      else {
        if (await approveIfNeeded(p, me.address, base, ROUTER, total)) await pause(2500);
        setBusy(`2 of 4 · buying ${symbol} with half`);
        await send(p, me.address, ROUTER, encodeFunctionData({ abi: R, functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens", args: [half, minOut, path, me.address as Hex, dl()] }), "The swap");
      }
      const got = (await bal(p, token, me.address)) - before;
      if (got <= 0n) throw new Error(`No ${symbol} arrived from the swap.`);
      setBusy(`${isEth ? 2 : 3} of ${isEth ? 3 : 4} · allowing the router to add ${symbol}`);
      if (await approveIfNeeded(p, me.address, token, ROUTER, got)) await pause(2500);
      setBusy(`${isEth ? 3 : 4} of ${isEth ? 3 : 4} · adding both sides to the pool`);
      const tx = await twice(() => isEth
        ? sendValue(p, me.address, ROUTER, encodeFunctionData({ abi: R, functionName: "addLiquidityETH", args: [token as Hex, got, pct(got, 0.97), pct(rest, 0.97), me.address as Hex, dl()] }), rest, "Adding liquidity")
        : send(p, me.address, ROUTER, encodeFunctionData({ abi: R, functionName: "addLiquidity", args: [token as Hex, base as Hex, got, rest, pct(got, 0.97), pct(rest, 0.97), me.address as Hex, dl()] }), "Adding liquidity"));
      setMsg({ ok: true, text: `In the pool. Your share now earns 0.3% of every swap in ${symbol}/${pay === "ETH" ? "WETH" : "USDG"}.`, tx, block: await blockOf(p, tx) });
      await readPos();
    } catch (e) {
      setMsg({ ok: false, text: `${niceError(e, "The deposit did not go through.")} Anything already swapped stays in your wallet.` });
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async () => {
    if (!me || !pos || pos.lp <= 0n) return;
    setMsg(null);
    try {
      const p = await ready(me.rdns);
      setBusy("1 of 2 · allowing the router to take your pool tokens");
      if (await approveIfNeeded(p, me.address, pair, ROUTER, pos.lp)) await pause(2500);
      setBusy("2 of 2 · taking both sides out of the pool");
      const tx = await twice(() => isEth
        ? send(p, me.address, ROUTER, encodeFunctionData({ abi: R, functionName: "removeLiquidityETHSupportingFeeOnTransferTokens", args: [token as Hex, pos.lp, 0n, 0n, me.address as Hex, dl()] }), "The withdrawal")
        : send(p, me.address, ROUTER, encodeFunctionData({ abi: R, functionName: "removeLiquidity", args: [token as Hex, base as Hex, pos.lp, 0n, 0n, me.address as Hex, dl()] }), "The withdrawal"));
      setMsg({ ok: true, text: `Withdrawn: ${symbol} and ${pay} are back in your wallet.`, tx, block: await blockOf(p, tx) });
      await readPos();
    } catch (e) {
      setMsg({ ok: false, text: niceError(e, "The withdrawal did not go through.") });
    } finally {
      setBusy(null);
    }
  };

  const quick = isEth ? ["0.005", "0.01", "0.05", "0.1"] : ["5", "10", "50", "100"];
  return (
    <div className="space-y-3">
      <label className="block rounded-2xl border border-line bg-[#090909] p-3.5 focus-within:border-ui/60">
        <span className="flex justify-between text-[12px] text-muted">
          You put in
          <span className="font-mono">{usdIn ? `≈ $${usdIn.toLocaleString("en", { maximumFractionDigits: 2 })}` : ""}</span>
        </span>
        <span className="mt-1.5 flex items-center gap-3">
          <span className="rounded-full bg-[#1f1f1f] px-3 py-1 font-mono text-[13px] text-text">{pay}</span>
          <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" aria-label={`Amount in ${pay}`} className="min-w-0 flex-1 bg-transparent text-right font-display text-[28px] tabular-nums text-text outline-none" />
        </span>
      </label>
      <div className="flex gap-1.5">
        {quick.map((v) => (
          <button key={v} type="button" onClick={() => setAmt(v)} className={cx("flex-1 rounded-lg border py-1 font-mono text-[12px]", amt === v ? "border-leaf text-text" : "border-line text-muted hover:text-text")}>
            {v}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-[#0c0c0c] p-3">
        <p className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
          <span>Fees at the last 30 days</span>
          <span className="flex gap-1">
            {[1, 7, 30].map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={cx("rounded-md border px-2 py-0.5 normal-case tracking-normal", days === d ? "border-leaf text-text" : "border-line hover:text-text")}>
                {d === 1 ? "1 day" : `${d} days`}
              </button>
            ))}
          </span>
        </p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 font-mono">
          <span className="text-[20px] text-text">{`$${usdIn.toFixed(2)}`}</span>
          <span className="text-leaf">→</span>
          <span className="text-[20px] text-leaf">{`+$${fees.toFixed(fees < 1 ? 3 : 2)}`}</span>
          <span className="text-[12px] text-muted">{`in ${days === 1 ? "a day" : `${days} days`}, if it pays like the last 30`}</span>
        </p>
        <div className="mt-3 border-t border-line pt-3">
          <p className="flex justify-between font-mono text-[12px] text-muted">
            <span className="uppercase tracking-[0.08em]">{`If ${symbol} moves`}</span>
            <span className={cx(move > 0 ? "text-leaf" : move < 0 ? "text-flesh" : "text-text")}>{`${move > 0 ? "+" : ""}${Math.round(move * 100)}%`}</span>
          </p>
          <input type="range" min={-90} max={300} step={5} value={Math.round(move * 100)} onChange={(e) => setMove(Number(e.target.value) / 100)} aria-label={`Price move of ${symbol} in percent`} className="mt-2 w-full accent-[var(--leaf)]" />
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[12.5px]">
            <p>
              <span className="block text-[11.5px] text-muted">Just holding</span>
              <span className="text-text">{`$${pv.hold.toFixed(2)}`}</span>
            </p>
            <p>
              <span className="block text-[11.5px] text-muted">In the pool</span>
              <span className="text-text">{`$${pv.pool.toFixed(2)}`}</span>
            </p>
            <p>
              <span className="block text-[11.5px] text-muted">Pool + fees vs hold</span>
              <span className={cx(pv.pool + fees >= pv.hold ? "text-leaf" : "text-flesh")}>{`${pv.pool + fees - pv.hold >= 0 ? "+" : "−"}$${Math.abs(pv.pool + fees - pv.hold).toFixed(2)}`}</span>
            </p>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#7d8a83]">Any move away from today&apos;s price leaves the pool behind simply holding. The fees have to make up that gap.</p>
        </div>
      </div>
      <div className={cx("rounded-xl border p-3 text-[12.5px]", fails.length ? "border-flesh/50 bg-flesh-deep/30" : "border-line")}>
        <p className="flex items-center justify-between gap-3">
          <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{`Token check · ${symbol}`}</span>
          <a href={`/app/trust/check?q=${token}`} className="text-[12px] text-leaf hover:underline">Full check →</a>
        </p>
        <p className="mt-1">
          {!check ? (
            <span className="text-muted">Reading the chain…</span>
          ) : check.error ? (
            <span className="text-muted">The check did not answer. Open it before you deposit.</span>
          ) : fails.length ? (
            <span className="text-flesh">{`${fails.length} red flag${fails.length > 1 ? "s" : ""}: ${fails.map((f) => f.name).join(", ")}`}</span>
          ) : (
            <span className="text-leaf">No red flags at the latest block.</span>
          )}
        </p>
        {fails.length > 0 && (
          <label className="mt-2 flex items-start gap-2 text-[12.5px] text-text">
            <input type="checkbox" checked={okFlags} onChange={(e) => setOkFlags(e.target.checked)} className="mt-0.5 accent-[var(--flesh)]" />
            I read the flags and still want to put money into this pool.
          </label>
        )}
      </div>
      <button type="button" disabled={!!busy} onClick={() => void deposit()} className="h-12 w-full rounded-2xl bg-ui text-[15px] font-semibold text-[#0b0b0b] transition-[filter] hover:brightness-110 disabled:opacity-60">
        {busy ?? (!me ? "Connect a wallet to deposit" : `Deposit ${amt || 0} ${pay}`)}
      </button>
      {pos && pos.lp > 0n && (
        <div className="rounded-xl border border-leaf/30 bg-leaf/[0.05] p-3 text-[12.5px]">
          <p className="flex justify-between">
            <span className="text-muted">Your position</span>
            <span className="font-mono text-text">{`${(pos.share * 100).toFixed(4)}% of the pool`}</span>
          </p>
          <p className="mt-1 flex justify-between">
            <span className="text-muted">{`Your ${pay === "ETH" ? "WETH" : "USDG"} side`}</span>
            <span className="font-mono text-text">{pos.baseSide.toLocaleString("en", { maximumFractionDigits: dec === 6 ? 2 : 6 })}</span>
          </p>
          <button type="button" disabled={!!busy} onClick={() => void withdraw()} className="mt-2 h-9 w-full rounded-lg border border-line text-[12.5px] text-text hover:border-flesh disabled:opacity-60">
            Withdraw all
          </button>
        </div>
      )}
      {msg && (
        <p className={cx("text-[12px]", msg.ok ? "text-leaf" : "text-flesh")}>
          {msg.text}{" "}
          {msg.tx && (
            <a href={EXPLORER + msg.tx} target="_blank" rel="noreferrer" className="font-mono underline">
              {`${msg.block ? `Block ${msg.block.toLocaleString("en-US")} · ` : ""}receipt ↗`}
            </a>
          )}
        </p>
      )}
      <p className="text-[12px] leading-relaxed text-[#7d8a83]">Half is swapped for {symbol}, then both go into the pool from your wallet through the Uniswap V2 router. Corbel holds nothing and takes no fee. A price move can take back more than the fees; a pool can be drained. Check the token first.</p>
    </div>
  );
}
