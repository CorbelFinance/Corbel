import { guardWait } from "@/lib/guard";
import { frozenWeek } from "@/lib/payout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/rewards/list?week=2026-W48 → the frozen payout list of a finished week: the seed block and its hash, the
 * Merkle root and total the project multisig posts on chain, and every winner with their amount and proof. Public, so
 * anyone can rebuild the root and redo the draw (see /rewards-verify.mjs).
 */
export async function GET(req: Request) {
  const week = new URL(req.url).searchParams.get("week") ?? "";
  if (!/^\d{4}-W\d{2}$/.test(week)) return Response.json({ error: "Pass week=YYYY-Www." }, { status: 400 });
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    const r = await frozenWeek(week);
    return Response.json(r, { status: "pending" in r ? 202 : 200, headers: { "cache-control": "pending" in r ? "no-store" : "public, max-age=300" } });
  } finally {
    g.release();
  }
}
