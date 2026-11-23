import { getClient } from "@corbel/data/chain";

/**
 * Blocks per second on Robinhood Chain, measured from the chain's own timestamps (the latest block against one
 * ~200,000 blocks earlier), kept for 30 minutes. Figures that say "last 24 hours" or "3 h ago" turn blocks into time
 * with this, never with a fixed guess: the rate moved from about 4 to about 9 a second within weeks.
 */
const TTL = 30 * 60_000;
const SPAN = 200_000n;
const FALLBACK = 8.7; // measured 2026-11-22, used only when the chain cannot be read
const G = globalThis as unknown as { __corbelBps?: { at: number; bps: number }; __corbelBpsRun?: Promise<number> | null };

export async function blocksPerSecond(): Promise<number> {
  if (G.__corbelBps && Date.now() - G.__corbelBps.at < TTL) return G.__corbelBps.bps;
  if (G.__corbelBpsRun) return G.__corbelBpsRun;
  G.__corbelBpsRun = (async () => {
    try {
      const client = getClient(process.env.RPC_URL);
      if (!client) return G.__corbelBps?.bps ?? FALLBACK;
      const head = await client.getBlock();
      const past = await client.getBlock({ blockNumber: head.number - SPAN });
      const dt = Number(head.timestamp - past.timestamp);
      const bps = dt > 0 ? Number(SPAN) / dt : FALLBACK;
      // a wild value (clock jump, reorg at the edge) keeps the last good one
      const ok = bps > 0.5 && bps < 50 ? bps : (G.__corbelBps?.bps ?? FALLBACK);
      G.__corbelBps = { at: Date.now(), bps: ok };
      return ok;
    } catch {
      return G.__corbelBps?.bps ?? FALLBACK;
    } finally {
      G.__corbelBpsRun = null;
    }
  })();
  return G.__corbelBpsRun;
}

/** The last measured rate without waiting (the fallback until the first read lands); starts a fresh read when stale. */
export function blocksPerSecondNow(): number {
  if (!G.__corbelBps || Date.now() - G.__corbelBps.at >= TTL) void blocksPerSecond();
  return G.__corbelBps?.bps ?? FALLBACK;
}
