/**
 * One token's market, read from the chain: the pool it trades in, its swaps over the last day, the
 * pool's own price ladder (V2), and a dollar view through the WETH/USDG pool. Everything is a read:
 * eth_getLogs for Swap events, eth_call for reserves and supply, block headers for time.
 */
import { decodeAbiParameters, encodeAbiParameters, getAddress, keccak256, toHex, type Address, type Hex, type PublicClient } from "viem";
import { LOG_WINDOW, RH } from "./trust/addresses.ts";
import { findV2 } from "./trust/pools.ts";

const V2_SWAP = keccak256(toHex("Swap(address,uint256,uint256,uint256,uint256,address)"));
const V2_SYNC = keccak256(toHex("Sync(uint112,uint112)"));
const V2_MINT = keccak256(toHex("Mint(address,uint256,uint256)"));
const V2_BURN = keccak256(toHex("Burn(address,uint256,uint256,address)"));
const V4_MODIFY = keccak256(toHex("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)"));
const V4_SWAP = keccak256(toHex("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"));
/** The USDG/WETH V2 pair, used only to turn WETH amounts into dollars. Read from the factory on 2026-11-12. */
const WETH_USDG_PAIR = "0x8803c117ccae7b5146297876c2a25df135141c4d" as Address;

const ERC20 = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
const PAIR = [
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

export interface V4Ref {
  id: `0x${string}`;
  key: { currency0: `0x${string}`; currency1: `0x${string}`; fee: number; tickSpacing: number; hooks: `0x${string}` };
  block: number;
}

export interface Trade {
  block: number;
  /** unix seconds, interpolated between measured block times */
  t: number;
  side: "buy" | "sell";
  /** base per token: the pool's price right after the swap (V2 Sync, v4 sqrtPriceX96) */
  price: number;
  token: number;
  base: number;
  tx: string;
  /** the address the pool paid or was paid by: the swap's recipient (V2) or the router (v4) */
  who: string;
  /** the wallet that signed the transaction, for the newest swaps (a router is never a person) */
  from?: string;
}

export interface LadderStep {
  move: number;
  /** base needed to push the price up by `move` (buys), or base paid out when sells push it down */
  base: number;
  token: number;
}

export interface Market {
  token: { address: string; symbol: string; name: string; decimals: number; supply: number | null };
  pool: { kind: "v2" | "v4"; id: string; base: string; hooked: boolean; fee: number | null };
  base: { symbol: string; usd: number };
  head: number;
  from: number;
  /** unix time of the first block read */
  since: number;
  price: number | null;
  reserves: { token: number; base: number } | null;
  /** estimate: a v4 pool, read from the liquidity in range now (see v4Ladder) */
  ladder: { up: LadderStep[]; down: LadderStep[]; estimate?: boolean } | null;
  trades: Trade[];
  /** liquidity added to or taken out of the pool in the window */
  lp: LpEvent[];
  ms: number;
}

export interface LpEvent {
  block: number;
  t: number;
  kind: "add" | "remove";
  /** V2 only: amounts moved; v4 liquidity sits in ranges, so only the direction is known */
  token: number | null;
  base: number | null;
  tx: string;
  /** the wallet that signed the transaction, for the newest events */
  from?: string;
}

/** Signers already read, by transaction: a transaction's signer never changes, so it is read once per process. */
const SIGNERS = ((globalThis as unknown as { __corbelSigners?: Map<string, string> }).__corbelSigners ??= new Map<string, string>());

/** The signing wallet of each transaction, a few at a time; a read that fails leaves it unknown. */
async function signers(client: PublicClient, txs: string[]) {
  const todo = [...new Set(txs)].filter((h) => !SIGNERS.has(h));
  for (let i = 0; i < todo.length; i += 10)
    await Promise.all(
      todo.slice(i, i + 10).map((h) =>
        client
          .getTransaction({ hash: h as Hex })
          .then((tx) => SIGNERS.set(h, tx.from.toLowerCase()))
          .catch(() => undefined),
      ),
    );
  if (SIGNERS.size > 50_000) for (const k of [...SIGNERS.keys()].slice(0, 10_000)) SIGNERS.delete(k);
}

const MOVES = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2];

export function v2Ladder(rt: number, rb: number) {
  const k = rt * rb;
  const p = rb / rt;
  const up = MOVES.map((m) => {
    const t2 = Math.sqrt(k / (p * (1 + m)));
    return { move: m, base: k / t2 - rb, token: rt - t2 };
  });
  const down = MOVES.map((m) => {
    const t2 = Math.sqrt(k / (p * (1 - m)));
    return { move: m, base: rb - k / t2, token: t2 - rt };
  });
  return { up, down };
}

