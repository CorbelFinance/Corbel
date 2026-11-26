import { keepCandles } from "@/lib/candleStore";
import { wantHistory } from "@/lib/candleBackfill";
import { getClient, parseAddress, readMarket, redact, asBackground, asVisitor, gateState } from "@corbel/data/chain";
import { launchCreator, launcherHistory, poolLauncher } from "@corbel/indexer";
import { ensureV4, v4PoolsFor } from "@/lib/v4extra";
import { guardWait } from "@/lib/guard";
import { byToken, dsLinks, dsTokens } from "@/lib/pairs";
import { keepSnap, loadSnap } from "@/lib/snapshot";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/market?token=<address> → the token's pool, its swaps over the last day, the pool's price ladder
 * (V2) and a dollar rate. Read-only. One shared read per token, cached for 45 s.
 */
const TTL = 45_000;
/** A stale answer is still served (and refreshed behind it) for this long. */
const STALE = 60 * 60_000;
const MAX = 300;
/** Shared with /api/whales, which reads the swaps already held here instead of asking the chain again. */
const G = globalThis as unknown as { __corbelMarketCache?: Map<string, { at: number; body: unknown }> };
// the last answers are kept on disk too, so a restart serves them at once instead of reading every token cold
type MarketSnap = { at: number; rows: [string, { at: number; body: unknown }][] };
const cache = (G.__corbelMarketCache ??= new Map<string, { at: number; body: unknown }>((loadSnap<MarketSnap>("market")?.rows ?? []).filter(([, v]) => Date.now() - v.at < STALE)));
let savedAt = 0;
function saveCache() {
  if (Date.now() - savedAt < 60_000) return;
  savedAt = Date.now();
  const rows = [...cache.entries()].filter(([, v]) => Date.now() - v.at < STALE && !(v.body as { none?: boolean }).none);
  keepSnap<MarketSnap>("market", { at: Date.now(), rows });
}
const inflight = new Map<string, Promise<unknown>>();

function compute(address: `0x${string}`, w: number): Promise<unknown> {
  const key = `${address.toLowerCase()}:${w}`;
  let p = inflight.get(key);
  if (p) return p;
  const client = getClient(process.env.RPC_URL);
  if (!client) return Promise.reject(new Error("paused"));
  // v4 pools made before the index window are looked up first (once, then kept)
  const look = ensureV4(client, address);
  // where the time goes, kept in the answer (no hosts, no keys): the v4 lookup, the chain read, the pairs index
  const t0 = Date.now(), q0 = gateState();
  const t: Record<string, number> = { queued: q0.queued, inflight: q0.inflight, paused: q0.paused };
  p = Promise.race([look, new Promise((r) => setTimeout(r, 15_000))])
    .then(() => ((t.look = Date.now() - t0), readMarket(client, address, v4PoolsFor(address.toLowerCase()), w)))
    // no pool yet but the lookup is still out: wait for it (a minute at most) and read again
    .then(async (m) => (m ? m : Promise.race([look, new Promise((r) => setTimeout(r, 60_000))]).then(() => readMarket(client, address, v4PoolsFor(address.toLowerCase()), w))))
    .then(async (m) => {
      if (!m) return { none: true };
      t.read = Date.now() - t0 - (t.look ?? 0);
      // keep the swaps as candles: the chart scrolls back past this read (lib/candleStore)
      try {
        keepCandles(address, m.trades, m.since);
        // and read the rest of its history back to the pool's first day, in the background
        wantHistory(address, m.head);
      } catch {
        // history is a convenience; the answer goes out without it
      }
      // the token across every venue on the chain (the pairs index), next to the one pool we read swap by swap
      const pairs = await dsTokens([address.toLowerCase()]);
      const d = byToken(pairs).get(address.toLowerCase());
      const venues = [...new Set(pairs.filter((x) => x.baseToken.address.toLowerCase() === address.toLowerCase()).map((x) => x.dexId))];
      const own = pairs.filter((x) => x.baseToken.address.toLowerCase() === address.toLowerCase()).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
      const top = own[0];
      const all = d
        ? { price: d.price, liquidity: d.liquidity, volume: d.volume, change: d.change, buys: d.buys, sells: d.sells, venues, pairs: pairs.length, created: d.created, fdv: top?.fdv ?? null, dex: top?.dexId ?? null, links: dsLinks(own) }
        : null;
      // who made this pool, and what else that wallet launched (from the local index)
      const who = poolLauncher(m.pool.id);
      const hist = who ? (launcherHistory(who) ?? { launches: 0, dead: 0, checked: 0 }) : null;
      // the developer: the wallet that created the token on its launchpad; otherwise the wallet that made the pool,
      // unless that wallet makes pools in bulk (a launchpad's migrator, not a person)
      const creator = launchCreator(address);
      const dev = creator ? { address: creator, from: "launchpad" } : who && hist && hist.launches <= 3 ? { address: who.toLowerCase(), from: "pool" } : null;
      t.ds = Date.now() - t0 - (t.look ?? 0) - t.read;
      return { ...m, all, dev, launcher: who ? { address: who, ...hist! } : null, t };
    })
    .then((body) => {
      if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), body });
      saveCache();
      return body;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * Warm the tokens people open most (the top of trending and the busiest stocks) before anyone clicks, one at a time.
 * The public node allows only a few requests at once and the warm-up shares that budget with every visitor, so it
 * stays small: WARM_TRENDING + WARM_STOCKS tokens, the long tail refreshed every TAIL_MS. Runs once a minute; a cycle
 * still running is not doubled.
 */
