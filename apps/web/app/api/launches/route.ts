import { launchStats } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";
import { blocksPerSecond } from "@/lib/blockRate";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/launches → launch analytics from the local index; hours use the block rate measured from the chain. Cached 30 s. */
let cached: { at: number; body: unknown } | null = null;

async function handle() {
  if (cached && Date.now() - cached.at < 30_000) return Response.json(cached.body);
  const bps = await blocksPerSecond();
  const st = launchStats(Math.round(bps * 3600));
  if (!st) return Response.json({ error: "The index is not available yet." }, { status: 503 });
  const s = { ...st, bps };
  cached = { at: Date.now(), body: s };
  return Response.json(s);
}

/** Rate limit and concurrency cap first (lib/guard.ts), then the handler. */
export async function GET(req: Request) {
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    const res = await handle();
    if (res.ok) award(req, "launches");
    return res;
  } finally {
    g.release();
  }
}
