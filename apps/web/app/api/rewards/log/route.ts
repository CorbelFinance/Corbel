import { guardWait } from "@/lib/guard";
import { weekLog, weekOf } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/rewards/log?week=2026-W48 → the week's public points log: every row in order (participant number, action,
 * points, time, transaction for on-chain actions) with its seal in the hash chain, the hash before the first row and
 * the chain's head. Anyone can recompute the chain and the board from it (see /rewards-log-verify.mjs).
 */
export async function GET(req: Request) {
  const w = new URL(req.url).searchParams.get("week") ?? weekOf();
  if (!/^\d{4}-W\d{2}$/.test(w)) return Response.json({ error: "Pass week=YYYY-Www." }, { status: 400 });
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    const log = weekLog(w);
    return log ? Response.json(log, { headers: { "cache-control": "no-store" } }) : Response.json({ error: "The log is not open." }, { status: 503 });
  } finally {
    g.release();
  }
}
