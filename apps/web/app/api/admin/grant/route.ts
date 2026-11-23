import { sameOrigin, session } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { grant, grants, REPORTS, type ReportKind } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Owner's panel · report points. GET → the latest grants; POST {wallet, kind, note} → adds the points for a checked
 * bug report or idea. Only wallets in ADMIN_WALLETS get an answer; everyone else gets a plain 404.
 */
const admins = () => (process.env.ADMIN_WALLETS ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
const notFound = () => new Response("Not found.", { status: 404 });

async function run(req: Request, fn: (admin: string) => Promise<Response> | Response) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const s = session(req);
    if (!s || !admins().includes(s.address.toLowerCase())) return notFound();
    if (req.method !== "GET" && !sameOrigin(req)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
    return await fn(s.address);
  } finally {
    g.release();
  }
}

export const GET = (req: Request) => run(req, () => Response.json({ kinds: REPORTS, grants: grants() }, { headers: { "cache-control": "no-store" } }));
export const POST = (req: Request) =>
  run(req, async (admin) => {
    const b = (await req.json().catch(() => null)) as { wallet?: string; kind?: string; note?: string } | null;
    const kind = String(b?.kind ?? "") as ReportKind;
    if (!(kind in REPORTS)) return Response.json({ error: "Pick a kind." }, { status: 400 });
    const e = grant(admin, String(b?.wallet ?? ""), kind, String(b?.note ?? ""));
    return e ? Response.json({ error: e }, { status: 400 }) : Response.json({ ok: true, grants: grants() });
  });
