import { poolStudy, signalStudy } from "@corbel/indexer";
import { verdictStats } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; body: unknown } | null = null;

/**
 * GET /api/accuracy → does what the token check reads tell which tokens get drained? Two studies from Corbel's index,
 * each signal computed only from what was on chain before the pool or launch it judges, plus how many check results are
 * on record for the score-based study. Cached 10 minutes. The same numbers the /accuracy page draws.
 */
export async function GET() {
  if (cache && Date.now() - cache.at < 600_000) return Response.json(cache.body);
  const pools = poolStudy();
  const launches = signalStudy();
  if (!pools) return Response.json({ error: "The index is not reachable right now." }, { status: 503 });
  const body = { at: new Date().toISOString(), pools, launches, verdicts: verdictStats() };
  cache = { at: Date.now(), body };
  return Response.json(body, { headers: { "cache-control": "public, max-age=600" } });
}
