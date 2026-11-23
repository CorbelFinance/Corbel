import { session } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { startTelegram } from "@/lib/telegram";
import { SWEEP_MS, feedOf, startWatchSweep } from "@/lib/watchEngine";
import { startWebhooks } from "@/lib/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET → the signed-in wallet's alerts: what changed for the worse on the tokens it watches, newest first. */
export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    startWebhooks();
    startTelegram();
    startWatchSweep();
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet first." }, { status: 401 });
    return Response.json({ ...feedOf(s.address), everyMin: SWEEP_MS / 60_000 }, { headers: { "cache-control": "no-store" } });
  } finally {
    g.release();
  }
}
