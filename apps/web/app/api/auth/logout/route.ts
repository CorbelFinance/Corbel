import { clearCookie, isSecure, sameOrigin } from "@/lib/auth";
import { clearGoogle } from "@/lib/google";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/auth/logout → clears the session cookie. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
  const h = new Headers({ "cache-control": "no-store" });
  h.append("set-cookie", clearCookie(isSecure(req)));
  h.append("set-cookie", clearGoogle(isSecure(req)));
  return Response.json({ ok: true }, { headers: h });
}
