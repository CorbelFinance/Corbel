import { launchOutcomes } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/outcomes → what became of every indexed launch, per launch pad, all time and the last 7 days. Cached 60 s. */
let cached: { at: number; body: unknown } | null = null;

export async function GET(req: Request) {
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    if (cached && Date.now() - cached.at < 60_000) return Response.json(cached.body);
    const o = launchOutcomes();
    if (!o) return Response.json({ error: "The index is not available yet." }, { status: 503 });
    cached = { at: Date.now(), body: o };
    return Response.json(o);
  } finally {
    g.release();
  }
}
