import { sameOrigin, session } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { alertsFor, botName, linkCode, linkedChat, startTelegram, telegramOn, unlink } from "@/lib/telegram";
import { tierOf } from "@/lib/tiers";
import { startWatchSweep } from "@/lib/watchEngine";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The signed-in wallet's Telegram link. GET → whether the bot runs, whether this wallet is linked, how many saved items
 * its tier sends. POST → a one-time link to the bot. DELETE → unlink. Writes only from this site's own pages.
 */
async function run(req: Request, fn: (owner: string) => Response) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    startTelegram();
    startWatchSweep();
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet first." }, { status: 401 });
    if (req.method !== "GET" && !sameOrigin(req)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
    return fn(s.address);
  } finally {
    g.release();
  }
}

export const GET = (req: Request) =>
  run(req, (owner) => (linkedChat(owner) !== null && award(req, "telegram", owner), Response.json({ on: telegramOn(), bot: botName(), linked: linkedChat(owner) !== null, holder: !!tierOf(owner), alerts: alertsFor(owner) }, { headers: { "cache-control": "no-store" } })));
export const POST = (req: Request) =>
  run(req, (owner) => {
    if (!telegramOn()) return Response.json({ error: "The Telegram bot is not running yet." }, { status: 503 });
    if (!tierOf(owner)) return Response.json({ error: "Telegram alerts are for $CORBEL holders, from the Light tier up." }, { status: 403 });
    return Response.json(linkCode(owner), { headers: { "cache-control": "no-store" } });
  });
export const DELETE = (req: Request) =>
  run(req, (owner) => {
    unlink(owner);
    return Response.json({ linked: false });
  });
