import { isAddress, parseAbiItem, formatUnits, type Hex } from "viem";
import { getClient, redact } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Orders for real wallets (CorbelOrders). GET → the contract and the tip a keeper takes; GET ?owner=0x… → that wallet's
 * orders read from the chain: what is left, the floor, when the next slice is due. Placing and cancelling are signed
 * by the wallet itself in the browser. Off until ORDERS_CONTRACT is set; ORDERS_FROM_BLOCK is the deploy block.
 */
const PLACED = parseAbiItem("event Placed(uint256 indexed id, address indexed owner, address tokenIn, address tokenOut, uint256 fills, uint256 amountPerFill, uint256 minOutPerFill, uint256 interval)");
const ABI = [{ type: "function", name: "orders", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "uint96" }, { type: "uint128" }, { type: "uint128" }, { type: "uint32" }, { type: "uint32" }, { type: "uint32" }, { type: "uint16" }] }] as const;
const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73": { symbol: "WETH", decimals: 18 },
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": { symbol: "USDG", decimals: 6 },
};
const TIP_BPS = 30;

export async function GET(req: Request) {
  const contract = process.env.ORDERS_CONTRACT as Hex | undefined;
  if (!contract) return Response.json({ mode: "off", error: "Orders on the chain are not open yet." }, { status: 503 });
  const owner = (new URL(req.url).searchParams.get("owner") ?? "").toLowerCase();
  if (!owner) return Response.json({ mode: "live", contract, tipBps: TIP_BPS, tokens: TOKENS });
  if (!isAddress(owner)) return Response.json({ error: "Pass a 0x address." }, { status: 400 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const c = getClient(process.env.RPC_URL);
    if (!c) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const head = await c.getBlockNumber();
    const from = BigInt(process.env.ORDERS_FROM_BLOCK ?? "0");
    const logs = [];
    for (let a = from; a <= head; a += 20_000n) {
      const b = a + 19_999n < head ? a + 19_999n : head;
      logs.push(...(await c.getLogs({ address: contract, event: PLACED, args: { owner: owner as Hex }, fromBlock: a, toBlock: b })));
    }
    const rows = await Promise.all(
      logs.slice(-50).map(async (l) => {
        const o = await c.readContract({ address: contract, abi: ABI, functionName: "orders", args: [l.args.id!] });
        const tin = TOKENS[o[1].toLowerCase()], tout = TOKENS[o[2].toLowerCase()];
        return {
          id: Number(l.args.id),
          tokenIn: tin?.symbol ?? o[1],
          tokenOut: tout?.symbol ?? o[2],
          fillsLeft: Number(o[3]),
          fills: Number(l.args.fills),
          perFill: tin ? formatUnits(o[4], tin.decimals) : o[4].toString(),
          floor: tout ? formatUnits(o[5], tout.decimals) : o[5].toString(),
          interval: Number(o[6]),
          nextAt: Number(o[7]),
          tx: l.transactionHash,
        };
      }),
    );
    return Response.json({ mode: "live", contract, tipBps: TIP_BPS, orders: rows.reverse() }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[api/orders/mine]", redact(e));
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  } finally {
    g.release();
  }
}
