import { erc20Abi } from "viem";
import { getClient } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { PREDICT, SAFE, USDG } from "@/lib/predict";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/transparency → what Corbel's live contracts hold right now, read from the chain: the Predict contract's
 * USDG, its market count and code size; the project Safe's owners, threshold and balances. Cached 60 seconds.
 */
const SAFE_ABI = [
  { type: "function", name: "getOwners", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "getThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
const PRED_ABI = [{ type: "function", name: "count", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const;
const G = globalThis as unknown as { __corbelTransp?: { at: number; body: unknown } };

export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    if (G.__corbelTransp && Date.now() - G.__corbelTransp.at < 60_000) return Response.json(G.__corbelTransp.body);
    const c = getClient(process.env.RPC_URL);
    if (!c) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const ok = <T,>(p: Promise<T>) => p.catch(() => null);
    const [block, pUsdg, pCode, pCount, owners, threshold, sEth, sUsdg] = await Promise.all([
      ok(c.getBlockNumber()),
      ok(c.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [PREDICT] })),
      ok(c.getCode({ address: PREDICT })),
      ok(c.readContract({ address: PREDICT, abi: PRED_ABI, functionName: "count" })),
      ok(c.readContract({ address: SAFE, abi: SAFE_ABI, functionName: "getOwners" })),
      ok(c.readContract({ address: SAFE, abi: SAFE_ABI, functionName: "getThreshold" })),
      ok(c.getBalance({ address: SAFE })),
      ok(c.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [SAFE] })),
    ]);
    const body = {
      block: block?.toString() ?? null,
      predict: { address: PREDICT, usdg: pUsdg != null ? Number(pUsdg) / 1e6 : null, codeBytes: pCode ? (pCode.length - 2) / 2 : null, markets: pCount != null ? Number(pCount) : null },
      safe: { address: SAFE, owners: owners ?? [], threshold: threshold != null ? Number(threshold) : null, eth: sEth != null ? Number(sEth) / 1e18 : null, usdg: sUsdg != null ? Number(sUsdg) / 1e6 : null },
    };
    G.__corbelTransp = { at: Date.now(), body };
    return Response.json(body);
  } finally {
    g.release();
  }
}
