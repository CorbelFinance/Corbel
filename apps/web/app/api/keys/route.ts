import { AI_ACCESS } from "@corbel/config";
import { session, sameOrigin } from "@/lib/auth";
import { API_KEYS, createKey, listKeys, revokeKey } from "@/lib/apikeys";
import { guardWait } from "@/lib/guard";
import { tierOf } from "@/lib/tiers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * API keys of the signed-in wallet. GET lists them (never the key itself) and says whether this wallet may make one:
 * holders at Light level or above. POST makes one and returns it once. DELETE ?id= revokes one. Writes only from this
 * site's own pages.
 */
const noStore = { "cache-control": "no-store" };
const light = AI_ACCESS.tiers[0]!;

export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const s = session(req);
    const t = tierOf(s?.address);
    return Response.json({ signedIn: !!s, holder: !!t, tier: t?.name ?? null, need: light.minCoins, holdDays: AI_ACCESS.holdDays, limits: { ...API_KEYS, boost: API_KEYS.boost * (t?.apiBoost ?? 1) }, keys: s ? listKeys(s.address) : [] }, { headers: noStore });
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
    if (!s) return Response.json({ error: "Sign in with your wallet to make a key." }, { status: 401 });
    if (!tierOf(s.address)) return Response.json({ error: `Keys are for holders: ${light.minCoins.toLocaleString("en-US")} $CORBEL held for ${AI_ACCESS.holdDays} days.` }, { status: 403 });
    const body = (await req.json().catch(() => ({}))) as { label?: unknown };
    const r = createKey(s.address, typeof body.label === "string" ? body.label : "");
    if ("error" in r) return Response.json(r, { status: 400 });
    return Response.json({ key: r.key, keys: listKeys(s.address) }, { headers: noStore });
  } finally {
    g.release();
  }
}

export async function DELETE(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    if (!sameOrigin(req)) return Response.json({ error: "Refused." }, { status: 403 });
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in first." }, { status: 401 });
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!revokeKey(s.address, id)) return Response.json({ error: "No such key." }, { status: 404 });
    return Response.json({ keys: listKeys(s.address) }, { headers: noStore });
  } finally {
    g.release();
  }
}
