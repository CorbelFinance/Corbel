/**
 * Transaction preview: what a transaction would move if it were signed now. It is run with eth_simulateV1 at the
 * latest block with transfer tracing on, so native ETH moves show as transfers too; nothing is sent. The result is the
 * signer's net change per asset, who receives what leaves the signer, and every approval the transaction grants.
 */
import type { Address, Hex, PublicClient } from "viem";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const APPROVAL = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const APPROVAL_ALL = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31";
/** where eth_simulateV1 reports native ETH moves */
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const MAX_UINT = 2n ** 256n - 1n;

export type PreviewTx = { from: Address; to: Address; value?: bigint; data?: Hex };
export type Change = { asset: string; symbol: string; decimals: number; amount: string; nft: boolean };
export type Grant = { token: string; symbol: string; decimals: number; spender: string; amount: string | null; unlimited: boolean; all: boolean; revoke: boolean };
export type Preview = {
  ok: boolean;
  reason: string | null;
  gas: number | null;
  block: string;
  /** the signer's net change per asset: negative leaves, positive arrives */
  changes: Change[];
  /** addresses that receive what leaves the signer, with the asset */
  receivers: { address: string; asset: string; symbol: string; amount: string }[];
  grants: Grant[];
};

type Log = { address: string; topics: string[]; data: string };
const addr = (t: string) => `0x${t.slice(-40)}`.toLowerCase();
const num = (d: string) => (d && d !== "0x" ? BigInt(d.length > 66 ? d.slice(0, 66) : d) : 0n);

/** Turns simulated logs into the preview's moves for `who`. Pure, for tests. */
export function readMoves(logs: Log[], who: string) {
  const me = who.toLowerCase();
  const net = new Map<string, { v: bigint; nft: boolean }>();
  const recv = new Map<string, bigint>();
  const grants: { token: string; spender: string; amount: bigint | null; all: boolean; on: boolean }[] = [];
  for (const l of logs) {
    const t0 = l.topics[0]?.toLowerCase();
    const a = l.address.toLowerCase();
    if (t0 === TRANSFER && l.topics.length >= 3) {
      // ERC-721 puts the token id in topic 3 and no data; ERC-20 and native ETH carry the amount in data
      const nft = l.topics.length === 4;
      const v = nft ? 1n : num(l.data);
      const f = addr(l.topics[1]!), to = addr(l.topics[2]!);
      if (f === me && to !== me) {
        net.set(a, { v: (net.get(a)?.v ?? 0n) - v, nft });
        const k = `${to}|${a}`;
        recv.set(k, (recv.get(k) ?? 0n) + v);
      }
      if (to === me && f !== me) net.set(a, { v: (net.get(a)?.v ?? 0n) + v, nft });
    } else if (t0 === APPROVAL && l.topics.length >= 3 && addr(l.topics[1]!) === me) {
      grants.push({ token: a, spender: addr(l.topics[2]!), amount: l.topics.length === 4 ? null : num(l.data), all: false, on: true });
    } else if (t0 === APPROVAL_ALL && l.topics.length >= 3 && addr(l.topics[1]!) === me) {
      grants.push({ token: a, spender: addr(l.topics[2]!), amount: null, all: true, on: num(l.data) !== 0n });
    }
  }
  return { net, recv, grants };
}

async function metaOf(client: PublicClient, a: string): Promise<{ symbol: string; decimals: number }> {
  if (a === NATIVE) return { symbol: "ETH", decimals: 18 };
  const abi = [
    { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
    { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  ] as const;
  const [s, d] = await Promise.all([
    client.readContract({ address: a as Address, abi, functionName: "symbol" }).catch(() => null),
    client.readContract({ address: a as Address, abi, functionName: "decimals" }).catch(() => null),
  ]);
  return { symbol: typeof s === "string" && s ? s.slice(0, 24) : `${a.slice(0, 6)}…${a.slice(-4)}`, decimals: d === null ? 0 : Number(d) };
}

export async function previewTx(client: PublicClient, tx: PreviewTx): Promise<Preview> {
  const block = await client.getBlockNumber();
  const call = { from: tx.from, to: tx.to, value: `0x${(tx.value ?? 0n).toString(16)}`, data: tx.data ?? "0x" };
  const r = (await client.request({ method: "eth_simulateV1", params: [{ blockStateCalls: [{ calls: [call] }], traceTransfers: true, validation: false }, `0x${block.toString(16)}`] } as never)) as { calls: { status: string; gasUsed: string; logs?: Log[]; error?: { message?: string } }[] }[];
  const c = r[0]?.calls[0];
  if (!c) throw new Error("no simulation result");
  const ok = c.status === "0x1";
  const { net, recv, grants } = readMoves(ok ? (c.logs ?? []) : [], tx.from);
  const assets = [...new Set([...net.keys(), ...[...recv.keys()].map((k) => k.split("|")[1]!), ...grants.map((g) => g.token)])];
  const meta = new Map(await Promise.all(assets.map(async (a) => [a, await metaOf(client, a)] as const)));
  return {
    ok,
    reason: ok ? null : (c.error?.message ?? "The transaction would revert."),
    gas: c.gasUsed ? Number(BigInt(c.gasUsed)) : null,
    block: block.toString(),
    changes: [...net.entries()].filter(([, x]) => x.v !== 0n).map(([a, x]) => ({ asset: a, symbol: meta.get(a)!.symbol, decimals: x.nft ? 0 : meta.get(a)!.decimals, amount: x.v.toString(), nft: x.nft })),
    receivers: [...recv.entries()].map(([k, v]) => {
      const [to, a] = k.split("|") as [string, string];
      return { address: to, asset: a, symbol: meta.get(a)!.symbol, amount: v.toString() };
    }),
    grants: grants.map((g) => ({ token: g.token, symbol: meta.get(g.token)!.symbol, decimals: meta.get(g.token)!.decimals, spender: g.spender, amount: g.amount === null ? null : g.amount.toString(), unlimited: g.amount !== null && g.amount >= MAX_UINT / 2n, all: g.all, revoke: g.all ? !g.on : g.amount === 0n })),
  };
}
