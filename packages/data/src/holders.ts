/**
 * Who holds a token, read from the chain: Transfer events since the pool opened (bounded window), then balanceOf
 * for the largest candidates. Labels: pool, burn, creator, first mint, snipers (bought in the first blocks after the
 * pool opened), bundle (several first-block buyers), fresh wallets (almost no transactions). Shares are of supply.
 */
import { getAddress, keccak256, toHex, type Address, type PublicClient } from "viem";
import { LOG_WINDOW, RH } from "./trust/addresses.ts";

const TRANSFER = keccak256(toHex("Transfer(address,address,uint256)"));
const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
/** Blocks after the pool opened in which a buyer counts as a sniper (~30 s at ~12 blocks/s). */
const SNIPE_BLOCKS = 360;

export type HolderTag = "pool" | "burn" | "contract" | "creator" | "minted" | "sniper" | "bundle" | "fresh" | "whale" | "dolphin" | "fish";
export interface Holder {
  address: string;
  share: number;
  tags: HolderTag[];
  bought: number;
  sold: number;
  txs: number | null;
}
export interface Holders {
  token: string;
  supply: number;
  holders: number;
  complete: boolean;
  from: number;
  top: Holder[];
  summary: { top10: number; creator: number; snipers: number; sniperCount: number; bundle: number; bundleCount: number; fresh: number; freshCount: number; pool: number; burned: number; contracts: number; insiders: number };
  /**
   * Buyer retention by week since the pool opened: of the wallets whose first buy from the pool fell in that week, how
   * many hold any of the token now. Read from every transfer since the pool opened, so only when that history is
   * complete; null otherwise.
   */
  retention: { week: number; buyers: number; holding: number }[] | null;
  ms: number;
}

type Log = { topics: string[]; data: `0x${string}`; blockNumber: string; transactionHash: string };

