/**
 * Check any address: what it is and what it did lately, read only from the chain.
 *  - kind: a wallet, a wallet with a smart account on it (EIP-7702), or a contract; a wallet that has sent many
 *    transactions but moved almost no tokens of its own is flagged as a likely relay (it sends transactions for
 *    others, as smart-wallet bundlers do), which is why a DEX can show it "selling" coins it never held
 *  - token moves over the window: per token, what came in and went out, and how much of it went through contracts
 *    (pools and routers: buys and sells) against wallets (plain transfers)
 *  - first in: the earliest token transfer into it inside the window (who funded it, as far as tokens show)
 *  - counterparties: the wallets and contracts it exchanged tokens with most often
 * ETH itself is not read here: native transfers leave no log, and this node has no trace API.
 */
import { formatUnits, type Address, type Hex, type PublicClient } from "viem";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ERC20 = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

type Log = { address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string };
export type AddressKind = "wallet" | "smart-wallet" | "contract";
export type AddressRead = {
  address: string;
  kind: AddressKind;
  delegate: string | null;
  txCount: number;
  relay: boolean;
  /** partial: the address moved so many tokens that only the newest part of the window was read */
  window: { from: string; to: string; days: number; partial: boolean };
  moves: number;
  tokens: { token: string; symbol: string; in: number; out: number; viaContracts: number; viaWallets: number; transfers: number }[];
  firstIn: { from: string; token: string; symbol: string; amount: number; block: string; tx: string } | null;
  counterparties: { address: string; kind: AddressKind; transfers: number }[];
  /** what it holds at the head block: ETH, and every token it moved in the window that it still has */
  holds: { eth: number; tokens: { token: string; symbol: string; amount: number }[] };
};

/**
 * Logs over a range for one topic filter. Without a contract address the node answers at most 30,000 blocks per
 * request, so the range is cut into such chunks and read three at a time per direction. A chunk refused for its size is halved; a
 * chunk refused for the rate (429) or lost on the way is asked again after a pause, never halved: halving a rate
 * refusal only multiplies the requests that get refused.
 */
const CHUNK = 30_000n;
const LANES = 3; // per direction: the in and out reads run side by side, six requests at most
const TOO_BIG = /spans|range|exceeds limit|too many (results|logs)|limit exceeded|response size|query returned more/i;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function chunk(client: PublicClient, topics: (string | null)[], from: bigint, to: bigint, depth = 0): Promise<Log[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await client.request({ method: "eth_getLogs", params: [{ topics, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }] } as never)) as Log[];
    } catch (e) {
      const msg = String((e as { details?: string; message?: string })?.details ?? (e as Error)?.message ?? e);
      if (TOO_BIG.test(msg) && depth < 6 && to > from) {
        const mid = from + (to - from) / 2n;
        return [...(await chunk(client, topics, from, mid, depth + 1)), ...(await chunk(client, topics, mid + 1n, to, depth + 1))];
      }
      if (attempt >= 4) throw e;
      await pause(1_500 * (attempt + 1) + Math.random() * 500);
    }
  }
}
/** Past this many transfers one direction stops reading older chunks: a router or a bot moves thousands a day. */
const MAX_LOGS = 20_000;
/** Newest chunks first; returns the logs and the first block actually covered (later than `from` when it stopped early). */
async function logs(client: PublicClient, topics: (string | null)[], from: bigint, to: bigint): Promise<{ logs: Log[]; from: bigint }> {
  const parts: [bigint, bigint][] = [];
  for (let b = to; b >= from; b -= CHUNK) {
    parts.push([b - CHUNK + 1n < from ? from : b - CHUNK + 1n, b]);
    if (b < CHUNK) break;
  }
  const out: (Log[] | undefined)[] = new Array(parts.length);
  let next = 0;
  let seen = 0;
  await Promise.all(Array.from({ length: LANES }, async () => {
    for (let k = next++; k < parts.length && seen < MAX_LOGS; k = next++) {
      out[k] = await chunk(client, topics, parts[k]![0], parts[k]![1]);
      seen += out[k]!.length;
    }
  }));
  // keep only an unbroken run from the newest chunk back, so the window has no holes
  let n = 0;
  while (n < parts.length && out[n]) n++;
  return { logs: out.slice(0, n).flat() as Log[], from: n === parts.length ? from : parts[n - 1]?.[0] ?? to };
}

async function kindOf(client: PublicClient, a: Address): Promise<{ kind: AddressKind; delegate: string | null }> {
  const code = (await client.getCode({ address: a }).catch(() => undefined)) ?? "0x";
  if (code === "0x" || code === "0x0") return { kind: "wallet", delegate: null };
  // EIP-7702: a wallet whose code is 0xef0100 + the delegate's address is still a person's wallet
  if (/^0xef0100[0-9a-f]{40}$/i.test(code)) return { kind: "smart-wallet", delegate: `0x${code.slice(8)}` };
  return { kind: "contract", delegate: null };
}

