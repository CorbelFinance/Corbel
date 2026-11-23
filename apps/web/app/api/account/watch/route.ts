import { sameOrigin, session } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { addWatch, listWatch, removeWatch } from "@/lib/watchlist";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The signed-in address's watchlist. GET lists, POST {kind, value, label} adds, DELETE ?value= removes. */
async function run(req: Request, fn: (owner: string) => Promise<Response> | Response) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet first." }, { status: 401 });
    if (req.method !== "GET" && !sameOrigin(req)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
    return await fn(s.address);
  } finally {
    g.release();
  }
}

export const GET = (req: Request) => run(req, (owner) => Response.json({ items: listWatch(owner) ?? [] }, { headers: { "cache-control": "no-store" } }));

export const POST = (req: Request) =>
  run(req, async (owner) => {
    const b = (await req.json().catch(() => null)) as { kind?: string; value?: string; label?: string } | null;
    const err = addWatch(owner, String(b?.kind ?? ""), String(b?.value ?? "").trim(), String(b?.label ?? ""));
    if (err) return Response.json({ error: err }, { status: 400 });
    award(req, "watch", `${owner}:${String(b?.value ?? "").trim().toLowerCase()}`);
    return Response.json({ items: listWatch(owner) ?? [] });
  });

export const DELETE = (req: Request) =>
  run(req, (owner) => {
    removeWatch(owner, new URL(req.url).searchParams.get("value") ?? "");
    return Response.json({ items: listWatch(owner) ?? [] });
  });
