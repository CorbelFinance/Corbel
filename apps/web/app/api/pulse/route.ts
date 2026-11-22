import { LAUNCHPADS } from "@corbel/config";
import { pulse } from "@corbel/indexer";
import { topChecksToday } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; body: unknown } | null = null;
const padName = (pad: string | null) => (pad ? (LAUNCHPADS.find((l) => l.id === pad)?.name ?? pad.charAt(0).toUpperCase() + pad.slice(1)) : null);

/**
 * GET /api/pulse → what is happening on Robinhood Chain right now, from Corbel's own index: newest launches, launches
 * that reached a DEX pool, pools found drained, the tokens checked most today, and running counts. Cached 20 s.
 */
export async function GET() {
  if (cache && Date.now() - cache.at < 20_000) return Response.json(cache.body);
  const p = pulse(18);
  if (!p) return Response.json({ error: "The index is not reachable right now." }, { status: 503 });
  const body = {
    head: p.head,
    counts: p.counts,
    events: p.events.map((e) => ({ ...e, pad: padName(e.pad) })),
    checks: topChecksToday(6),
  };
  cache = { at: Date.now(), body };
  return Response.json(body, { headers: { "cache-control": "public, max-age=20" } });
}
