import { ethUsd, getClient, parseAddress, readPoolHealth, redact } from "@corbel/data/chain";
import { poolBlock } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/poolhealth?pair=0x… → who holds a V2 pool's liquidity (burned, locked, contracts, wallets), the largest
 * holders and how much of the pool's depth wallets could withdraw right now. Read from the LP token's own transfers
 * since the pool's first block; cached 15 minutes per pool. A long first read answers 202 and goes on in the background.
 */
const TTL = 15 * 60_000;
const G = globalThis as unknown as { __corbelPh?: Map<string, { at: number; body: unknown }>; __corbelPhRun?: Map<string, Promise<unknown>> };
const cache = (G.__corbelPh ??= new Map());
const runs = (G.__corbelPhRun ??= new Map());

export async function GET(req: Request) {
  const pair = parseAddress((new URL(req.url).searchParams.get("pair") ?? "").trim());
  if (!pair) return Response.json({ error: "Paste a pool address." }, { status: 400 });
  const key = pair.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return (award(req, "health"), Response.json(hit.body));
  const g = await guardWait(req, "wallet", 60_000);
  if ("blocked" in g) return g.blocked;
  try {
    const client = getClient(process.env.RPC_URL);
    if (!client) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    let run = runs.get(key);
    if (!run) {
      run = (async () => readPoolHealth(client, pair, BigInt(poolBlock(key) ?? 0), await ethUsd(client).catch(() => 0)))()
        .then((body) => {
          if (!(body as { error?: string }).error) cache.set(key, { at: Date.now(), body });
          return body;
        })
        .finally(() => runs.delete(key));
      run.catch((e: unknown) => console.error("[api/poolhealth]", redact(e)));
      runs.set(key, run);
    }
    const body = await Promise.race([run, new Promise((r) => setTimeout(() => r(null), 45_000))]);
    if (body === null) return Response.json({ pending: "Reading every LP transfer since the pool's first block." }, { status: 202, headers: { "cache-control": "no-store" } });
    if (!(body as { error?: string }).error) award(req, "health");
    return Response.json(body, { status: (body as { error?: string }).error ? 400 : 200 });
  } catch (e) {
    console.error("[api/poolhealth]", redact(e));
    return Response.json({ error: "The chain did not answer." }, { status: 502 });
  } finally {
    g.release();
  }
}
