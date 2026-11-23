/**
 * Who holds a V2 pool's liquidity, and how much of it could leave right now. A V2 pair's LP token is an ERC-20: its
 * Transfer events since the pool's first block give every holder's balance (checked against balanceOf for the
 * largest). Each holder is burned (the zero or dead address, gone for good), a known locker (HoodLock, a launchpad's
 * locker), another contract (a farm, a vault, a router), or a wallet: a wallet can remove its share at once.
 * The pool's depth is both sides at the pool's own price, in dollars; "withdrawable now" is the wallets' share of it.
 */
import { formatUnits, type Address, type PublicClient } from "viem";
import { BURN_ADDRESSES, KNOWN_LOCKERS, RH } from "./addresses.ts";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const PAIR = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
] as const;
/** Lockers people use to lock LP and team tokens on this chain, besides the launchpads' own. */
const LOCKERS: Record<string, string> = { ...KNOWN_LOCKERS, "0xd0f7d8c6e9f6d80c297bebe4f7fd1b9c8125c32f": "HoodLock" };

export type LpKind = "burned" | "locked" | "contract" | "wallet";
export type PoolHealth = {
  pair: string;
  base: "ETH" | "USDG";
  depthUsd: number;
  shares: Record<LpKind, number>;
  withdrawableUsd: number;
  holders: number;
  top: { address: string; kind: LpKind; label: string | null; share: number; usd: number }[];
  fromBlock: string;
  head: string;
};

type Log = { topics: string[]; data: string };
async function logs(client: PublicClient, pair: string, from: bigint, to: bigint, depth = 0): Promise<Log[]> {
  try {
    return (await client.request({ method: "eth_getLogs", params: [{ address: pair, topics: [TRANSFER], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }] } as never)) as Log[];
  } catch (e) {
    if (depth >= 12 || to <= from) throw e;
    const mid = from + (to - from) / 2n;
    return [...(await logs(client, pair, from, mid, depth + 1)), ...(await logs(client, pair, mid + 1n, to, depth + 1))];
  }
}

export async function readPoolHealth(client: PublicClient, pair: Address, fromBlock: bigint, ethUsd: number): Promise<PoolHealth | { error: string }> {
  const [t0, t1] = (await Promise.all([client.readContract({ address: pair, abi: PAIR, functionName: "token0" }), client.readContract({ address: pair, abi: PAIR, functionName: "token1" })])) as [string, string];
  const bases: Record<string, "ETH" | "USDG"> = { [RH.WETH.toLowerCase()]: "ETH", [RH.USDG.toLowerCase()]: "USDG" };
  const baseIs0 = !!bases[t0.toLowerCase()];
  const base = bases[(baseIs0 ? t0 : t1).toLowerCase()];
  if (!base) return { error: "This pair has no ETH or USDG side." };
  const head = await client.getBlockNumber();

  // every LP transfer since the pool's first block, in windows of 2M blocks (split when the node refuses one)
  const net = new Map<string, bigint>();
  for (let a = fromBlock; a <= head; a += 2_000_000n) {
    const b = a + 1_999_999n > head ? head : a + 1_999_999n;
    for (const l of await logs(client, pair, a, b)) {
      if (l.topics.length !== 3) continue;
      const f = `0x${l.topics[1]!.slice(26)}`, t = `0x${l.topics[2]!.slice(26)}`, v = BigInt(l.data.slice(0, 66));
      net.set(f, (net.get(f) ?? 0n) - v);
      net.set(t, (net.get(t) ?? 0n) + v);
    }
  }
  const supply = (await client.readContract({ address: pair, abi: PAIR, functionName: "totalSupply" })) as bigint;
  if (supply === 0n) return { error: "This pool has no liquidity." };
  const held = [...net.entries()].filter(([a, v]) => v > 0n && a !== "0x0000000000000000000000000000000000000000").sort((x, y) => (y[1] > x[1] ? 1 : -1));
  // the largest holders are read again with balanceOf, so a missed event never decides the answer
  const top = held.slice(0, 25);
  const checked = await Promise.all(top.map(async ([a]) => (await client.readContract({ address: pair, abi: PAIR, functionName: "balanceOf", args: [a as Address] }).catch(() => null)) as bigint | null));
  top.forEach(([a], i) => checked[i] !== null && net.set(a, checked[i]!));

  const kindOf = async (a: string): Promise<{ kind: LpKind; label: string | null }> => {
    if ((BURN_ADDRESSES as readonly string[]).includes(a)) return { kind: "burned", label: a.endsWith("dead") ? "dead address" : "zero address" };
    if (LOCKERS[a]) return { kind: "locked", label: LOCKERS[a]! };
    const code = (await client.getCode({ address: a as Address }).catch(() => undefined)) ?? "0x";
    // a wallet with a smart account on it (EIP-7702) is still a wallet
    return code === "0x" || /^0xef0100/i.test(code) ? { kind: "wallet", label: null } : { kind: "contract", label: null };
  };
  // the zero address's own balance (LP minted to it, the V2 minimum liquidity) counts as burned
  const zero = (await client.readContract({ address: pair, abi: PAIR, functionName: "balanceOf", args: ["0x0000000000000000000000000000000000000000"] }).catch(() => 0n)) as bigint;
  const shares: Record<LpKind, number> = { burned: Number(zero) / Number(supply), locked: 0, contract: 0, wallet: 0 };
  const [r0, r1] = (await client.readContract({ address: pair, abi: PAIR, functionName: "getReserves" })) as readonly [bigint, bigint, number];
  const baseRes = Number(formatUnits(baseIs0 ? r0 : r1, base === "USDG" ? 6 : 18));
  const depthUsd = 2 * (base === "USDG" ? baseRes : baseRes * ethUsd);
  const rows: PoolHealth["top"] = [];
  const all = [...net.entries()].filter(([a, v]) => v > 0n && a !== "0x0000000000000000000000000000000000000000").sort((x, y) => (y[1] > x[1] ? 1 : -1));
  for (const [i, [a, v]] of all.entries()) {
    const share = Number(v) / Number(supply);
    // small holders past the first 40 are counted as wallets without a code read: together they are a rounding error
    const k = i < 40 ? await kindOf(a) : { kind: "wallet" as LpKind, label: null };
    shares[k.kind] += share;
    if (rows.length < 10) rows.push({ address: a, kind: k.kind, label: k.label, share, usd: share * depthUsd });
  }
  return {
    pair: pair.toLowerCase(),
    base,
    depthUsd,
    shares,
    withdrawableUsd: shares.wallet * depthUsd,
    holders: all.length,
    top: rows,
    fromBlock: fromBlock.toString(),
    head: head.toString(),
  };
}
