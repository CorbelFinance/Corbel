import { getClient } from "@corbel/data/chain";
import { session } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/rewards/revoke {tx} → points for revoking an approval, only after the chain shows it: sent by the signed-in
 * wallet, a call of approve(spender, 0), successful, mined within the last hour. A transaction counts once.
 */
export async function POST(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet first." }, { status: 401 });
    const b = (await req.json().catch(() => null)) as { tx?: string } | null;
    const tx = String(b?.tx ?? "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return Response.json({ error: "Give the revoke's transaction hash." }, { status: 400 });
    const c = getClient(process.env.RPC_URL);
    if (!c) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const [r, t] = await Promise.all([c.getTransactionReceipt({ hash: tx as `0x${string}` }).catch(() => null), c.getTransaction({ hash: tx as `0x${string}` }).catch(() => null)]);
    if (!r || !t || r.status !== "success") return Response.json({ error: "That revoke is not on chain as a success yet." }, { status: 400 });
    // approve(address,uint256) with the amount word all zeros
    const isRevoke = t.input.slice(0, 10).toLowerCase() === "0x095ea7b3" && /^0+$/.test(t.input.slice(74, 138));
    if (r.from.toLowerCase() !== s.address.toLowerCase() || !isRevoke) return Response.json({ error: "That transaction is not a revoke from this wallet." }, { status: 400 });
    const blk = await c.getBlock({ blockNumber: r.blockNumber });
    if (Date.now() / 1000 - Number(blk.timestamp) > 3600) return Response.json({ error: "Only revokes from the last hour count." }, { status: 400 });
    return Response.json({ points: award(req, "revoke", tx.toLowerCase()) });
  } finally {
    g.release();
  }
}
