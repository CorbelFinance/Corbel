import { getClient, redact } from "@corbel/data/chain";
import { parseAbiItem, type Hex } from "viem";
import { guardWait } from "@/lib/guard";
import { MANDATES, MANDATES_POOL, MANDATES_V5 } from "@/lib/predict";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/agents/registry → every agent that holds a Corbel mandate on Robinhood Chain, with its record read from the
 * chain: the mandates it trades for, trades made, trades the contract refused, bond posted, bond lost to owners, and
 * whether it was ever frozen. From the mandate factories' Created events and each mandate's own events. Cached 10 min.
 */
const CREATED = parseAbiItem("event Created(address indexed mandate, address indexed owner, address indexed agent)");
const TRADED = parseAbiItem("event Traded(address indexed agent, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, string memo)");
const VIOLATION = parseAbiItem("event Violation(address indexed agent, uint8 indexed rule, address tokenIn, address tokenOut, uint256 amountIn, uint256 slashed, uint8 strikes, string memo)");
const BONDED = parseAbiItem("event Bonded(address indexed agent, uint256 amount, uint256 total)");
const FROZEN = parseAbiItem("event Frozen(address indexed agent, uint256 seized)");
const FACTORIES = [
  { address: MANDATES.factory as Hex, from: BigInt(MANDATES.block) },
  { address: MANDATES_POOL.factory as Hex, from: BigInt(MANDATES_POOL.block) },
  { address: MANDATES_V5.factory as Hex, from: BigInt(MANDATES_V5.block) },
];
let cache: { at: number; body: unknown } | null = null;

export async function GET(req: Request) {
  if (cache && Date.now() - cache.at < 600_000) return Response.json(cache.body);
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    const c = getClient(process.env.RPC_URL);
    if (!c) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const head = await c.getBlockNumber();
    const made = (await Promise.all(FACTORIES.map((f) => c.getLogs({ address: f.address, event: CREATED, fromBlock: f.from, toBlock: head })))).flat();
    const mandates = made.slice(-60).map((l) => ({ mandate: l.args.mandate!, owner: l.args.owner!, agent: l.args.agent!, from: l.blockNumber }));
    const agents = new Map<string, { agent: string; mandates: number; trades: number; refused: number; bonded: number; lost: number; frozen: number }>();
    for (const m of mandates) {
      const [tr, vi, bo, fr] = await Promise.all([
        c.getLogs({ address: m.mandate, event: TRADED, fromBlock: m.from, toBlock: head }),
        c.getLogs({ address: m.mandate, event: VIOLATION, fromBlock: m.from, toBlock: head }),
        c.getLogs({ address: m.mandate, event: BONDED, fromBlock: m.from, toBlock: head }),
        c.getLogs({ address: m.mandate, event: FROZEN, fromBlock: m.from, toBlock: head }),
      ]);
      // an agent can be replaced: count each event for the agent it names, not the one the mandate started with
      const add = (agent: string) => {
        const k = agent.toLowerCase();
        const a = agents.get(k) ?? { agent: k, mandates: 0, trades: 0, refused: 0, bonded: 0, lost: 0, frozen: 0 };
        agents.set(k, a);
        return a;
      };
      add(m.agent).mandates++;
      for (const l of tr) add(l.args.agent!).trades++;
      for (const l of vi) {
        const a = add(l.args.agent!);
        a.refused++;
        a.lost += Number(l.args.slashed ?? 0n) / 1e6;
      }
      for (const l of bo) add(l.args.agent!).bonded += Number(l.args.amount ?? 0n) / 1e6;
      for (const l of fr) {
        const a = add(l.args.agent!);
        a.frozen++;
        a.lost += Number(l.args.seized ?? 0n) / 1e6;
      }
    }
    const body = { block: head.toString(), mandates: mandates.length, agents: [...agents.values()].sort((a, b) => b.trades - a.trades) };
    cache = { at: Date.now(), body };
    return Response.json(body);
  } catch (e) {
    console.error("[api/agents/registry]", redact(e));
    return Response.json({ error: "The chain did not answer." }, { status: 502 });
  } finally {
    g.release();
  }
}
