import { parseAddress } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { portfolioOf, portfolioWarm } from "@/lib/portfolio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/portfolio?address=0x… → balances, tokens received inside the index window (Transfer logs),
 * spot values in ETH. Read-only. Cached 60 s per address; one scan per address at a time.
 */
async function handle(req: Request) {
  const address = parseAddress((new URL(req.url).searchParams.get("address") ?? "").trim());
  if (!address) return Response.json({ error: "Paste a 0x address." }, { status: 400 });
  const r = await portfolioOf(address);
  return "body" in r ? Response.json(r.body) : Response.json({ error: r.error }, { status: r.status });
}

/** Rate limit and concurrency cap first (lib/guard.ts), then the handler. */
export async function GET(req: Request) {
  // the same address already cached or scanning: join it, no slot needed (several blocks of one page ask at once)
  const a = parseAddress((new URL(req.url).searchParams.get("address") ?? "").trim());
  if (a && portfolioWarm(a)) return handle(req);
  const g = await guardWait(req, "portfolio", 40_000);
  if ("blocked" in g) return g.blocked;
  try {
    return await handle(req);
  } finally {
    g.release();
  }
}
