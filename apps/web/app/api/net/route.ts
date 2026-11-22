import { getClient, readNet } from "@corbel/data/chain";

export const dynamic = "force-dynamic";

/** One RPC read per 10 s for all visitors. The browser never talks to the RPC itself. */
let cache: { at: number; body: { block: string; gasPriceGwei: string } | null } | null = null;
const TTL = 10_000;

export async function GET() {
  const now = Date.now();
  if (!cache || now - cache.at > TTL) {
    const snap = await readNet(getClient(process.env.RPC_URL));
    cache = {
      at: now,
      body: snap ? { block: snap.block.toString(), gasPriceGwei: (Number(snap.gasPriceWei) / 1e9).toFixed(3) } : null,
    };
  }
  // no data (RPC down) is a normal state for the header, not an error
  return Response.json(cache.body ?? { block: null }, {
    status: 200,
    headers: { "cache-control": "public, max-age=5" },
  });
}
