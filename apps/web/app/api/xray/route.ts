import { NATIVE, RH, getClient, parseAddress, quote, redact, type Portfolio } from "@corbel/data/chain";
import { v4PoolsBetween } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";
import { portfolioOf } from "@/lib/portfolio";
import { ensureV4 } from "@/lib/v4extra";
import { award } from "@/lib/points";
import { HELD } from "@corbel/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/xray?address=0x… → how much of a wallet could actually be sold right now. For each token it holds
 * (largest spot value first, up to MAX), selling the whole balance into ETH is simulated on every route at the
 * latest block; the best route's output is the exit, next to the spot value. Pool math only: a token that taxes or
 * blocks its own transfers can pay less than this, which the token check shows. Read-only. Cached 2 minutes.
 */
type Address = `0x${string}`;
const MAX = 12;
const TTL = 120_000;
const G = globalThis as unknown as { __corbelXray?: Map<string, { at: number; body: unknown }> };
const cache = (G.__corbelXray ??= new Map());

/** ok: a route pays; none: no pool takes the sell; unread: the simulation itself failed, which proves nothing */
export type XrayRow = { token: string; symbol: string | null; copy: boolean; amount: number; spot: number | null; exit: number | null; impact: number | null; route: string | null; reason: string | null; kind: "ok" | "none" | "unread" };
/** the chain's base assets: a token that takes one of these names at another address is a copy */
const BASE: Record<string, string> = { USDG: RH.USDG.toLowerCase(), WETH: RH.WETH.toLowerCase(), ETH: "" };

async function each<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]!);
    }
  }));
  return out;
}

async function handle(address: Address) {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);
  const client = getClient(process.env.RPC_URL);
  if (!client) return Response.json({ error: "Chain reads are paused. Try again later." }, { status: 503 });
  const p = await portfolioOf(address);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.status });
  const pf = p.body as Portfolio;
  const held = pf.holdings.filter((h) => BigInt(h.raw) > 0n).sort((a, b) => (b.ethSpot ?? -1) - (a.ethSpot ?? -1));
  const rows = await each(held.slice(0, MAX), 4, async (h): Promise<XrayRow> => {
    const sym = (h.symbol ?? "").toUpperCase();
    const copy = Object.hasOwn(BASE, sym) && BASE[sym] !== h.token.toLowerCase();
    const amount = Number(BigInt(h.raw) / 10n ** BigInt(Math.max(0, h.decimals - 6))) / 10 ** Math.min(6, h.decimals);
    try {
      await Promise.race([ensureV4(client, h.token as Address), new Promise((r) => setTimeout(r, 10_000))]);
      const q = await quote(client, h.token as Address, NATIVE, BigInt(h.raw), { v4PoolsBetween });
      const best = q.best !== null ? q.routes[q.best] : null;
      const exit = best?.amountOut ? Number(BigInt(best.amountOut) / 10n ** 9n) / 1e9 : null;
      const reason = best ? null : (q.routes.find((r) => r.reason)?.reason ?? "No pool can take this sell.");
      // "could not fund" means the simulation could not give itself the token: that says nothing about the exit
      const kind = best ? "ok" : q.routes.length && q.routes.every((r) => /fund/i.test(r.reason ?? "")) ? "unread" : "none";
      return { token: h.token, symbol: h.symbol, copy, amount, spot: h.ethSpot, exit, impact: q.impact, route: best ? best.hops.map((x) => x.venue).join(" → ") : null, reason: kind === "unread" ? "Not simulated: this token's balance could not be set up for the test." : reason, kind };
    } catch {
      return { token: h.token, symbol: h.symbol, copy, amount, spot: h.ethSpot, exit: null, impact: null, route: null, reason: "Not simulated: the chain did not answer.", kind: "unread" };
    }
  });
  const eth = Number(BigInt(pf.eth) / 10n ** 9n) / 1e9 + Number(BigInt(pf.weth) / 10n ** 9n) / 1e9;
  // spot and exit over the same rows: a token that was not simulated stays out of both
  const read = rows.filter((r) => r.kind !== "unread");
  const spot = read.reduce((a, r) => a + (r.spot ?? 0), 0);
  const exit = read.reduce((a, r) => a + (r.exit ?? 0), 0);
  const body = {
    address,
    block: pf.block,
    eth,
    usdgPerEth: pf.usdgPerEth,
    rows,
    more: Math.max(0, held.length - MAX),
    totals: { spot, exit, stuck: rows.filter((r) => r.kind === "none").length, unread: rows.filter((r) => r.kind === "unread").length },
    at: Date.now(),
  };
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), body });
  return Response.json(body);
}

export async function GET(req: Request) {
  if (HELD.xray) return new Response("Not found.", { status: 404 });
  const a = parseAddress((new URL(req.url).searchParams.get("address") ?? "").trim());
  if (!a) return Response.json({ error: "Paste a 0x address." }, { status: 400 });
  const g = await guardWait(req, "portfolio", 60_000);
  if ("blocked" in g) return g.blocked;
  try {
    const res = await handle(a as Address);
    if (res.ok) award(req, "xray");
    return res;
  } catch (e) {
    console.error("[api/xray]", redact(e));
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  } finally {
    g.release();
  }
}
