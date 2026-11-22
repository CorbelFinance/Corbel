import { NATIVE, RH, assetMeta, getClient, parseAddress, quote, redact, toRaw } from "@corbel/data/chain";
import { ensureV4, v4PoolsBetween } from "@/lib/v4extra";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/quote?from=ETH|WETH|USDG|0x…&to=…&amount=1.5
 * Every candidate route (direct and through ETH or USDG) is executed in an eth_call simulation at the
 * latest block. Read-only. Cached 10 s per (from, to, amount).
 */
type Address = `0x${string}`;
const NAMED: Record<string, Address> = { ETH: NATIVE, WETH: RH.WETH as Address, USDG: RH.USDG as Address };
const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 10_000;

const asset = (v: string | null): Address | null => {
  if (!v) return null;
  const up = v.trim().toUpperCase();
  const n = Object.hasOwn(NAMED, up) ? NAMED[up] : undefined;
  return n ?? parseAddress(v.trim());
};

async function handle(req: Request) {
  const u = new URL(req.url).searchParams;
  const from = asset(u.get("from"));
  const to = asset(u.get("to"));
  const amount = (u.get("amount") ?? "").trim();
  if (!from || !to) return Response.json({ error: "Pick both sides: ETH, WETH, USDG or a token address." }, { status: 400 });
  if (from.toLowerCase() === to.toLowerCase()) return Response.json({ error: "Both sides are the same asset." }, { status: 400 });
  if (amount.length > 61 || !/^\d{1,30}(\.\d{1,30})?$/.test(amount) || Number(amount) <= 0) return Response.json({ error: "Type an amount above zero." }, { status: 400 });

  const key = `${from}:${to}:${amount}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);

  const client = getClient(process.env.RPC_URL);
  if (!client) return Response.json({ error: "Chain reads are paused. Try again later." }, { status: 503 });
  try {
    // a token whose v4 pool predates the index: find that pool first (once, then kept)
    await Promise.race([Promise.all([from, to].filter((x) => !Object.values(NAMED).includes(x)).map((x) => ensureV4(client, x))), new Promise((r) => setTimeout(r, 15_000))]);
    const meta = await assetMeta(client, from);
    const raw = toRaw(amount, meta.decimals);
    const body = await quote(client, from, to, raw, { v4PoolsBetween });
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), body });
    return Response.json(body);
  } catch (e) {
    console.error("[api/quote]", redact(e));
    return Response.json({ error: "Could not read one of the tokens, or the chain did not answer." }, { status: 502 });
  }
}

/** Rate limit and concurrency cap first (lib/guard.ts), then the handler. */
export async function GET(req: Request) {
  const g = await guardWait(req, "quote", 40_000);
  if ("blocked" in g) return g.blocked;
  try {
    return await handle(req);
  } finally {
    g.release();
  }
}
