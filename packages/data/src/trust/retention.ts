/**
 * Buyer retention: of the wallets that bought a token in its first week, how many still hold it.
 * A buyer is a wallet that ends a transaction with more of the token, in a transaction where the token left a pool or
 * the launchpad curve. A router that passes the coins on in the same transaction ends with nothing and is not counted;
 * pools and the curve themselves are never buyers. Today's balances are read from the token (balanceOf), for the
 * largest buyers first when there are many.
 */
import type { Address, PublicClient } from "viem";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO = "0x0000000000000000000000000000000000000000";
/** at most this many buyers get their balance read */
export const MAX_CHECKED = 400;

export type Retention = {
  from: string;
  to: string;
  /** wallets that bought in the window */
  buyers: number;
  /** how many of them had today's balance read (largest buyers first) */
  checked: number;
  /** of the checked: still hold any of the token */
  holdAny: number;
  /** of the checked: still hold at least half of what they bought in the window */
  holdHalf: number;
};

type Log = { topics: string[]; data: string; transactionHash: string };
const addr = (t: string) => `0x${t.slice(-40)}`.toLowerCase();

/** Wallets that bought in these logs, with the amount each bought. Pure, for tests. */
export function buyersFrom(logs: Log[], sources: Set<string>): Map<string, bigint> {
  const byTx = new Map<string, Log[]>();
  for (const l of logs) {
    if (l.topics[0] !== TRANSFER || l.topics.length < 3) continue;
    const k = l.transactionHash.toLowerCase();
    const a = byTx.get(k);
    if (a) a.push(l);
    else byTx.set(k, [l]);
  }
  const out = new Map<string, bigint>();
  for (const ls of byTx.values()) {
    if (!ls.some((l) => sources.has(addr(l.topics[1]!)))) continue;
    const net = new Map<string, bigint>();
    for (const l of ls) {
      const v = BigInt(l.data === "0x" ? 0 : l.data);
      const f = addr(l.topics[1]!), t = addr(l.topics[2]!);
      net.set(f, (net.get(f) ?? 0n) - v);
      net.set(t, (net.get(t) ?? 0n) + v);
    }
    for (const [a, v] of net) if (v > 0n && a !== ZERO && !sources.has(a)) out.set(a, (out.get(a) ?? 0n) + v);
  }
  return out;
}

const ABI = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;

/** Transfer logs of `token` over a block range, halving the range when the node refuses it (too many logs in one answer). */
async function logsSplit(client: PublicClient, token: Address, from: bigint, to: bigint, depth = 0): Promise<Log[]> {
  try {
    return (await client.request({ method: "eth_getLogs", params: [{ address: token, topics: [TRANSFER], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }] } as never)) as Log[];
  } catch (e) {
    if (depth >= 12 || to <= from) throw e;
    const mid = from + (to - from) / 2n;
    const a = await logsSplit(client, token, from, mid, depth + 1);
    const b = await logsSplit(client, token, mid + 1n, to, depth + 1);
    return [...a, ...b];
  }
}

export async function readRetention(client: PublicClient, token: Address, from: bigint, weekBlocks: bigint, sources: string[]): Promise<Retention | null> {
  const head = await client.getBlockNumber();
  const to = from + weekBlocks < head ? from + weekBlocks : head;
  const logs = await logsSplit(client, token, from, to);
  const bought = buyersFrom(logs, new Set(sources.map((s) => s.toLowerCase())));
  const top = [...bought.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0)).slice(0, MAX_CHECKED);
  let holdAny = 0, holdHalf = 0, checked = 0;
  for (let i = 0; i < top.length; i += 40) {
    const part = top.slice(i, i + 40);
    const bal = await Promise.all(part.map(([w]) => (client.readContract({ address: token, abi: ABI, functionName: "balanceOf", args: [w as Address] } as never) as Promise<bigint>).catch(() => null)));
    part.forEach(([, b], k) => {
      const v = bal[k];
      if (v === null || v === undefined) return;
      checked++;
      if (v > 0n) holdAny++;
      if (v * 2n >= b) holdHalf++;
    });
  }
  return { from: from.toString(), to: to.toString(), buyers: bought.size, checked, holdAny, holdHalf };
}
