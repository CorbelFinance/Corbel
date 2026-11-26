import { getClient, readHolders } from "@corbel/data/chain";
import { tokenPools } from "@corbel/indexer";

/**
 * One holders read per token, shared by /api/holders and the trust report (two minutes per token, one read at a
 * time). `brief` is what the Corbel score needs: shares of supply outside pools and burn.
 */
const BUSY = new Set(["0x0bd7d308f8e1639fab988df18a8011f41eacad73", "0x5fc5360d0400a0fd4f2af552add042d716f1d168"]);
const TTL = 30 * 60_000; // a full read takes up to a minute on a busy token; holders move slowly
const G = globalThis as unknown as { __corbelHolders?: { cache: Map<string, { at: number; body: Awaited<ReturnType<typeof readHolders>> }>; inflight: Map<string, ReturnType<typeof readHolders>> } };
const box = (G.__corbelHolders ??= { cache: new Map(), inflight: new Map() });

export async function holdersOf(token: `0x${string}`) {
  const key = token.toLowerCase();
  const hit = box.cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.body;
  const client = getClient(process.env.RPC_URL);
  if (!client) throw new Error("chain reads are paused");
  let p = box.inflight.get(key);
  if (!p) {
    const tp = tokenPools(key);
    p = readHolders(client, token, { poolBlock: tp?.firstBlock ?? null, pools: tp?.pools ?? [], creator: tp?.launcher ?? null, windows: BUSY.has(key) ? 6 : undefined });
    box.inflight.set(key, p);
  }
  try {
    const body = await p;
    if (box.cache.size > 300) box.cache.delete(box.cache.keys().next().value!);
    box.cache.set(key, { at: Date.now(), body });
    return body;
  } finally {
    box.inflight.delete(key);
  }
}

/** The part of a holders read the score uses; null when the read is missing or partial. */
export function holdersBrief(h: Awaited<ReturnType<typeof readHolders>> | null) {
  if (!h || !h.complete) return null;
  const people = h.top.filter((x) => !x.tags.includes("pool") && !x.tags.includes("burn") && !x.tags.includes("contract"));
  return { top10: h.summary.top10, insiders: h.summary.insiders, creator: h.summary.creator, holders: h.holders, largest: people[0]?.share ?? 0 };
}

/** A holders read already kept (no chain read), as the small summary lists show; null when none is fresh. */
export function peekHolders(token: string) {
  const hit = box.cache.get(token.toLowerCase());
  if (!hit || Date.now() - hit.at > 2 * TTL || !hit.body.complete) return null;
  const s = hit.body.summary;
  return { top10: s.top10, creator: s.creator, snipers: s.snipers, sniperCount: s.sniperCount, insiders: s.insiders, holders: hit.body.holders };
}
