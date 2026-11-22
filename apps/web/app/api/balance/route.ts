import { getClient, parseAddress, redact } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

/** GET /api/balance?address=&token= → one token balance at the latest block, in token units. Read-only. */
export async function GET(req: Request) {
  const g = await guardWait(req, "wallet");
  if ("blocked" in g) return g.blocked;
  try {
    const u = new URL(req.url);
    const who = parseAddress(u.searchParams.get("address") ?? ""), token = parseAddress(u.searchParams.get("token") ?? "");
    if (!who || !token) return Response.json({ error: "Pass an address and a token." }, { status: 400 });
    const client = getClient(process.env.RPC_URL);
    if (!client) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const [b, d] = await Promise.all([client.readContract({ address: token, abi: ABI, functionName: "balanceOf", args: [who] }), client.readContract({ address: token, abi: ABI, functionName: "decimals" }).then(Number).catch(() => 18)]);
    return Response.json({ amount: Number(b) / 10 ** d });
  } catch (e) {
    console.error("[api/balance]", redact(e));
    return Response.json({ error: "The chain did not answer." }, { status: 502 });
  } finally {
    g.release();
  }
}