export async function readAddress(client: PublicClient, address: Address, blocksBack: bigint, days: number): Promise<AddressRead> {
  const a = address.toLowerCase();
  const pad = `0x${a.slice(2).padStart(64, "0")}`;
  const head = await client.getBlockNumber();
  const from = head > blocksBack ? head - blocksBack : 0n;
  const [k, txCount, outRead, inRead] = await Promise.all([
    kindOf(client, address),
    client.getTransactionCount({ address }).catch(() => 0),
    logs(client, [TRANSFER, pad], from, head),
    logs(client, [TRANSFER, null, pad], from, head),
  ]);
  // a very busy address is read over a shorter window: both directions cut at the later of their first blocks
  const start = outRead.from > inRead.from ? outRead.from : inRead.from;
  const partial = start > from;
  const inWindow = (l: Log) => BigInt(l.blockNumber) >= start;
  const outLogs = outRead.logs.filter(inWindow), inLogs = inRead.logs.filter(inWindow);
  const all = [...outLogs.map((l) => ({ l, dir: "out" as const })), ...inLogs.map((l) => ({ l, dir: "in" as const }))].filter(({ l }) => l.topics.length === 3 && l.data.length >= 66);
  all.sort((x, y) => Number(BigInt(x.l.blockNumber) - BigInt(y.l.blockNumber)));

  // the other side of each move, and whether it is a contract (pools and routers) or a wallet
  const other = (x: { l: Log; dir: "in" | "out" }) => `0x${(x.dir === "out" ? x.l.topics[2]! : x.l.topics[1]!).slice(26)}`.toLowerCase();
  const counts = new Map<string, number>();
  for (const x of all) counts.set(other(x), (counts.get(other(x)) ?? 0) + 1);
  const top = [...counts.entries()].sort((p, q) => q[1] - p[1]).slice(0, 40);
  const kinds = new Map<string, AddressKind>();
  await Promise.all(top.map(async ([c]) => kinds.set(c, c === "0x0000000000000000000000000000000000000000" ? "wallet" : (await kindOf(client, c as Address)).kind)));

  // per token: in, out, and how much went through contracts against wallets
  const meta = new Map<string, { symbol: string; dec: number }>();
  const tokenIds = [...new Set(all.map((x) => x.l.address.toLowerCase()))].slice(0, 30);
  const held: { token: string; symbol: string; amount: number }[] = [];
  const [eth] = await Promise.all([
    client.getBalance({ address, blockNumber: head }).catch(() => 0n),
    ...tokenIds.map(async (t) => {
      const [symbol, dec, bal] = await Promise.all([
        client.readContract({ address: t as Address, abi: ERC20, functionName: "symbol" }).catch(() => "?"),
        client.readContract({ address: t as Address, abi: ERC20, functionName: "decimals" }).catch(() => 18),
        client.readContract({ address: t as Address, abi: ERC20, functionName: "balanceOf", args: [address], blockNumber: head }).catch(() => 0n),
      ]);
      meta.set(t, { symbol: String(symbol).slice(0, 16), dec: Number(dec) });
      const amount = Number(formatUnits(bal as bigint, Number(dec)));
      if (amount > 0) held.push({ token: t, symbol: String(symbol).slice(0, 16), amount });
    }),
  ]);
  const tok = new Map<string, AddressRead["tokens"][number]>();
  for (const x of all) {
    const t = x.l.address.toLowerCase();
    const m = meta.get(t);
    if (!m) continue;
    const v = Number(formatUnits(BigInt(x.l.data.slice(0, 66)), m.dec));
    const r = tok.get(t) ?? { token: t, symbol: m.symbol, in: 0, out: 0, viaContracts: 0, viaWallets: 0, transfers: 0 };
    r[x.dir] += v;
    r.transfers++;
    if ((kinds.get(other(x)) ?? "wallet") === "contract") r.viaContracts++;
    else r.viaWallets++;
    tok.set(t, r);
  }

  const first = all.find((x) => x.dir === "in");
  const fm = first ? meta.get(first.l.address.toLowerCase()) : undefined;
  // a relay sends many transactions of its own yet moves next to no tokens itself
  const relay = k.kind === "wallet" && txCount >= 20 && all.length <= Math.max(2, txCount / 50);

  return {
    address: a,
    kind: k.kind,
    delegate: k.delegate,
    txCount,
    relay,
    window: { from: start.toString(), to: head.toString(), days, partial },
    moves: all.length,
    tokens: [...tok.values()].sort((p, q) => q.transfers - p.transfers).slice(0, 12),
    firstIn: first && fm ? { from: other(first), token: first.l.address.toLowerCase(), symbol: fm.symbol, amount: Number(formatUnits(BigInt(first.l.data.slice(0, 66)), fm.dec)), block: BigInt(first.l.blockNumber).toString(), tx: first.l.transactionHash as Hex } : null,
    counterparties: top.slice(0, 10).map(([c, n]) => ({ address: c, kind: kinds.get(c) ?? "wallet", transfers: n })),
    holds: { eth: Number(formatUnits(eth as bigint, 18)), tokens: held.sort((p, q) => p.symbol.localeCompare(q.symbol)) },
  };
}
