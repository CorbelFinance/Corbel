import { getClient } from "@corbel/data/chain";
import { session } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/rewards/swap {tx} → swap points, only after the chain shows the swap: sent by the signed-in wallet, to the
 * V2 router Corbel's swap screen uses, successful, and mined within the last hour. A transaction counts once.
 */
const ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";

export async function POST(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet first." }, { status: 401 });
    const b = (await req.json().catch(() => null)) as { tx?: string } | null;
    const tx = String(b?.tx ?? "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return Response.json({ error: "Give the swap's transaction hash." }, { status: 400 });
    const c = getClient(process.env.RPC_URL);
    if (!c) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const r = await c.getTransactionReceipt({ hash: tx as `0x${string}` }).catch(() => null);
    if (!r || r.status !== "success") return Response.json({ error: "That swap is not on chain as a success yet." }, { status: 400 });
    if (r.from.toLowerCase() !== s.address.toLowerCase() || (r.to ?? "").toLowerCase() !== ROUTER) return Response.json({ error: "That transaction is not a swap from this wallet through Corbel." }, { status: 400 });
    const blk = await c.getBlock({ blockNumber: r.blockNumber });
    if (Date.now() / 1000 - Number(blk.timestamp) > 3600) return Response.json({ error: "Only swaps from the last hour count." }, { status: 400 });
    return Response.json({ points: award(req, "swap", tx.toLowerCase()) });
  } finally {
    g.release();
  }
}
