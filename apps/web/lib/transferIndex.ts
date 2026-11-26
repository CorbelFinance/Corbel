/**
 * Token transfers of one address from a node's transfer-history method (TRANSFERS_RPC with TRANSFERS_METHOD on the
 * server), shaped as Transfer logs so the address read can use them in place of reading every block range. Newest
 * first, a thousand per page, stopped at MAX; the block it stopped at is returned so the window stays honest. Null when
 * the method is not set or does not answer: the caller then reads the logs itself.
 */
import type { TransferLog } from "@corbel/data/chain";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MAX = 20_000;
const pad = (a: string) => `0x${a.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

type T = { blockNum?: string; hash?: string; from?: string; to?: string; rawContract?: { address?: string | null; value?: string | null } };

export async function transfersOf(address: string, dir: "in" | "out", from: bigint, to: bigint): Promise<{ logs: TransferLog[]; from: bigint } | null> {
  const url = process.env.TRANSFERS_RPC, method = process.env.TRANSFERS_METHOD;
  if (!url || !method) return null;
  const out: TransferLog[] = [];
  let pageKey: string | undefined;
  let last: bigint | null = null;
  for (let page = 0; page < MAX / 1000; page++) {
    const params = {
      fromBlock: `0x${from.toString(16)}`,
      toBlock: `0x${to.toString(16)}`,
      [dir === "out" ? "fromAddress" : "toAddress"]: address,
      category: ["erc20"],
      order: "desc",
      withMetadata: false,
      excludeZeroValue: false,
      maxCount: "0x3e8",
      ...(pageKey ? { pageKey } : {}),
    };
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [params] }), signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: { transfers?: T[]; pageKey?: string }; error?: unknown };
    if (j.error || !j.result) return null;
    for (const t of j.result.transfers ?? []) {
      const token = t.rawContract?.address, value = t.rawContract?.value;
      if (!token || !t.from || !t.to || !t.blockNum || !value) continue;
      out.push({ address: token.toLowerCase(), topics: [TRANSFER, pad(t.from), pad(t.to)], data: pad(value), blockNumber: t.blockNum, transactionHash: t.hash ?? "0x" });
      last = BigInt(t.blockNum);
    }
    pageKey = j.result.pageKey;
    if (!pageKey) return { logs: out, from };
  }
  // stopped at MAX: the window starts where the newest MAX transfers reach back to
  return { logs: out, from: last ?? from };
}

/** Every token that credited `who` over the range, from the transfer index; null when it cannot answer in full. */
export async function receivedOf(who: string, from: bigint, to: bigint): Promise<string[] | null> {
  const r = await transfersOf(who, "in", from, to);
  // stopped short of the window: the older part is unknown, so the caller reads the logs instead
  if (!r || r.from > from) return null;
  return [...new Set(r.logs.map((l) => l.address))];
}
