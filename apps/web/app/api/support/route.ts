import { guardWait } from "@/lib/guard";
import { sameOrigin } from "@/lib/auth";
import { addMessage } from "@/lib/support";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/support {text, contact?, page?} → keeps a message for the team. Open to everyone, same origin only. */
export async function POST(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    if (!sameOrigin(req)) return Response.json({ error: "Refused." }, { status: 403 });
    const j = (await req.json().catch(() => null)) as { text?: unknown; contact?: unknown; page?: unknown } | null;
    const e = addMessage(req, j ?? {});
    if (e) return Response.json({ error: e }, { status: 400 });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } finally {
    g.release();
  }
}
