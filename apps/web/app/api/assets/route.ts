import { searchTicker, tokenMeta } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/assets?q=<ticker | 0x address> → tokens from the index for pickers. No chain call. */
function handle(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q || q.length > 64) return Response.json({ items: [] });
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
    const m = tokenMeta(q);
    return Response.json({ items: [{ address: q.toLowerCase(), symbol: m?.symbol ?? null, name: m?.name ?? null, pools: null }] });
  }
  if (!/^\$?[A-Za-z0-9._-]{1,20}$/.test(q)) return Response.json({ items: [] });
  const hits = searchTicker(q, 8);
  if (hits === null) return Response.json({ error: "The index is not available yet. Paste an address." }, { status: 503 });
  return Response.json({ items: hits });
}

/** Rate limit and concurrency cap first (lib/guard.ts), then the handler. */
export async function GET(req: Request) {
  const g = await guardWait(req, "assets");
  if ("blocked" in g) return g.blocked;
  try {
    return await handle(req);
  } finally {
    g.release();
  }
}
