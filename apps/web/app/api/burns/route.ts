import { TOKEN } from "@corbel/config";
import { getClient, redact } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/burns → every $CORBEL burn, read from the chain: the total supply now and how much of the billion is gone,
 * the Fee Burn contract's own counters (burns, ETH spent, coins burned, its share now, when it ends), and one row per
 * burn: the contract's (Burned events, with the record each one carried) and the team wallets' (transfers to the dead
 * or zero address). Every row links to its transaction. Shared, refreshed once a minute.
 */
const PB = "0x8e649485F2800Ec9CB8f1382C6B27c5Cb7782F98" as const;
const PB_FROM = 122_290_000n; // the block the contract was deployed in, rounded down
const BURNED = "0x54baafe9fd4d525b93ca7f726a60ef5289b576ec38efef10a4eb8c974a80c881";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DEAD32 = `0x${"000000000000000000000000000000000000dead".padStart(64, "0")}`;
const ZERO32 = `0x${"0".repeat(64)}`;
const NAMES = ["burns", "totalEth", "totalBurned", "ends", "rate"] as const;
const PB_ABI = NAMES.map((name) => ({ type: "function", name, stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }));
const SUPPLY_ABI = [{ type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }, { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const TTL = 60_000;

export type BurnRow = { at: number; by: "contract" | "team"; eth: number | null; coins: number; tx: string; record: string | null };
type Body = { block: string; at: number; supply: number; destroyed: number; contract: { address: string; burns: number; eth: number; coins: number; ends: number; shareBps: number }; rows: BurnRow[] };
type Log = { topics: string[]; data: string; blockNumber: string; transactionHash: string };
// the scan so far: logs and block times up to `to`; each refresh reads only the blocks after it
type Scan = { to: bigint; mine: Log[]; sent: Log[]; times: Map<string, number> };
const G = globalThis as unknown as { __corbelBurns?: { at: number; body: Body }; __corbelBurnsScan?: Scan; __corbelBurnsJob?: Promise<Body> | null };
const units = (v: bigint) => Number(v / 10n ** 12n) / 1e6;

async function read(): Promise<Body> {
  const client = getClient(process.env.RPC_URL);
  if (!client) throw new Error("no client");
  const head = await client.getBlockNumber();
  const token = TOKEN.contract as `0x${string}`;
  const [supply, dead, ...pb] = (await Promise.all([
    client.readContract({ address: token, abi: SUPPLY_ABI, functionName: "totalSupply", blockNumber: head }),
    client.readContract({ address: token, abi: SUPPLY_ABI, functionName: "balanceOf", args: ["0x000000000000000000000000000000000000dEaD"], blockNumber: head }),
    ...NAMES.map((functionName) => client.readContract({ address: PB, abi: PB_ABI, functionName, blockNumber: head } as never)),
  ])) as bigint[];
  const team = new Set((process.env.TEAM_WALLETS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
  const logs = (async (params: object) => (await client.request({ method: "eth_getLogs", params: [params] } as never)) as Log[]);
  const prev = G.__corbelBurnsScan;
  const from = `0x${(prev ? prev.to + 1n : PB_FROM).toString(16)}`, to = `0x${head.toString(16)}`;
  const [newMine, newSent] = prev && prev.to >= head ? [[], []] : await Promise.all([
    logs({ address: PB, topics: [BURNED], fromBlock: from, toBlock: to }),
    // one query per wallet and per destination: the node refuses OR-lists of topics over a long range
    Promise.all([...team].flatMap((w) => [DEAD32, ZERO32].map((d) => logs({ address: token, topics: [TRANSFER, `0x${w.slice(2).padStart(64, "0")}`, d], fromBlock: from, toBlock: to })))).then((r) => r.flat()),
  ]);
  const mine = [...(prev?.mine ?? []), ...newMine], sent = [...(prev?.sent ?? []), ...newSent];
  const times = new Map(prev?.times ?? []);
  await Promise.all([...new Set([...newMine, ...newSent].map((l) => l.blockNumber))].filter((b) => !times.has(b)).map(async (b) => {
    const blk = await client.getBlock({ blockNumber: BigInt(b) });
    times.set(b, Number(blk.timestamp) * 1000);
  }));
  G.__corbelBurnsScan = { to: head > (prev?.to ?? 0n) ? head : prev!.to, mine, sent, times };
  const rows: BurnRow[] = [
    ...mine.map((l) => ({ at: times.get(l.blockNumber)!, by: "contract" as const, eth: Number(BigInt(`0x${l.data.slice(2, 66)}`)) / 1e18, coins: units(BigInt(`0x${l.data.slice(66, 130)}`)), tx: l.transactionHash, record: l.topics[2] ?? null })),
    ...sent.map((l) => ({ at: times.get(l.blockNumber)!, by: "team" as const, eth: null, coins: units(BigInt(l.data)), tx: l.transactionHash, record: null })),
  ].sort((a, b) => b.at - a.at);
  return {
    block: head.toString(),
    at: Date.now(),
    supply: units(supply!),
    destroyed: 1e9 - units(supply!) + units(dead!),
    contract: { address: PB, burns: Number(pb[0]), eth: Number(pb[1]) / 1e18, coins: units(pb[2]!), ends: Number(pb[3]), shareBps: Number(pb[4]) },
    rows,
  };
}

// one refresh at a time; it stores the result for everyone
function refresh(): Promise<Body> {
  // one quiet retry: the first read after a restart sometimes loses its connection
  G.__corbelBurnsJob ??= read()
    .catch(() => new Promise<void>((ok) => setTimeout(ok, 1_500)).then(read))
    .then((body) => ((G.__corbelBurns = { at: Date.now(), body }), body))
    .finally(() => (G.__corbelBurnsJob = null));
  return G.__corbelBurnsJob;
}

export async function GET(req: Request) {
  const c = G.__corbelBurns;
  if (c && Date.now() - c.at < TTL) return Response.json(c.body);
  // older than a minute: answer with it at once and refresh behind it, so nobody waits on the chain
  if (c) {
    refresh().catch((e) => console.error("[api/burns]", redact(e)));
    return Response.json(c.body);
  }
  const g = await guardWait(req, "wallet");
  if ("blocked" in g) return g.blocked;
  try {
    return Response.json(await refresh());
  } catch (e) {
    console.error("[api/burns]", redact(e));
    if (G.__corbelBurns) return Response.json({ ...G.__corbelBurns.body, stale: true });
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  } finally {
    g.release();
  }
}
