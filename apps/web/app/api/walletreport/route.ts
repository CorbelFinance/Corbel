import { asBackground, getClient, parseAddress, readWalletReport, redact } from "@corbel/data/chain";
import { allTokens, poolSides } from "@corbel/indexer";
import { blocksPerSecond } from "@/lib/blockRate";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/walletreport?a=0x… → what a wallet traded, what each trade was worth then, and the gas it paid. A report
 * takes a few minutes: the first call starts it and answers 202 with the step it is on; ask again until it is in.
 * Kept 20 minutes per address, in memory only. Three reports are read at a time.
 */
const TTL = 20 * 60_000;
const MAX_RUNS = 3;
type Run = { step: string; error: string | null };
const G = globalThis as unknown as { __corbelWr?: { cache: Map<string, { at: number; body: unknown }>; runs: Map<string, Run> } };
const box = (G.__corbelWr ??= { cache: new Map(), runs: new Map() });
const noStore = { "cache-control": "no-store" };

export async function GET(req: Request) {
  const a = parseAddress((new URL(req.url).searchParams.get("a") ?? "").trim());
  if (!a) return Response.json({ error: "Paste an address (0x…)." }, { status: 400 });
  const key = a.toLowerCase();
  const hit = box.cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return (award(req, "report"), Response.json(hit.body, { headers: noStore }));
  const run = box.runs.get(key);
  if (run?.error) {
    box.runs.delete(key);
    return Response.json({ error: run.error }, { status: 502 });
  }
  if (run) return Response.json({ step: run.step }, { status: 202, headers: noStore });
  const g = await guardWait(req, "wallet", 20_000);
  if ("blocked" in g) return g.blocked;
  try {
    if ([...box.runs.values()].filter((r) => !r.error).length >= MAX_RUNS) return Response.json({ error: "Three reports are being read right now. Try again in a few minutes." }, { status: 429 });
    const client = getClient(process.env.RPC_URL);
    if (!client) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const me: Run = { step: "Starting", error: null };
    box.runs.set(key, me);
    // the heaviest read on the site: it waits behind every visitor's request, never in front of one
    void asBackground(async () => {
      const bps = await blocksPerSecond();
      const body = await readWalletReport(client, a, { tokens: allTokens, pools: poolSides }, { recentBlocks: BigInt(Math.round(bps * 86_400)), onStep: (s) => (me.step = s) });
      if (box.cache.size > 50) box.cache.delete(box.cache.keys().next().value!);
      box.cache.set(key, { at: Date.now(), body: { ...body, at: Date.now() } });
      box.runs.delete(key);
    }).catch((e: unknown) => {
      console.error("[api/walletreport]", redact(e));
      me.error = "The chain did not answer. Try again in a minute.";
      setTimeout(() => box.runs.get(key) === me && box.runs.delete(key), 60_000).unref?.();
    });
    return Response.json({ step: me.step }, { status: 202, headers: noStore });
  } finally {
    g.release();
  }
}
