import { CURVE_INIT, RH, getClient, parseAddress, readRetention, redact } from "@corbel/data/chain";
import { tokenBirth } from "@corbel/indexer";
import { blocksPerSecond } from "@/lib/blockRate";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/retention?token=0x… → of the wallets that bought the token in its first week, how many still hold it.
 * The week starts at the token's launch or first pool (from the index); the token's Transfer logs of that week give the
 * buyers, its balanceOf gives today's holdings. Cached 15 minutes per token.
 */
const TTL = 15 * 60_000;
const G = globalThis as unknown as { __corbelRetention?: Map<string, { at: number; body: unknown }> };
const cache = (G.__corbelRetention ??= new Map());

export async function GET(req: Request) {
  const token = parseAddress((new URL(req.url).searchParams.get("token") ?? "").trim());
  if (!token) return Response.json({ error: "Paste a token address." }, { status: 400 });
  const key = token.toLowerCase();
  const hit = cache.get(key);
  // points only for an answer, never for an error
  if (hit && Date.now() - hit.at < TTL) return (award(req, "retention"), Response.json(hit.body));
  const birth = tokenBirth(key);
  // a token born before the index window: no first week to read
  if (!birth) return Response.json({ retention: null, why: "This token's first week is older than the indexed history." });
  const g = await guardWait(req, "wallet", 60_000);
  if ("blocked" in g) return g.blocked;
  try {
    const client = getClient(process.env.RPC_URL);
    if (!client) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const sources = [RH.V4_POOL_MANAGER, ...birth.pairs];
    if (birth.launchTx) {
      const r = await client.getTransactionReceipt({ hash: birth.launchTx as `0x${string}` }).catch(() => null);
      const curve = r?.logs.find((l) => l.topics[0]?.startsWith(CURVE_INIT))?.address;
      if (curve) sources.push(curve);
    }
    const bps = await blocksPerSecond();
    const week = BigInt(Math.round(bps * 7 * 86_400));
    const retention = await readRetention(client, token, BigInt(birth.block), week, sources);
    const days = retention ? Math.min(7, (Number(retention.to) - Number(retention.from)) / bps / 86_400) : 0;
    const body = { retention, days, at: Date.now() };
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), body });
    award(req, "retention");
    return Response.json(body);
  } catch (e) {
    console.error("[api/retention]", redact(e));
    return Response.json({ error: "The chain did not answer." }, { status: 502 });
  } finally {
    g.release();
  }
}
