import { sameOrigin, session } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { radarStatus, setRadar, startRadarAlerts } from "@/lib/radarAlerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The signed-in wallet's Radar alerts. GET → on or off, whether its tier allows them, the delay for its tier, whether
 * Telegram delivery is linked, and the last digests it got. POST {on} → turn them on or off (this site's own pages only).
 */
async function run(req: Request, fn: (owner: string) => Promise<Response> | Response) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    startRadarAlerts();
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet first." }, { status: 401 });
    if (req.method !== "GET" && !sameOrigin(req)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
    return await fn(s.address);
  } finally {
    g.release();
  }
}

export const GET = (req: Request) => run(req, (owner) => Response.json(radarStatus(owner), { headers: { "cache-control": "no-store" } }));
export const POST = (req: Request) =>
  run(req, async (owner) => {
    const j = (await req.json().catch(() => null)) as { on?: unknown } | null;
    const e = setRadar(owner, j?.on === true);
    if (e) return Response.json({ error: e }, { status: 403 });
    return Response.json(radarStatus(owner));
  });
