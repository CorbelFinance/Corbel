/**
 * Who controls a v4 pool's liquidity. v4 has no LP token: liquidity sits in positions keyed by
 * (sender, ticks, salt). We replay the pool's ModifyLiquidity events, net each position, then ask who can
 * pull it: a position-manager NFT (its owner, burned or not), the pool's hook, another contract, or a wallet.
 * Shares are in liquidity units, which compare positions only roughly when their ranges differ.
 */
import { decodeAbiParameters, type Address, type Hex, type PublicClient } from "viem";
import { BURN_ADDRESSES, LOG_WINDOW, RH, TOPICS } from "./addresses.ts";

export type Holder = "burned" | "hook" | "contract" | "wallet";
export interface LockRead {
  shares: Record<Holder, number>;
  positions: number;
  /** the scan started at the pool's creation block (false: older events may be missing) */
  complete: boolean;
  topHolder: { kind: Holder; address: string; share: number } | null;
}

const OWNER_OF = [{ type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] }] as const;
const MAX_WINDOWS = 120; // ~3.5 days at 4 blocks/s; older pools are read from their last 120 windows only

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]!);
    }
  }));
  return out;
}

export async function readV4Lock(client: PublicClient, poolId: Hex, hooks: Address, createdAt: number | null, head: bigint): Promise<LockRead | null> {
  const start = createdAt !== null ? BigInt(createdAt) : head - BigInt(LOG_WINDOW * MAX_WINDOWS);
  const windows: [bigint, bigint][] = [];
  for (let to = head; to >= start && windows.length < MAX_WINDOWS; to -= BigInt(LOG_WINDOW)) {
    const from = to - BigInt(LOG_WINDOW) + 1n;
    windows.push([from < start ? start : from, to]);
  }
  const complete = createdAt !== null && windows.length < MAX_WINDOWS + 1 && windows.at(-1)![0] <= BigInt(createdAt);
  let logs: { topics: Hex[]; data: Hex }[];
  try {
    const parts = await pool(windows, 6, ([from, to]) =>
      client.request({
        method: "eth_getLogs",
        params: [{ address: RH.V4_POOL_MANAGER, topics: [TOPICS.V4_MODIFY_LIQUIDITY, poolId], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }],
      } as never) as Promise<{ topics: Hex[]; data: Hex }[]>,
    );
    logs = parts.flat();
  } catch {
    return null;
  }

  // net liquidity per position
  const pos = new Map<string, { sender: Address; salt: Hex; liq: bigint }>();
  for (const l of logs) {
    const sender = `0x${l.topics[2]!.slice(26)}`.toLowerCase() as Address;
    const [tl, tu, delta, salt] = decodeAbiParameters([{ type: "int24" }, { type: "int24" }, { type: "int256" }, { type: "bytes32" }], l.data);
    const k = `${sender}:${tl}:${tu}:${salt}`;
    const p = pos.get(k) ?? { sender, salt: salt as Hex, liq: 0n };
    p.liq += delta as bigint;
    pos.set(k, p);
  }
  const live = [...pos.values()].filter((p) => p.liq > 0n);
  const total = live.reduce((a, p) => a + p.liq, 0n);
  const shares: Record<Holder, number> = { burned: 0, hook: 0, contract: 0, wallet: 0 };
  if (total === 0n) return { shares, positions: 0, complete, topHolder: null };

  const codeCache = new Map<string, boolean>();
  const isContract = async (a: Address) => {
    if (!codeCache.has(a)) {
      const c = await client.getCode({ address: a }).catch(() => undefined);
      codeCache.set(a, !!c && c !== "0x");
    }
    return codeCache.get(a)!;
  };
  const byHolder = new Map<string, { kind: Holder; liq: bigint }>();
  await pool(live, 6, async (p) => {
    let kind: Holder;
    let who: string = p.sender;
    if (p.sender === hooks.toLowerCase()) kind = "hook";
    else {
      // position manager: salt = tokenId, the NFT owner can withdraw
      const owner = await client.readContract({ address: p.sender, abi: OWNER_OF, functionName: "ownerOf", args: [BigInt(p.salt)] }).catch(() => null);
      if (owner) {
        who = owner.toLowerCase();
        kind = (BURN_ADDRESSES as readonly string[]).includes(who) ? "burned" : (await isContract(owner)) ? "contract" : "wallet";
      } else kind = (await isContract(p.sender)) ? "contract" : "wallet";
    }
    const h = byHolder.get(who) ?? { kind, liq: 0n };
    h.liq += p.liq;
    byHolder.set(who, h);
  });
  for (const h of byHolder.values()) shares[h.kind] += Number((h.liq * 10_000n) / total) / 10_000;
  const [addr, top] = [...byHolder.entries()].sort((a, b) => (b[1].liq > a[1].liq ? 1 : -1))[0]!;
  return { shares, positions: live.length, complete, topHolder: { kind: top.kind, address: addr, share: Number((top.liq * 10_000n) / total) / 10_000 } };
}
