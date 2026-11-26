import { companyOf } from "@/lib/companyInfo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/company?symbol=NVDA&name=NVIDIA → what the company behind a stock token does, its sector tags and its own
 * links (site, X, LinkedIn), or { company: null } when there is no clear match. Cached a week on the server.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const symbol = (u.searchParams.get("symbol") ?? "").trim();
  const name = (u.searchParams.get("name") ?? "").trim();
  if (!/^[A-Za-z][A-Za-z0-9.]{0,9}$/.test(symbol) || name.length > 80) return Response.json({ error: "A ticker and a name are needed." }, { status: 400 });
  const company = await companyOf(symbol, name || symbol);
  return Response.json({ company }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
