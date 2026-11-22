import { isSecure, sameOrigin, sessionCookie, verifySignIn } from "@/lib/auth";
import { signedIn } from "@/lib/stats";
import { guardWait } from "@/lib/guard";
import { deviceCookie, noteVisit, startLinker } from "@/lib/sybil";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/auth/verify {message, signature} → sets the session cookie when the signed message checks out. */
export async function POST(req: Request) {
  const g = await guardWait(req, "auth");
  if ("blocked" in g) return g.blocked;
  try {
    if (!sameOrigin(req)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
    const body = (await req.json().catch(() => null)) as { message?: unknown; signature?: unknown } | null;
    if (typeof body?.message !== "string" || typeof body.signature !== "string") return Response.json({ error: "Malformed sign-in." }, { status: 400 });
    const host = req.headers.get("host") ?? "";
    const r = await verifySignIn(body.message, body.signature, host);
    if ("error" in r) return Response.json({ error: r.error }, { status: 401 });
    signedIn(r.address);
    noteVisit(req, r.address);
    startLinker();
    const h = new Headers({ "cache-control": "no-store" });
    h.append("set-cookie", sessionCookie(r.address, isSecure(req)));
    const dev = deviceCookie(req, isSecure(req));
    if (dev) h.append("set-cookie", dev);
    return Response.json({ address: r.address }, { headers: h });
  } finally {
    g.release();
  }
}
