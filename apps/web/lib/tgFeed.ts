/**
 * The Telegram group feed: every $CORBEL buy in the main pool, every burn (the Fee Burn contract's and the team
 * wallets'), and every new lock on HoodLock, posted to the community group. Read from the chain with the site's own
 * RPC gate, a few blocks at a time; nothing third-party.
 *
 *   TELEGRAM_GROUP_CHAT  the group's chat id (off without it)
 *   TG_BUY_MIN_USD       smallest buy that is posted, in dollars (default 0: every buy)
 *   TG_BIG_BUY_USD       a buy at or above this is called out as big (default 500)
 *
 * The main pool is the one the Fee Burn contract buys in (its poolKey), so the feed follows the same pool as the burns.
 */
import { TOKEN } from "@corbel/config";
import { getClient, readEthUsd, redact } from "@corbel/data/chain";
import { decodeAbiParameters, encodeAbiParameters, keccak256, toEventSelector, type Hex, type PublicClient } from "viem";

export const PB = "0x8e649485F2800Ec9CB8f1382C6B27c5Cb7782F98";
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const DEAD = "0x000000000000000000000000000000000000dead";
const SITE = "https://corbel.finance";
const SCAN = "https://robinhoodchain.blockscout.com";
const SWAP = toEventSelector("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const TRANSFER = toEventSelector("Transfer(address,address,uint256)");
const BURNED = toEventSelector("Burned(uint256,bytes32,uint256,uint256)");
const KEY_ABI = [{ type: "function", name: "poolKey", stateMutability: "view", inputs: [], outputs: [{ type: "tuple", components: [{ name: "currency0", type: "address" }, { name: "currency1", type: "address" }, { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" }] }] }] as const;
const SUPPLY_ABI = [{ type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const;
const topicOf = (a: string) => `0x${a.toLowerCase().slice(2).padStart(64, "0")}` as Hex;

// ------------------------------------------------------------------------------------------------ the messages
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (v: number) => (v >= 100 ? `$${n0(v)}` : `$${v.toFixed(2)}`);
const big = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M` : n0(v));

export type Buy = { coins: number; eth: number; usd: number | null; buyer: string; tx: string };
export type Burn = { coins: number; by: "contract" | "team"; eth: number | null; tx: string; totalDestroyed: number | null };
export type Lock = { coins: number; from: string; tx: string };

export function buyText(b: Buy, bigUsd: number): string {
  const head = b.usd !== null && b.usd >= bigUsd ? "🟢🟢🟢 Big buy" : "🟢 Buy";
  return [
    `${head}: ${big(b.coins)} $CORBEL for ${b.eth.toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH${b.usd !== null ? ` (${usd(b.usd)})` : ""}`,
    `Wallet ${short(b.buyer)}`,
    `${SCAN}/tx/${b.tx}`,
  ].join("\n");
}

export function burnText(b: Burn): string {
  const who = b.by === "contract" ? `Fee Burn contract${b.eth !== null ? `, bought with ${b.eth.toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH of fees` : ""}` : "Team wallet";
  return [`🔥 ${n0(b.coins)} $CORBEL burned`, who, ...(b.totalDestroyed !== null ? [`Burned so far: ${n0(b.totalDestroyed)}`] : []), `${SCAN}/tx/${b.tx}`, `${SITE}/burn`].join("\n");
}

export function lockText(l: Lock): string {
  return [`🔒 ${n0(l.coins)} $CORBEL locked on HoodLock`, `From ${short(l.from)}`, `${SCAN}/tx/${l.tx}`].join("\n");
}

// ------------------------------------------------------------------------------------------------ the sweep
type Log = { topics: Hex[]; data: Hex; transactionHash: Hex; blockNumber: bigint | null; address: string };
type Pool = { id: Hex; tokenIs0: boolean };
const G = globalThis as unknown as { __corbelTgFeed?: { on: boolean; last: bigint | null; pool: Pool | null } };

async function poolOf(c: PublicClient): Promise<Pool> {
  const k = (await c.readContract({ address: PB, abi: KEY_ABI, functionName: "poolKey" })) as { currency0: Hex; currency1: Hex; fee: number; tickSpacing: number; hooks: Hex };
  const id = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]));
  return { id, tokenIs0: k.currency0.toLowerCase() === TOKEN.contract.toLowerCase() };
}

/** One pass over the blocks since the last one: what to post, oldest first. Exported for the runner and tests. */
export async function sweep(c: PublicClient, from: bigint, to: bigint, pool: Pool, team: string[]): Promise<{ at: bigint; text: string }[]> {
  const token = TOKEN.contract as Hex;
  const get = (p: object) => c.request({ method: "eth_getLogs", params: [{ ...p, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }] } as never) as Promise<(Omit<Log, "blockNumber"> & { blockNumber: Hex })[]>;
  const [swaps, burns, locks, ...teamBurns] = await Promise.all([
    get({ address: POOL_MANAGER, topics: [SWAP, pool.id] }),
    get({ address: PB, topics: [BURNED] }),
    get({ address: token, topics: [TRANSFER, null, topicOf(TOKEN.locker)] }),
    ...team.flatMap((w) => [DEAD, "0x0000000000000000000000000000000000000000"].map((d) => get({ address: token, topics: [TRANSFER, topicOf(w), topicOf(d)] }))),
  ]);
  const out: { at: bigint; text: string }[] = [];
  const minUsd = Number(process.env.TG_BUY_MIN_USD ?? 0), bigUsd = Number(process.env.TG_BIG_BUY_USD ?? 500);
  let ethPx: number | null = null;
  if (swaps.length) ethPx = await readEthUsd(c).catch(() => null);
  // the Fee Burn contract's own purchase is a burn, posted once as a burn, not as a buy
  const burnTxs = new Set(burns.map((l) => l.transactionHash.toLowerCase()));
  for (const l of swaps) {
    if (burnTxs.has(l.transactionHash.toLowerCase())) continue;
    const [a0, a1] = decodeAbiParameters([{ type: "int128" }, { type: "int128" }], l.data) as [bigint, bigint];
    // v4 swap deltas are the caller's: the coin it received is positive
    const dt = pool.tokenIs0 ? a0 : a1, de = pool.tokenIs0 ? a1 : a0;
    if (dt <= 0n) continue;
    const coins = Number(dt) / 1e18, eth = Math.abs(Number(de)) / 1e18, dollars = ethPx ? eth * ethPx : null;
    if (dollars !== null && dollars < minUsd) continue;
    const tx = (await c.getTransaction({ hash: l.transactionHash }).catch(() => null)) as { from: string } | null;
    out.push({ at: BigInt(l.blockNumber), text: buyText({ coins, eth, usd: dollars, buyer: tx?.from ?? `0x${l.topics[2]!.slice(26)}`, tx: l.transactionHash }, bigUsd) });
  }
  const burned = burns.length + teamBurns.flat().length > 0 ? await destroyed(c).catch(() => null) : null;
  for (const l of burns) {
    const [ethIn, coins] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], l.data) as [bigint, bigint];
    out.push({ at: BigInt(l.blockNumber), text: burnText({ coins: Number(coins) / 1e18, by: "contract", eth: Number(ethIn) / 1e18, tx: l.transactionHash, totalDestroyed: burned }) });
  }
  for (const l of teamBurns.flat()) out.push({ at: BigInt(l.blockNumber), text: burnText({ coins: Number(BigInt(l.data)) / 1e18, by: "team", eth: null, tx: l.transactionHash, totalDestroyed: burned }) });
  for (const l of locks) out.push({ at: BigInt(l.blockNumber), text: lockText({ coins: Number(BigInt(l.data)) / 1e18, from: `0x${l.topics[1]!.slice(26)}`, tx: l.transactionHash }) });
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** How much of the billion is gone: never minted back, plus what sits in the dead address. */
async function destroyed(c: PublicClient): Promise<number> {
  const token = TOKEN.contract as Hex;
  const [supply, dead] = await Promise.all([
    c.readContract({ address: token, abi: SUPPLY_ABI, functionName: "totalSupply" }) as Promise<bigint>,
    c.readContract({ address: token, abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }], functionName: "balanceOf", args: [DEAD] }) as Promise<bigint>,
  ]);
  return 1e9 - Number(supply) / 1e18 + Number(dead) / 1e18;
}

/** Starts the feed once per process: every 15 s, the blocks since the last pass (at most 3,000 at a time). */
export function startFeed(send: (chat: number, text: string) => Promise<unknown>) {
  const chat = Number(process.env.TELEGRAM_GROUP_CHAT);
  if (!chat || G.__corbelTgFeed?.on) return;
  const st = (G.__corbelTgFeed = { on: true, last: null, pool: null } as { on: boolean; last: bigint | null; pool: Pool | null });
  const team = (process.env.TEAM_WALLETS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^0x[0-9a-f]{40}$/.test(x));
  const tick = async () => {
    const c = getClient(process.env.RPC_URL);
    if (!c) return;
    try {
      st.pool ??= await poolOf(c);
      const head = await c.getBlockNumber();
      // the first pass starts at the head: no backlog of old buys after a restart
      if (st.last === null) return void (st.last = head);
      if (head <= st.last) return;
      const from = st.last + 1n, to = head - from > 3_000n ? from + 3_000n : head;
      const posts = await sweep(c, from, to, st.pool, team);
      for (const p of posts) await send(chat, p.text);
      st.last = to;
    } catch (e) {
      console.error("[tg feed]", redact(e));
    }
  };
  const loop = async () => {
    for (;;) {
      await tick();
      await new Promise((ok) => setTimeout(ok, 15_000));
    }
  };
  void loop();
}
