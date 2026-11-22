import { isSecure } from "@/lib/auth";
import { finishGoogle, googleOn, originOf } from "@/lib/google";
import { guardWait } from "@/lib/guard";
import { deviceCookie, noteVisit, startLinker } from "@/lib/sybil";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/auth/google/callback?code&state → the Google session cookie, then back to the page the visitor came from. */
export async function GET(req: Request) {
  const g = await guardWait(req, "auth");
  if ("blocked" in g) return g.blocked;
  try {
    const origin = originOf(req);
    const h = new Headers({ "cache-control": "no-store", "referrer-policy": "no-referrer" });
    if (!googleOn()) {
      h.set("location", `${origin}/app/ai/chat`);
      return new Response(null, { status: 302, headers: h });
    }
    const secure = isSecure(req);
    const r = await finishGoogle(req, secure);
    if ("error" in r) {
      h.set("location", `${origin}/app/ai/chat?signin=${encodeURIComponent(r.error)}`);
      return new Response(null, { status: 302, headers: h });
    }
    for (const c of r.cookies) h.append("set-cookie", c);
    // the same fair-use signals as a wallet sign-in: a salted IP hash and a device cookie, kept 24 hours
    noteVisit(req, r.id);
    startLinker();
    const dev = deviceCookie(req, secure);
    if (dev) h.append("set-cookie", dev);
    h.set("location", `${origin}${r.back}`);
    return new Response(null, { status: 302, headers: h });
  } finally {
    g.release();
  }
}
