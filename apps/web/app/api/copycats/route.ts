import { copycats, indexStatus } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";
import { blocksPerSecond } from "@/lib/blockRate";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/copycats?days=7 → new tokens that reuse a ticker an earlier token already had, newest first, each with the
 * first token seen under that ticker. From the local index; days turn into blocks at the rate measured from the chain.
 */
let cached: { key: string; at: number; body: unknown } | null = null;

export async function GET(req: Request) {
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    const days = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 7) || 7));
    const key = String(days);
    if (cached && cached.key === key && Date.now() - cached.at < 60_000) return (award(req, "copycats"), Response.json(cached.body));
    const st = indexStatus();
    if (!st?.high) return Response.json({ error: "The index is not available yet." }, { status: 503 });
    const bps = await blocksPerSecond();
    const rows = copycats(st.high - Math.round(bps * 86_400 * days), 60) ?? [];
    const body = { head: st.high, bps, days, rows };
    cached = { key, at: Date.now(), body };
    award(req, "copycats");
    return Response.json(body);
  } finally {
    g.release();
  }
}
