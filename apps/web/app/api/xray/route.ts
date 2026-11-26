import { NATIVE, getClient, isBaseCopy, parseAddress, quote, redact, type Portfolio } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { portfolioOf } from "@/lib/portfolio";
import { ensureV4, v4PoolsBetween } from "@/lib/v4extra";
import { award } from "@/lib/points";
import { HELD } from "@corbel/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/xray?address=0x… → how much of a wallet could actually be sold right now. For each token it holds
 * (largest spot value first, up to MAX), selling the whole balance into ETH is simulated on every route at the
 * latest block; the best route's output is the exit, next to what the same amount is worth at the price of a small sale
 * on that route (a pool's own price can come from a pool nothing can be sold into). Pool math only: a token that taxes or
 * blocks its own transfers can pay less than this, which the token check shows. Nothing is signed. Kept 5 minutes; an
 * answer up to an hour old is served at once, marked stale, while a fresh read runs behind it; a long read answers 202
 * and goes on in the background. Tokens that only wear a base asset's ticker come last.
 */
type Address = `0x${string}`;
const MAX = 12;
const TTL = 300_000;
const G = globalThis as unknown as { __corbelXray?: Map<string, { at: number; body: unknown }> };
const cache = (G.__corbelXray ??= new Map());
const R = globalThis as unknown as { __corbelXrayRun?: Map<string, Promise<Response>> };
const runs = (R.__corbelXrayRun ??= new Map());
const STALE = 60 * 60_000;

/** One read per address at a time, whoever asks. */
function runOnce(a: Address): Promise<Response> {
  const key = a.toLowerCase();
  let run = runs.get(key);
  if (!run) {
    run = handle(a).finally(() => runs.delete(key));
    run.catch((e: unknown) => console.error("[api/xray]", redact(e)));
    runs.set(key, run);
  }
  return run;
}

/** ok: a route pays; none: no pool takes the sell; unread: the simulation itself failed, which proves nothing */
export type XrayRow = { token: string; symbol: string | null; copy: boolean; amount: number; spot: number | null; exit: number | null; impact: number | null; route: string | null; reason: string | null; kind: "ok" | "none" | "unread" };

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

/** Worth at the price of a small sale on the same route: the exit without its own price impact. */
const spotOnRoute = (exit: number | null, impact: number | null, pool: number | null) => (exit !== null && impact !== null && impact < 0.999 ? exit / (1 - impact) : pool);

async function handle(address: Address) {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);
  const client = getClient(process.env.RPC_URL);
  if (!client) return Response.json({ error: "Chain reads are paused. Try again later." }, { status: 503 });
  const p = await portfolioOf(address);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.status });
  const pf = p.body as Portfolio;
  const isCopy = (h: { symbol: string | null; token: string }) => isBaseCopy(h.symbol, h.token);
  // real holdings first, largest spot value first; one with no price yet goes above dust, since it may be worth anything.
  // Bait that copies a base asset must not push them off the list
  const held = pf.holdings.filter((h) => BigInt(h.raw) > 0n).sort((a, b) => Number(isCopy(a)) - Number(isCopy(b)) || (b.ethSpot ?? 1e-4) - (a.ethSpot ?? 1e-4));
  const rows = await each(held.slice(0, MAX), 6, async (h): Promise<XrayRow> => {
    const copy = isCopy(h);
    const amount = Number(BigInt(h.raw) / 10n ** BigInt(Math.max(0, h.decimals - 6))) / 10 ** Math.min(6, h.decimals);
    try {
      await Promise.race([ensureV4(client, h.token as Address), new Promise((r) => setTimeout(r, 10_000))]);
      const q = await quote(client, h.token as Address, NATIVE, BigInt(h.raw), { v4PoolsBetween });
      const best = q.best !== null ? q.routes[q.best] : null;
      const exit = best?.amountOut ? Number(BigInt(best.amountOut) / 10n ** 9n) / 1e9 : null;
      const reason = best ? null : (q.routes.find((r) => r.reason)?.reason ?? "No pool can take this sell.");
      // "could not fund" means the simulation could not give itself the token: that says nothing about the exit
      const kind = best ? "ok" : q.routes.length && q.routes.every((r) => /fund/i.test(r.reason ?? "")) ? "unread" : "none";
      return { token: h.token, symbol: h.symbol, copy, amount, spot: spotOnRoute(exit, q.impact, h.ethSpot), exit, impact: q.impact, route: best ? best.hops.map((x) => x.venue).join(" → ") : null, reason: kind === "unread" ? "Not simulated: this token's balance could not be set up for the test." : reason, kind };
    } catch {
      return { token: h.token, symbol: h.symbol, copy, amount, spot: h.ethSpot, exit: null, impact: null, route: null, reason: "Not simulated: the chain did not answer.", kind: "unread" };
    }
  });
  const eth = Number(BigInt(pf.eth) / 10n ** 9n) / 1e9 + Number(BigInt(pf.weth) / 10n ** 9n) / 1e9;
  // spot and exit over the same rows: a token that was not simulated, has no price or is bait stays out of both
  const read = rows.filter((r) => r.kind !== "unread" && r.spot !== null && !r.copy);
  const spot = read.reduce((a, r) => a + (r.spot ?? 0), 0);
  const exit = read.reduce((a, r) => a + (r.exit ?? 0), 0);
  const body = {
    address,
    block: pf.block,
    eth,
    usdgPerEth: pf.usdgPerEth,
    rows,
    more: Math.max(0, held.length - MAX),
    totals: { spot, exit, stuck: rows.filter((r) => r.kind === "none" && !r.copy).length, unread: rows.filter((r) => r.kind === "unread" && !r.copy).length, unpriced: rows.reduce((s, r) => s + (r.spot === null && !r.copy ? (r.exit ?? 0) : 0), 0), copies: held.filter(isCopy).length },
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
  const old = cache.get(a.toLowerCase());
  if (old && Date.now() - old.at >= TTL && Date.now() - old.at < STALE) {
    void runOnce(a as Address).catch(() => undefined);
    award(req, "xray");
    return Response.json({ ...(old.body as object), stale: true });
  }
  const g = await guardWait(req, "portfolio", 60_000);
  if ("blocked" in g) return g.blocked;
  try {
    const run = runOnce(a as Address);
    const res = await Promise.race([run, new Promise<null>((r) => setTimeout(() => r(null), 40_000))]);
    if (!res) return Response.json({ pending: "Selling each holding in a simulation." }, { status: 202, headers: { "cache-control": "no-store" } });
    if (res.ok) award(req, "xray");
    // one run answers several callers: each gets its own copy of the body
    return res.clone();
  } catch (e) {
    console.error("[api/xray]", redact(e));
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  } finally {
    g.release();
  }
}
