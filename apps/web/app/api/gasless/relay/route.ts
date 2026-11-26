import { sameOrigin } from "@/lib/auth";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Swaps without ETH, for real wallets. GET → the contract, the relayer's minimum fee in USDG, and whether the relayer
 * answers. POST {intent, path, v, r, s, pv, pr, ps} → the request the visitor's wallet signed (a USDG permit and a swap
 * intent) goes to the relayer, which checks it, simulates it, pays the gas and sends it. The relayer runs on this
 * server (RELAYER_URL, a local address); nothing here holds a key. Off until GASLESS_CONTRACT and RELAYER_URL are set.
 */
const on = () => !!process.env.GASLESS_CONTRACT && !!process.env.RELAYER_URL;

export async function GET() {
  if (!on()) return Response.json({ mode: "off", error: "Swaps without ETH are not open yet." }, { status: 503 });
  const h = (await fetch(`${process.env.RELAYER_URL}/health`, { signal: AbortSignal.timeout(5_000) }).then((r) => r.json()).catch(() => null)) as { ok?: boolean; minFee?: string } | null;
  return Response.json({ mode: "live", contract: process.env.GASLESS_CONTRACT, chainId: 4663, minFee: h?.minFee ?? null, relayer: !!h?.ok }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  if (!on()) return Response.json({ error: "Swaps without ETH are not open yet." }, { status: 503 });
  if (!sameOrigin(req)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const raw = await req.text();
    if (raw.length > 8_000) return Response.json({ error: "Request too large." }, { status: 413 });
    const r = await fetch(`${process.env.RELAYER_URL}/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: raw, signal: AbortSignal.timeout(120_000) }).catch(() => null);
    if (!r) return Response.json({ error: "The relayer did not answer. Try again in a minute." }, { status: 502 });
    return Response.json(await r.json().catch(() => ({ error: "The relayer gave no answer." })), { status: r.status });
  } finally {
    g.release();
  }
}
