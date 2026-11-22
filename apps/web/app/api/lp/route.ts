import { getClient, parseAddress, redact } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { loadSnap } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/lp?address=0x… → the address's LP positions in the pools on Earn: its LP tokens in each V2 pair,
 * the share of the pool they are, what that share holds in dollars, and its cut of the last day's fees.
 * Pools come from the Earn snapshot; two reads per pool at the latest block. Read-only.
 */
const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
type Row = { token: string; symbol: string; base: string; pair: string; liquidity: number; fees: number; hours: number; apr: number | null };
const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 30_000;

async function handle(req: Request) {
  const address = parseAddress((new URL(req.url).searchParams.get("address") ?? "").trim());
  if (!address) return Response.json({ error: "Paste a 0x address." }, { status: 400 });
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);
  const rows = (globalThis as unknown as { __corbelEarn?: { snap: { rows: Row[] } | null } }).__corbelEarn?.snap?.rows ?? loadSnap<{ at: number; rows: Row[] }>("earn")?.rows ?? [];
  if (!rows.length) return Response.json({ warming: true, positions: [] }, { status: 202 });
  const client = getClient(process.env.RPC_URL);
  if (!client) return Response.json({ error: "Chain reads are paused. Try again later." }, { status: 503 });
  try {
    const got = await Promise.all(
      rows.map(async (r) => {
        const pair = r.pair as `0x${string}`;
        const [bal, supply] = await Promise.all([client.readContract({ address: pair, abi: ERC20, functionName: "balanceOf", args: [address] }), client.readContract({ address: pair, abi: ERC20, functionName: "totalSupply" })]);
        if (bal === 0n || supply === 0n) return null;
        const share = Number((bal * 1_000_000_000n) / supply) / 1e9;
        return { token: r.token, symbol: r.symbol, base: r.base, pair: r.pair, share, value: share * r.liquidity, feesDay: share * r.fees * (24 / Math.max(1, r.hours)), apr: r.apr };
      }),
    );
    const positions = got.filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.value - a.value);
    const body = { address, positions, total: positions.reduce((s, p) => s + p.value, 0), feesDay: positions.reduce((s, p) => s + p.feesDay, 0), pools: rows.length };
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), body });
    return Response.json(body);
  } catch (e) {
    console.error("[api/lp]", redact(e));
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const g = await guardWait(req, "wallet");
  if ("blocked" in g) return g.blocked;
  try {
    return await handle(req);
  } finally {
    g.release();
  }
}
