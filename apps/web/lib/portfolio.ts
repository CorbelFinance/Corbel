import { getClient, readPortfolio, redact } from "@corbel/data/chain";
import { allTokens, indexStatus, launcherHistory, tokenMeta } from "@corbel/indexer";
import { ensureV4, v4PoolsBetween, v4PoolsFor } from "./v4extra";
import { receivedOf } from "./transferIndex";

/**
 * One address's balances and the tokens it received inside the index window, valued at spot in ETH.
 * Shared by /api/portfolio and the read-only share links. Cached 60 s per address; one scan per address at a time.
 */
const G = globalThis as unknown as { __corbelPortfolio?: { cache: Map<string, { at: number; body: unknown }>; inflight: Map<string, Promise<unknown>> } };
const box = (G.__corbelPortfolio ??= { cache: new Map(), inflight: new Map() });
const TTL = 60_000;

/** True when this address is cached or already being scanned: serving it costs no new chain reads. */
export function portfolioWarm(address: string): boolean {
  const key = address.toLowerCase(), hit = box.cache.get(key);
  return Boolean((hit && Date.now() - hit.at < TTL) || box.inflight.has(key));
}

export async function portfolioOf(address: `0x${string}`): Promise<{ body: unknown } | { error: string; status: number }> {
  const key = address.toLowerCase();
  const hit = box.cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { body: hit.body };
  // mark the scan as running before the first await, so every block of the page joins this one read
  let run = box.inflight.get(key) as Promise<{ body: unknown } | { error: string; status: number }> | undefined;
  if (!run) {
    run = scan(address, key).finally(() => box.inflight.delete(key));
    box.inflight.set(key, run);
  }
  return run;
}

async function scan(address: `0x${string}`, key: string): Promise<{ body: unknown } | { error: string; status: number }> {
  const client = getClient(process.env.RPC_URL);
  if (!client) return { error: "Chain reads are paused. Try again later.", status: 503 };
  const st = indexStatus();
  const head = await client.getBlockNumber().catch(() => null);
  if (!head) return { error: "The chain did not answer. Try again in a minute.", status: 502 };
  // scan the index window when there is one, else the last ~3 days
  const from = st?.low ? BigInt(st.low) : head - 1_000_000n;
  try {
    const r = await readPortfolio(client, address, { from, to: head }, { v4PoolsBetween, tokenMeta, allTokens, v4For: (t) => v4PoolsFor(t) ?? [], findPools: (t) => ensureV4(client, t), received: receivedOf });
    const body = { ...r, launches: launcherHistory(address) };
    if (box.cache.size > 200) box.cache.delete(box.cache.keys().next().value!);
    // a read that missed the index is shown once and asked again next time, never kept
    if (r.scanned.index || !allTokens().length) box.cache.set(key, { at: Date.now(), body });
    return { body };
  } catch (e) {
    console.error("[portfolio]", redact(e));
    return { error: "The chain did not answer. Try again in a minute.", status: 502 };
  }
}
