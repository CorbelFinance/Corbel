import { guardWait } from "@/lib/guard";
import { xcheckSnap } from "@/lib/xcheck";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/xcheck → the checker's last pass: the chain's ETH price against outside quotes, and each listed token's
 * price and holder count against an outside explorer, with the tokens in doubt.
 */
export async function GET(req: Request) {
  const g = await guardWait(req, "stocks");
  if ("blocked" in g) return g.blocked;
  try {
    const s = xcheckSnap();
    if (!s) return Response.json({ warming: true }, { status: 202 });
    return Response.json(
      {
        at: s.at,
        eth: { ours: s.eth.ours, median: s.eth.median, sources: s.eth.outside.length, agree: s.eth.agree },
        checked: s.tokens.length,
        agree: s.tokens.filter((t) => t.agree === true).length,
        doubt: s.tokens.filter((t) => t.agree === false).map((t) => ({ token: t.token, symbol: t.symbol, why: t.why, holders: t.holders })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } finally {
    g.release();
  }
}
