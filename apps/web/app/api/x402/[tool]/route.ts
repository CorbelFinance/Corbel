import { buildReport, getClient, parseAddress, previewTx, redact } from "@corbel/data/chain";
import { creatorRecord, launchCreator, launchTx, launcherHistory, poolLauncher, sameTicker, v4PoolsFor } from "@corbel/indexer";
import { proofsFor } from "@/lib/ledger";
import { NETWORK, PRICES, decodeHeader, encodeResponse, paymentsOpen, payTo, requirements, settle, verify } from "@/lib/x402";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Pay per call over x402, for agents with no account and no key (lib/x402).
 *   GET  /api/x402/token?q=0x…    the token check
 *   GET  /api/x402/ledger?token=  a token's sealed verdicts with proofs
 *   POST /api/x402/preview        {from,to,value?,data?} what a transaction would move
 * Without X-PAYMENT: 402 and what to sign. With a valid one: settled on chain, then the answer, with X-PAYMENT-RESPONSE.
 */
async function run(tool: string, req: Request): Promise<unknown> {
  const u = new URL(req.url).searchParams;
  const client = getClient(process.env.RPC_URL);
  if (!client) throw new Error("paused");
  if (tool === "token") {
    const a = parseAddress(u.get("q") ?? "");
    if (!a) return { error: "Pass q=<token address>." };
    return buildReport(client, a, a, { v4PoolsFor, launcherHistory, sameTicker, poolLauncher, launchCreator, creatorRecord, launchTx });
  }
  if (tool === "ledger") {
    const a = parseAddress(u.get("token") ?? "");
    return a ? { token: a, verdicts: proofsFor(a) } : { error: "Pass token=<address>." };
  }
  const b = (await req.json().catch(() => null)) as { from?: string; to?: string; value?: string; data?: string } | null;
  const from = parseAddress(b?.from ?? ""), to = parseAddress(b?.to ?? "");
  if (!from || !to) return { error: "Give from and to." };
  return previewTx(client, { from, to, value: BigInt(b?.value || 0), data: (b?.data || "0x") as `0x${string}` });
}

async function handle(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  if (!(tool in PRICES)) return Response.json({ error: "Unknown tool. Paid tools: token, ledger, preview." }, { status: 404 });
  if (!paymentsOpen()) return Response.json({ error: "Paid calls are not open yet. The free API at /api works with per-minute limits." }, { status: 503 });
  const h = decodeHeader(req.headers.get("x-payment"));
  if (!h) return Response.json(requirements(tool, req.url), { status: 402 });
  const bad = await verify(h, tool, payTo()!);
  if (bad) return Response.json({ ...requirements(tool, req.url), error: bad }, { status: 402 });
  const s = await settle(h, tool);
  if ("error" in s) return Response.json({ ...requirements(tool, req.url), error: s.error }, { status: 402 });
  try {
    const body = await run(tool, req);
    return Response.json(body, { headers: { "x-payment-response": encodeResponse({ success: true, transaction: s.tx, network: NETWORK, payer: h.payload.authorization.from }) } });
  } catch (e) {
    console.error("[x402]", redact(e));
    return Response.json({ error: "Paid, but the chain did not answer. Send the same request with a new payment, or ask for a refund with this transaction.", transaction: s.tx }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
