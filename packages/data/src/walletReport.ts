/**
 * Wallet report: what a wallet traded, what it paid in gas, and what each trade was worth at the time.
 *
 * Which tokens: every indexed token it holds now (balanceOf over the whole index), every token it ever approved through
 * Permit2 (one contract, read back to its first block), and every token it moved in the last few days. For each token
 * the wallet's own Transfer events are read from the token's first block, so the history of a found token is whole. A
 * token bought and sold out long ago without Permit2 can be missed: the answer says how many tokens were read.
 *
 * What a trade was worth: the other side of the same transaction. USDG or WETH moved by the wallet; else the ETH that
 * crossed the pools (WETH wrapped or unwrapped, or the native side of a v4 swap); else, for a buy the wallet sent, the
 * ETH it attached. ETH turns into dollars at the WETH/USDG pool's reserves in the last update before that block. When
 * nothing of that can be read, the value is left empty: it is never guessed.
 */
import { formatUnits, pad, toEventSelector, type Address, type Hex, type PublicClient } from "viem";
import { LOG_WINDOW, RH } from "./trust/addresses.ts";
import { cleanText } from "./text.ts";
import { heldOf } from "./held.ts";

const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3" as Address;
const ZERO = "0x0000000000000000000000000000000000000000";
const SEL = {
  transfer: toEventSelector("Transfer(address,address,uint256)"),
  p2Approval: toEventSelector("Approval(address,address,address,uint160,uint48)"),
  p2Permit: toEventSelector("Permit(address,address,address,uint160,uint48,uint48)"),
  wethIn: toEventSelector("Deposit(address,uint256)"),
  wethOut: toEventSelector("Withdrawal(address,uint256)"),
  v4Swap: toEventSelector("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"),
  v2Swap: toEventSelector("Swap(address,uint256,uint256,uint256,uint256,address)"),
  v2Mint: toEventSelector("Mint(address,uint256,uint256)"),
  v2Burn: toEventSelector("Burn(address,uint256,uint256,address)"),
  v4Liq: toEventSelector("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)"),
  sync: toEventSelector("Sync(uint112,uint112)"),
};
const ERC20 = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
const FACTORY = [{ type: "function", name: "getPair", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] }] as const;

type Log = { address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex?: string };
type Receipt = { from: string; to: string | null; gasUsed: bigint; effectiveGasPrice: bigint; status: string; logs: Log[] };

export type ReportKind = "buy" | "sell" | "swap" | "liquidity" | "in" | "out";
export type ReportRow = {
  at: number;
  block: number;
  tx: string;
  kind: ReportKind;
  token: string;
  symbol: string;
  /** signed: what entered (+) or left (-) the wallet */
  amount: number;
  /** the other side, when one was read */
  counter: { symbol: string; amount: number } | null;
  usd: number | null;
  gasEth: number | null;
  gasUsd: number | null;
};
export type ReportToken = {
  token: string;
  symbol: string;
  buys: number;
  sells: number;
  bought: number;
  sold: number;
  spentUsd: number;
  receivedUsd: number;
  /** average-cost result of what was sold; null when a side of it could not be valued */
  realizedUsd: number | null;
  held: number;
};
export type WalletReport = {
  address: string;
  head: string;
  tokensRead: number;
  tokensFound: number;
  rows: ReportRow[];
  tokens: ReportToken[];
  totals: { txs: number; buys: number; sells: number; spentUsd: number; receivedUsd: number; realizedUsd: number; unvalued: number; gasEth: number; gasUsd: number };
  capped: boolean;
  firstAt: number | null;
  ethUsd: number | null;
};
export type ReportIndex = {
  /** every token in the index: address, first block */
  tokens(): { address: string; firstBlock: number | null }[];
  /** currency0/currency1 of v4 pools */
  pools(ids: string[]): Map<string, { token0: string; token1: string }>;
};

const hex = (n: bigint) => `0x${n.toString(16)}` as Hex;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TOO_BIG = /spans|range|exceeds limit|too many (results|logs)|limit exceeded|response size|query returned more/i;

async function each<T, R>(items: T[], lanes: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]!, k);
    }
  }));
  return out;
}

