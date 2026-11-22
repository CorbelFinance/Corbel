/**
 * API keys for the public read-only endpoints, for holders only (after the first version was
 * pulled: free wallets could mint keys without end). A key may be made by a wallet at Light level or above; it lifts the
 * per-minute limits by API_KEYS.boost, has its own daily cap, and never lifts the limit of the visitor's own address
 * above API_KEYS.boost times the base (guard.ts keeps that bucket too), so many keys from one place gain nothing.
 * Only a SHA-256 of the key is stored, never the key itself: it is shown once, when it is made.
 */
import { createHash, randomBytes } from "node:crypto";
import { store } from "./store";

export const API_KEYS = { maxKeys: 2, boost: 5, perDay: 5000 } as const;

const db = () =>
  store(
    "apikeys",
    `CREATE TABLE IF NOT EXISTS keys (hash TEXT PRIMARY KEY, owner TEXT NOT NULL, label TEXT NOT NULL, tail TEXT NOT NULL,
       created INTEGER NOT NULL, revoked INTEGER, last INTEGER, day TEXT, uses INTEGER NOT NULL DEFAULT 0);
     CREATE INDEX IF NOT EXISTS keys_owner ON keys (owner);`,
  );

const hashOf = (key: string) => createHash("sha256").update(key).digest("hex");
const today = () => new Date().toISOString().slice(0, 10);

export type KeyRow = { id: string; label: string; tail: string; created: number; last: number | null; usesToday: number };

export function listKeys(owner: string): KeyRow[] {
  const rows = (db()?.prepare("SELECT hash, label, tail, created, last, day, uses FROM keys WHERE owner = ? AND revoked IS NULL ORDER BY created").all(owner.toLowerCase()) ?? []) as {
    hash: string; label: string; tail: string; created: number; last: number | null; day: string | null; uses: number;
  }[];
  return rows.map((r) => ({ id: r.hash.slice(0, 12), label: r.label, tail: r.tail, created: r.created, last: r.last, usesToday: r.day === today() ? r.uses : 0 }));
}

/** Makes a key for this wallet (the caller checks the holder level). Returns the key, shown once, or an error. */
export function createKey(owner: string, label: string): { key: string } | { error: string } {
  const d = db();
  if (!d) return { error: "Keys are not available right now." };
  if (listKeys(owner).length >= API_KEYS.maxKeys) return { error: `A wallet can hold ${API_KEYS.maxKeys} keys. Revoke one first.` };
  const key = `ck_${randomBytes(24).toString("hex")}`;
  const name = label.replace(/[^\w .-]/g, "").trim().slice(0, 32) || "My key";
  d.prepare("INSERT INTO keys (hash, owner, label, tail, created) VALUES (?, ?, ?, ?, ?)").run(hashOf(key), owner.toLowerCase(), name, key.slice(-4), Date.now());
  return { key };
}

export function revokeKey(owner: string, id: string): boolean {
  if (!/^[0-9a-f]{12}$/.test(id)) return false;
  const r = db()?.prepare("UPDATE keys SET revoked = ? WHERE owner = ? AND substr(hash, 1, 12) = ? AND revoked IS NULL").run(Date.now(), owner.toLowerCase(), id);
  return !!r && Number(r.changes) > 0;
}

/**
 * The key a request carries (header x-api-key), if it is live and under its daily cap: its hash, "over" when the
 * daily cap is spent, or null for no key. Counts the use.
 */
export function keyOf(req: Request): string | "over" | null {
  const key = req.headers.get("x-api-key")?.trim();
  if (!key || !/^ck_[0-9a-f]{48}$/.test(key)) return null;
  const d = db();
  if (!d) return null;
  const h = hashOf(key);
  const row = d.prepare("SELECT day, uses FROM keys WHERE hash = ? AND revoked IS NULL").get(h) as { day: string | null; uses: number } | undefined;
  if (!row) return null;
  const day = today();
  const uses = row.day === day ? row.uses : 0;
  if (uses >= API_KEYS.perDay) return "over";
  d.prepare("UPDATE keys SET day = ?, uses = ?, last = ? WHERE hash = ?").run(day, uses + 1, Date.now(), h);
  return h;
}
