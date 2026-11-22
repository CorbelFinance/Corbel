import { sameOrigin } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { record } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/t {s, e: [{k, p, t?, ms?, q}]} → 204. Page views, clicks and leaves from this site's own pages, for the
 * owner's counts. No IP, user agent, cookie or wallet is kept (see lib/stats.ts). Same origin only.
 */
export async function POST(req: Request) {
  const g = await guardWait(req, "track");
  if ("blocked" in g) return g.blocked;
  try {
    if (!sameOrigin(req)) return new Response(null, { status: 204 });
    const text = await req.text();
    if (text.length > 16_000) return new Response(null, { status: 204 });
    const j = JSON.parse(text) as { s?: unknown; e?: unknown; v?: unknown };
    if (typeof j.s === "string" && Array.isArray(j.e)) record(j.s, j.e as never, j.v as never);
  } catch {
    // a malformed beacon is dropped
  } finally {
    g.release();
  }
  return new Response(null, { status: 204 });
}
