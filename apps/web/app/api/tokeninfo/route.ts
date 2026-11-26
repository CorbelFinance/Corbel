import { TOKEN } from "@corbel/config";
import { getClient, redact } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/tokeninfo → $CORBEL read from its contract at the latest block: total supply, coins in the team's
 * locker, coins burned (destroyed by the token's own burn, so missing from the supply, plus what sits at the dead and
 * zero addresses). Every figure comes with the block it was read at. Cached for a minute, shared by everyone.
 */
const ABI = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
const DEAD = "0x000000000000000000000000000000000000dEaD" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const TTL = 60_000;
const G = globalThis as unknown as { __corbelTokenInfo?: { at: number; body: unknown } };

export async function GET(req: Request) {
  if (G.__corbelTokenInfo && Date.now() - G.__corbelTokenInfo.at < TTL) return Response.json(G.__corbelTokenInfo.body);
  const g = await guardWait(req, "wallet");
  if ("blocked" in g) return g.blocked;
  try {
    const client = getClient(process.env.RPC_URL);
    if (!client) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const token = TOKEN.contract as `0x${string}`;
    const block = await client.getBlockNumber();
    const read = (fn: "totalSupply" | "balanceOf", who?: `0x${string}`) =>
      client.readContract({ address: token, abi: ABI, functionName: fn, args: who ? [who] : [], blockNumber: block } as never) as Promise<bigint>;
    const [supply, locked, dead, zero] = await Promise.all([read("totalSupply"), read("balanceOf", TOKEN.locker as `0x${string}`), read("balanceOf", DEAD), read("balanceOf", ZERO)]);
    const units = (v: bigint) => Number(v / 10n ** 12n) / 1e6; // 18 decimals, kept exact to six places
    const body = { block: block.toString(), at: Date.now(), supply: units(supply), locked: units(locked), burned: units(10n ** 27n - supply + dead + zero), locker: TOKEN.locker, contract: TOKEN.contract };
    G.__corbelTokenInfo = { at: Date.now(), body };
    return Response.json(body);
  } catch (e) {
    console.error("[api/tokeninfo]", redact(e));
    return Response.json({ error: "The chain did not answer." }, { status: 502 });
  } finally {
    g.release();
  }
}
