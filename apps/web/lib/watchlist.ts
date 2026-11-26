/** Watchlist per signed-in address: tokens and addresses to keep an eye on. Address, item, label, time added. */
import { getAddress, isAddress } from "viem";
import { cleanText } from "@corbel/data/chain";
import { store } from "./store";

export type Item = { kind: "token" | "address"; value: string; label: string; added: number };
const MAX = 50;

const db = () =>
  store(
    "accounts",
    `CREATE TABLE IF NOT EXISTS watch (
       owner TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, label TEXT NOT NULL, added INTEGER NOT NULL,
       PRIMARY KEY (owner, value))`,
  );

export function listWatch(owner: string): Item[] | null {
  const d = db();
  if (!d) return null;
  return (d.prepare("SELECT kind, value, label, added FROM watch WHERE owner = ? ORDER BY added DESC").all(owner.toLowerCase()) as Record<string, unknown>[]).map((r) => ({
    kind: r.kind === "address" ? "address" : "token",
    value: String(r.value),
    label: String(r.label),
    added: Number(r.added),
  }));
}

export function addWatch(owner: string, kind: string, value: string, label: string): string | null {
  const d = db();
  if (!d) return "Storage is not available.";
  if (kind !== "token" && kind !== "address") return "Pick token or address.";
  if (!isAddress(value)) return "Paste a 0x address.";
  const n = (d.prepare("SELECT COUNT(*) n FROM watch WHERE owner = ?").get(owner.toLowerCase()) as { n: number }).n;
  if (n >= MAX) return "The list is full. Remove something first.";
  const clean = (cleanText(label, 40) ?? "").slice(0, 40);
  d.prepare("INSERT OR REPLACE INTO watch (owner, kind, value, label, added) VALUES (?, ?, ?, ?, ?)").run(owner.toLowerCase(), kind, getAddress(value), clean, Math.floor(Date.now() / 60_000) * 60);
  return null;
}

export function removeWatch(owner: string, value: string) {
  db()?.prepare("DELETE FROM watch WHERE owner = ? AND lower(value) = ?").run(owner.toLowerCase(), value.toLowerCase());
}

/** Every distinct token on anyone's watchlist, most watched first, with how many wallets follow it. */
export function watchedTokens(limit = 60): { token: string; label: string; watchers: number }[] {
  const d = db();
  if (!d) return [];
  return d.prepare("SELECT value AS token, MAX(label) AS label, COUNT(*) AS watchers FROM watch WHERE kind = 'token' GROUP BY value ORDER BY watchers DESC LIMIT ?").all(limit) as { token: string; label: string; watchers: number }[];
}

/** The tokens one wallet watches (for its alert feed). */
export function watchedBy(owner: string): string[] {
  return (listWatch(owner) ?? []).filter((i) => i.kind === "token").map((i) => i.value.toLowerCase());
}

/** Every distinct wallet on anyone's watchlist (for the drain alarm). */
export function watchedAddresses(limit = 60, owners?: (owner: string) => boolean | number | null): string[] {
  const d = db();
  if (!d) return [];
  if (!owners) return (d.prepare("SELECT value FROM watch WHERE kind = 'address' GROUP BY value ORDER BY COUNT(*) DESC LIMIT ?").all(limit) as { value: string }[]).map((r) => r.value.toLowerCase());
  // only wallets watched by at least one owner who passes (the drain alarm for holders)
  // owners() answers false (none), true or null (no limit), or how many of the owner's wallets count, oldest first
  const rows = d.prepare("SELECT value, owner FROM watch WHERE kind = 'address' ORDER BY rowid").all() as { value: string; owner: string }[];
  const n = new Map<string, number>();
  const taken = new Map<string, number>();
  for (const r of rows) {
    const q = owners(r.owner);
    if (q === false || q === 0) continue;
    const k = (taken.get(r.owner) ?? 0) + 1;
    if (typeof q === "number" && k > q) continue;
    taken.set(r.owner, k);
    n.set(r.value.toLowerCase(), (n.get(r.value.toLowerCase()) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v]) => v);
}

/** The wallets one owner watches. */
export function walletsWatchedBy(owner: string): string[] {
  return (listWatch(owner) ?? []).filter((i) => i.kind === "address").map((i) => i.value.toLowerCase());
}

/** Who watches this token or wallet, with each owner's position in their own list (oldest first), for alert limits. */
export function watchersOf(value: string): { owner: string; rank: number }[] {
  const d = db();
  if (!d) return [];
  const owners = d.prepare("SELECT owner, kind FROM watch WHERE lower(value) = ?").all(value.toLowerCase()) as { owner: string; kind: string }[];
  return owners.map((o) => {
    const r = d.prepare("SELECT COUNT(*) AS n FROM watch WHERE owner = ? AND kind = ? AND added < (SELECT added FROM watch WHERE owner = ? AND lower(value) = ?)").get(o.owner, o.kind, o.owner, value.toLowerCase()) as { n: number };
    return { owner: o.owner, rank: r.n };
  });
}
