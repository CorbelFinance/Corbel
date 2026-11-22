import { isSecure } from "@/lib/auth";
import { googleOn, startGoogle } from "@/lib/google";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/auth/google?back=/path → off to Google's account picker. */
export async function GET(req: Request) {
  const g = await guardWait(req, "auth");
  if ("blocked" in g) return g.blocked;
  try {
    if (!googleOn()) return Response.json({ error: "Google sign-in is not open yet." }, { status: 503 });
    const s = startGoogle(req, isSecure(req));
    return new Response(null, { status: 302, headers: { location: s.url, "set-cookie": s.cookie, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  } finally {
    g.release();
  }
}
