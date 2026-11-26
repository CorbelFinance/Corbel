import { encodeFunctionData, formatUnits, parseUnits, type Hex } from "viem";
import { guardWait } from "@/lib/guard";
import { devClient, devchain, devSend } from "@/lib/devchain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stock baskets (CorbelBasket) on the test fork: WETH in, several stock tokens out in one transaction, by the weights
 * the buyer sets, each with its own floor. Only stock tokens with a V2 pool against WETH can be in a basket, since the
 * contract swaps through the V2 router.
 *   GET  → the stock tokens that can go in a basket now, with a quote for 0.01 WETH each
 *   POST {weth, picks: [{token, weight}]} → buys the basket as the fork's test address, returns what came out
 */
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73" as Hex;
const ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba" as Hex;
const R = [{ type: "function", name: "getAmountsOut", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address[]" }], outputs: [{ type: "uint256[]" }] }] as const;
const E = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
const B = [{ type: "function", name: "buy", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }, { type: "address[][]" }, { type: "uint16[]" }, { type: "uint256[]" }, { type: "uint256" }], outputs: [{ type: "uint256[]" }] }] as const;

type Pick = { token: Hex; symbol: string; name: string; decimals: number; per001: string; path: Hex[] };
let cache: { at: number; rows: Pick[] } | null = null;

async function eligible(): Promise<Pick[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.rows;
  const c = devClient()!;
  const s = (await fetch(`http://127.0.0.1:${process.env.PORT ?? "3000"}/api/stocks`, { cache: "no-store" }).then((r) => r.json()).catch(() => null)) as { rows?: { address: string; symbol: string; name: string }[] } | null;
  const rows: Pick[] = [];
  const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Hex;
  for (const r of s?.rows ?? []) {
    const t = r.address.toLowerCase() as Hex;
    // straight from WETH, or through USDG: whichever V2 route answers
    let path: Hex[] | null = null, q: readonly bigint[] | null = null;
    for (const p of [[WETH, t], [WETH, USDG, t]] as Hex[][]) {
      q = await c.readContract({ address: ROUTER, abi: R, functionName: "getAmountsOut", args: [parseUnits("0.01", 18), p] }).catch(() => null);
      if (q && q[q.length - 1]! > 0n) {
        path = p;
        break;
      }
    }
    if (!path || !q) continue;
    const dec = await c.readContract({ address: t, abi: E, functionName: "decimals" }).catch(() => 18);
    rows.push({ token: t, symbol: r.symbol, name: r.name, decimals: Number(dec), per001: formatUnits(q[q.length - 1]!, Number(dec)), path });
    if (rows.length >= 12) break;
  }
  if (rows.length) cache = { at: Date.now(), rows };
  return rows;
}

export async function GET(req: Request) {
  const d = devchain();
  if (!d?.basket || !devClient()) return Response.json({ mode: "off", error: "Baskets run on the test fork until the contract is deployed." }, { status: 503 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    return Response.json({ mode: "fork", contract: d.basket, tokens: (await eligible()).map(({ path, ...t }) => ({ ...t, via: path.length > 2 ? "USDG" : "direct" })) });
  } catch (e) {
    return Response.json({ error: (e as Error).message.slice(0, 200) }, { status: 502 });
  } finally {
    g.release();
  }
}

export async function POST(req: Request) {
  const d = devchain(), c = devClient();
  if (!d?.basket || !c) return Response.json({ error: "The test fork is off." }, { status: 503 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const j = (await req.json().catch(() => null)) as { weth?: unknown; picks?: { token?: unknown; weight?: unknown }[] } | null;
    const weth = Number(j?.weth);
    if (!(weth > 0 && weth <= 1)) return Response.json({ error: "Spend between 0 and 1 WETH." }, { status: 400 });
    const list = await eligible();
    const picks = (j?.picks ?? []).map((p) => ({ t: list.find((x) => x.token === String(p.token).toLowerCase()), w: Math.round(Number(p.weight)) })).filter((p) => p.t && p.w > 0);
    if (picks.length < 2 || picks.length > 10) return Response.json({ error: "Pick 2 to 10 stock tokens." }, { status: 400 });
    const sum = picks.reduce((a, p) => a + p.w, 0);
    // weights in basis points that add up to exactly 10,000; the last token takes the rounding, as the contract does
    const bps = picks.map((p) => Math.floor((p.w / sum) * 10_000));
    bps[bps.length - 1]! += 10_000 - bps.reduce((a, b) => a + b, 0);
    const amountIn = parseUnits(String(weth), 18);
    const paths = picks.map((p) => p.t!.path);
    const mins: bigint[] = [];
    for (let i = 0; i < picks.length; i++) {
      const q = await c.readContract({ address: ROUTER, abi: R, functionName: "getAmountsOut", args: [(amountIn * BigInt(bps[i]!)) / 10_000n, paths[i]!] });
      mins.push((q[q.length - 1]! * 97n) / 100n);
    }
    const block = await c.getBlock();
    await devSend(WETH, encodeFunctionData({ abi: E, functionName: "approve", args: [d.basket, amountIn] }));
    const tx = await devSend(d.basket, encodeFunctionData({ abi: B, functionName: "buy", args: [WETH, amountIn, paths, bps, mins, block.timestamp + 600n] }));
    // what each token got, read from the Bought event of this transaction
    const r = await c.getTransactionReceipt({ hash: tx });
    const ev = r.logs.find((l) => l.address.toLowerCase() === d.basket!.toLowerCase());
    const outs: bigint[] = [];
    if (ev) {
      const data = ev.data.slice(2);
      const words = (k: number) => BigInt(`0x${data.slice(k * 64, k * 64 + 64)}`);
      const n = picks.length, offOuts = Number(words(2)) / 32;
      for (let i = 0; i < n; i++) outs.push(words(offOuts + 1 + i));
    }
    return Response.json({ ok: true, tx, spent: weth, rows: picks.map((p, i) => ({ symbol: p.t!.symbol, weightBps: bps[i], floor: formatUnits(mins[i]!, p.t!.decimals), got: outs[i] !== undefined ? formatUnits(outs[i]!, p.t!.decimals) : null })) });
  } catch (e) {
    return Response.json({ error: (e as Error).message.slice(0, 240) }, { status: 502 });
  } finally {
    g.release();
  }
}
