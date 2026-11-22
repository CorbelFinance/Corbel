"use client";

/**
 * Swap from your own wallet. Quotes again at the latest block, sends the best route through the Uniswap V2
 * router with min out = quote − slippage, waits for the receipt, and shows what you got against the quote.
 * No Corbel contract is involved; the wallet signs a plain router call. Routes through v4 pools are not sent yet.
 */
import { useState } from "react";
import { cx } from "@corbel/ui";
import { encodeFunctionData, formatUnits, parseUnits, type Hex } from "viem";
import { useLinked } from "./wallet";
import { saveAct } from "./activity";

type Provider = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
type Hop = { venue: string; from: string; to: string };
type Quote = { from: { address: string; symbol: string; decimals: number }; to: { address: string; symbol: string; decimals: number }; routes: { hops: Hop[]; amountOut: string | null; ok: boolean }[]; best: number | null };

const ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const NATIVE = "0x0000000000000000000000000000000000000000";
const CHAIN = 4663;
const EXPLORER = "https://robinhoodchain.blockscout.com/tx/";

const ABI = [
  { type: "function", name: "swapExactETHForTokens", stateMutability: "payable", inputs: [{ type: "uint256" }, { type: "address[]" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256[]" }] },
  { type: "function", name: "swapExactTokensForETH", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "address[]" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256[]" }] },
  { type: "function", name: "swapExactTokensForTokens", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "address[]" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256[]" }] },
] as const;
const ERC20 = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

function findProvider(rdns?: string): Promise<Provider | null> {
  return new Promise((done) => {
    let found: Provider | null = null;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ info: { rdns: string }; provider: Provider }>).detail;
      if (!found && (!rdns || d.info.rdns === rdns)) found = d.provider;
    };
    window.addEventListener("eip6963:announceProvider", on);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", on);
      done(found ?? (window as unknown as { ethereum?: Provider }).ethereum ?? null);
    }, 300);
  });
}

