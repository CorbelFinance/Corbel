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