/**
 * The same ladder for a v4 pool, from the liquidity in range now (L) and the current √price: moving √P to √P' takes
 * L·(√P' − √P) of currency1 and L·(1/√P − 1/√P') of currency0 (raw units). Exact while L holds across the move (a
 * full-range pool, as launchpads make); where a range ends inside the move it is an estimate. Fees are left out.
 */
export function v4Ladder(L: number, sqrtX96: number, tokenIs0: boolean, tokenDec: number, baseDec: number) {
  const s = sqrtX96 / 2 ** 96; // √(raw currency1 per raw currency0)
  const step = (m: number, up: boolean) => {
    // the token's price in base moves by m: P (c1 per c0) moves the same way when the token is currency0
    const f = tokenIs0 ? (up ? 1 + m : 1 - m) : up ? 1 / (1 + m) : 1 / (1 - m);
    const s2 = s * Math.sqrt(f);
    const d1 = L * Math.abs(s2 - s), d0 = L * Math.abs(1 / s - 1 / s2);
    const [tok, base] = tokenIs0 ? [d0, d1] : [d1, d0];
    return { move: m, base: base / 10 ** baseDec, token: tok / 10 ** tokenDec };
  };
  return { up: MOVES.map((m) => step(m, true)), down: MOVES.map((m) => step(m, false)) };
}

const EXTSLOAD = [{ type: "function", name: "extsload", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bytes32" }] }] as const;
/** slot0 and the in-range liquidity of a v4 pool (Pool.State at keccak(id, 6): slot0 at +0, liquidity at +3). */
export async function v4State(client: PublicClient, id: Hex): Promise<{ sqrt: bigint; liquidity: bigint } | null> {
  const base = BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [id, 6n])));
  const read = (slot: bigint) => client.readContract({ address: RH.V4_POOL_MANAGER as Address, abi: EXTSLOAD, functionName: "extsload", args: [toHex(slot, { size: 32 })] }).catch(() => null);
  const [w0, w3] = await Promise.all([read(base), read(base + 3n)]);
  if (!w0 || !w3) return null;
  const sqrt = BigInt(w0) & ((1n << 160n) - 1n), liquidity = BigInt(w3) & ((1n << 128n) - 1n);
  return sqrt > 0n && liquidity > 0n ? { sqrt, liquidity } : null;
}

export async function ethUsd(client: PublicClient): Promise<number> {
  const [r0, r1] = (await client.readContract({ address: WETH_USDG_PAIR, abi: PAIR, functionName: "getReserves" })) as readonly [bigint, bigint, number];
  const t0 = ((await client.readContract({ address: WETH_USDG_PAIR, abi: PAIR, functionName: "token0" })) as string).toLowerCase();
  const [weth, usdg] = t0 === RH.WETH ? [r0, r1] : [r1, r0];
  return Number(usdg) / 1e6 / (Number(weth) / 1e18);
}

/** The chain's base assets by name: a symbol read that fails (a busy node) must never show them as "?". */
const KNOWN_META: Record<string, { symbol: string; name: string }> = {
  "0x0000000000000000000000000000000000000000": { symbol: "ETH", name: "Ether" },
  [RH.WETH]: { symbol: "WETH", name: "Wrapped Ether" },
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": { symbol: "USDG", name: "Global Dollar" },
};

async function meta(client: PublicClient, a: Address) {
  const call = (functionName: "symbol" | "name" | "decimals" | "totalSupply") => client.readContract({ address: a, abi: ERC20, functionName }).catch(() => null);
  // one more try for the name fields: a single failed read is usually the node, not the token
  const named = async (f: "symbol" | "name") => (await call(f)) ?? (await new Promise((ok) => setTimeout(ok, 400)).then(() => call(f)));
  const [sym0, name0, decimals, supply] = await Promise.all([named("symbol"), named("name"), call("decimals"), call("totalSupply")]);
  const known = KNOWN_META[a.toLowerCase()];
  const symbol = known?.symbol ?? sym0, name = known?.name ?? name0;
  const d = decimals === null ? 18 : Number(decimals);
  return { symbol: (symbol as string | null) ?? "?", name: (name as string | null) ?? "", decimals: d, supply: supply === null ? null : Number(supply as bigint) / 10 ** d };
}

const BASES: Record<string, { symbol: string; decimals: number }> = {
  [RH.WETH]: { symbol: "WETH", decimals: 18 },
  [RH.USDG]: { symbol: "USDG", decimals: 6 },
  [RH.NATIVE]: { symbol: "ETH", decimals: 18 },
};

