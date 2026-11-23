/**
 * The local test chain (packages/contracts/scripts/devchain.ts): a fork of Robinhood Chain on this machine with
 * Corbel's contracts deployed by a test address. On when DEVCHAIN points at the JSON that script writes; never on the
 * live site. The server acts as the test address (impersonated on the fork; no key exists), so every button can be
 * tried without a wallet or real money.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, http, type Hex, type PublicClient } from "viem";

export type Devchain = { rpc: string; chainId: number; dev: Hex; fund: Hex; orders: Hex; predict: Hex; launchpad?: Hex; fromBlock?: string; at: string };

export function devchain(): Devchain | null {
  const f = process.env.DEVCHAIN;
  if (!f) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8")) as Devchain;
  } catch {
    return null;
  }
}

let client: PublicClient | null = null;
export function devClient(): PublicClient | null {
  const d = devchain();
  if (!d) return null;
  client ??= createPublicClient({ transport: http(d.rpc, { timeout: 180_000 }) });
  return client;
}

/** Sends a transaction from a test address on the fork (the main one unless `from`) and waits; throws if it reverts. */
export async function devSend(to: Hex, data: Hex, value = 0n, from?: Hex): Promise<Hex> {
  const d = devchain(), c = devClient();
  if (!d || !c) throw new Error("The local test chain is off.");
  const who = from ?? d.dev;
  await c.request({ method: "anvil_impersonateAccount", params: [who] } as never);
  // a second test address may have no ETH yet: give it gas money on the fork
  if (who !== d.dev && (await c.getBalance({ address: who })) < 10n ** 18n) await c.request({ method: "anvil_setBalance", params: [who, "0x56bc75e2d63100000"] } as never);
  const hash = (await c.request({ method: "eth_sendTransaction", params: [{ from: who, to, data, value: `0x${value.toString(16)}` }] } as never)) as Hex;
  const r = await c.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("The transaction reverted.");
  return hash;
}

/** Moves the fork's clock forward (test only: lets a DCA's next slice come due). */
export async function devWarp(seconds: number) {
  const c = devClient();
  if (!c) return;
  await c.request({ method: "evm_increaseTime", params: [seconds] } as never);
  await c.request({ method: "evm_mine", params: [] } as never);
}
