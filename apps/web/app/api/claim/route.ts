import { session, sameOrigin } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { claimOf, claimPrice, claimsOpen, makeClaim } from "@/lib/claims";
import { award } from "@/lib/points";
import { launchCreator } from "@corbel/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/claim?token=0x… → the team's claim on this token's check page (or null), whether claims are open, the price
 * in $CORBEL right now, and whether the signed-in wallet is the token's creator. POST {token, tx?, website, x, telegram,
 * team[], note} → makes or edits the claim (signed in, this site only). A claim never changes a check or the score.
 */
export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const token = (new URL(req.url).searchParams.get("token") ?? "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(token)) return Response.json({ error: "Send ?token=0x…" }, { status: 400 });
    const s = session(req);
    const open = claimsOpen();
    return Response.json(
      { open, claim: claimOf(token), price: open ? await claimPrice() : null, mine: !!s && launchCreator(token) === s.address.toLowerCase() },
      { headers: { "cache-control": "no-store" } },
    );
  } finally {
    g.release();
  }
}

export async function POST(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    if (!sameOrigin(req)) return Response.json({ error: "Refused." }, { status: 403 });
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet first." }, { status: 401 });
    const j = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const r = await makeClaim(s.address, String(j.token ?? ""), typeof j.tx === "string" ? j.tx : null, j);
    // a new claim (paid by a burn) earns its points once; an edit carries no tx
    if (!("error" in r) && typeof j.tx === "string" && r.claim.tx === j.tx.toLowerCase()) award(req, "claim", r.claim.tx);
    return "error" in r ? Response.json({ error: r.error }, { status: r.status }) : Response.json(r, { headers: { "cache-control": "no-store" } });
  } finally {
    g.release();
  }
}