/** Block → unix time, from measured anchor blocks, linear in between. */
async function clock(client: PublicClient, blocks: bigint[]) {
  const pts = await Promise.all(blocks.map(async (n) => ({ n: Number(n), t: Number((await client.getBlock({ blockNumber: n })).timestamp) })));
  pts.sort((a, b) => a.n - b.n);
  return (n: number) => {
    let i = pts.findIndex((p) => p.n >= n);
    if (i === -1) i = pts.length - 1;
    else if (i === 0) i = 1;
    const a = pts[i - 1]!, b = pts[i]!;
    return b.n === a.n ? a.t : Math.round(a.t + ((n - a.n) * (b.t - a.t)) / (b.n - a.n));
  };
}

type Log = { topics: string[]; data: `0x${string}`; blockNumber: string; transactionHash: string; logIndex: string };

/**
 * Reads the market for `token`. `v4` are the token's v4 pools from the local index (newest first).
 * `windows` × LOG_WINDOW blocks of history (14 ≈ one day at ~4 blocks a second).
 */
export async function readMarket(client: PublicClient, tokenIn: Address, v4: V4Ref[], windows = 36): Promise<Market | null> {
  const t0 = Date.now();
  const token = getAddress(tokenIn);
  const lower = token.toLowerCase();
  const [m, usd, headBig] = await Promise.all([meta(client, token), ethUsd(client).catch(() => 0), client.getBlockNumber()]);

  // the pool: the deepest V2 pair against WETH or USDG, else the newest unhooked v4 pool against ETH, WETH or USDG
  const v2 = await findV2(client, token).catch(() => []);
  const toUsd = (b: { base: string; baseReserve: bigint }) => (b.base === "USDG" ? Number(b.baseReserve) / 1e6 : (Number(b.baseReserve) / 1e18) * usd);
  const bestV2 = v2.sort((a, b) => toUsd(b) - toUsd(a))[0];
  const v4ok = v4.filter((p) => {
    const other = p.key.currency0.toLowerCase() === lower ? p.key.currency1.toLowerCase() : p.key.currency0.toLowerCase();
    return BASES[other] !== undefined;
  });
  const bestV4 = v4ok.find((p) => /^0x0{40}$/i.test(p.key.hooks)) ?? v4ok[0];
  if (!bestV2 && !bestV4) return null;

  const head = Number(headBig);
  const from = head - windows * LOG_WINDOW + 1;
  const edges: bigint[] = [];
  for (let i = 0; i <= windows; i++) edges.push(BigInt(Math.max(0, head - i * LOG_WINDOW)));
  const when = await clock(client, edges.filter((_, i) => i % 2 === 0 || i === windows));

  const ranges = Array.from({ length: windows }, (_, i) => {
    const to = head - i * LOG_WINDOW;
    return { fromBlock: toHex(Math.max(0, to - LOG_WINDOW + 1)), toBlock: toHex(to) };
  });

  // a busy pool's window can be too much for one answer (the node refuses it, or it runs past the size or time limit):
  // that window is split in halves until each half fits, as the holders reader does
  const read = async (q: Record<string, unknown>, from: number, to: number, depth = 0): Promise<Log[]> => {
    try {
      return (await client.request({ method: "eth_getLogs", params: [{ ...q, fromBlock: toHex(from), toBlock: toHex(to) }] } as never)) as Log[];
    } catch (e) {
      if (depth >= 6 || to <= from) throw e;
      const mid = Math.floor((from + to) / 2);
      return [...(await read(q, from, mid, depth + 1)), ...(await read(q, mid + 1, to, depth + 1))];
    }
  };
  const logsFor = async (q: Record<string, unknown>) => (await Promise.all(ranges.map((r) => read(q, Number(r.fromBlock), Number(r.toBlock))))).flat();
  const v2Logs = (pair: Address) => logsFor({ address: pair, topics: [[V2_SWAP, V2_SYNC, V2_MINT, V2_BURN]] });
  const v4Logs = (id: string) => logsFor({ address: RH.V4_POOL_MANAGER, topics: [[V4_SWAP, V4_MODIFY], id] });
  const [l2, l4] = await Promise.all([bestV2 ? v2Logs(bestV2.pair) : Promise.resolve(null), bestV4 ? v4Logs(bestV4.id) : Promise.resolve(null)]);
  // the busier pool wins; a V2 pair wins a tie because its curve is exact
  const swaps2 = l2?.filter((l) => l.topics[0] === V2_SWAP).length ?? 0;
  const swaps4 = l4?.filter((l) => l.topics[0] === V4_SWAP).length ?? 0;
  const useV2 = !!bestV2 && (l4 === null || swaps2 >= swaps4);

  let pool: Market["pool"];
  let baseSym: string;
  let baseDec: number;
  let reserves: Market["reserves"] = null;
  let ladder: Market["ladder"] = null;
  let tokenIs0: boolean;
  let logs: Log[];

  if (useV2 && bestV2) {
    baseSym = bestV2.base;
    baseDec = BASE_DEC(bestV2.base);
    const [res, tok0] = await Promise.all([
      client.readContract({ address: bestV2.pair, abi: PAIR, functionName: "getReserves" }) as Promise<readonly [bigint, bigint, number]>,
      client.readContract({ address: bestV2.pair, abi: PAIR, functionName: "token0" }) as Promise<string>,
    ]);
    tokenIs0 = tok0.toLowerCase() === lower;
    const rt = Number(tokenIs0 ? res[0] : res[1]) / 10 ** m.decimals;
    const rb = Number(tokenIs0 ? res[1] : res[0]) / 10 ** baseDec;
    reserves = { token: rt, base: rb };
    if (rt > 0 && rb > 0) ladder = v2Ladder(rt, rb);
    pool = { kind: "v2", id: bestV2.pair, base: baseSym, hooked: false, fee: 3000 };
    logs = l2 ?? [];
  } else {
    const p = bestV4!;
    tokenIs0 = p.key.currency0.toLowerCase() === lower;
    const other = (tokenIs0 ? p.key.currency1 : p.key.currency0).toLowerCase();
    baseSym = BASES[other]!.symbol;
    baseDec = BASES[other]!.decimals;
    pool = { kind: "v4", id: p.id, base: baseSym, hooked: !/^0x0{40}$/i.test(p.key.hooks), fee: p.key.fee };
    logs = l4 ?? [];
    const st = await v4State(client, p.id as Hex);
    if (st) ladder = { ...v4Ladder(Number(st.liquidity), Number(st.sqrt), tokenIs0, m.decimals, baseDec), estimate: true };
  }

  // V2: the Sync just before each Swap holds the reserves after it, so the price is the pool's, not the trade's average
  const syncs = new Map<string, Log>();
  for (const l of logs) if (l.topics[0] === V2_SYNC) syncs.set(`${l.transactionHash}:${Number(l.logIndex)}`, l);
  const trades: Trade[] = [];
  const lp: LpEvent[] = [];
  for (const l of logs) {
    const topic = l.topics[0];
    if (topic === V2_SYNC) continue;
    if (topic === V2_MINT || topic === V2_BURN) {
      const [a0, a1] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], l.data) as readonly bigint[];
      const block = Number(l.blockNumber);
      lp.push({ block, t: when(block), kind: topic === V2_MINT ? "add" : "remove", token: Number(tokenIs0 ? a0! : a1!) / 10 ** m.decimals, base: Number(tokenIs0 ? a1! : a0!) / 10 ** baseDec, tx: l.transactionHash });
      continue;
    }
    if (topic === V4_MODIFY) {
      const [, , delta] = decodeAbiParameters([{ type: "int24" }, { type: "int24" }, { type: "int256" }], l.data) as readonly bigint[];
      const block = Number(l.blockNumber);
      if (delta !== 0n) lp.push({ block, t: when(block), kind: delta! > 0n ? "add" : "remove", token: null, base: null, tx: l.transactionHash });
      continue;
    }
    const block = Number(l.blockNumber);
    let tokenAmt: number, baseAmt: number, buy: boolean, who: string;
    let poolPx: number | null = null;
    if (pool.kind === "v2") {
      const [a0In, a1In, a0Out, a1Out] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], l.data) as readonly bigint[];
      const tIn = tokenIs0 ? a0In! : a1In!, tOut = tokenIs0 ? a0Out! : a1Out!, bIn = tokenIs0 ? a1In! : a0In!, bOut = tokenIs0 ? a1Out! : a0Out!;
      buy = tOut > 0n;
      tokenAmt = Number(buy ? tOut : tIn) / 10 ** m.decimals;
      baseAmt = Number(buy ? bIn : bOut) / 10 ** baseDec;
      who = `0x${l.topics[2]!.slice(26)}`;
      const s = syncs.get(`${l.transactionHash}:${Number(l.logIndex) - 1}`);
      if (s) {
        const [r0, r1] = decodeAbiParameters([{ type: "uint112" }, { type: "uint112" }], s.data) as readonly bigint[];
        const rt = Number(tokenIs0 ? r0! : r1!) / 10 ** m.decimals, rb = Number(tokenIs0 ? r1! : r0!) / 10 ** baseDec;
        if (rt > 0) poolPx = rb / rt;
      }
    } else {
      const [a0, a1, sqrtP] = decodeAbiParameters([{ type: "int128" }, { type: "int128" }, { type: "uint160" }], l.data) as readonly bigint[];
      // price of currency0 in currency1 after the swap, in human units
      const r = Number(sqrtP!) / 2 ** 96;
      const p10 = r * r * 10 ** ((tokenIs0 ? m.decimals : baseDec) - (tokenIs0 ? baseDec : m.decimals));
      if (p10 > 0) poolPx = tokenIs0 ? p10 : 1 / p10;
      // v4 Swap deltas are the caller's: positive = the caller received it
      const dt = tokenIs0 ? a0! : a1!, db = tokenIs0 ? a1! : a0!;
      buy = dt > 0n;
      tokenAmt = Math.abs(Number(dt)) / 10 ** m.decimals;
      baseAmt = Math.abs(Number(db)) / 10 ** baseDec;
      who = `0x${l.topics[2]!.slice(26)}`;
    }
    if (!(tokenAmt > 0) || !(baseAmt > 0)) continue;
    trades.push({ block, t: when(block), side: buy ? "buy" : "sell", price: poolPx ?? baseAmt / tokenAmt, token: tokenAmt, base: baseAmt, tx: l.transactionHash, who });
  }
  trades.sort((a, b) => b.block - a.block);
  lp.sort((a, b) => b.block - a.block);
  // who actually traded: the newest swaps and liquidity moves get their signing wallet (labels in the terminal use it)
  await signers(client, [...trades.slice(0, 150).map((x) => x.tx), ...lp.slice(0, 40).map((x) => x.tx)]);
  for (const x of trades.slice(0, 150)) x.from = SIGNERS.get(x.tx);
  for (const x of lp.slice(0, 40)) x.from = SIGNERS.get(x.tx);

  const price = reserves && reserves.token > 0 ? reserves.base / reserves.token : (trades[0]?.price ?? null);
  return {
    token: { address: token, symbol: m.symbol, name: m.name, decimals: m.decimals, supply: m.supply },
    pool,
    base: { symbol: baseSym, usd: baseSym === "USDG" ? 1 : usd },
    head,
    from,
    since: when(from),
    price,
    reserves,
    ladder,
    trades: trades.slice(0, 2000),
    lp,
    ms: Date.now() - t0,
  };
}

