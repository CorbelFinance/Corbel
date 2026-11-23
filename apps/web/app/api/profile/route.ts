import { sameOrigin, session } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { nickOf, setNick } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET → the signed-in wallet's nickname. POST {nick} → sets it (empty clears it); once a day, unique, no team-like names. */
export async function GET(req: Request) {
  const s = session(req);
  return Response.json({ nick: s ? nickOf(s.address) : null, signedIn: !!s }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    if (!sameOrigin(req)) return Response.json({ error: "Refused." }, { status: 403 });
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet first." }, { status: 401 });
    const b = (await req.json().catch(() => null)) as { nick?: string } | null;
    const err = setNick(s.address, String(b?.nick ?? ""));
    return err ? Response.json({ error: err }, { status: 400 }) : Response.json({ nick: nickOf(s.address) });
  } finally {
    g.release();
  }
}
