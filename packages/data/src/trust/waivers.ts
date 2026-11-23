/**
 * Launch-tax waivers on the launchpad's bonding curve. In its launch transaction a creator may exempt a list of
 * wallets from the launch fee (about 7% in the first two seconds, against 1% after). The curve logs one event per
 * exempted wallet inside that transaction, so the list is read, never inferred; then the curve's buy events say how
 * much of the supply those wallets took, how fast, and the token's balanceOf says how much they still hold.
 * The creator's own address is reported apart: a creator is always exempt.
 */
import type { Address, Hex, PublicClient } from "viem";

/** the curve's events, by topic0 */
export const CURVE_INIT = "0x908408e3";
export const CURVE_EXEMPT = "0xe4b7e48f";
export const CURVE_BUY = "0xec36bf57";
/** "the first seconds": blocks after the launch block, about 2 s at the chain's ~9 blocks a second */
export const FAST_BLOCKS = 20;
/** buys are summed over this many blocks after launch (about 6 minutes) */
export const BUY_BLOCKS = 3_000;
const MAX_WALLETS = 60;

export type Waivers = {
  /** the launch transaction the list was read from */
  tx: string;
  block: string;
  /** wallets the creator exempted, the creator not counted */
  wallets: number;
  /** of supply, 0..1: bought by the exempted wallets in the first BUY_BLOCKS blocks */
  bought: number;
  /** of supply, 0..1: the part of `bought` taken in the first FAST_BLOCKS blocks */
  fast: number;
  /** how many of the exempted wallets bought at all */
  buyers: number;
  /** ETH they paid in */
  eth: number;
  /** of supply, 0..1: what the exempted wallets hold now; null when the balance read failed */
  holdNow: number | null;
  /** the largest exempted buyers, share of supply bought */
  top: { address: string; bought: number }[];
};

const ABI = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const addr = (topic: string) => `0x${topic.slice(-40)}`.toLowerCase();
const word = (data: string, i: number) => BigInt(`0x${data.slice(2 + 64 * i, 66 + 64 * i) || "0"}`);

/** Reads the waivers of one launch. Returns null when the transaction is not a curve launch. */
export async function readWaivers(client: PublicClient, tx: Hex, token: Address, supply: bigint): Promise<Waivers | null> {
  const r = await client.getTransactionReceipt({ hash: tx });
  const init = r.logs.find((l) => l.topics[0]?.startsWith(CURVE_INIT));
  if (!init || supply <= 0n) return null;
  const curve = init.address.toLowerCase();
  const creator = r.from.toLowerCase();
  const listed = new Set<string>();
  for (const l of r.logs) if (l.address.toLowerCase() === curve && l.topics[0]?.startsWith(CURVE_EXEMPT) && l.topics[1]) listed.add(addr(l.topics[1]));
  listed.delete(creator);
  const wallets = [...listed];
  const b0 = r.blockNumber;
  const base: Waivers = { tx, block: b0.toString(), wallets: wallets.length, bought: 0, fast: 0, buyers: 0, eth: 0, holdNow: wallets.length ? null : 0, top: [] };
  if (!wallets.length) return base;

  const head = await client.getBlockNumber();
  const to = b0 + BigInt(BUY_BLOCKS) < head ? b0 + BigInt(BUY_BLOCKS) : head;
  const logs = await client.request({ method: "eth_getLogs", params: [{ address: curve as Address, fromBlock: `0x${b0.toString(16)}`, toBlock: `0x${to.toString(16)}` }] } as never) as { topics: string[]; data: string; blockNumber: string; transactionHash: string }[];
  const mine = new Set(wallets);
  const by = new Map<string, bigint>();
  let bought = 0n;
  let fast = 0n;
  let wei = 0n;
  for (const l of logs) {
    if (!l.topics[0]?.startsWith(CURVE_BUY) || l.transactionHash.toLowerCase() === tx.toLowerCase()) continue;
    // topic 1 is who called the curve (a router or the wallet), topic 2 who receives the coins
    const who = [l.topics[2], l.topics[1]].filter(Boolean).map((t) => addr(t!)).find((a) => mine.has(a));
    if (!who) continue;
    const out = word(l.data, 1);
    bought += out;
    wei += word(l.data, 0);
    if (BigInt(l.blockNumber) - b0 <= BigInt(FAST_BLOCKS)) fast += out;
    by.set(who, (by.get(who) ?? 0n) + out);
  }

  let holdNow: number | null = null;
  try {
    const bal = await Promise.all(wallets.slice(0, MAX_WALLETS).map((w) => client.readContract({ address: token, abi: ABI, functionName: "balanceOf", args: [w as Address] } as never) as Promise<bigint>));
    holdNow = share(bal.reduce((a, b) => a + b, 0n), supply);
  } catch {
    holdNow = null;
  }

  return {
    ...base,
    bought: share(bought, supply),
    fast: share(fast, supply),
    buyers: by.size,
    eth: Number(wei / 10n ** 12n) / 1e6,
    holdNow,
    top: [...by.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, 5).map(([address, v]) => ({ address, bought: share(v, supply) })),
  };
}

const share = (v: bigint, supply: bigint) => Number((v * 1_000_000n) / supply) / 1_000_000;
