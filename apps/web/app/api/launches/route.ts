import { launchStats } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/launches → launch analytics from the local index. No chain call. Cached 30 s. */
let cached: { at: number; body: unknown } | null = null;

function handle() {
  if (cached && Date.now() - cached.at < 30_000) return Response.json(cached.body);
  const s = launchStats();
  if (!s) return Response.json({ error: "The index is not available yet." }, { status: 503 });
  cached = { at: Date.now(), body: s };
  return Response.json(s);
}

/** Rate limit and concurrency cap first (lib/guard.ts), then the handler. */
export async function GET(req: Request) {
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    return await handle();
  } finally {
    g.release();
  }
}