/** One log query: halved when the node calls it too big, asked again when it was refused for the rate or lost. */
async function logs(client: PublicClient, q: { address?: string; topics: (string | string[] | null)[] }, from: bigint, to: bigint, depth = 0): Promise<Log[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await client.request({ method: "eth_getLogs", params: [{ ...q, fromBlock: hex(from), toBlock: hex(to) }] } as never)) as Log[];
    } catch (e) {
      const msg = String((e as { details?: string })?.details ?? (e as Error)?.message ?? e);
      if (TOO_BIG.test(msg) && depth < 12 && to > from) {
        const mid = from + (to - from) / 2n;
        return [...(await logs(client, q, from, mid, depth + 1)), ...(await logs(client, q, mid + 1n, to, depth + 1))];
      }
      if (attempt >= 4) throw e;
      await pause(1_200 * (attempt + 1) + Math.random() * 400);
    }
  }
}
/** A range in windows the node takes: 10M blocks for one contract, LOG_WINDOW without one. */
async function ranged(client: PublicClient, q: { address?: string; topics: (string | string[] | null)[] }, from: bigint, to: bigint, window: bigint, lanes: number): Promise<Log[]> {
  const w: [bigint, bigint][] = [];
  for (let a = from; a <= to; a += window) w.push([a, a + window - 1n > to ? to : a + window - 1n]);
  return (await each(w, lanes, ([a, b]) => logs(client, q, a, b))).flat();
}

