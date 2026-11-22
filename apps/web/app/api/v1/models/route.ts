import { guardWait } from "@/lib/guard";
import { autoPick } from "@/lib/autopick";
import { isAvailable, models, modelsReady } from "@/lib/compute";
import { MARKUP } from "@/lib/credits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/v1/models: the text models a Corbel model key can call, with the price per 1M tokens as charged, and the
 * model each "auto" choice goes to right now. No key needed to read it. */
export async function GET(req: Request) {
  const g = await guardWait(req, "v1");
  if ("blocked" in g) return g.blocked;
  try {
    await modelsReady();
    const all = (models()?.rows ?? []).filter((m) => isAvailable(m.id) && (m.kind === "text" || m.kind === "code"));
    const p = (v: number) => Math.round(v * (1 + MARKUP) * 1e4) / 1e4;
    const auto = Object.fromEntries((["price", "speed", "quality"] as const).map((m) => [`auto:${m}`, autoPick(all, m)?.id ?? null]));
    return Response.json(
      { object: "list", auto, data: all.map((m) => ({ id: m.id, object: "model", owned_by: m.maker, context: m.ctx, usd_per_1m_input: p(m.pin), usd_per_1m_output: p(m.pout) })) },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  } finally {
    g.release();
  }
}