async function waitReceipt(p: Provider, hash: string) {
  for (let i = 0; i < 90; i++) {
    const r = (await p.request({ method: "eth_getTransactionReceipt", params: [hash] })) as { status: string } | null;
    if (r) return r.status === "0x1";
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error("No receipt yet. Check the transaction on the explorer.");
}

type StepId = "quote" | "network" | "approve" | "sign" | "block" | "done";
const STEPS: { id: StepId; label: string }[] = [
  { id: "quote", label: "Quote again" },
  { id: "network", label: "Network" },
  { id: "approve", label: "Approve" },
  { id: "sign", label: "Sign" },
  { id: "block", label: "In a block" },
  { id: "done", label: "Received" },
];

export function SwapButton({ from, to, amount, slippage = 0.01 }: { from: string; to: string; amount: string; slippage?: number }) {
  const { linked } = useLinked();
  const [state, setState] = useState<{ kind: "idle" } | { kind: "busy"; step: string } | { kind: "done"; hash: string; quoted: string; got: string | null; sym: string } | { kind: "error"; msg: string }>({ kind: "idle" });
  // the progress strip: where the swap is, what was skipped, and the transactions sent so far
  const [at, setAt] = useState<StepId | null>(null);
  const [skipped, setSkipped] = useState<StepId[]>([]);
  const [txs, setTxs] = useState<{ approve?: string; swap?: string }>({});

  async function go() {
    let cur: StepId = "quote";
    const mark = (s: StepId) => ((cur = s), setAt(s));
    setSkipped([]);
    setTxs({});
    mark("quote");
    try {
      if (!linked || linked.via !== "wallet") throw new Error("Connect a wallet first (top right).");
      setState({ kind: "busy", step: "Quoting again at the latest block" });
      const q = (await fetch(`/api/quote?from=${from}&to=${to}&amount=${amount}`).then((r) => r.json())) as Quote & { error?: string };
      if (q.error || q.best === null) throw new Error(q.error ?? "No route fills this trade.");
      const best = q.routes[q.best]!;
      if (!best.ok || !best.amountOut) throw new Error("The best route does not fill right now.");
      if (best.hops.some((h) => h.venue !== "v2")) throw new Error("The best route goes through a v4 pool. Sending v4 routes from the app is not built yet.");
      const fromNative = q.from.address === NATIVE, toNative = q.to.address === NATIVE;
      const path = [fromNative ? WETH : q.from.address, ...best.hops.map((h) => (h.to === NATIVE ? WETH : h.to))] as Hex[];
      const amountIn = parseUnits(amount, q.from.decimals);
      const quoted = BigInt(best.amountOut);
      const minOut = (quoted * BigInt(Math.round((1 - slippage) * 10_000))) / 10_000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      const me = linked.address as Hex;

      mark("network");
      const p = await findProvider(linked.rdns);
      if (!p) throw new Error("No wallet found in this browser.");
      await p.request({ method: "eth_requestAccounts" });
      const chain = Number((await p.request({ method: "eth_chainId" })) as string);
      if (chain !== CHAIN) {
        setState({ kind: "busy", step: "Switching your wallet to Robinhood Chain" });
        try {
          await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${CHAIN.toString(16)}` }] });
        } catch {
          await p.request({ method: "wallet_addEthereumChain", params: [{ chainId: `0x${CHAIN.toString(16)}`, chainName: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: ["https://robinhoodchain.blockscout.com"] }] });
        }
      }
      const call = (to: string, data: Hex) => p.request({ method: "eth_call", params: [{ to, data }, "latest"] }) as Promise<Hex>;
      const balOf = async () => (toNative ? null : BigInt(await call(q.to.address, encodeFunctionData({ abi: ERC20, functionName: "balanceOf", args: [me] }))));

      mark("approve");
      if (fromNative) setSkipped((s) => [...s, "approve"]);
      if (!fromNative) {
        const allowed = BigInt(await call(q.from.address, encodeFunctionData({ abi: ERC20, functionName: "allowance", args: [me, ROUTER] })));
        if (allowed < amountIn) {
          setState({ kind: "busy", step: `Approve ${q.from.symbol} in your wallet` });
          const ah = (await p.request({ method: "eth_sendTransaction", params: [{ from: me, to: q.from.address, data: encodeFunctionData({ abi: ERC20, functionName: "approve", args: [ROUTER, amountIn] }) }] })) as string;
          setTxs((x) => ({ ...x, approve: ah }));
          if (!(await waitReceipt(p, ah))) throw new Error("The approval failed.");
        } else setSkipped((s) => [...s, "approve"]);
      }
      const before = await balOf();
      const data = fromNative
        ? encodeFunctionData({ abi: ABI, functionName: "swapExactETHForTokens", args: [minOut, path, me, deadline] })
        : toNative
          ? encodeFunctionData({ abi: ABI, functionName: "swapExactTokensForETH", args: [amountIn, minOut, path, me, deadline] })
          : encodeFunctionData({ abi: ABI, functionName: "swapExactTokensForTokens", args: [amountIn, minOut, path, me, deadline] });
      mark("sign");
      setState({ kind: "busy", step: "Confirm the swap in your wallet" });
      const hash = (await p.request({ method: "eth_sendTransaction", params: [{ from: me, to: ROUTER, data, value: fromNative ? `0x${amountIn.toString(16)}` : "0x0" }] })) as string;
      mark("block");
      setTxs((x) => ({ ...x, swap: hash }));
      const act = { at: Date.now(), hash, from: q.from.symbol, to: q.to.symbol, amount, quoted: formatUnits(quoted, q.to.decimals), got: null as string | null, status: "pending" as const };
      saveAct(act);
      setState({ kind: "busy", step: "Waiting for the block" });
      if (!(await waitReceipt(p, hash))) {
        saveAct({ ...act, status: "failed" });
        throw new Error("The swap reverted: the price moved past your minimum.");
      }
      const after = await balOf();
      const got = before !== null && after !== null ? formatUnits(after - before, q.to.decimals) : null;
      saveAct({ ...act, got, status: "done" });
      mark("done");
      setState({ kind: "done", hash, quoted: formatUnits(quoted, q.to.decimals), got, sym: q.to.symbol });
    } catch (e) {
      const m = (e as { message?: string }).message ?? "The swap did not go through.";
      setAt(cur);
      setState({ kind: "error", msg: /reject|denied/i.test(m) ? "You cancelled it in the wallet." : m });
    }
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={() => void go()} disabled={state.kind === "busy" || !(Number(amount) > 0)} className="ibtn h-11 w-full">
        {state.kind === "busy" ? state.step : "Swap with my wallet"}
      </button>
      {at && (
        <ol aria-label="Swap progress" className="mt-3 grid grid-cols-6 gap-1">
          {STEPS.map((s, i) => {
            const idx = STEPS.findIndex((x) => x.id === at);
            const failed = state.kind === "error" && s.id === at;
            const done = i < idx || (s.id === "done" && state.kind === "done");
            const now = s.id === at && state.kind === "busy";
            const skip = skipped.includes(s.id);
            return (
              <li key={s.id} className="min-w-0">
                <span className={cx("block h-1 rounded-full", failed ? "bg-flesh" : skip ? "bg-[#2e2e2e]" : done ? "bg-leaf" : now ? "animate-pulse bg-leaf/60" : "bg-[#242424]")} />
                <span className={cx("mt-1 block truncate text-[12px]", failed ? "text-flesh" : done || now ? "text-text" : "text-muted")}>{skip ? `${s.label} · not needed` : s.label}</span>
                {s.id === "approve" && txs.approve && (
                  <a href={EXPLORER + txs.approve} target="_blank" rel="noreferrer" className="block truncate font-mono text-[12px] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                    tx ↗
                  </a>
                )}
                {s.id === "block" && txs.swap && (
                  <a href={EXPLORER + txs.swap} target="_blank" rel="noreferrer" className="block truncate font-mono text-[12px] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                    tx ↗
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {state.kind === "done" && (
        <div className="mt-3 rounded-xl border border-leaf/40 bg-leaf/[0.06] p-3 text-[13px]">
          <p className="flex justify-between">
            <span className="text-muted">Quoted</span>
            <span className="font-mono text-text">
              {state.quoted} {state.sym}
            </span>
          </p>
          {state.got !== null && (
            <p className="flex justify-between">
              <span className="text-muted">Received</span>
              <span className="font-mono text-leaf">
                {state.got} {state.sym}
              </span>
            </p>
          )}
          <a href={EXPLORER + state.hash} target="_blank" rel="noreferrer" className="mt-2 block truncate font-mono text-[12px] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
            {state.hash} ↗
          </a>
        </div>
      )}
      {state.kind === "error" && <p className="mt-3 rounded-xl border border-flesh/40 bg-flesh-deep/40 px-3 py-2 text-[13px] text-text">{state.msg}</p>}
      <p className="mt-2 text-[12px] leading-snug text-muted">Signs a Uniswap V2 router call in your wallet. Not audited. Start small.</p>
    </div>
  );
}
