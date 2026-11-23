import { session, sameOrigin } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { balance, createModelKey, CREDITS, creditsOpen, history, listModelKeys, revokeModelKey, setKeyCap, startCreditsSweep, treasury } from "@/lib/credits";
import { markupOf } from "@/lib/markup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Credits of the signed-in wallet. GET → the balance, top-ups and spending, the model keys and where to send USDG.
 * POST {label, cap} → a new model key, shown once. PATCH {id, cap} → a key's daily cap. DELETE ?id= → revokes a key.
 * Writes only from this site's own pages.
 */
const noStore = { "cache-control": "no-store" };

export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    startCreditsSweep();
    const s = session(req);
    const base = { open: creditsOpen(), treasury: creditsOpen() ? treasury() : null, markup: markupOf(s?.address), minTopUp: CREDITS.minTopUp, maxCap: CREDITS.maxCap, signedIn: !!s };
    if (!s) return Response.json(base, { headers: noStore });
    return Response.json({ ...base, ...balance(s.address), ...history(s.address), keys: listModelKeys(s.address) }, { headers: noStore });
  } finally {
    g.release();
  }
}

async function guarded(req: Request, f: (owner: string, j: Record<string, unknown>) => Response) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    if (!sameOrigin(req)) return Response.json({ error: "Refused." }, { status: 403 });
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet first." }, { status: 401 });
    const j = req.method === "DELETE" ? {} : (((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>);
    return f(s.address, j);
  } finally {
    g.release();
  }
}

export const POST = (req: Request) =>
  guarded(req, (owner, j) => {
    // keys spend Credits: none are made while Credits are closed
    if (!creditsOpen()) return Response.json({ error: "Credits are not open yet." }, { status: 403 });
    const r = createModelKey(owner, typeof j.label === "string" ? j.label : "", Number(j.cap));
    return "error" in r ? Response.json(r, { status: 400 }) : Response.json(r, { headers: noStore });
  });

export const PATCH = (req: Request) =>
  guarded(req, (owner, j) => (setKeyCap(owner, String(j.id ?? ""), Number(j.cap)) ? Response.json({ ok: true }) : Response.json({ error: "No such key." }, { status: 400 })));

export const DELETE = (req: Request) =>
  guarded(req, (owner) => (revokeModelKey(owner, new URL(req.url).searchParams.get("id") ?? "") ? Response.json({ ok: true }) : Response.json({ error: "No such key." }, { status: 400 })));
