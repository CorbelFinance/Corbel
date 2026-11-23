import { RH, getClient, parseAddress, redact } from "@corbel/data/chain";
import { poolBlock } from "@corbel/indexer";
import type { PublicClient } from "viem";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/feehistory?pair=0x… → every day of a V2 pool since its first block: swaps, volume in the base asset and the
 * fees LPs earned (0.3% of each trade's size, counted in the base asset). Read from the pair's own Swap events in
 * windows of WINDOW blocks (halved while over the node's log cap); a swap's day comes from the timestamps of the
 * window's first and last swap, interpolated between them.
 * Cached 30 minutes per pool.
 */
const SWAP = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const WINDOW = 5_000_000n;
const FEE = 0.003;
const TTL = 30 * 60_000;
const G = globalThis as unknown as { __corbelFeeHist?: Map<string, { at: number; body: unknown }>; __corbelFeeRun?: Map<string, Promise<unknown>> };
const cache = (G.__corbelFeeHist ??= new Map());
const runs = (G.__corbelFeeRun ??= new Map());

const PAIR = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const DEC = [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }] as const;
const word = (data: string, i: number) => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64) || "0"}`);

type Log = { data: string; blockNumber: string };
/** A window's swaps; a window over the node's log cap (a busy pool) is split in halves until each part fits. */
async function logsIn(client: PublicClient, pair: string, from: bigint, to: bigint): Promise<[bigint, bigint, Log[]][]> {
  try {
    const logs = (await client.request({ method: "eth_getLogs", params: [{ address: pair, topics: [SWAP], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }] } as never)) as Log[];
    return [[from, to, logs]];
  } catch (e) {
    // split any failed window, not only one over the log cap: a long read can also time out on the way to the node
    if (to - from < 2_000n) throw e;
    const mid = from + (to - from) / 2n;
    return [...(await logsIn(client, pair, from, mid)), ...(await logsIn(client, pair, mid + 1n, to))];
  }
}

export type FeeDay = { day: number; swaps: number; vol: number; fees: number };

async function read(client: PublicClient, pair: `0x${string}`) {
  const [t0, t1] = (await Promise.all([client.readContract({ address: pair, abi: PAIR, functionName: "token0" }), client.readContract({ address: pair, abi: PAIR, functionName: "token1" })])) as [string, string];
  const bases = [RH.WETH.toLowerCase(), RH.USDG.toLowerCase()];
  const baseIs0 = bases.includes(t0.toLowerCase());
  if (!baseIs0 && !bases.includes(t1.toLowerCase())) return { error: "This pair has no ETH or USDG side." };
  const base = (baseIs0 ? t0 : t1) as `0x${string}`;
  const baseDec = Number(await client.readContract({ address: base, abi: DEC, functionName: "decimals" }));
  const head = await client.getBlockNumber();
  const start = BigInt(poolBlock(pair.toLowerCase()) ?? 0);
  const ts = new Map<bigint, number>();
  const stamp = async (b: bigint) => {
    if (!ts.has(b)) ts.set(b, Number((await client.getBlock({ blockNumber: b })).timestamp));
    return ts.get(b)!;
  };
  const days = new Map<number, FeeDay>();
  let first: number | null = null;
  for (let from = start; from <= head; from += WINDOW) {
    const to = from + WINDOW - 1n > head ? head : from + WINDOW - 1n;
    for (const [lo, hi, logs] of await logsIn(client, pair, from, to)) {
      if (!logs.length) continue;
      // anchor the clock on the window's first and last swap, never on an empty edge (the genesis block's time is not the chain's pace)
      const f = BigInt(logs[0]!.blockNumber), z = BigInt(logs[logs.length - 1]!.blockNumber);
      const [a, b] = await Promise.all([stamp(f), stamp(z)]);
      const per = Number(z - f) ? (b - a) / Number(z - f) : 0;
      for (const l of logs) {
        const bn = BigInt(l.blockNumber);
        const day = Math.floor((a + Number(bn - f) * per) / 86_400);
        first ??= day;
        // amount0In, amount1In, amount0Out, amount1Out: the base side's in plus out is the trade's size in base
        const size = Number(baseIs0 ? word(l.data, 0) + word(l.data, 2) : word(l.data, 1) + word(l.data, 3)) / 10 ** baseDec;
        const x = days.get(day) ?? { day, swaps: 0, vol: 0, fees: 0 };
        x.swaps++;
        x.vol += size;
        x.fees += size * FEE;
        days.set(day, x);
      }
    }
  }
  // every day from the first swap to today, quiet days included
  const today = Math.floor(Number(await stamp(head)) / 86_400);
  const out: FeeDay[] = [];
  if (first !== null) for (let d = first; d <= today; d++) out.push(days.get(d) ?? { day: d, swaps: 0, vol: 0, fees: 0 });
  return { pair, base: baseIs0 ? t0 : t1, baseSymbol: base.toLowerCase() === RH.USDG.toLowerCase() ? "USDG" : "ETH", fromBlock: start.toString(), head: head.toString(), days: out, at: Date.now() };
}

export async function GET(req: Request) {
  const pair = parseAddress((new URL(req.url).searchParams.get("pair") ?? "").trim());
  if (!pair) return Response.json({ error: "Paste a pool address." }, { status: 400 });
  const key = pair.toLowerCase();
  const hit = cache.get(key);
  // a cached answer is still a use of the tool: it earns the same points
  if (hit && Date.now() - hit.at < TTL) return (award(req, "fees"), Response.json(hit.body));
  const g = await guardWait(req, "wallet", 90_000);
  if ("blocked" in g) return g.blocked;
  try {
    const client = getClient(process.env.RPC_URL);
    if (!client) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    let run = runs.get(key);
    if (!run) {
      run = read(client, pair as `0x${string}`)
        .then((body) => {
          if (!(body as { error?: string }).error) {
            if (cache.size > 200) cache.delete(cache.keys().next().value!);
            cache.set(key, { at: Date.now(), body });
          }
          return body;
        })
        .finally(() => runs.delete(key));
      run.catch((e: unknown) => console.error("[api/feehistory]", redact(e)));
      runs.set(key, run);
    }
    // a long history keeps reading after this answer; the page asks again and gets it from the cache
    const body = await Promise.race([run, new Promise((r) => setTimeout(() => r(null), 45_000))]);
    if (body === null) return Response.json({ pending: "Reading the pool's whole history. This page asks again by itself." }, { status: 202, headers: { "cache-control": "no-store" } });
    if (!(body as { error?: string }).error) {
      if (cache.size > 200) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), body });
    }
    if (!(body as { error?: string }).error) award(req, "fees");
    return Response.json(body, { status: (body as { error?: string }).error ? 400 : 200 });
  } catch (e) {
    console.error("[api/feehistory]", redact(e));
    return Response.json({ error: "The chain did not answer." }, { status: 502 });
  } finally {
    g.release();
  }
}
