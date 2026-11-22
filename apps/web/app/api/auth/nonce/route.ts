import { newNonce } from "@/lib/auth";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/auth/nonce → a single-use nonce for a Sign-in with Ethereum message (valid 5 minutes). */
export async function GET(req: Request) {
  const g = await guardWait(req, "auth");
  if ("blocked" in g) return g.blocked;
  try {
    return Response.json({ nonce: newNonce() }, { headers: { "cache-control": "no-store" } });
  } finally {
    g.release();
  }
}
