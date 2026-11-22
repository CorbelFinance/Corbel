import { session } from "@/lib/auth";
import { googleOn, googleSession } from "@/lib/google";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/auth/me → the signed-in address and session expiry, or nulls. */
export async function GET(req: Request) {
  const s = session(req);
  return Response.json({ address: s?.address ?? null, exp: s?.exp ?? null, google: !!googleSession(req), googleOn: googleOn() }, { headers: { "cache-control": "no-store" } });
}
