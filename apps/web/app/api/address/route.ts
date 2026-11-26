import { getClient, parseAddress, readAddress, redact } from "@corbel/data/chain";
import { allTokens, tokenMeta } from "@corbel/indexer";
import { blocksPerSecond } from "@/lib/blockRate";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";
import { transfersOf } from "@/lib/transferIndex";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/address?a=0x… → what an address is and what it did over the last DAYS days: wallet, smart-account wallet or
 * contract, a likely relay, token moves per token (through contracts or wallets), the first token transfer in, and
 * the addresses it exchanged tokens with most. Read from the chain; cached 10 minutes per address. Transfers come from
 * the node's transfer index when the server has one (seconds), else from the logs block range by block range. An
 * answer up to an hour old is served at once, marked stale, while a fresh read runs behind it.
 * A long read answers 202 and goes on in the background.
 */
const DAYS = 2;
const TTL = 10 * 60_000;
const G = globalThis as unknown as { __corbelAddr?: Map<string, { at: number; body: unknown }> };
const cache = (G.__corbelAddr ??= new Map());
const R = globalThis as unknown as { __corbelAddrRun?: Map<string, Promise<unknown>> };
const runs = (R.__corbelAddrRun ??= new Map());
const STALE = 60 * 60_000;

/** One read of an address, shared by every caller asking for it at the same time. */
function readOnce(a: `0x${string}`): Promise<unknown> | null {
  const key = a.toLowerCase();
  const client = getClient(process.env.RPC_URL);
  if (!client) return null;
  let run = runs.get(key);
  if (!run) {
    run = (async () => {
      const bps = await blocksPerSecond();
      const body = { ...(await readAddress(client, a, BigInt(Math.round(bps * DAYS * 86_400)), DAYS, { tokens: allTokens().map((t) => t.address), meta: tokenMeta, transfers: transfersOf })), at: Date.now() };
      if (cache.size > 300) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), body });
      return body as unknown;
    })().finally(() => runs.delete(key));
    run.catch((e: unknown) => console.error("[api/address]", redact(e)));
    runs.set(key, run);
  }
  return run;
}

export async function GET(req: Request) {
  const a = parseAddress((new URL(req.url).searchParams.get("a") ?? "").trim());
  if (!a) return Response.json({ error: "Paste an address (0x…)." }, { status: 400 });
  const key = a.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return (award(req, "address"), Response.json(hit.body));
  // older but still recent: answer now and refresh behind it
  if (hit && Date.now() - hit.at < STALE) {
    void readOnce(a)?.catch(() => undefined);
    return (award(req, "address"), Response.json({ ...(hit.body as object), stale: true }));
  }
  const g = await guardWait(req, "wallet", 60_000);
  if ("blocked" in g) return g.blocked;
  try {
    const run = readOnce(a);
    if (!run) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const body = await Promise.race([run, new Promise<null>((r) => setTimeout(() => r(null), 40_000))]);
    if (body === null) return Response.json({ pending: "Reading two days of transfers and every indexed balance." }, { status: 202, headers: { "cache-control": "no-store" } });
    award(req, "address");
    return Response.json(body);
  } catch {
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  } finally {
    g.release();
  }
}
