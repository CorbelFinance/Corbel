import { peekHolders } from "@/lib/holdersOf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/risk?tokens=0x…,0x… → who holds each token (top 10, creator, snipers, insiders), from holders reads the
 * server already keeps; tokens with no fresh read are left out. Never reads the chain, so a list of 60 costs nothing.
 */
export async function GET(req: Request) {
  const list = (new URL(req.url).searchParams.get("tokens") ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => /^0x[0-9a-f]{40}$/.test(x))
    .slice(0, 80);
  const rows: Record<string, NonNullable<ReturnType<typeof peekHolders>>> = {};
  for (const t of list) {
    const h = peekHolders(t);
    if (h) rows[t] = h;
  }
  return Response.json({ rows }, { headers: { "Cache-Control": "public, max-age=60" } });
}
