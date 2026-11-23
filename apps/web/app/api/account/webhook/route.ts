import { sameOrigin, session } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";
import { startWatchSweep } from "@/lib/watchEngine";
import { hookOf, removeHook, setHook, startWebhooks } from "@/lib/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The signed-in wallet's webhook. GET → the URL and its last answer; POST {url} → sets it and shows the secret once; DELETE → removes it. */
async function run(req: Request, fn: (owner: string) => Promise<Response> | Response) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    startWebhooks();
    startWatchSweep();
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet first." }, { status: 401 });
    if (req.method !== "GET" && !sameOrigin(req)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
    return await fn(s.address);
  } finally {
    g.release();
  }
}

export const GET = (req: Request) => run(req, (owner) => Response.json({ hook: hookOf(owner) }, { headers: { "cache-control": "no-store" } }));
export const POST = (req: Request) =>
  run(req, async (owner) => {
    const b = (await req.json().catch(() => null)) as { url?: string } | null;
    const r = setHook(owner, String(b?.url ?? ""));
    if ("error" in r) return Response.json(r, { status: 400 });
    award(req, "webhook", owner);
    return Response.json({ ...r, hook: hookOf(owner) }, { headers: { "cache-control": "no-store" } });
  });
export const DELETE = (req: Request) =>
  run(req, (owner) => {
    removeHook(owner);
    return Response.json({ hook: null });
  });
