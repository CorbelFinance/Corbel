import { getClient, parseAddress, readWallet, redact } from "@corbel/data/chain";
import { launcherHistory } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/wallet?address=0x… → ETH, WETH and USDG balances at the latest block, plus launch history from the index. Read-only. */
const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 15_000;

async function handle(req: Request) {
  const address = parseAddress((new URL(req.url).searchParams.get("address") ?? "").trim());
  if (!address) return Response.json({ error: "Paste a 0x address." }, { status: 400 });
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);
  const client = getClient(process.env.RPC_URL);
  if (!client) return Response.json({ error: "Chain reads are paused. Try again later." }, { status: 503 });
  try {
    const w = await readWallet(client, address);
    if (!w) return Response.json({ error: "RPC is not on Robinhood Chain. Refusing to read." }, { status: 502 });
    const body = { ...w, launches: launcherHistory(address) };
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), body });
    return Response.json(body);
  } catch (e) {
    console.error("[api/wallet]", redact(e));
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  }
}

/** Rate limit and concurrency cap first (lib/guard.ts), then the handler. */
export async function GET(req: Request) {
  const g = await guardWait(req, "wallet");
  if ("blocked" in g) return g.blocked;
  try {
    return await handle(req);
  } finally {
    g.release();
  }
}
