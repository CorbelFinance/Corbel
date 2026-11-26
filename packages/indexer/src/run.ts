/**
 * Corbel indexer: walks Robinhood Chain logs in 25 000-block windows and stores pools, tokens and
 * launchers. Backfills `CORBEL_BACKFILL_DAYS` (default 7) back from head, then follows new blocks.
 * Read-only: it only calls the RPC, never sends anything. Restart-safe (progress is stored).
 *
 *   RPC_URL=https://rpc.mainnet.chain.robinhood.com pnpm --filter @corbel/indexer start
 */
import { createPublicClient, decodeAbiParameters, encodeAbiParameters, http, keccak256, toHex, type Address, type Hex } from "viem";
import { RH, TOPICS, LOG_WINDOW, THIN_RESERVE } from "../../data/src/trust/addresses.ts";
import { decodeInitialize } from "../../data/src/trust/pools.ts";
import { openDb } from "./db.ts";
import { initLaunches, launchWindow } from "./launches.ts";
import { limitedFetch } from "../../data/src/limiter.ts";
import { cleanText } from "../../data/src/text.ts";

if (process.env.CHAIN_READS !== "1") {
  console.error("[indexer] CHAIN_READS is not 1: not starting.");
  process.exit(2);
}

const RPC = process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const DAYS = Number(process.env.CORBEL_BACKFILL_DAYS ?? 7);
const BLOCK_TIME = 0.25; // s, measured: ~4 blocks per second on 4663
const CONCURRENCY = 6;
const once = process.argv.includes("--once");

const client = createPublicClient({ transport: http(RPC, { retryCount: 4, retryDelay: 800, timeout: 30_000, fetchFn: limitedFetch, batch: { batchSize: 8, wait: 20 } }) });
const db = openDb();
initLaunches(db);
const getP = db.prepare("SELECT value FROM progress WHERE key = ?");
const setP = db.prepare("INSERT INTO progress(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
const insPool = db.prepare(`INSERT OR IGNORE INTO pools(id, kind, token0, token1, fee, tick_spacing, hooks, block, tx) VALUES(?,?,?,?,?,?,?,?,?)`);
const insTok = db.prepare(`INSERT OR IGNORE INTO tokens(address, first_block) VALUES(?, ?)`);
const setLaunch = db.prepare(`UPDATE pools SET launcher = ?, via = ?, pad = ? WHERE id = ?`);
const setMeta = db.prepare(`UPDATE tokens SET symbol = ?, name = ?, decimals = ? WHERE address = ?`);
const prog = (k: string) => (getP.get(k) as { value: number } | undefined)?.value;

const V3_LIQ = [{ type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] }] as const;
const ERC20 = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

async function pool<T>(items: T[], fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) await fn(items[i++]!).catch(() => undefined);
  }));
}

