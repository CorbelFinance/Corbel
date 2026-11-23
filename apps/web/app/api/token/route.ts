import { asBackground, buildReport, getClient, parseAddress, redact } from "@corbel/data/chain";
import { countCheck, saveVerdict } from "@/lib/stats";
import { creatorRecord, launchCreator, launchTx, launcherHistory, poolLauncher, sameTicker, searchTicker, v4PoolsFor } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";
import { holdersBrief, holdersOf } from "@/lib/holdersOf";
import { byToken, dsTokens } from "@/lib/pairs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trust checks for one token: GET /api/token?q=<address | ticker>.
 * Address → full report (contract reads + buy/sell simulation via eth_call). Ticker → candidates from
 * the local index. Read-only. Cached per address for 60 s.
 */
const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 60_000;
/** An older report is still served at once (and read again behind it) for this long: nobody waits on a known token. */
const STALE = 30 * 60_000;
const MAX = 500;
const inflight = new Map<string, Promise<unknown>>();

async function handle(req: Request) {
  const raw = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 200);
  // a sentence ("is NVDA safe to buy"): take the address in it, or the word that looks like a ticker
  const STOP = new Set(["is", "it", "safe", "to", "buy", "check", "the", "a", "token", "coin", "scam", "rug", "can", "i", "sell", "should", "this", "what", "about", "0x…", "0x..."]);
  const q = raw.match(/0x[0-9a-fA-F]{40}/)?.[0] ?? (raw.includes(" ") ? (raw.split(/\s+/).map((w) => w.replace(/[?!.,]/g, "")).find((w) => w && !STOP.has(w.toLowerCase()) && /^\$?[A-Za-z0-9._-]{2,20}$/.test(w)) ?? "") : raw);
  if (!q || q.length > 64) return Response.json({ error: "Type a ticker such as NVDA, or paste a contract address." }, { status: 400 });

  const address = parseAddress(q);
  if (!address) {
    if (!/^\$?[A-Za-z0-9._-]{1,20}$/.test(q)) return Response.json({ error: "That is neither an address nor a ticker." }, { status: 400 });
    const hits = searchTicker(q);
    if (hits === null) return Response.json({ error: "Ticker search needs the index, which is not running here yet. Paste the contract address." }, { status: 503 });
    return Response.json({ candidates: hits });
  }

  const key = address.toLowerCase();
  // which tokens get checked: contract and symbol only, never who asked
  countCheck(address, (cache.get(key)?.body as { meta?: { symbol?: string | null } } | undefined)?.meta?.symbol);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Response.json(await withHolders(address, hit.body));
  const client0 = getClient(process.env.RPC_URL);
  if (hit && client0 && Date.now() - hit.at < STALE) {
    if (!inflight.has(key)) {
      const p = asBackground(() => buildReport(client0, address, q, { v4PoolsFor, launcherHistory, sameTicker, poolLauncher, launchCreator, creatorRecord, launchTx }));
      inflight.set(key, p);
      p.then((body) => {
        if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
        cache.set(key, { at: Date.now(), body });
      })
        .catch((e) => console.error("[api/token]", redact(e)))
        .finally(() => inflight.delete(key));
    }
    return Response.json(await withHolders(address, hit.body));
  }

  const client = getClient(process.env.RPC_URL);
  if (!client)
    return Response.json({ error: "Chain reads are paused. Try again later." }, { status: 503 });

  try {
    let p = inflight.get(key);
    if (!p) {
      p = buildReport(client, address, q, { v4PoolsFor, launcherHistory, sameTicker, poolLauncher, launchCreator, creatorRecord, launchTx });
      inflight.set(key, p);
    }
    const body = await p;
    inflight.delete(key);
    if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), body });
    // the day's first result per token, for the accuracy study (token-level, nothing about who asked)
    const b = body as { checks?: { id: string; result: string }[]; meta?: { block?: string } };
    if (b.checks) saveVerdict(address, b.meta?.block, b.checks);
    return Response.json(await withHolders(address, body));
  } catch (e) {
    inflight.delete(key);
    console.error("[api/token]", redact(e));
    const msg = (e as Error).message === "not-robinhood-chain" ? "RPC is not on Robinhood Chain. Refusing to read." : "The chain did not answer. Try again in a minute.";
    return Response.json({ error: msg }, { status: 502 });
  }
}

/**
 * Who holds it, for the score's Holders part: waits up to six seconds for a full holders read; when it is slower
 * the report goes out without it (the score re-weights) and the read finishes into the cache for the next ask.
 */
async function withHolders(address: `0x${string}`, body: unknown) {
  const b = body as { holders?: unknown; market?: unknown };
  if (!b.market) {
    const m = await Promise.race([dsTokens([address]).then((p) => byToken(p).get(address.toLowerCase()) ?? null).catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), 4000))]);
    if (m) b.market = { liquidity: m.liquidity };
  }
  if (b.holders) return body;
  const read = holdersOf(address).then(holdersBrief).catch(() => null);
  const h = await Promise.race([read, new Promise<undefined>((ok) => setTimeout(ok, 6000))]);
  if (h) b.holders = h;
  return body;
}

/** Our own token is the one people check most: its report is kept warm (read in the background every 4 minutes). */
const WARM = globalThis as unknown as { __corbelOwnWarm?: ReturnType<typeof setInterval> };
function warmOwn() {
  const own = parseAddress(process.env.CORBEL_TOKEN ?? "");
  if (WARM.__corbelOwnWarm || !own) return;
  const run = () => {
    const client = getClient(process.env.RPC_URL);
    const key = own.toLowerCase();
    if (!client || inflight.has(key)) return;
    const p = asBackground(() => buildReport(client, own, own, { v4PoolsFor, launcherHistory, sameTicker, poolLauncher, launchCreator, creatorRecord, launchTx }));
    inflight.set(key, p);
    p.then((body) => void cache.set(key, { at: Date.now(), body }))
      .catch((e) => console.error("[api/token] warm", redact(e)))
      .finally(() => inflight.delete(key));
  };
  WARM.__corbelOwnWarm = setInterval(run, 4 * 60_000);
  WARM.__corbelOwnWarm.unref?.();
  run();
}

/** Rate limit and concurrency cap first (lib/guard.ts), then the handler. */
export async function GET(req: Request) {
  warmOwn();
  const g = await guardWait(req, "token", 40_000);
  if ("blocked" in g) return g.blocked;
  try {
    const res = await handle(req);
    if (res.ok) award(req, "check");
    return res;
  } finally {
    g.release();
  }
}
