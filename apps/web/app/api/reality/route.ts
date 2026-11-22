import { parseAddress, redact } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { reality, type Reality } from "@/lib/reality";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/reality?token=0x… → the project's claims next to what can be checked: each claim quoted word for word
 * from its own site, channel or profile, marked backed, unbacked or contradicted by evidence read here, and a score.
 * Cached six hours per token; one read per token at a time.
 */
const TTL = 6 * 3600_000;
const G = globalThis as unknown as { __corbelReality?: { cache: Map<string, { at: number; body: Reality }>; inflight: Map<string, Promise<Reality>> } };
const box = (G.__corbelReality ??= { cache: new Map(), inflight: new Map() });

export async function GET(req: Request) {
  const token = parseAddress((new URL(req.url).searchParams.get("token") ?? "").trim());
  if (!token) return Response.json({ error: "Paste the token's contract address." }, { status: 400 });
  const k = token.toLowerCase();
  const hit = box.cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);
  let p = box.inflight.get(k);
  if (!p) {
    const g = await guardWait(req, "token", 40_000);
    if ("blocked" in g) return g.blocked;
    p = reality(token).finally(() => (g.release(), box.inflight.delete(k)));
    box.inflight.set(k, p);
  }
  try {
    const body = await p;
    if (box.cache.size > 500) box.cache.delete(box.cache.keys().next().value!);
    box.cache.set(k, { at: Date.now(), body });
    return Response.json(body);
  } catch (e) {
    console.error("[api/reality]", redact(e));
    return Response.json({ error: "The read did not finish. Try again in a minute." }, { status: 502 });
  }
}