const word = (data: string, i: number) => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64) || "0"}`);
const int128 = (data: string, i: number) => {
  const v = word(data, i);
  return v >= 2n ** 255n ? v - 2n ** 256n : v;
};

/**
 * ETH that crossed the pools in one transaction: the larger of what was wrapped or unwrapped and what native v4 pools
 * moved (a route can do both with the same ETH, so they are never added together).
 */
export function ethCrossed(receipt: { logs: Log[] }, pools: Map<string, { token0: string; token1: string }>): bigint {
  let wrapped = 0n, unwrapped = 0n, native = 0n;
  for (const l of receipt.logs) {
    const a = l.address.toLowerCase(), t = l.topics[0];
    if (a === RH.WETH && t === SEL.wethIn) wrapped += word(l.data, 0);
    else if (a === RH.WETH && t === SEL.wethOut) unwrapped += word(l.data, 0);
    else if (a === RH.V4_POOL_MANAGER && t === SEL.v4Swap) {
      const p = pools.get(l.topics[1]!.toLowerCase());
      if (p?.token0 === ZERO) {
        const v = int128(l.data, 0);
        native += v < 0n ? -v : v;
      }
    }
  }
  return [wrapped, unwrapped, native].reduce((m, v) => (v > m ? v : m), 0n);
}

/**
 * What a buy cost: the ETH the wallet attached, which includes the interface's fee; the ETH that crossed the pools when
 * far more was attached than used (the rest came back) or nothing was (someone else sent the transaction).
 */
export const paidEth = (sent: number, crossed: number) => (sent >= crossed && sent <= crossed * 1.1 ? sent : crossed);

/** Average-cost result per token from its rows, oldest first. Sold coins with no valued cost make the result unknown. */
export function tokenTotals(rows: ReportRow[], held: Map<string, number>): ReportToken[] {
  const by = new Map<string, ReportRow[]>();
  for (const r of rows) by.set(r.token, [...(by.get(r.token) ?? []), r]);
  const out: ReportToken[] = [];
  for (const [token, list] of by) {
    const t: ReportToken = { token, symbol: list[0]!.symbol, buys: 0, sells: 0, bought: 0, sold: 0, spentUsd: 0, receivedUsd: 0, realizedUsd: 0, held: held.get(token) ?? 0 };
    let qty = 0, cost = 0, known = true;
    for (const r of [...list].sort((a, b) => a.block - b.block)) {
      if (r.amount > 0) {
        if (r.kind === "buy" || r.kind === "swap") {
          t.buys++;
          t.bought += r.amount;
          if (r.usd === null) known = false;
          else t.spentUsd += r.usd;
          cost += r.usd ?? 0;
        } else known = false; // received for free or from liquidity: its cost is not on chain
        qty += r.amount;
      } else {
        const n = Math.min(-r.amount, qty);
        const avg = qty > 0 ? cost / qty : 0;
        if (r.kind === "sell" || r.kind === "swap") {
          t.sells++;
          t.sold += -r.amount;
          if (r.usd === null) known = false;
          else {
            t.receivedUsd += r.usd;
            if (-r.amount > qty * 1.000001) known = false;
            if (t.realizedUsd !== null) t.realizedUsd += r.usd - avg * n;
          }
        }
        qty -= n;
        cost -= avg * n;
      }
    }
    if (!known || t.sells === 0) t.realizedUsd = t.sells === 0 ? 0 : null;
    out.push(t);
  }
  return out.sort((a, b) => b.spentUsd + b.receivedUsd - (a.spentUsd + a.receivedUsd));
}

/** ETH in dollars at a block: the WETH/USDG pair's reserves in its last update at or before that block. */
function ethPrices(client: PublicClient, pair: Address, wethIs0: boolean) {
  const cache = new Map<string, Promise<number | null>>();
  const STEP = 25_000n; // under an hour: one price per step is enough for a report, and the pair updates all the time
  return (block: bigint): Promise<number | null> => {
    const slot = block / STEP;
    const key = slot.toString();
    let p = cache.get(key);
    if (!p) {
      p = (async () => {
        for (let back = 0n; back < 4n; back++) {
          const to = (slot - back) * STEP + (back === 0n ? block % STEP : STEP - 1n);
          const l = await logs(client, { address: pair, topics: [SEL.sync] }, (slot - back) * STEP, to).catch(() => [] as Log[]);
          const last = l.at(-1);
          if (!last) continue;
          const r0 = Number(formatUnits(word(last.data, 0), wethIs0 ? 18 : 6)), r1 = Number(formatUnits(word(last.data, 1), wethIs0 ? 6 : 18));
          const v = wethIs0 ? r1 / r0 : r0 / r1;
          if (Number.isFinite(v) && v > 0) return v;
        }
        return null;
      })().catch(() => null);
      cache.set(key, p);
    }
    return p;
  };
}

const MAX_TOKENS = 60;
const MAX_TX = 400;

export async function readWalletReport(client: PublicClient, address: Address, index: ReportIndex, opts: { recentBlocks: bigint; onStep?: (step: string) => void }): Promise<WalletReport> {
  const step = opts.onStep ?? (() => {});
  const me = address.toLowerCase() as Address;
  const topic = pad(me, { size: 32 });
  step("Reading the latest block");
  const head = await client.getBlockNumber();
  const all = index.tokens();
  const born = new Map(all.map((t) => [t.address.toLowerCase(), t.firstBlock ?? 0]));

  // 1. which tokens: held now, ever approved through Permit2, moved in the last days
  // the three reads run side by side: none of them waits for another
  step("Looking for tokens: balances, Permit2, the last day of transfers");
  const rFrom = head > opts.recentBlocks ? head - opts.recentBlocks : 0n;
  const p2 = (ev: string) => ranged(client, { address: PERMIT2, topics: [ev, topic] }, 0n, head, 10_000_000n, 2);
  const [heldRaw, approved, permitted, rOut, rIn] = await Promise.all([
    heldOf(client, me, [...born.keys()]),
    // one event per query: the node takes the wide range only for one value of each topic
    p2(SEL.p2Approval),
    p2(SEL.p2Permit),
    ranged(client, { topics: [SEL.transfer, topic] }, rFrom, head, BigInt(LOG_WINDOW), 2),
    ranged(client, { topics: [SEL.transfer, null, topic] }, rFrom, head, BigInt(LOG_WINDOW), 2),
  ]);
  const found = new Set<string>([...heldRaw.keys(), RH.USDG, RH.WETH]);
  for (const l of [...approved, ...permitted]) found.add(`0x${l.topics[2]!.slice(26)}`.toLowerCase());
  for (const l of [...rOut, ...rIn]) if (l.topics.length === 3) found.add(l.address.toLowerCase());

  // 2. the whole history of each found token, from its first block. Newest tokens first when there are too many
  const list = [...found].sort((a, b) => (a === RH.USDG || a === RH.WETH ? -1 : b === RH.USDG || b === RH.WETH ? 1 : (born.get(b) ?? 0) - (born.get(a) ?? 0)));
  const read = list.slice(0, MAX_TOKENS);
  let done = 0;
  const moves: Log[] = (
    await each(read, 3, async (t) => {
      const from = BigInt(Math.max(0, (born.get(t) ?? 0) - 1));
      const [o, i] = await Promise.all([
        ranged(client, { address: t, topics: [SEL.transfer, topic] }, from, head, 10_000_000n, 2),
        ranged(client, { address: t, topics: [SEL.transfer, null, topic] }, from, head, 10_000_000n, 2),
      ]);
      step(`Reading token histories: ${++done} of ${read.length}`);
      const seen = new Set<string>();
      return [...o, ...i].filter((l) => l.topics.length === 3 && l.data.length >= 66 && !seen.has(`${l.transactionHash}:${l.logIndex}`) && seen.add(`${l.transactionHash}:${l.logIndex}`));
    })
  ).flat();

  // 3. group by transaction, newest first up to the cap
  const byTx = new Map<string, { block: bigint; net: Map<string, bigint> }>();
  for (const l of moves) {
    const e = byTx.get(l.transactionHash) ?? { block: BigInt(l.blockNumber), net: new Map<string, bigint>() };
    const t = l.address.toLowerCase(), v = word(l.data, 0);
    const to = `0x${l.topics[2]!.slice(26)}`.toLowerCase(), from = `0x${l.topics[1]!.slice(26)}`.toLowerCase();
    const d = (to === me ? v : 0n) - (from === me ? v : 0n);
    e.net.set(t, (e.net.get(t) ?? 0n) + d);
    byTx.set(l.transactionHash, e);
  }
  const txs = [...byTx.entries()].sort((a, b) => (b[1].block > a[1].block ? 1 : -1));
  const capped = txs.length > MAX_TX;
  const take = txs.slice(0, MAX_TX);

  step("Reading receipts and prices");
  const meta = new Map<string, { symbol: string; dec: number }>();
  await each([...new Set(take.flatMap(([, e]) => [...e.net.keys()]))], 4, async (t) => {
    const [s, d] = await Promise.all([
      client.readContract({ address: t as Address, abi: ERC20, functionName: "symbol" }).catch(() => "?"),
      client.readContract({ address: t as Address, abi: ERC20, functionName: "decimals" }).catch(() => 18),
    ]);
    meta.set(t, { symbol: cleanText(String(s), 16) || "?", dec: Number(d) });
  });
  const receipts = new Map<string, Receipt>();
  const blocks = new Map<string, number>();
  await each(take, 4, async ([h, e]) => {
    const [r, b] = await Promise.all([
      client.request({ method: "eth_getTransactionReceipt", params: [h as Hex] }).catch(() => null),
      blocks.has(e.block.toString()) ? null : client.getBlock({ blockNumber: e.block }).catch(() => null),
    ]);
    if (r) receipts.set(h, { ...(r as unknown as Receipt), gasUsed: BigInt((r as unknown as { gasUsed: string }).gasUsed), effectiveGasPrice: BigInt((r as unknown as { effectiveGasPrice: string }).effectiveGasPrice ?? "0x0") });
    if (b) blocks.set(e.block.toString(), Number(b.timestamp) * 1000);
  });
  const ids = [...new Set([...receipts.values()].flatMap((r) => r.logs.filter((l) => l.address.toLowerCase() === RH.V4_POOL_MANAGER && l.topics[0] === SEL.v4Swap).map((l) => l.topics[1]!.toLowerCase())))];
  const pools = ids.length ? index.pools(ids) : new Map<string, { token0: string; token1: string }>();
  const pair = (await client.readContract({ address: RH.V2_FACTORY as Address, abi: FACTORY, functionName: "getPair", args: [RH.WETH as Address, RH.USDG as Address] })) as Address;
  const price = ethPrices(client, pair, RH.WETH < RH.USDG);

  // 4. rows
  const rows: ReportRow[] = [];
  await each(take, 4, async ([h, e]) => {
    const r = receipts.get(h);
    const at = blocks.get(e.block.toString()) ?? 0;
    const eth = await price(e.block);
    const mine = r?.from.toLowerCase() === me;
    const gasEth = r && mine ? Number(formatUnits(r.gasUsed * r.effectiveGasPrice, 18)) : null;
    const amt = (t: string) => Number(formatUnits(e.net.get(t) ?? 0n, meta.get(t)?.dec ?? 18));
    const base = ([RH.USDG, RH.WETH] as string[]).filter((t) => (e.net.get(t) ?? 0n) !== 0n);
    const others = [...e.net.keys()].filter((t) => t !== RH.USDG && t !== RH.WETH && e.net.get(t) !== 0n);
    const has = (...s: string[]) => !!r?.logs.some((l) => s.includes(l.topics[0] ?? ""));
    const liquidity = has(SEL.v2Mint, SEL.v2Burn) || (has(SEL.v4Liq) && !has(SEL.v4Swap));
    const swapped = has(SEL.v2Swap, SEL.v4Swap);
    const crossed = r ? Number(formatUnits(ethCrossed(r, pools), 18)) : 0;
    let sent = 0;
    const ins = others.filter((t) => e.net.get(t)! > 0n), outs = others.filter((t) => e.net.get(t)! < 0n);
    if (r && mine && !base.length && ins.length && !outs.length) {
      const t = await client.getTransaction({ hash: h as Hex }).catch(() => null);
      sent = t ? Number(formatUnits(t.value, 18)) : 0;
    }
    let first = true;
    const push = (t: string, kind: ReportKind, counter: ReportRow["counter"], usd: number | null) => {
      rows.push({ at, block: Number(e.block), tx: h, kind, token: t, symbol: meta.get(t)?.symbol ?? "?", amount: amt(t), counter, usd, gasEth: first ? gasEth : null, gasUsd: first && gasEth !== null && eth !== null ? gasEth * eth : null });
      first = false;
    };
    const ethSide = (v: number): { counter: ReportRow["counter"]; usd: number | null } => (v > 0 ? { counter: { symbol: "ETH", amount: v }, usd: eth === null ? null : v * eth } : { counter: null, usd: null });
    const baseSide = (): { counter: ReportRow["counter"]; usd: number | null } | null => {
      const t = base[0];
      if (!t) return null;
      const v = Math.abs(amt(t));
      return { counter: { symbol: t === RH.USDG ? "USDG" : "WETH", amount: v }, usd: t === RH.USDG ? v : eth === null ? null : v * eth };
    };
    if (liquidity) {
      for (const t of [...others, ...base]) push(t, "liquidity", null, null);
    } else if (ins.length && outs.length) {
      // token for token: both sides are worth the ETH in the middle (it crossed on the way out and in)
      const side = swapped && crossed > 0 ? ethSide(crossed) : { counter: null, usd: null };
      for (const t of outs) push(t, "swap", ins[0] ? { symbol: meta.get(ins[0])?.symbol ?? "?", amount: amt(ins[0]) } : null, outs.length === 1 ? side.usd : null);
      for (const t of ins) push(t, "swap", outs[0] ? { symbol: meta.get(outs[0])?.symbol ?? "?", amount: -amt(outs[0]) } : null, ins.length === 1 ? side.usd : null);
    } else if (others.length) {
      const buy = ins.length > 0;
      const bs = base.length && Math.sign(amt(base[0]!)) === (buy ? -1 : 1) ? baseSide() : null;
      const side = bs ?? (swapped && crossed > 0 ? ethSide(buy ? paidEth(sent, crossed) : crossed) : buy && sent > 0 ? ethSide(sent) : null);
      const traded = !!bs || swapped || (buy && sent > 0);
      for (const t of others) push(t, traded ? (buy ? "buy" : "sell") : buy ? "in" : "out", side?.counter ?? null, traded && others.length === 1 ? side?.usd ?? null : null);
    } else {
      // only USDG or WETH moved: an ETH/USDG swap, wrapping, or a plain transfer
      for (const t of base) {
        const v = amt(t);
        if (t === RH.USDG && swapped && crossed > 0) push(t, v > 0 ? "buy" : "sell", { symbol: "ETH", amount: crossed }, Math.abs(v));
        else push(t, v > 0 ? "in" : "out", null, t === RH.USDG ? Math.abs(v) : eth === null ? null : Math.abs(v) * eth);
      }
    }
  });
  rows.sort((a, b) => b.block - a.block);

  const held = new Map([...heldRaw].map(([t, v]) => [t, Number(formatUnits(v, meta.get(t)?.dec ?? 18))]));
  const traded = rows.filter((r) => r.token !== RH.USDG && r.token !== RH.WETH);
  const tokens = tokenTotals(traded, held).filter((t) => t.buys + t.sells > 0);
  const sum = (f: (r: ReportRow) => number | null) => rows.reduce((s, r) => s + (f(r) ?? 0), 0);
  const trade = traded.filter((r) => r.kind === "buy" || r.kind === "sell" || r.kind === "swap");
  return {
    address: me,
    head: head.toString(),
    tokensRead: read.length,
    tokensFound: found.size,
    rows,
    tokens,
    totals: {
      txs: take.length,
      buys: trade.filter((r) => r.amount > 0).length,
      sells: trade.filter((r) => r.amount < 0).length,
      spentUsd: tokens.reduce((s, t) => s + t.spentUsd, 0),
      receivedUsd: tokens.reduce((s, t) => s + t.receivedUsd, 0),
      realizedUsd: tokens.reduce((s, t) => s + (t.realizedUsd ?? 0), 0),
      unvalued: trade.filter((r) => r.usd === null).length,
      gasEth: sum((r) => r.gasEth),
      gasUsd: sum((r) => r.gasUsd),
    },
    capped,
    firstAt: rows.at(-1)?.at ?? null,
    ethUsd: await price(head),
  };
}
