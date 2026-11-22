import { indexStatus, poolsSince, recentPools } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";
import { launchpadOf } from "@corbel/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * New pools on Robinhood Chain, newest first: GET /api/radar?kind=v2|v4&before=<block>&limit=<n>.
 * Reads the local index only; no chain call. Ages are estimated from block height (~4 blocks per second).
 */
const BLOCKS_PER_DAY = 345_600;

function handle(req: Request) {
  const u = new URL(req.url).searchParams;
  const kind = u.get("kind");
  const before = Number(u.get("before") ?? "");
  const limit = Number(u.get("limit") ?? 50);
  const status = indexStatus();
  if (!status) return Response.json({ error: "The index is not available yet." }, { status: 503 });
  const rows = recentPools({
    kind: kind === "v2" || kind === "v4" ? kind : undefined,
    before: Number.isFinite(before) && before > 0 ? before : undefined,
    limit: Number.isFinite(limit) ? limit : 50,
  });
  const head = status.high;
  const day = head ? poolsSince(head - BLOCKS_PER_DAY) : null;
  return Response.json(
    { head, low: status.low, pools: status.pools, last24h: day ? Object.fromEntries(day.map((r) => [r.kind, r.n])) : null, rows: rows?.map(({ pad, hook, ...r }) => ({ ...r, launchpad: launchpadOf(pad, hook) })) ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Rate limit and concurrency cap first (lib/guard.ts), then the handler. */
export async function GET(req: Request) {
  const g = await guardWait(req, "radar");
  if ("blocked" in g) return g.blocked;
  try {
    return await handle(req);
  } finally {
    g.release();
  }
}
