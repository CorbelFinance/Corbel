import { encodeFunctionData, formatUnits, parseUnits, type Hex } from "viem";
import { guardWait } from "@/lib/guard";
import { devClient, devchain, devSend, devWarp } from "@/lib/devchain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Orders (CorbelOrders): limit, DCA and TWAP that wait in escrow until the pool pays the floor.
 * Today this runs on the local test chain only (lib/devchain), acting as the test address:
 *   GET                       → balances, every order, and whether each is due now
 *   POST {action:"place", tokenIn, tokenOut, amountPerFill, fills, intervalMin, minOutPerFill}
 *   POST {action:"cancel", id} · POST {action:"keeper"} fills what is due · POST {action:"warp", minutes}
 * On the live site the same contract is called from the visitor's own wallet once it is deployed.
 */
const TOKENS: Record<string, { address: Hex; decimals: number }> = {
  WETH: { address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", decimals: 18 },
  USDG: { address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", decimals: 6 },
};
const sym = (a: string) => Object.entries(TOKENS).find(([, t]) => t.address === a.toLowerCase())?.[0] ?? a;
const ABI = [
  { type: "function", name: "nextId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "orders", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "uint96" }, { type: "uint128" }, { type: "uint128" }, { type: "uint32" }, { type: "uint32" }, { type: "uint32" }, { type: "uint16" }] },
  { type: "function", name: "due", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address[]" }], outputs: [{ type: "bool" }, { type: "uint256" }] },
  { type: "function", name: "place", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint96" }, { type: "uint128" }, { type: "uint128" }, { type: "uint32" }, { type: "uint32" }, { type: "uint16" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "fill", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "address[]" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
] as const;
const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

async function state() {
  const d = devchain()!, c = devClient()!;
  const [block, next, ...bals] = await Promise.all([
    c.getBlock(),
    c.readContract({ address: d.orders, abi: ABI, functionName: "nextId" }),
    ...Object.values(TOKENS).map((t) => c.readContract({ address: t.address, abi: ERC20, functionName: "balanceOf", args: [d.dev] })),
  ]);
  const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1)).slice(-30);
  const orders = await Promise.all(
    ids.map(async (id) => {
      const o = await c.readContract({ address: d.orders, abi: ABI, functionName: "orders", args: [id] });
      const [owner, tin, tout, left, per, floor, interval, nextAt, expiry] = o;
      const din = TOKENS[sym(tin)]?.decimals ?? 18, dout = TOKENS[sym(tout)]?.decimals ?? 18;
      const [ready, quote] = left > 0n ? await c.readContract({ address: d.orders, abi: ABI, functionName: "due", args: [id, [tin, tout]] }) : [false, 0n];
      return { id: Number(id), owner, tokenIn: sym(tin), tokenOut: sym(tout), fillsLeft: Number(left), amountPerFill: Number(formatUnits(per, din)), minOutPerFill: Number(formatUnits(floor, dout)), intervalMin: interval / 60, nextAt, expiry, due: ready, quote: Number(formatUnits(quote, dout)) };
    }),
  );
  return {
    mode: "test",
    chain: { rpc: "local fork of Robinhood Chain", block: Number(block.number), time: Number(block.timestamp) },
    contract: d.orders,
    wallet: d.dev,
    balances: Object.fromEntries(Object.keys(TOKENS).map((k, i) => [k, Number(formatUnits(bals[i] as bigint, TOKENS[k]!.decimals))])),
    orders: orders.reverse(),
  };
}

export async function GET(req: Request) {
  if (!devchain()) return Response.json({ mode: "off", error: "Orders are not deployed yet. On localhost they run on the local test chain." }, { status: 503 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    return Response.json(await state(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: `The test chain did not answer: ${(e as Error).message.split("\n")[0]}` }, { status: 502 });
  } finally {
    g.release();
  }
}

export async function POST(req: Request) {
  const d = devchain();
  if (!d) return Response.json({ error: "Orders are not deployed yet." }, { status: 503 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.action === "place") {
      const tin = TOKENS[String(b.tokenIn)], tout = TOKENS[String(b.tokenOut)];
      if (!tin || !tout || tin === tout) return Response.json({ error: "Pick two different tokens: WETH or USDG." }, { status: 400 });
      const fills = Math.max(1, Math.min(365, Math.round(Number(b.fills) || 1)));
      const per = parseUnits(String(Number(b.amountPerFill) || 0), tin.decimals);
      const floor = parseUnits(String(Number(b.minOutPerFill) || 0), tout.decimals);
      const interval = fills > 1 ? Math.max(60, Math.round((Number(b.intervalMin) || 60) * 60)) : 0;
      if (per <= 0n || floor <= 0n) return Response.json({ error: "Give an amount and a floor above zero." }, { status: 400 });
      await devSend(tin.address, encodeFunctionData({ abi: ERC20, functionName: "approve", args: [d.orders, per * BigInt(fills)] }));
      await devSend(d.orders, encodeFunctionData({ abi: ABI, functionName: "place", args: [tin.address, tout.address, BigInt(fills), per, floor, interval, 0, 30] }));
    } else if (b.action === "cancel") {
      await devSend(d.orders, encodeFunctionData({ abi: ABI, functionName: "cancel", args: [BigInt(Number(b.id))] }));
    } else if (b.action === "keeper") {
      // what a keeper does: fill every order that is due and whose floor the pool pays now
      const s = await state();
      for (const o of s.orders.filter((x) => x.due)) {
        const path = [TOKENS[o.tokenIn]!.address, TOKENS[o.tokenOut]!.address];
        await devSend(d.orders, encodeFunctionData({ abi: ABI, functionName: "fill", args: [BigInt(o.id), path, BigInt(s.chain.time + 600)] }));
      }
    } else if (b.action === "warp") {
      await devWarp(Math.max(60, Math.min(30 * 86_400, Math.round((Number(b.minutes) || 60) * 60))));
    } else return Response.json({ error: "Unknown action." }, { status: 400 });
    return Response.json(await state());
  } catch (e) {
    return Response.json({ error: (e as Error).message.split("\n")[0] }, { status: 400 });
  } finally {
    g.release();
  }
}
