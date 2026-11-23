import { parseAddress } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { batches, closeBatch, outcomes, proofsFor } from "@/lib/ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/ledger → the verdict batches (Merkle roots, how many verdicts each, posted on chain or not) and the outcomes
 * of verdicts a week old. GET /api/ledger?token=0x… → that token's committed verdicts with the proof of each.
 * A new batch closes at most once an hour, on the first read after the hour.
 */
export async function GET(req: Request) {
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    closeBatch();
    const t = new URL(req.url).searchParams.get("token");
    if (t !== null) {
      const a = parseAddress(t);
      if (!a) return Response.json({ error: "Pass a token address." }, { status: 400 });
      return Response.json({ token: a, verdicts: proofsFor(a), scheme: "leaf = keccak256(token|block|results); sorted-pair Merkle tree" });
    }
    return Response.json({ batches: batches(), outcomes: outcomes(), poster: !!process.env.LEDGER_KEY, scheme: "leaf = keccak256(token|block|results); sorted-pair Merkle tree" }, { headers: { "cache-control": "public, max-age=60" } });
  } finally {
    g.release();
  }
}
