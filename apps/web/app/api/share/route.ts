import { parseAddress } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { portfolioOf } from "@/lib/portfolio";
import { readShare, SHARE_HOURS, signShare } from "@/lib/share";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/share?address=0x…&hours=24 → a signed, expiring read-only link token for that address.
 * GET /api/share?t=<token> → what the link shows: the portfolio with the address left out, and when it expires.
 * Signing and refusing a bad link are cheap; only a valid view spends the portfolio read budget.
 */
const noStore = { headers: { "cache-control": "private, no-store" } };

async function view(t: string, req: Request) {
  const s = readShare(t);
  if (!s) return Response.json({ error: "This link is not valid or has expired." }, { status: 410, ...noStore });
  const g = await guardWait(req, "portfolio");
  if ("blocked" in g) return g.blocked;
  try {
    const r = await portfolioOf(s.address);
    if (!("body" in r)) return Response.json({ error: r.error }, { status: r.status });
    // the viewer gets the numbers, never the address
    const { address: _hidden, launches: _l, ...rest } = r.body as { address: string; launches?: unknown } & Record<string, unknown>;
    void _hidden;
    void _l;
    return Response.json({ ...rest, exp: s.exp }, noStore);
  } finally {
    g.release();
  }
}

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const t = u.get("t");
  if (t) return view(t, req);
  const g = await guardWait(req, "wallet");
  if ("blocked" in g) return g.blocked;
  try {
    const address = parseAddress((u.get("address") ?? "").trim());
    if (!address) return Response.json({ error: "Paste a 0x address." }, { status: 400 });
    const hours = Number(u.get("hours") ?? 24);
    if (!SHARE_HOURS.includes(hours as (typeof SHARE_HOURS)[number])) return Response.json({ error: "Pick 1, 24 or 168 hours." }, { status: 400 });
    return Response.json(signShare(address, hours), noStore);
  } finally {
    g.release();
  }
}
