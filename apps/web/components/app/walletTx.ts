"use client";

/**
 * Sending transactions from the visitor's own wallet: find the wallet (EIP-6963, else window.ethereum), make sure
 * it is on Robinhood Chain, read with eth_call, send, and wait for the receipt. Corbel never holds a key.
 */
import { encodeFunctionData, type Hex } from "viem";

export type Provider = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
export const CHAIN = 4663;
export const EXPLORER = "https://robinhoodchain.blockscout.com/tx/";
export const ERC20 = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export function findProvider(rdns?: string): Promise<Provider | null> {
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

/** The wallet, connected and on Robinhood Chain. */
export async function ready(rdns?: string): Promise<Provider> {
  const p = await findProvider(rdns);
  if (!p) throw new Error("No wallet found in this browser.");
  await p.request({ method: "eth_requestAccounts" });
  const chain = Number((await p.request({ method: "eth_chainId" })) as string);
  if (chain !== CHAIN) {
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${CHAIN.toString(16)}` }] });
    } catch {
      await p.request({ method: "wallet_addEthereumChain", params: [{ chainId: `0x${CHAIN.toString(16)}`, chainName: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: ["https://robinhoodchain.blockscout.com"] }] });
    }
  }
  return p;
}

export async function waitReceipt(p: Provider, hash: string) {
  for (let i = 0; i < 90; i++) {
    const r = (await p.request({ method: "eth_getTransactionReceipt", params: [hash] })) as { status: string } | null;
    if (r) return r.status === "0x1";
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error("No receipt yet. Check the transaction on the explorer.");
}

export const call = (p: Provider, to: string, data: Hex) => p.request({ method: "eth_call", params: [{ to, data }, "latest"] }) as Promise<Hex>;

/** Send one call and wait for it to land; throws on a revert. */
export async function send(p: Provider, from: string, to: string, data: Hex, what: string): Promise<string> {
  const hash = (await p.request({ method: "eth_sendTransaction", params: [{ from, to, data }] })) as string;
  if (!(await waitReceipt(p, hash))) throw new Error(`${what} reverted.`);
  return hash;
}

/** Approve `spender` for `amount` of `token` when the allowance is short. Returns the approval hash, or null. */
export async function approveIfNeeded(p: Provider, me: string, token: string, spender: string, amount: bigint): Promise<string | null> {
  const allowed = BigInt(await call(p, token, encodeFunctionData({ abi: ERC20, functionName: "allowance", args: [me as Hex, spender as Hex] })));
  if (allowed >= amount) return null;
  return send(p, me, token, encodeFunctionData({ abi: ERC20, functionName: "approve", args: [spender as Hex, amount] }), "The approval");
}

export const niceError = (e: unknown, fallback: string) => {
  const m = (e as { message?: string }).message ?? fallback;
  return /reject|denied/i.test(m) ? "You cancelled it in the wallet." : m.length > 160 ? fallback : m;
};
