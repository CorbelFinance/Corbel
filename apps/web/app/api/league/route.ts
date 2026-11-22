import { survivalLeague } from "@corbel/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; body: unknown } | null = null;

/** GET /api/league → the survival league over the last 7 days of DEX pools, from Corbel's index. Cached 5 minutes. */
export async function GET() {
  if (cache && Date.now() - cache.at < 300_000) return Response.json(cache.body);
  const l = survivalLeague(7);
  if (!l) return Response.json({ error: "The index is not reachable right now." }, { status: 503 });
  const body = { at: new Date().toISOString(), days: 7, ...l };
  cache = { at: Date.now(), body };
  return Response.json(body, { headers: { "cache-control": "public, max-age=300" } });
}
