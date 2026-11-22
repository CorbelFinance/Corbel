import { parseAddress, redact } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { holdersOf } from "@/lib/holdersOf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/holders?token=<address> → top holders with labels and the insider summary. One shared read per token
 * (lib/holdersOf, also used by the trust report), kept thirty minutes.
 */
export async function GET(req: Request) {
  const g = await guardWait(req, "holders", 40_000);
  if ("blocked" in g) return g.blocked;
  try {
    const a = parseAddress((new URL(req.url).searchParams.get("token") ?? "").trim());
    if (!a) return Response.json({ error: "Pass a token contract address." }, { status: 400 });
    try {
      return Response.json(await holdersOf(a));
    } catch (e) {
      console.error("[api/holders]", redact(e));
      return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
    }
  } finally {
    g.release();
  }
}