/** Every venue's pool births: V2 pairs from each V2 factory, V3 pools, V4 pools. `onlyNew` reads only the venues added later. */
async function windowAt(from: bigint, to: bigint, onlyNew = false) {
  const range = { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` };
  const v2From = onlyNew ? RH.V2_FACTORIES_MORE : [RH.V2_FACTORY, ...RH.V2_FACTORIES_MORE];
  const none = Promise.resolve([] as never[]);
  const v3 = (await client.request({ method: "eth_getLogs", params: [{ ...range, address: RH.V3_FACTORY, topics: [TOPICS.V3_POOL_CREATED] }] } as never)) as { topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string }[];
  const [v2, v4] = await Promise.all([
    client.request({ method: "eth_getLogs", params: [{ ...range, address: v2From, topics: [TOPICS.V2_PAIR_CREATED] }] } as never) as Promise<{ topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string }[]>,
    onlyNew ? none : (client.request({ method: "eth_getLogs", params: [{ ...range, address: RH.V4_POOL_MANAGER, topics: [TOPICS.V4_INITIALIZE] }] } as never) as Promise<(never & { logIndex: string })[]>),
  ]);
  const txs = new Map<string, { id: string; logIndex: number }[]>();
  const addTx = (h: string, id: string, logIndex: string | number) => txs.set(h, [...(txs.get(h) ?? []), { id, logIndex: Number(logIndex) }]);
  const toks = new Set<string>();
  db.exec("BEGIN");
  for (const l of v2) {
    const t0 = ("0x" + l.topics[1]!.slice(26)).toLowerCase();
    const t1 = ("0x" + l.topics[2]!.slice(26)).toLowerCase();
    const pair = ("0x" + l.data.slice(26, 66)).toLowerCase();
    const b = Number(BigInt(l.blockNumber));
    insPool.run(pair, "v2", t0, t1, null, null, null, b, l.transactionHash);
    addTx(l.transactionHash, pair, l.logIndex);
    for (const t of [t0, t1]) if (insTok.run(t, b).changes) toks.add(t);
  }
  for (const l of v3) {
    // PoolCreated(token0, token1, fee) indexed; data: tickSpacing, pool
    const t0 = ("0x" + l.topics[1]!.slice(26)).toLowerCase();
    const t1 = ("0x" + l.topics[2]!.slice(26)).toLowerCase();
    const fee = Number(BigInt(l.topics[3]!));
    const [spacing, addr] = decodeAbiParameters([{ type: "int24" }, { type: "address" }], l.data as Hex) as [number, string];
    const b = Number(BigInt(l.blockNumber));
    insPool.run(addr.toLowerCase(), "v3", t0, t1, fee, Number(spacing), null, b, l.transactionHash);
    addTx(l.transactionHash, addr.toLowerCase(), l.logIndex);
    for (const t of [t0, t1]) if (insTok.run(t, b).changes) toks.add(t);
  }
  for (const raw of v4) {
    const p = decodeInitialize(raw);
    const t0 = p.key.currency0.toLowerCase(),
      t1 = p.key.currency1.toLowerCase();
    insPool.run(p.id, "v4", t0, t1, p.key.fee, p.key.tickSpacing, p.key.hooks.toLowerCase(), p.block, p.tx);
    addTx(p.tx, p.id, (raw as { logIndex: string }).logIndex);
    for (const t of [t0, t1]) if (!/^0x0{40}$/.test(t) && insTok.run(t, p.block).changes) toks.add(t);
  }
  db.exec("COMMIT");

  // launchers and token metadata
  await pool([...txs.entries()], async ([h, pools]) => {
    for (const r of await launchers(h, pools)) setLaunch.run(r.launcher, r.via, r.pad, r.id);
  });
  await pool([...toks], async (a) => {
    const r = await Promise.allSettled(ERC20.map((f) => client.readContract({ address: a as Address, abi: ERC20, functionName: f.name })));
    const v = r.map((x) => (x.status === "fulfilled" ? x.value : null));
    setMeta.run(cleanText(v[0], 32), cleanText(v[1]), v[2] === null ? null : Number(v[2]), a);
  });
  return { v2: v2.length, v3: v3.length, v4: v4.length, tokens: toks.size };
}

// ---------- launchers ----------
// ERC-4337: a bundler sends handleOps for many users, so tx.from is not the creator. The creator is the
// `sender` of the UserOperationEvent that follows the pool's log (each op's event is emitted after it runs).
const ENTRY_POINTS = new Set(["0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789", "0x0000000071727de22e5e9d8baf0edac6f37da032", "0x4337084d9e255ff0702461cf8895ce9e3b5ff108"]);
const USER_OP_EVENT = "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f";

async function launchers(hash: string, pools: { id: string; logIndex: number }[]) {
  const r = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
  const ops = r.logs.filter((l) => ENTRY_POINTS.has(l.address.toLowerCase()) && l.topics[0] === USER_OP_EVENT).map((l) => ({ at: Number(l.logIndex), sender: `0x${l.topics[2]!.slice(26)}`.toLowerCase() }));
  // the launchpad: the contract the transaction called; through a bundler, the first contract in the logs that is
  // not plumbing (entry point, pool manager, V2 factory, the pool's own tokens)
  const plumbing = new Set([...ENTRY_POINTS, RH.V4_POOL_MANAGER.toLowerCase(), RH.V2_FACTORY.toLowerCase(), ...RH.V2_FACTORIES_MORE, RH.V3_FACTORY, RH.WETH.toLowerCase(), RH.USDG.toLowerCase()]);
  const firstApp = () => r.logs.map((l) => l.address.toLowerCase()).find((a) => !plumbing.has(a) && !r.logs.some((x) => x.topics[0] === TOPICS.V2_PAIR_CREATED && `0x${x.data.slice(26, 66)}`.toLowerCase() === a)) ?? null;
  return pools.map((p) => {
    const op = ops.find((o) => o.at > p.logIndex);
    return op ? { id: p.id, launcher: op.sender, via: "aa", pad: firstApp() } : { id: p.id, launcher: r.from.toLowerCase(), via: "eoa", pad: r.to ? r.to.toLowerCase() : null };
  });
}

// ---------- launchpads for pools indexed before the pad column ----------
const PAD_BATCH = 120;
/** Fills `pad` for the newest pools that lack it, one receipt per creating transaction. */
async function fillPads(limit: number) {
  const rows = db.prepare(`SELECT id, tx FROM pools WHERE pad IS NULL AND tx != '' ORDER BY block DESC LIMIT ?`).all(limit) as { id: string; tx: string }[];
  const byTx = new Map<string, string[]>();
  for (const r of rows) byTx.set(r.tx, [...(byTx.get(r.tx) ?? []), r.id]);
  let n = 0;
  await pool([...byTx.entries()], async ([h, ids]) => {
    const rc = await client.getTransactionReceipt({ hash: h as `0x${string}` });
    const at = (id: string) => {
      const l = rc.logs.find((x) => (x.topics[0] === TOPICS.V4_INITIALIZE && x.topics[1]?.toLowerCase() === id) || (x.topics[0] === TOPICS.V2_PAIR_CREATED && `0x${x.data.slice(26, 66)}`.toLowerCase() === id));
      return l ? Number(l.logIndex) : -1;
    };
    for (const r of await launchers(h, ids.map((id) => ({ id, logIndex: at(id) })))) {
      // "" marks a pool whose pad could not be told, so it is not read again
      setLaunch.run(r.launcher, r.via, r.pad ?? "", r.id);
      n++;
    }
  });
  return n;
}

// ---------- liveness refresh ----------
const REFRESH_BATCH = 300;
const REFRESH_EVERY = 300_000; // ms: the RPC limit is shared with the site
const V2_RES = [{ type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] }] as const;
const EXTSLOAD_MANY = [{ type: "function", name: "extsload", stateMutability: "view", inputs: [{ type: "bytes32[]" }], outputs: [{ type: "bytes32[]" }] }] as const;
const POOLS_SLOT = 6n; // v4 PoolManager: mapping(PoolId => Pool.State) _pools
const LIQUIDITY_OFFSET = 3n;
const MODIFY_LIQUIDITY = keccak256(toHex("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)"));

/**
 * A v4 pool with no liquidity at its price was either emptied by its LPs or its price walked out of every position
 * (they are still there). Only the first is a drain: true when the pool's own events show liquidity taken out.
 * A failed read answers null (unknown), never "drained".
 */
async function v4Removed(id: string, from: number): Promise<boolean | null> {
  try {
    const logs = (await client.request({ method: "eth_getLogs", params: [{ address: RH.V4_POOL_MANAGER as Address, topics: [MODIFY_LIQUIDITY, id as Hex], fromBlock: toHex(from), toBlock: "latest" }] })) as { data: Hex }[];
    return logs.some((l) => (decodeAbiParameters([{ type: "int24" }, { type: "int24" }, { type: "int256" }, { type: "bytes32" }], l.data)[2] as bigint) < 0n);
  } catch {
    return null;
  }
}
const WETH = RH.WETH.toLowerCase(),
  USDG = RH.USDG.toLowerCase();
const stale = db.prepare(`SELECT id, kind, token0, token1, funded, block FROM pools WHERE kind = ? ORDER BY checked_at IS NOT NULL, checked_at ASC, block DESC LIMIT ?`);
const setLive = db.prepare(`UPDATE pools SET dead = ?, base_reserve = ?, checked_at = ?, funded = CASE WHEN ? = 1 THEN 1 ELSE funded END WHERE id = ?`);
const V4_BATCH = 2000; // v4 is read in one PoolManager call per 250 pools: cheap

/**
 * Liveness, one rule for V2 and v4: a pool is funded once it is seen with liquidity at its current price (V2: both
 * reserves, the WETH/USDG side above 1/1000 of the thin threshold; v4: in-range liquidity above zero). A funded pool
 * later found dry is dead (drained). A pool never seen funded stays null: it is empty, not drained. For v4, "dry"
 * means nothing to trade at the current price, which also happens when the price walks out of positions that are
 * still there: a dry v4 pool counts as drained only when its ModifyLiquidity events show liquidity taken out (checked
 * on 64 pools on 2026-11-21: 63 emptied by their LPs, 1 out of range). v4 is read in batches through
 * PoolManager.extsload(bytes32[]).
 */
async function refreshLiveness(): Promise<number> {
  const at = Number(await client.getBlockNumber());
  const out: [number | null, string | null, string, number][] = [];
  const verdict = (alive: boolean, funded: number | null): [number | null, number] => (alive ? [0, 1] : [funded === 1 ? 1 : null, 0]);
  const v2 = stale.all("v2", REFRESH_BATCH) as { id: string; token0: string; token1: string; funded: number | null }[];
  await pool(v2, async (r) => {
    const base = r.token0 === WETH || r.token1 === WETH ? "WETH" : r.token0 === USDG || r.token1 === USDG ? "USDG" : null;
    const [a0, a1] = await client.readContract({ address: r.id as Address, abi: V2_RES, functionName: "getReserves" });
    const baseRes = base ? ((base === "WETH" ? r.token0 === WETH : r.token0 === USDG) ? a0 : a1) : null;
    const dry = a0 === 0n || a1 === 0n || (baseRes !== null && base !== null && baseRes < THIN_RESERVE[base] / 1000n);
    const [dead, seen] = verdict(!dry, r.funded);
    out.push([dead, baseRes === null ? null : baseRes.toString(), r.id, seen]);
  });
  const v4 = stale.all("v4", V4_BATCH) as { id: string; funded: number | null; block: number }[];
  const dryV4: { id: string; block: number }[] = [];
  for (let i = 0; i < v4.length; i += 250) {
    const part = v4.slice(i, i + 250);
    const slots = part.map((r) => {
      const state = BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [r.id as Hex, POOLS_SLOT])));
      return `0x${(state + LIQUIDITY_OFFSET).toString(16).padStart(64, "0")}` as Hex;
    });
    const words = await client.readContract({ address: RH.V4_POOL_MANAGER as Address, abi: EXTSLOAD_MANY, functionName: "extsload", args: [slots] });
    part.forEach((r, j) => {
      const liquidity = BigInt(words[j] ?? "0x0") & ((1n << 128n) - 1n);
      const [dead, seen] = verdict(liquidity > 0n, r.funded);
      if (dead === 1) dryV4.push(r);
      else out.push([dead, null, r.id, seen]);
    });
  }
  // V3 pools: alive while the pool holds liquidity in range; out of range is not drained (unknown, rechecked)
  const v3 = stale.all("v3", REFRESH_BATCH) as { id: string; funded: number | null }[];
  await pool(v3, async (r) => {
    const l = (await client.readContract({ address: r.id as Address, abi: V3_LIQ, functionName: "liquidity" })) as bigint;
    const [dead, seen] = verdict(l > 0n, r.funded);
    out.push([dead === 1 ? null : dead, null, r.id, seen]);
  });
  // funded and dry: drained only if liquidity was taken out; otherwise the price left the positions (unknown, rechecked)
  await pool(dryV4, async (r) => {
    const removed = await v4Removed(r.id, r.block);
    out.push([removed === true ? 1 : null, null, r.id, 0]);
  });
  db.exec("BEGIN");
  for (const [dead, res, id, seen] of out) setLive.run(dead, res, at, seen, id);
  db.exec("COMMIT");
  return out.length;
}

async function main() {
  const head = await client.getBlockNumber();
  const floor = head - BigInt(Math.round((DAYS * 86_400) / BLOCK_TIME));
  let low = BigInt(prog("low") ?? Number(head));
  let high = BigInt(prog("high") ?? Number(head));
  console.log(`[indexer] head ${head}, target floor ${floor}, have ${low}..${high}`);

  // backfill downwards
  while (low > floor) {
    const to = low - 1n;
    const from = to - BigInt(LOG_WINDOW - 1) < floor ? floor : to - BigInt(LOG_WINDOW - 1);
    const t = Date.now();
    const r = await windowAt(from, to);
    low = from;
    setP.run("low", Number(low));
    if (high === head && prog("high") === undefined) setP.run("high", Number(head));
    console.log(`[backfill] ${from}..${to}  v2 ${r.v2}  v4 ${r.v4}  new tokens ${r.tokens}  ${Date.now() - t} ms`);
  }
  if (process.argv.includes("--fix-launchers")) {
    // re-derive launchers recorded before AA support; heaviest "launchers" first (bundlers look serial)
    const rows = db.prepare(`SELECT p.id, p.tx, p.kind FROM pools p WHERE p.via IS NULL ORDER BY (SELECT COUNT(*) FROM pools q WHERE q.launcher = p.launcher) DESC`).all() as { id: string; tx: string; kind: string }[];
    const byTx = new Map<string, string[]>();
    for (const r of rows) byTx.set(r.tx, [...(byTx.get(r.tx) ?? []), r.id]);
    let done = 0;
    const t = Date.now();
    await pool([...byTx.entries()], async ([h, ids]) => {
      // the receipt also gives each pool's own log index
      const rc = await client.getTransactionReceipt({ hash: h as `0x${string}` });
      const at = (id: string) => {
        const l = rc.logs.find((x) => (x.topics[0] === TOPICS.V4_INITIALIZE && x.topics[1]?.toLowerCase() === id) || (x.topics[0] === TOPICS.V2_PAIR_CREATED && `0x${x.data.slice(26, 66)}`.toLowerCase() === id));
        return l ? Number(l.logIndex) : -1;
      };
      for (const r of await launchers(h, ids.map((id) => ({ id, logIndex: at(id) })))) setLaunch.run(r.launcher, r.via, r.pad, r.id);
      if (++done % 500 === 0) console.log(`[fix-launchers] ${done}/${byTx.size} txs  ${Math.round((Date.now() - t) / 1000)} s`);
    });
    console.log(`[fix-launchers] done ${done} txs`);
    return;
  }
  if (once) {
    if (process.argv.includes("--refresh")) console.log(`[refresh] ${await refreshLiveness()} pools`);
    return;
  }

  // venues added later (more V2 factories, the V3 factory): read once back over the same days the index keeps
  const vfloor = head - BigInt(Math.round((DAYS * 86_400) / BLOCK_TIME));
  let vlow = BigInt(prog("venues_low") ?? Number(prog("high") ?? Number(head)));
  while (vlow > vfloor) {
    const to = vlow - 1n;
    const from = to - BigInt(LOG_WINDOW - 1) < vfloor ? vfloor : to - BigInt(LOG_WINDOW - 1);
    const r = await windowAt(from, to, true).catch((e) => (console.error("[venues back]", (e as Error).message), null));
    if (!r) break;
    vlow = from;
    setP.run("venues_low", Number(vlow));
    if (r.v2 || r.v3) console.log(`[venues back] ${from}..${to}  v2 ${r.v2}  v3 ${r.v3}`);
  }

  // launches: three days back on launchpad contracts, then follow with the pools
  const LAUNCH_DAYS = Number(process.env.CORBEL_LAUNCH_DAYS ?? 3);
  const lfloor = head - BigInt(Math.round((LAUNCH_DAYS * 86_400) / BLOCK_TIME));
  let llow = BigInt(prog("launch_low") ?? Number(head));
  let lhigh = BigInt(prog("launch_high") ?? Number(head));
  if (prog("launch_high") === undefined) setP.run("launch_high", Number(head));
  while (llow > lfloor) {
    const to = llow - 1n;
    const from = to - BigInt(LOG_WINDOW - 1) < lfloor ? lfloor : to - BigInt(LOG_WINDOW - 1);
    const n = await launchWindow(client as never, db, from, to, cleanText).catch((e) => (console.error("[launches]", (e as Error).message), -1));
    if (n < 0) break;
    llow = from;
    setP.run("launch_low", Number(llow));
    if (n) console.log(`[launches back] ${from}..${to}  ${n} new`);
  }

  // follow head; re-read pool liveness in rotating batches
  let lastRefresh = 0;
  // a few blocks behind the newest one: nodes are not all at the same height, and one that is behind refuses the range
  const BEHIND = 5n;
  let failed = 0;
  for (;;) {
    if (Date.now() - lastRefresh > REFRESH_EVERY) {
      const t = Date.now();
      const n = await refreshLiveness().catch(() => 0);
      lastRefresh = Date.now();
      if (n) console.log(`[refresh] ${n} pools  ${Date.now() - t} ms`);
      const f = await fillPads(PAD_BATCH).catch(() => 0);
      if (f) console.log(`[pads] ${f} pools  ${Date.now() - lastRefresh} ms`);
    }
    let now = high;
    try {
      now = (await client.getBlockNumber()) - BEHIND;
      while (high < now) {
        const from = high + 1n;
        const to = from + BigInt(LOG_WINDOW - 1) > now ? now : from + BigInt(LOG_WINDOW - 1);
        const r = await windowAt(from, to);
        high = to;
        setP.run("high", Number(high));
        if (r.v2 || r.v3 || r.v4) console.log(`[follow] ${from}..${to}  v2 ${r.v2}  v3 ${r.v3}  v4 ${r.v4}`);
      }
      failed = 0;
    } catch (e) {
      // progress moves only after a whole window, so the same window is simply read again; a write that was cut short is
      // undone first. Twenty failures in a row are not a passing refusal: leave, and start clean
      if (db.isTransaction) db.exec("ROLLBACK");
      if (++failed >= 20) throw e;
      console.error(`[follow] ${failed}: ${String((e as { details?: string }).details || (e as Error).message).slice(0, 120)}`);
      await new Promise((res) => setTimeout(res, 5_000));
      continue;
    }
    while (lhigh < now) {
      const from = lhigh + 1n;
      const to = from + BigInt(LOG_WINDOW - 1) > now ? now : from + BigInt(LOG_WINDOW - 1);
      const n = await launchWindow(client as never, db, from, to, cleanText).catch(() => -1);
      if (n < 0) break;
      lhigh = to;
      setP.run("launch_high", Number(lhigh));
      if (n) console.log(`[launches] ${from}..${to}  ${n} new`);
    }
    await new Promise((res) => setTimeout(res, 15_000));
  }
}

main().catch((e) => {
  console.error("[indexer] fatal", e);
  process.exit(1);
});
