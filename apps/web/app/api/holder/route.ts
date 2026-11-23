import { AI_ACCESS, TOKEN, aiTier } from "@corbel/config";
import { getClient, parseAddress, redact } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { heldCoins, lockedCoins } from "@/lib/tiers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/holder?address=<address> → the holder card: today's $CORBEL balance (from the contract), the held
 * balance that sets the tier (the lowest of the last AI_ACCESS.holdDays days, from the token's indexed transfers),
 * the tier it gives and how far the next one is. The tier here comes from coins only, never from hand-kept lists,
 * so the card shows nothing a wallet's balance does not already show.
 */
const ABI = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;

export async function GET(req: Request) {
  const g = await guardWait(req, "wallet");
  if ("blocked" in g) return g.blocked;
  try {
    const a = parseAddress(new URL(req.url).searchParams.get("address") ?? "");
    if (!a) return Response.json({ error: "Paste a 0x address." }, { status: 400 });
    const client = getClient(process.env.RPC_URL);
    if (!client) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const block = await client.getBlockNumber();
    const raw = (await client.readContract({ address: TOKEN.contract as `0x${string}`, abi: ABI, functionName: "balanceOf", args: [a], blockNumber: block } as never)) as bigint;
    const balance = Number(raw / 10n ** 12n) / 1e6;
    // the held balance needs the token's transfer history, kept on the server that runs the chat
    const held = process.env.CORBEL_TOKEN ? Math.min(balance, heldCoins(a)) : null;
    // coins locked on HoodLock cannot move: they count in full, next to the free balance's lowest point
    const locked = process.env.CORBEL_TOKEN ? lockedCoins(a) : 0;
    const counted = (held ?? balance) + locked;
    const tier = aiTier(counted);
    const tiers = AI_ACCESS.tiers;
    const next = tiers.find((t) => t.minCoins > counted) ?? null;
    return Response.json({
      block: block.toString(),
      balance,
      held,
      locked,
      holdDays: AI_ACCESS.holdDays,
      tier: tier ? { id: tier.id, name: tier.name, minCoins: tier.minCoins } : null,
      next: next ? { id: next.id, name: next.name, minCoins: next.minCoins, missing: Math.max(0, next.minCoins - counted) } : null,
      tiers: tiers.map((t) => ({ id: t.id, name: t.name, minCoins: t.minCoins, markup: t.markup, gpuMinutes: t.gpuMinutes, apiBoost: t.apiBoost, alerts: t.alerts, extra: t.extra })),
      // coins this wallet spent on Corbel and that were burned: none until Credits open
      burned: 0,
    });
  } catch (e) {
    console.error("[api/holder]", redact(e));
    return Response.json({ error: "The chain did not answer." }, { status: 502 });
  } finally {
    g.release();
  }
}
