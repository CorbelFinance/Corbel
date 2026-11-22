import { guardWait } from "@/lib/guard";
import { availReady, gpus, isAvailable, models, providerOn } from "@/lib/compute";
import { MEDIA } from "@/lib/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/compute?what=models → every AI model with its list price per 1M tokens, plus picture, film and sound models that open later.
 * GET /api/compute?what=gpus → GPU types with hourly rates.
 * Served from a cache that refreshes behind the answer; 202 while the first read is out.
 */
export async function GET(req: Request) {
  const g = await guardWait(req, "assets");
  if ("blocked" in g) return g.blocked;
  try {
    const u = new URL(req.url).searchParams;
    const what = u.get("what");
    const cache = { headers: { "cache-control": "public, max-age=60" } };
    if (what === "models") {
      // right after a restart the list of models our provider runs is not read yet: wait for it rather than answer "0 open"
      await availReady();
      const m = models();
      const on = providerOn();
      // an answer without that list is never cached, so a browser does not keep a zero
      return m ? Response.json({ at: m.at, provider: on, rows: [...m.rows.map((r) => ({ ...r, avail: isAvailable(r.id) })), ...MEDIA.map((r) => ({ ...r, avail: false }))] }, on ? cache : { headers: { "cache-control": "no-store" } }) : Response.json({ warming: true }, { status: 202 });
    }
    if (what === "gpus") {
      const x = gpus();
      return x ? Response.json({ at: x.at, rows: x.rows }, cache) : Response.json({ warming: true }, { status: 202 });
    }
    return Response.json({ error: "Ask for models or gpus." }, { status: 400 });
  } finally {
    g.release();
  }
}
