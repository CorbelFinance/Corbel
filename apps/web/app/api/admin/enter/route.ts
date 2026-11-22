import { createHash } from "node:crypto";
import { isSecure, sessionCookie } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/enter?t=… → a one-time way into the owner's panel without a browser wallet. A ticket is minted on
 * the server only (a row with the ticket's hash, its wallet and a 15-minute expiry); it works once, then the visitor
 * holds an ordinary session for that wallet. The wallet must also be in ADMIN_WALLETS. Anything else: a plain 404.
 */
const db = () => store("admin", "CREATE TABLE IF NOT EXISTS tickets (hash TEXT PRIMARY KEY, wallet TEXT NOT NULL, exp INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);");
const admins = () => (process.env.ADMIN_WALLETS ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);

export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const t = new URL(req.url).searchParams.get("t") ?? "";
    const nf = new Response("Not found.", { status: 404, headers: { "cache-control": "no-store" } });
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(t)) return nf;
    const d = db();
    if (!d) return nf;
    const hash = createHash("sha256").update(t).digest("hex");
    const row = d.prepare("SELECT wallet, exp, used FROM tickets WHERE hash = ?").get(hash) as { wallet: string; exp: number; used: number } | undefined;
    if (!row || row.used || row.exp < Date.now() || !admins().includes(row.wallet.toLowerCase())) return nf;
    d.prepare("UPDATE tickets SET used = 1 WHERE hash = ?").run(hash);
    return new Response(null, { status: 303, headers: { location: "/app/admin", "set-cookie": sessionCookie(row.wallet, isSecure(req)), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  } finally {
    g.release();
  }
}
