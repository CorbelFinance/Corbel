/**
 * Support: visitors write to the team from the terminal. A message is kept with the page it came from and an optional
 * contact the visitor typed; nothing else about the visitor (no IP, no wallet) is stored next to it. The owner reads
 * and closes them in the panel. Rate: SUPPORT_PER_HOUR per visitor (a salted hash of the IP, in memory only).
 */
import { createHash } from "node:crypto";
import { store } from "./store";

export const SUPPORT = { perHour: 4, maxChars: 1200, maxContact: 80 } as const;

const db = () =>
  store(
    "support",
    "CREATE TABLE IF NOT EXISTS msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, page TEXT NOT NULL, text TEXT NOT NULL, contact TEXT, done INTEGER NOT NULL DEFAULT 0);",
  );

const G = globalThis as unknown as { __corbelSupport?: { hits: Map<string, number[]>; salt: string } };
const box = (G.__corbelSupport ??= { hits: new Map<string, number[]>(), salt: createHash("sha256").update(String(Math.random()) + Date.now()).digest("hex") });

const visitor = (req: Request) => {
  const name = process.env.CLIENT_IP_HEADER;
  const ip = (name && req.headers.get(name)?.split(",")[0]?.trim()) || "local";
  return createHash("sha256").update(box.salt + ip).digest("hex").slice(0, 16);
};

/** Stores one message. Returns an error to show, or null. */
export function addMessage(req: Request, input: { text?: unknown; contact?: unknown; page?: unknown }): string | null {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (text.length < 5) return "Write a few words so we can help.";
  if (text.length > SUPPORT.maxChars) return `At most ${SUPPORT.maxChars} characters.`;
  const contact = typeof input.contact === "string" ? input.contact.trim().slice(0, SUPPORT.maxContact) : "";
  const page = typeof input.page === "string" && /^\/[\w\-./?=&%]{0,120}$/.test(input.page) ? input.page : "/";
  const now = Date.now();
  const v = visitor(req);
  const recent = (box.hits.get(v) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= SUPPORT.perHour) return "That is enough messages for an hour. We read every one; please wait a little.";
  recent.push(now);
  box.hits.set(v, recent);
  if (box.hits.size > 5000) for (const [k, ts] of box.hits) if (!ts.some((t) => now - t < 3_600_000)) box.hits.delete(k);
  const d = db();
  if (!d) return "Support is not available right now. Write to us in Telegram.";
  d.prepare("INSERT INTO msgs (at, page, text, contact) VALUES (?, ?, ?, ?)").run(now, page, text, contact || null);
  return null;
}

export type Msg = { id: number; at: number; page: string; text: string; contact: string | null; done: boolean };

export function listMessages(limit = 200): { open: number; rows: Msg[] } {
  const d = db();
  if (!d) return { open: 0, rows: [] };
  const rows = (d.prepare("SELECT id, at, page, text, contact, done FROM msgs ORDER BY done ASC, at DESC LIMIT ?").all(limit) as { id: number; at: number; page: string; text: string; contact: string | null; done: number }[]).map((r) => ({ ...r, done: !!r.done }));
  const open = (d.prepare("SELECT COUNT(*) AS n FROM msgs WHERE done = 0").get() as { n: number }).n;
  return { open, rows };
}

export function setDone(id: number, done: boolean) {
  db()?.prepare("UPDATE msgs SET done = ? WHERE id = ?").run(done ? 1 : 0, id);
}
