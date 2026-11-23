import { encodeFunctionData, formatEther, parseEther, parseEventLogs, type Hex } from "viem";
import { guardWait } from "@/lib/guard";
import { devClient, devchain, devSend, devWarp } from "@/lib/devchain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Protected launch (CorbelLaunchpad): a token with a fixed supply and no owner, sold on a two-way curve with a deadline;
 * if it sells out, all raised ETH and the reserved tokens become locked liquidity in a v4 pool; if not, buyers sell back
 * with no fee. Runs on the local test chain only today (lib/devchain), acting as the test address:
 *   GET → every launch on the test chain with its state, raised, sold and the test wallet's tokens
 *   POST {action:"launch", name, symbol, targetEth, hours} · {action:"buy", sale, eth} · {action:"sell", sale, share}
 *   POST {action:"graduate", sale} · {action:"warp", minutes}
 */
const PAD = [
  { type: "event", name: "Launched", inputs: [{ name: "sale", type: "address", indexed: true }, { name: "token", type: "address", indexed: true }, { name: "creator", type: "address", indexed: true }, { name: "target", type: "uint256", indexed: false }, { name: "deadline", type: "uint256", indexed: false }] },
  { type: "function", name: "launch", stateMutability: "nonpayable", inputs: [{ type: "string" }, { type: "string" }, { type: "uint256" }, { type: "uint256" }], outputs: [{ type: "address" }] },
] as const;
const SALE = [
  { type: "function", name: "state", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "raised", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "sold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "target", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "deadline", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lockedLiquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  { type: "function", name: "quoteBuy", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "buy", stateMutability: "payable", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "sell", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "graduate", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;
const TOKEN = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
const APPROVE = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
const STATES = ["live", "failed", "graduated"] as const;

async function state() {
  const d = devchain()!, c = devClient()!;
  const block = await c.getBlock();
  const logs = parseEventLogs({ abi: PAD, logs: await c.getLogs({ address: d.launchpad as Hex, fromBlock: BigInt(d.fromBlock ?? Number(block.number) - 5000), toBlock: "latest" }) });
  const launches = await Promise.all(
    logs.map(async (l) => {
      const sale = l.args.sale, token = l.args.token;
      const r = (fn: (typeof SALE)[number]["name"]) => c.readContract({ address: sale, abi: SALE, functionName: fn as "raised" }) as Promise<bigint>;
      const [st, raised, sold, target, deadline, locked, sym, name, mine, supply] = await Promise.all([
        c.readContract({ address: sale, abi: SALE, functionName: "state" }),
        r("raised"), r("sold"), r("target"), r("deadline"), r("lockedLiquidity"),
        c.readContract({ address: token, abi: TOKEN, functionName: "symbol" }),
        c.readContract({ address: token, abi: TOKEN, functionName: "name" }),
        c.readContract({ address: token, abi: TOKEN, functionName: "balanceOf", args: [d.dev] }),
        c.readContract({ address: token, abi: TOKEN, functionName: "totalSupply" }),
      ]);
      return { sale, token, name, symbol: sym, state: STATES[st] ?? "live", raised: Number(formatEther(raised)), target: Number(formatEther(target)), sold: Number(formatEther(sold)), supply: Number(formatEther(supply)), deadline: Number(deadline), lockedLiquidity: locked.toString(), mine: Number(formatEther(mine)) };
    }),
  );
  const eth = await c.getBalance({ address: d.dev });
  return { mode: "test", chain: { block: Number(block.number), time: Number(block.timestamp) }, launchpad: d.launchpad, wallet: d.dev, eth: Number(formatEther(eth)), launches: launches.reverse() };
}

export async function GET(req: Request) {
  if (!devchain()?.launchpad) return Response.json({ mode: "off", error: "The launchpad is not deployed yet. On localhost it runs on the local test chain." }, { status: 503 });
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
  if (!d?.launchpad) return Response.json({ error: "The launchpad is not deployed yet." }, { status: 503 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const sale = String(b.sale ?? "") as Hex;
    if (b.action === "launch") {
      const name = String(b.name ?? "").trim().slice(0, 64), symbol = String(b.symbol ?? "").trim().slice(0, 16);
      if (!name || !symbol) return Response.json({ error: "Give a name and a ticker." }, { status: 400 });
      const target = parseEther(String(Math.max(0.01, Number(b.targetEth) || 1)));
      const secs = BigInt(Math.max(3600, Math.min(30 * 86_400, Math.round((Number(b.hours) || 24) * 3600))));
      await devSend(d.launchpad as Hex, encodeFunctionData({ abi: PAD, functionName: "launch", args: [name, symbol, target, secs] }));
    } else if (b.action === "buy") {
      await devSend(sale, encodeFunctionData({ abi: SALE, functionName: "buy", args: [0n] }), parseEther(String(Math.max(0.0001, Number(b.eth) || 0.1))));
    } else if (b.action === "sell") {
      const s = await state();
      const l = s.launches.find((x) => x.sale.toLowerCase() === sale.toLowerCase());
      if (!l || l.mine <= 0) return Response.json({ error: "No tokens to sell." }, { status: 400 });
      const share = Math.min(1, Math.max(0.01, Number(b.share) || 1));
      // whole balance on a full sell (no float rounding above what is held)
      const held = await devClient()!.readContract({ address: l.token as Hex, abi: TOKEN, functionName: "balanceOf", args: [d.dev] });
      const amt = share >= 1 ? held : (held * BigInt(Math.round(share * 1000))) / 1000n;
      // the sale takes the tokens with transferFrom: approve them first, as a wallet would
      await devSend(l.token as Hex, encodeFunctionData({ abi: APPROVE, functionName: "approve", args: [sale, amt] }));
      await devSend(sale, encodeFunctionData({ abi: SALE, functionName: "sell", args: [amt, 0n] }));
    } else if (b.action === "graduate") {
      await devSend(sale, encodeFunctionData({ abi: SALE, functionName: "graduate", args: [] }));
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
