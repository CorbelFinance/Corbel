/**
 * Where a token trades. V2: factory.getPair against WETH and USDG. v4: Initialize events from the
 * PoolManager (via the local index when present, else a bounded backwards scan of the chain).
 */
import { decodeAbiParameters, getAddress, type Address, type PublicClient } from "viem";
import { BURN_ADDRESSES, LOG_WINDOW, RH, TOPICS } from "./addresses.ts";
import type { PoolKey } from "./sim.ts";

const V2_FACTORY_ABI = [{ type: "function", name: "getPair", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] }] as const;
const PAIR_ABI = [
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export interface V2Pool {
  kind: "v2";
  pair: Address;
  base: "WETH" | "USDG";
  /** base-token reserve, raw units */
  baseReserve: bigint;
  /** 0..1 share of LP tokens on burn addresses */
  lpBurned: number | null;
}
export interface V4Pool {
  kind: "v4";
  id: `0x${string}`;
  key: PoolKey;
  block: number;
  tx: `0x${string}`;
}

const ZERO = "0x0000000000000000000000000000000000000000";

export async function findV2(client: PublicClient, token: Address): Promise<V2Pool[]> {
  const out: V2Pool[] = [];
  for (const [base, addr] of [
    ["WETH", RH.WETH],
    ["USDG", RH.USDG],
  ] as const) {
    let pair: Address;
    try {
      pair = await client.readContract({ address: RH.V2_FACTORY, abi: V2_FACTORY_ABI, functionName: "getPair", args: [token, addr] });
    } catch {
      continue;
    }
    if (!pair || pair === ZERO) continue;
    try {
      const [[r0, r1], t0, supply, ...burned] = await Promise.all([
        client.readContract({ address: pair, abi: PAIR_ABI, functionName: "getReserves" }),
        client.readContract({ address: pair, abi: PAIR_ABI, functionName: "token0" }),
        client.readContract({ address: pair, abi: PAIR_ABI, functionName: "totalSupply" }),
        ...BURN_ADDRESSES.map((b) => client.readContract({ address: pair, abi: PAIR_ABI, functionName: "balanceOf", args: [b] })),
      ]);
      const baseIsT0 = getAddress(t0 as string) === getAddress(addr);
      const burnedSum = (burned as bigint[]).reduce((a, b) => a + b, 0n);
      out.push({
        kind: "v2",
        pair,
        base,
        baseReserve: baseIsT0 ? (r0 as bigint) : (r1 as bigint),
        lpBurned: (supply as bigint) > 0n ? Number((burnedSum * 10_000n) / (supply as bigint)) / 10_000 : null,
      });
    } catch {
      /* pair without the standard interface */
    }
  }
  return out;
}

export function decodeInitialize(log: { topics: readonly string[]; data: `0x${string}`; blockNumber: bigint | number | null; transactionHash: `0x${string}` | null }): V4Pool {
  const [fee, tickSpacing, hooks] = decodeAbiParameters([{ type: "uint24" }, { type: "int24" }, { type: "address" }, { type: "uint160" }, { type: "int24" }], log.data);
  return {
    kind: "v4",
    id: log.topics[1] as `0x${string}`,
    key: {
      currency0: getAddress("0x" + log.topics[2]!.slice(26)),
      currency1: getAddress("0x" + log.topics[3]!.slice(26)),
      fee: Number(fee),
      tickSpacing: Number(tickSpacing),
      hooks: getAddress(hooks as string),
    },
    block: Number(log.blockNumber ?? 0),
    tx: (log.transactionHash ?? "0x") as `0x${string}`,
  };
}

/** Scan backwards for v4 pools that pair native ETH with `token`. Bounded: `windows` × 25 000 blocks. */
export async function scanV4(client: PublicClient, token: Address, windows = 24): Promise<V4Pool[]> {
  // every window, both sides of the pool key: a token sorts as currency0 or currency1 depending on its address, and
  // stopping at the first window with a pool would keep a newer copycat pool and miss the token's real, older one
  const head = await client.getBlockNumber();
  const topic = ("0x" + token.slice(2).toLowerCase().padStart(64, "0")) as `0x${string}`;
  const found = new Map<string, V4Pool>();
  for (let i = 0; i < windows; i++) {
    const to = head - BigInt(i * LOG_WINDOW);
    const from = to - BigInt(LOG_WINDOW - 1);
    if (from < 0n) break;
    const range = { address: RH.V4_POOL_MANAGER, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` };
    const [as1, as0] = await Promise.all([
      client.request({ method: "eth_getLogs", params: [{ ...range, topics: [TOPICS.V4_INITIALIZE, null, null, topic] }] } as never),
      client.request({ method: "eth_getLogs", params: [{ ...range, topics: [TOPICS.V4_INITIALIZE, null, topic] }] } as never),
    ]);
    for (const l of [...(as1 as never[]), ...(as0 as never[])]) {
      const p = decodeInitialize(l);
      found.set(p.id.toLowerCase(), p);
    }
  }
  return [...found.values()];
}
