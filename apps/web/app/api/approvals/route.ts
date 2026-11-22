import { asVisitor, getClient, parseAddress, readApprovals, redact } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/approvals?address=<0x…> → the wallet's live token approvals with a risk for each. Read-only: revoking is
 * a transaction the visitor signs in their own wallet. One shared read per address, kept 5 minutes.
 */
const TTL = 5 * 60_000;
const MAX = 400;
const cache = new Map<string, { at: number; body: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export async function GET(req: Request) {
  const u = new URL(req.url);
  const address = parseAddress((u.searchParams.get("address") ?? "").trim());
  if (!address) return Response.json({ error: "Paste a wallet address (0x…)." }, { status: 400 });
  const key = address.toLowerCase();
  const fresh = u.searchParams.get("fresh") === "1";
  const hit = cache.get(key);
  if (hit && !fresh && Date.now() - hit.at < TTL) return Response.json(hit.body);
  const running = inflight.get(key);
  if (running) return Response.json(await running.catch(() => ({ error: "The chain did not answer. Try again in a minute." })));
  const g = await guardWait(req, "portfolio", 20_000);
  if ("blocked" in g) return g.blocked;
  try {
    const client = getClient(process.env.RPC_URL);
    if (!client) return Response.json({ error: "Chain reads are paused. Try again later." }, { status: 503 });
    const p = asVisitor(() => readApprovals(client, address)).then((body) => {
      if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), body });
      return body;
    });
    inflight.set(key, p);
    return Response.json(await p);
  } catch (e) {
    console.error("[api/approvals]", redact(e));
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  } finally {
    inflight.delete(key);
    g.release();
  }
}
