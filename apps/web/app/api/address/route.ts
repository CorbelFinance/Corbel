import { getClient, parseAddress, readAddress, redact } from "@corbel/data/chain";
import { blocksPerSecond } from "@/lib/blockRate";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/address?a=0x… → what an address is and what it did over the last DAYS days: wallet, smart-account wallet or
 * contract, a likely relay, token moves per token (through contracts or wallets), the first token transfer in, and
 * the addresses it exchanged tokens with most. Read from the chain; cached 10 minutes per address.
 */
const DAYS = 2;
const TTL = 10 * 60_000;
const G = globalThis as unknown as { __corbelAddr?: Map<string, { at: number; body: unknown }> };
const cache = (G.__corbelAddr ??= new Map());

export async function GET(req: Request) {
  const a = parseAddress((new URL(req.url).searchParams.get("a") ?? "").trim());
  if (!a) return Response.json({ error: "Paste an address (0x…)." }, { status: 400 });
  const key = a.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return (award(req, "address"), Response.json(hit.body));
  const g = await guardWait(req, "wallet", 60_000);
  if ("blocked" in g) return g.blocked;
  try {
    const client = getClient(process.env.RPC_URL);
    if (!client) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const bps = await blocksPerSecond();
    const body = { ...(await readAddress(client, a, BigInt(Math.round(bps * DAYS * 86_400)), DAYS)), at: Date.now() };
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), body });
    award(req, "address");
    return Response.json(body);
  } catch (e) {
    console.error("[api/address]", redact(e));
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  } finally {
    g.release();
  }
}
