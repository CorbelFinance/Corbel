import { sameOrigin, session } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { store } from "@/lib/store";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/practice → the signed-in wallet's practice account (paper trades), so it follows the wallet to any device.
 * PUT /api/practice {book} → saves it (same origin, signed in, up to 256 KB). Paper only: nothing here is a real trade.
 * Kept until the user resets the account; a reset saves an empty account over it.
 */
const db = () => store("practice", "CREATE TABLE IF NOT EXISTS books (wallet TEXT PRIMARY KEY, book TEXT NOT NULL, updated INTEGER NOT NULL);");

export async function GET(req: Request) {
  const s = session(req);
  if (!s) return Response.json({ signedIn: false });
  const r = db()?.prepare("SELECT book, updated FROM books WHERE wallet = ?").get(s.address.toLowerCase()) as { book: string; updated: number } | undefined;
  return Response.json({ signedIn: true, book: r ? JSON.parse(r.book) : null, updated: r?.updated ?? null }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(req: Request) {
  const s = session(req);
  if (!s) return Response.json({ error: "Sign in to save practice to your wallet." }, { status: 401 });
  if (!sameOrigin(req)) return Response.json({ error: "Wrong origin." }, { status: 403 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const text = await req.text();
    if (text.length > 262_144) return Response.json({ error: "The practice account is too large to save." }, { status: 413 });
    const j = JSON.parse(text) as { book?: { v?: number; trades?: unknown[] } };
    if (!j.book || j.book.v !== 1 || !Array.isArray(j.book.trades) || j.book.trades.length > 2000) return Response.json({ error: "Not a practice account." }, { status: 400 });
    db()?.prepare("INSERT INTO books (wallet, book, updated) VALUES (?, ?, ?) ON CONFLICT(wallet) DO UPDATE SET book = excluded.book, updated = excluded.updated").run(s.address.toLowerCase(), JSON.stringify(j.book), Date.now());
    award(req, "paper");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not read the practice account." }, { status: 400 });
  } finally {
    g.release();
  }
}