const WARM_TRENDING = 20;
const WARM_STOCKS = 12;
const TAIL_MS = 15 * 60_000;
const W = globalThis as unknown as { __corbelMarketWarm?: { timer: ReturnType<typeof setInterval> | null; busy: boolean } };
const warm = (W.__corbelMarketWarm ??= { timer: null, busy: false });
async function warmCycle() {
  if (warm.busy) return;
  warm.busy = true;
  try {
    type Trend = { at: number; rows: { token: string }[]; stocks?: { token: string }[] };
    // the trending list in memory, or its last snapshot on disk right after a restart
    const snap = (globalThis as unknown as { __corbelTrend?: { snap: Trend | null } }).__corbelTrend?.snap ?? loadSnap<Trend>("trending");
    // every token the lists show (trending and all stocks), the first few also over a whole day; one read at a time
    const hot = [WETH, ...(snap?.rows ?? []).slice(0, WARM_TRENDING).map((r) => r.token), ...(snap?.stocks ?? []).slice(0, WARM_STOCKS).map((r) => r.token)];
    const seen = new Set<string>();
    for (const [i, a] of hot.entries()) {
      const addr = parseAddress(a);
      if (!addr || seen.has(addr.toLowerCase())) continue;
      seen.add(addr.toLowerCase());
      for (const w of i < 6 ? [4, 36] : [4]) {
        const c = cache.get(`${addr.toLowerCase()}:${w}`);
        // the first few stay fresh; the long tail is refreshed every five minutes (people get the last answer at once anyway)
        if (c && Date.now() - c.at < (i < 10 ? TTL : TAIL_MS)) continue;
        await compute(addr, w).catch(() => undefined);
      }
    }
  } finally {
    warm.busy = false;
    (globalThis as unknown as { __corbelWhalesCollect?: () => void }).__corbelWhalesCollect?.();
  }
}
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";

async function handle(req: Request) {
  if (!warm.timer) {
    warm.timer = setInterval(() => void asBackground(warmCycle), 60_000);
    warm.timer.unref?.();
    void asBackground(warmCycle);
  }
  const address = parseAddress((new URL(req.url).searchParams.get("token") ?? "").trim());
  if (!address) return Response.json({ error: "Pass a token contract address." }, { status: 400 });
  // w: how many log windows to read (4 = the last few hours, fast; 36 = about a day)
  const w = Math.min(36, Math.max(1, Number(new URL(req.url).searchParams.get("w") ?? 36) || 36));
  const raw = cache.get(`${address.toLowerCase()}:${w}`);
  // "no pool" is kept a minute only: a pool can be found or made at any time
  const hit = raw && (raw.body as { none?: boolean }).none && Date.now() - raw.at > 60_000 ? undefined : raw;
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);
  if (!getClient(process.env.RPC_URL)) return Response.json({ error: "Chain reads are paused. Try again later." }, { status: 503 });
  // stale but recent: answer now, refresh behind it
  if (hit && Date.now() - hit.at < STALE) {
    void asBackground(() => compute(address, w)).catch((e) => console.error("[api/market]", redact(e)));
    return Response.json(hit.body);
  }
  try {
    return Response.json(await asVisitor(() => compute(address, w)));
  } catch (e) {
    console.error("[api/market]", redact(e));
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  }
}

export async function GET(req: Request) {
  // a cached answer, or a read of the same token already running, costs nothing: serve it without a slot, so
  // many people opening one token never fill the route for everyone else
  const address = parseAddress((new URL(req.url).searchParams.get("token") ?? "").trim());
  if (address) {
    const w = Math.min(36, Math.max(1, Number(new URL(req.url).searchParams.get("w") ?? 36) || 36));
    const key = `${address.toLowerCase()}:${w}`;
    const c = cache.get(key);
    // a cached answer is still a use of the tool: it earns the same points
    if (c && !(c.body as { none?: boolean }).none && Date.now() - c.at < TTL) return (award(req, "market"), Response.json(c.body));
    if (c && !(c.body as { none?: boolean }).none && Date.now() - c.at < STALE && getClient(process.env.RPC_URL)) {
      if (!inflight.has(key)) void asBackground(() => compute(address, w)).catch((e) => console.error("[api/market]", redact(e)));
      award(req, "market");
      return Response.json(c.body);
    }
    const running = inflight.get(key);
    if (running) {
      try {
        const body = await running;
        award(req, "market");
        return Response.json(body);
      } catch {
        // fall through to a fresh read
      }
    }
  }
  // a cold read takes up to half a minute through the chain node: wait that long for a slot rather than say busy
  const g = await guardWait(req, "market", 40_000);
  if ("blocked" in g) return g.blocked;
  try {
    const res = await handle(req);
    if (res.ok) award(req, "market");
    return res;
  } finally {
    g.release();
  }
}
