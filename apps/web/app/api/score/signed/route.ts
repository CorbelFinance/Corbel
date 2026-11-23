import { buildReport, getClient, parseAddress, redact } from "@corbel/data/chain";
import { creatorRecord, launchCreator, launchTx, launcherHistory, poolLauncher, sameTicker, v4PoolsFor } from "@corbel/indexer";
import { privateKeyToAccount } from "viem/accounts";
import { score, type Check } from "@/components/app/score";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/score/signed?token=0x… → a Corbel score for the token, signed for the mandate contract's score rule
 * (EIP-712 domain {name "Corbel score", version "1", chainId 4663}, type Score(address token,uint8 score,uint64 issuedAt)).
 * Anyone passes {token, score, issuedAt, v, r, s} to a mandate's submitScore; it counts for 10 minutes.
 * The signed number is the checks part of the score (0 to 90, from the seven checks alone), named so in the answer.
 * Off until SCORE_KEY is set on the server.
 */
const DOMAIN = { name: "Corbel score", version: "1", chainId: 4663 } as const;
const TYPES = { Score: [{ name: "token", type: "address" }, { name: "score", type: "uint8" }, { name: "issuedAt", type: "uint64" }] } as const;

export async function GET(req: Request) {
  const key = process.env.SCORE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return Response.json({ error: "Signed scores are not open yet." }, { status: 503 });
  const token = parseAddress(new URL(req.url).searchParams.get("token") ?? "");
  if (!token) return Response.json({ error: "Pass token=<address>." }, { status: 400 });
  const g = await guardWait(req, "quote", 40_000);
  if ("blocked" in g) return g.blocked;
  try {
    const c = getClient(process.env.RPC_URL);
    if (!c) return Response.json({ error: "Chain reads are paused." }, { status: 503 });
    const r = await buildReport(c, token, token, { v4PoolsFor, launcherHistory, sameTicker, poolLauncher, launchCreator, creatorRecord, launchTx });
    const total = Math.max(0, Math.min(100, Math.round(score(r.checks as Check[]).total)));
    const issuedAt = Math.floor(Date.now() / 1000);
    const account = privateKeyToAccount(key as `0x${string}`);
    const sig = await account.signTypedData({ domain: DOMAIN, types: TYPES, primaryType: "Score", message: { token, score: total, issuedAt: BigInt(issuedAt) } });
    const r_ = `0x${sig.slice(2, 66)}`, s_ = `0x${sig.slice(66, 130)}`, v = parseInt(sig.slice(130, 132), 16);
    return Response.json({ token, score: total, scoreOf: "the seven checks (0-90)", issuedAt, validFor: 600, signer: account.address, v, r: r_, s: s_, block: r.meta?.block ?? null });
  } catch (e) {
    console.error("[api/score/signed]", redact(e));
    return Response.json({ error: "The chain did not answer." }, { status: 502 });
  } finally {
    g.release();
  }
}