export async function readHolders(client: PublicClient, tokenIn: Address, opts: { poolBlock?: number | null; pools?: string[]; creator?: string | null; windows?: number } = {}): Promise<Holders> {
  const t0 = Date.now();
  const token = getAddress(tokenIn);
  const [head, supplyRaw, dec] = await Promise.all([
    client.getBlockNumber().then(Number),
    client.readContract({ address: token, abi: ERC20, functionName: "totalSupply" }) as Promise<bigint>,
    client.readContract({ address: token, abi: ERC20, functionName: "decimals" }).then(Number).catch(() => 18),
  ]);
  const windows = opts.windows ?? 60;
  const floor = head - windows * LOG_WINDOW + 1;
  const from = Math.max(floor, opts.poolBlock ? opts.poolBlock - LOG_WINDOW : floor);
  const complete = !!opts.poolBlock && opts.poolBlock - LOG_WINDOW >= floor;

  const ranges: { fromBlock: `0x${string}`; toBlock: `0x${string}` }[] = [];
  for (let to = head; to >= from; to -= LOG_WINDOW) ranges.push({ fromBlock: toHex(Math.max(from, to - LOG_WINDOW + 1)), toBlock: toHex(to) });
  // a busy token returns too many logs for one window: the RPC refuses, so the window is split in halves
  const read = async (from: number, to: number, depth = 0): Promise<Log[]> => {
    try {
      return (await client.request({ method: "eth_getLogs", params: [{ fromBlock: toHex(from), toBlock: toHex(to), address: token, topics: [TRANSFER] }] } as never)) as Log[];
    } catch (e) {
      if (depth >= 6 || to <= from) throw e;
      const mid = Math.floor((from + to) / 2);
      return [...(await read(from, mid, depth + 1)), ...(await read(mid + 1, to, depth + 1))];
    }
  };
  const logs: Log[] = [];
  for (let i = 0; i < ranges.length; i += 6) {
    const got = await Promise.all(ranges.slice(i, i + 6).map((r) => read(Number(r.fromBlock), Number(r.toBlock))));
    for (const g of got) logs.push(...g);
  }
  logs.sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber));

  const pools = new Set((opts.pools ?? []).map((p) => p.toLowerCase()).concat(RH.V4_POOL_MANAGER.toLowerCase()));
  const net = new Map<string, bigint>(), bought = new Map<string, bigint>(), sold = new Map<string, bigint>();
  const firstBuy = new Map<string, number>();
  let minted: string | null = null;
  const add = (m: Map<string, bigint>, k: string, v: bigint) => m.set(k, (m.get(k) ?? 0n) + v);
  for (const l of logs) {
    const f = `0x${l.topics[1]!.slice(26)}`.toLowerCase(), t = `0x${l.topics[2]!.slice(26)}`.toLowerCase();
    const v = BigInt(l.data);
    add(net, f, -v);
    add(net, t, v);
    if (f === ZERO && !minted && t !== ZERO) minted = t;
    if (pools.has(f)) {
      add(bought, t, v);
      if (!firstBuy.has(t)) firstBuy.set(t, Number(l.blockNumber));
    }
    if (pools.has(t)) add(sold, f, v);
  }
  // candidates: the largest net receivers plus anyone the pool paid, then their real balances
  const cands = [...new Set([...[...net.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, 70).map(([a]) => a), ...[...bought.keys()].slice(0, 30), ...(opts.creator ? [opts.creator.toLowerCase()] : []), ...(minted ? [minted] : [])])].filter((a) => a !== ZERO);
  const bal = new Map<string, bigint>();
  for (let i = 0; i < cands.length; i += 10) {
    const got = await Promise.all(cands.slice(i, i + 10).map((a) => (client.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [a as Address] }) as Promise<bigint>).catch(() => 0n)));
    got.forEach((b, j) => bal.set(cands[i + j]!, b));
  }
  const supply = Number(supplyRaw) / 10 ** dec;
  const sh = (v: bigint) => (supplyRaw > 0n ? Number((v * 1_000_000n) / supplyRaw) / 1_000_000 : 0);

  const poolBlock = opts.poolBlock ?? null;
  const snipers = new Set<string>(), bundle = new Set<string>();
  if (poolBlock) {
    const firstBlockBuyers: string[] = [];
    for (const [a, b] of firstBuy) {
      if (b - poolBlock <= SNIPE_BLOCKS && !pools.has(a)) snipers.add(a);
      if (b === poolBlock) firstBlockBuyers.push(a);
    }
    if (firstBlockBuyers.length >= 3) firstBlockBuyers.forEach((a) => bundle.add(a));
  }

  const ranked = [...bal.entries()].filter(([, b]) => b > 0n).sort((a, b) => (b[1] > a[1] ? 1 : -1));
  const top20 = ranked.slice(0, 20);
  const txCounts = await Promise.all(top20.map(([a]) => (pools.has(a) || a === DEAD ? Promise.resolve(null) : client.getTransactionCount({ address: a as Address }).catch(() => null))));
  // a holder with code is a contract (a launch curve, a hook, a locker, a vault): its share is not one person's
  const coded = new Set((await Promise.all(top20.map(([a]) => (pools.has(a) || a === DEAD ? Promise.resolve(null) : client.getCode({ address: a as Address }).then((c) => (c && c !== "0x" ? a : null)).catch(() => null))))).filter((x): x is string => !!x));
  const creator = opts.creator?.toLowerCase() ?? null;
  const top: Holder[] = top20.map(([a, b], i) => {
    const share = sh(b), txs = txCounts[i] ?? null;
    const tags: HolderTag[] = [];
    if (pools.has(a)) tags.push("pool");
    if (a === DEAD) tags.push("burn");
    if (coded.has(a)) tags.push("contract");
    if (creator && a === creator) tags.push("creator");
    if (minted && a === minted && a !== creator) tags.push("minted");
    if (bundle.has(a)) tags.push("bundle");
    else if (snipers.has(a)) tags.push("sniper");
    if (txs !== null && txs <= 3 && !tags.includes("pool")) tags.push("fresh");
    if (!tags.includes("pool") && !tags.includes("burn") && !tags.includes("contract")) tags.push(share >= 0.01 ? "whale" : share >= 0.001 ? "dolphin" : "fish");
    return { address: getAddress(a), share, tags, bought: Number(bought.get(a) ?? 0n) / 10 ** dec, sold: Number(sold.get(a) ?? 0n) / 10 ** dec, txs };
  });

  const sumBy = (pred: (a: string) => boolean) => ranked.filter(([a]) => pred(a)).reduce((s, [, b]) => s + sh(b), 0);
  const isPool = (a: string) => pools.has(a);
  const people = ranked.filter(([a]) => !isPool(a) && a !== DEAD && !coded.has(a));
  const freshSet = new Set(top.filter((h) => h.tags.includes("fresh")).map((h) => h.address.toLowerCase()));
  const summary = {
    top10: people.slice(0, 10).reduce((s, [, b]) => s + sh(b), 0),
    creator: creator ? sh(bal.get(creator) ?? 0n) : 0,
    snipers: sumBy((a) => snipers.has(a) && !bundle.has(a)),
    sniperCount: [...snipers].filter((a) => !bundle.has(a)).length,
    bundle: sumBy((a) => bundle.has(a)),
    bundleCount: bundle.size,
    fresh: sumBy((a) => freshSet.has(a)),
    freshCount: freshSet.size,
    pool: sumBy(isPool),
    burned: sh(bal.get(DEAD) ?? 0n),
    contracts: sumBy((a) => coded.has(a)),
    insiders: 0,
  };
  summary.insiders = Math.min(1, summary.creator + summary.snipers + summary.bundle + (minted && minted !== creator ? sh(bal.get(minted) ?? 0n) : 0));
  // retention: weekly cohorts of first-time buyers, at about 14,400 blocks an hour (0.25 s blocks)
  let retention: Holders["retention"] = null;
  if (complete && poolBlock) {
    const WEEK = 7 * 24 * 14_400;
    const cohorts = new Map<number, { buyers: number; holding: number }>();
    for (const [a, b] of firstBuy) {
      if (pools.has(a) || a === DEAD || coded.has(a)) continue;
      const w = Math.floor(Math.max(0, b - poolBlock) / WEEK);
      const c = cohorts.get(w) ?? { buyers: 0, holding: 0 };
      c.buyers++;
      if ((net.get(a) ?? 0n) > 0n) c.holding++;
      cohorts.set(w, c);
    }
    retention = [...cohorts.entries()].sort((x, y) => x[0] - y[0]).slice(0, 12).map(([week, c]) => ({ week, ...c }));
  }
  return { token, supply, holders: [...net.values()].filter((v) => v > 0n).length, complete, from, top, summary, retention, ms: Date.now() - t0 };
}