function BASE_DEC(b: string) {
  return b === "USDG" ? 6 : 18;
}

/**
 * The pool's own mid price for a token (deepest V2 pair against WETH or USDG), in dollars, and the pool's
 * liquidity. A handful of reads; no history. Used where many tokens are compared at once.
 */
export async function readMid(client: PublicClient, tokenIn: Address, ethUsdNow?: number): Promise<{ price: number; liquidity: number; base: string; pair: string } | null> {
  const token = getAddress(tokenIn);
  const usd = ethUsdNow ?? (await ethUsd(client).catch(() => 0));
  // let RPC errors throw, so callers can retry instead of reading "no pool"
  const v2 = await findV2(client, token);
  const toUsd = (b: { base: string; baseReserve: bigint }) => (b.base === "USDG" ? Number(b.baseReserve) / 1e6 : (Number(b.baseReserve) / 1e18) * usd);
  const best = v2.sort((a, b) => toUsd(b) - toUsd(a))[0];
  if (!best) return null;
  const dec = await client.readContract({ address: token, abi: ERC20, functionName: "decimals" }).then(Number).catch(() => 18);
  const [res, tok0] = await Promise.all([
    client.readContract({ address: best.pair, abi: PAIR, functionName: "getReserves" }) as Promise<readonly [bigint, bigint, number]>,
    client.readContract({ address: best.pair, abi: PAIR, functionName: "token0" }) as Promise<string>,
  ]);
  const is0 = tok0.toLowerCase() === token.toLowerCase();
  const rt = Number(is0 ? res[0] : res[1]) / 10 ** dec;
  const rb = Number(is0 ? res[1] : res[0]) / 10 ** BASE_DEC(best.base);
  if (!(rt > 0)) return null;
  const k = best.base === "USDG" ? 1 : usd;
  return { price: (rb / rt) * k, liquidity: rb * 2 * k, base: best.base, pair: best.pair };
}

export { ethUsd as readEthUsd };
