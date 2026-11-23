/**
 * Webhooks: a holder's server gets a POST when a token or wallet on its watchlist changes for the worse (the watch
 * engine's events). One URL per wallet, https on port 443 to a public host only (publicUrl), no redirects followed.
 * Each call carries x-corbel-signature = hex HMAC-SHA256 of the raw body with the wallet's secret, shown once when the
 * hook is set, and x-corbel-event = the event id. A hook that fails 20 times in a row is switched off.
 */
import { createHmac, randomBytes } from "node:crypto";
import { publicUrl } from "./safeFetch";
import { store } from "./store";
import { tierOf } from "./tiers";
import { onWatchEvent, type WatchEvent } from "./watchEngine";
import { watchersOf } from "./watchlist";

const MAX_FAILS = 20;
const db = () => store("webhooks", "CREATE TABLE IF NOT EXISTS hooks (owner TEXT PRIMARY KEY, url TEXT NOT NULL, secret TEXT NOT NULL, created INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, last INTEGER, status INTEGER);");

export const sign = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");

export function setHook(owner: string, url: string): { secret: string } | { error: string } {
  const u = publicUrl(url);
  if (!u) return { error: "Give an https URL on a public host (port 443)." };
  if (!tierOf(owner)) return { error: "Webhooks are for $CORBEL holders, from the Light tier up." };
  const secret = randomBytes(24).toString("hex");
  db()?.prepare("INSERT INTO hooks (owner, url, secret, created) VALUES (?, ?, ?, ?) ON CONFLICT(owner) DO UPDATE SET url = excluded.url, secret = excluded.secret, created = excluded.created, fails = 0, status = NULL").run(owner.toLowerCase(), u.toString(), secret, Date.now());
  return { secret };
}
export const hookOf = (owner: string) => (db()?.prepare("SELECT url, created, fails, last, status FROM hooks WHERE owner = ?").get(owner.toLowerCase()) as { url: string; created: number; fails: number; last: number | null; status: number | null } | undefined) ?? null;
export const removeHook = (owner: string) => void db()?.prepare("DELETE FROM hooks WHERE owner = ?").run(owner.toLowerCase());

async function post(owner: string, e: WatchEvent) {
  const h = db()?.prepare("SELECT url, secret, fails FROM hooks WHERE owner = ?").get(owner) as { url: string; secret: string; fails: number } | undefined;
  if (!h || h.fails >= MAX_FAILS || !publicUrl(h.url)) return;
  const body = JSON.stringify({ id: e.id, kind: e.kind, token: e.token, symbol: e.symbol, text: e.text, at: new Date(e.at).toISOString() });
  let status = 0;
  try {
    const r = await fetch(h.url, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", "x-corbel-event": String(e.id), "x-corbel-signature": sign(h.secret, body) }, body, signal: AbortSignal.timeout(8_000) });
    status = r.status;
  } catch {
    status = 0;
  }
  const ok = status >= 200 && status < 300;
  db()?.prepare("UPDATE hooks SET fails = ?, last = ?, status = ? WHERE owner = ?").run(ok ? 0 : h.fails + 1, Date.now(), status, owner);
}

const G = globalThis as unknown as { __corbelHooks?: boolean };
/** Subscribes the webhook sender to the watch engine, once per process. */
export function startWebhooks() {
  if (G.__corbelHooks) return;
  G.__corbelHooks = true;
  onWatchEvent((e) => {
    for (const w of watchersOf(e.token)) void post(w.owner, e);
  });
}
