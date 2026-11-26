import { parseAddress } from "@corbel/data/chain";
import { candlesOf } from "@/lib/candleStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TFS = new Set([60, 300, 900, 3600, 14400, 86400]);

/**
 * GET /api/candles?token=<address>&tf=3600&before=<unix>&days=14 → kept candles of the token's pool before a time,
 * price in the pool's base. History grows from the day it was first kept; a token nobody opened has none.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = parseAddress((u.searchParams.get("token") ?? "").trim());
  const tf = Math.max(300, Number(u.searchParams.get("tf")) || 3600);
  const before = Math.floor(Number(u.searchParams.get("before")) || Date.now() / 1000);
  const days = Math.min(400, Math.max(1, Number(u.searchParams.get("days")) || 14));
  if (!token || !TFS.has(tf === 300 ? 300 : tf)) return Response.json({ error: "Pass a token and a known interval." }, { status: 400 });
  return Response.json({ bars: candlesOf(token, tf, before, days) }, { headers: { "Cache-Control": "public, max-age=60" } });
}
