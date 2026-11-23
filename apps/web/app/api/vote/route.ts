import { parseAddress } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { castVote, CAP_COINS, DOMAIN, myVote, options, tally, TYPES, weekOf } from "@/lib/vote";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/vote[?voter=0x…] → this week's ballot, the public tally and, with a voter, that wallet's vote.
 * POST {voter, item, signature} → records a signed vote (EIP-712 Vote{week, item}, domain DOMAIN). No gas, nothing moves.
 */
export async function GET(req: Request) {
  const voter = parseAddress(new URL(req.url).searchParams.get("voter") ?? "");
  return Response.json({ week: weekOf(), domain: DOMAIN, types: TYPES, capCoins: CAP_COINS, options: options(), tally: tally(), mine: voter ? myVote(voter) : null }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const b = (await req.json().catch(() => null)) as { voter?: string; item?: string; signature?: string } | null;
    const voter = parseAddress(b?.voter ?? "");
    if (!voter || !b?.item || !/^0x[0-9a-fA-F]+$/.test(b.signature ?? "")) return Response.json({ error: "Give the wallet, the item and the signature." }, { status: 400 });
    const r = await castVote(voter, b.item, b.signature as `0x${string}`);
    if ("error" in r) return Response.json(r, { status: 400 });
    award(req, "vote", `${voter.toLowerCase()}:${tally().week}`);
    return Response.json({ ...r, tally: tally(), mine: myVote(voter) });
  } finally {
    g.release();
  }
}
