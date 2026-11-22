import { getClient, parseAddress, redact, asVisitor } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { PREDICT } from "@/lib/predict";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/predict → every market on the CorbelPredict contract on Robinhood Chain, read at the latest block:
 * kind, state, times, pots and weights, and for survival markets the pool's base reserve now against the line.
 * GET /api/predict?who=0x… → adds that wallet's stake on each side and what it can claim. Read-only, cached 15 s.
 */
const MARKET = {
  type: "tuple",
  components: [
    { name: "kind", type: "uint8" },
    { name: "state", type: "uint8" },
    { name: "outcome", type: "bool" },
    { name: "createdAt", type: "uint64" },
    { name: "closeAt", type: "uint64" },
    { name: "expiry", type: "uint64" },
    { name: "proposedAt", type: "uint64" },
    { name: "pair", type: "address" },
    { name: "base", type: "address" },
    { name: "minReserve", type: "uint256" },
    { name: "lowest", type: "uint256" },
    { name: "pokes", type: "uint32" },
    { name: "lastPoke", type: "uint64" },
    { name: "question", type: "bytes32" },
    { name: "strike", type: "uint256" },
    { name: "challenger", type: "address" },
    { name: "yesPot", type: "uint256" },
    { name: "noPot", type: "uint256" },
    { name: "yesWeight", type: "uint256" },
    { name: "noWeight", type: "uint256" },
  ],
} as const;
const ABI = [
  { type: "function", name: "count", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "markets", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [MARKET] },
  { type: "function", name: "stake", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "claimable", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
const PAIR = [
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const ERC20 = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

const cache = new Map<string, { at: number; body: unknown }>();
const meta = new Map<string, { symbol: string; decimals: number }>();
const TTL = 15_000;
const s = (v: bigint) => v.toString();

async function tokenMeta(client: NonNullable<ReturnType<typeof getClient>>, a: `0x${string}`) {
  const k = a.toLowerCase();
  const hit = meta.get(k);
  if (hit) return hit;
  const [symbol, decimals] = await Promise.all([client.readContract({ address: a, abi: ERC20, functionName: "symbol" }).catch(() => "?"), client.readContract({ address: a, abi: ERC20, functionName: "decimals" }).catch(() => 18)]);
  const m = { symbol: String(symbol).slice(0, 16), decimals: Number(decimals) };
  meta.set(k, m);
  return m;
}

async function read(who: `0x${string}` | null) {
  const client = getClient(process.env.RPC_URL);
  if (!client) return { status: 503, body: { error: "Chain reads are paused. Try again later." } };
  const n = Number(await client.readContract({ address: PREDICT, abi: ABI, functionName: "count" }));
  const block = await client.getBlock();
  const ids = Array.from({ length: Math.min(n, 200) }, (_, i) => n - 1 - i);
  const markets = await Promise.all(
    ids.map(async (id) => {
      const m = await client.readContract({ address: PREDICT, abi: ABI, functionName: "markets", args: [BigInt(id)] });
      let pool: { token: string; symbol: string; base: string; baseSymbol: string; baseDecimals: number; reserve: string } | null = null;
      if (m.kind === 0) {
        const [r, t0, t1] = await Promise.all([client.readContract({ address: m.pair, abi: PAIR, functionName: "getReserves" }), client.readContract({ address: m.pair, abi: PAIR, functionName: "token0" }), client.readContract({ address: m.pair, abi: PAIR, functionName: "token1" })]);
        const baseIs0 = t0.toLowerCase() === m.base.toLowerCase();
        const other = baseIs0 ? t1 : t0;
        const [om, bm] = await Promise.all([tokenMeta(client, other), tokenMeta(client, m.base)]);
        pool = { token: other, symbol: om.symbol, base: m.base, baseSymbol: bm.symbol, baseDecimals: bm.decimals, reserve: s(baseIs0 ? r[0] : r[1]) };
      }
      let mine: { yes: string; no: string; claimable: string } | null = null;
      if (who) {
        const [no, yes, cl] = await Promise.all([
          client.readContract({ address: PREDICT, abi: ABI, functionName: "stake", args: [BigInt(id), who, 0n] }),
          client.readContract({ address: PREDICT, abi: ABI, functionName: "stake", args: [BigInt(id), who, 1n] }),
          client.readContract({ address: PREDICT, abi: ABI, functionName: "claimable", args: [BigInt(id), who] }),
        ]);
        mine = { yes: s(yes), no: s(no), claimable: s(cl) };
      }
      return {
        id,
        kind: m.kind === 0 ? "survival" : "price",
        state: (["open", "proposed", "settled", "void"] as const)[m.state] ?? "open",
        outcome: m.outcome,
        createdAt: Number(m.createdAt),
        closeAt: Number(m.closeAt),
        expiry: Number(m.expiry),
        pair: m.pair,
        minReserve: s(m.minReserve),
        lowest: m.lowest === 2n ** 256n - 1n ? null : s(m.lowest),
        pokes: Number(m.pokes),
        lastPoke: Number(m.lastPoke),
        yesPot: s(m.yesPot),
        noPot: s(m.noPot),
        yesWeight: s(m.yesWeight),
        noWeight: s(m.noWeight),
        pool,
        mine,
      };
    }),
  );
  return { status: 200, body: { contract: PREDICT, block: s(block.number), now: Number(block.timestamp), count: n, markets } };
}

export async function GET(req: Request) {
  const g = await guardWait(req, "token");
  if ("blocked" in g) return g.blocked;
  try {
    const raw = new URL(req.url).searchParams.get("who");
    const who = raw ? parseAddress(raw.trim()) : null;
    if (raw && !who) return Response.json({ error: "Paste a 0x address." }, { status: 400 });
    const key = who?.toLowerCase() ?? "-";
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);
    const r = await asVisitor(() => read(who));
    if (r.status === 200) {
      if (cache.size > 300) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), body: r.body });
    }
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    console.error("[api/predict]", redact(e));
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  } finally {
    g.release();
  }
}
