import { redact } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { replay } from "@/lib/replay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/replay?tx=0x… → a reverted transaction run again and read: what stopped it, in which contract and function,
 * and the line of verified source that raised it. A transaction that went through says so. Answers are kept 10 minutes.
 */
const TTL = 10 * 60_000;
const G = globalThis as unknown as { __corbelReplay?: Map<string, { at: number; body: unknown }> };
const cache = (G.__corbelReplay ??= new Map());

export async function GET(req: Request) {
  const tx = (new URL(req.url).searchParams.get("tx") ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(tx)) return Response.json({ error: "Paste a transaction hash: 0x and 64 characters." }, { status: 400 });
  const hit = cache.get(tx);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);
  if (!process.env.RPC_URL) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
  const g = await guardWait(req, "wallet", 30_000);
  if ("blocked" in g) return g.blocked;
  try {
    const body = await replay(tx);
    if (!("error" in body)) {
      if (cache.size > 300) cache.delete(cache.keys().next().value!);
      cache.set(tx, { at: Date.now(), body });
    }
    return Response.json(body, { status: "error" in body ? 404 : 200 });
  } catch (e) {
    console.error("[api/replay]", redact(e));
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  } finally {
    g.release();
  }
}
