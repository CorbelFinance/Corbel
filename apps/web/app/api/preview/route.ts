import { getClient, parseAddress, previewTx, redact } from "@corbel/data/chain";
import { holderGate } from "@/lib/holderGate";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";
import { HELD } from "@corbel/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/preview {from, to, value?, data?} → what the transaction would move if signed now: the signer's net change
 * per asset, who receives it, and every approval it grants. Simulated at the latest block; nothing is sent or stored.
 * value is in wei (decimal or 0x hex); data is the calldata hex, up to MAX_DATA bytes.
 */
const MAX_DATA = 64 * 1024;

const wei = (v: unknown): bigint | null => {
  if (v === undefined || v === null || v === "") return 0n;
  const s = String(v).trim();
  if (!/^(0x[0-9a-fA-F]{1,64}|\d{1,78})$/.test(s)) return null;
  return BigInt(s);
};

export async function POST(req: Request) {
  if (HELD.preview) return new Response("Not found.", { status: 404 });
  const gate = holderGate(req, "preview");
  if (gate) return gate;
  const body = (await req.json().catch(() => null)) as { from?: string; to?: string; value?: string; data?: string } | null;
  const from = parseAddress(body?.from ?? "");
  const to = parseAddress(body?.to ?? "");
  const value = wei(body?.value);
  const data = (body?.data ?? "0x").trim() || "0x";
  if (!from || !to) return Response.json({ error: "Give the signer (from) and the contract or wallet it calls (to)." }, { status: 400 });
  if (value === null) return Response.json({ error: "Value must be a whole number of wei." }, { status: 400 });
  if (!/^0x([0-9a-fA-F]{2})*$/.test(data) || data.length > 2 + MAX_DATA * 2) return Response.json({ error: "Data must be hex starting with 0x." }, { status: 400 });
  const g = await guardWait(req, "quote", 40_000);
  if ("blocked" in g) return g.blocked;
  try {
    const client = getClient(process.env.RPC_URL);
    if (!client) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const out = await previewTx(client, { from, to, value, data: data as `0x${string}` });
    award(req, "preview");
    return Response.json(out);
  } catch (e) {
    console.error("[api/preview]", redact(e));
    return Response.json({ error: "The simulation did not run. Check the fields and try again." }, { status: 502 });
  } finally {
    g.release();
  }
}
