/**
 * Decision log of the mandate contract: every Break it run that actually executed records what the real
 * CorbelMandate decided (traded or slashed, under which rule) at which block. Nothing about the visitor is stored:
 * no IP, no agent string, no session; the time is rounded down to the minute. Kept to the last 500 runs.
 * Every entry carries the hash of the one before (sha256 over the previous hash and its own fields), so an entry
 * changed or removed in the middle breaks the chain from there on, and verifyChain() says where.
 */
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { LabResult } from "@corbel/data/chain";

export type LogEntry = {
  id: number;
  minute: number;
  scenario: string;
  block: string;
  rule: string;
  traded: boolean;
  slashed: string;
  strikes: number;
  frozen: boolean;
  /** hash of the entry before; "" for the first one ever */
  prev: string | null;
  hash: string | null;
};

type Fields = { minute: number; scenario: string; block: string; rule: string; traded: boolean; slashed: string; strikes: number; frozen: boolean };
/** The entry's hash: sha256 of the previous hash and the entry's fields in a fixed order. */
export function entryHash(prev: string, e: Fields): string {
  const body = [prev, e.minute, e.scenario, e.block, e.rule, e.traded ? 1 : 0, e.slashed, e.strikes, e.frozen ? 1 : 0].join("|");
  return createHash("sha256").update(body).digest("hex");
}

/** Walks entries oldest first; the first kept entry's `prev` is trusted (older ones are pruned). */
export function verifyChain(rows: (Fields & { id: number; prev: string | null; hash: string | null })[]): { ok: boolean; checked: number; brokenAt: number | null; head: string | null } {
  const chained = rows.filter((r) => r.hash);
  let last: string | null = null;
  for (const r of chained) {
    if (last !== null && r.prev !== last) return { ok: false, checked: chained.length, brokenAt: r.id, head: null };
    if (entryHash(r.prev ?? "", r) !== r.hash) return { ok: false, checked: chained.length, brokenAt: r.id, head: null };
    last = r.hash;
  }
  return { ok: true, checked: chained.length, brokenAt: null, head: last };
}

const G = globalThis as unknown as { __corbelLab?: DatabaseSync | null };

function file() {
  const base = process.env.CORBEL_DB ? dirname(resolve(/*turbopackIgnore: true*/ process.env.CORBEL_DB)) : resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "..", "data");
  return join(base, "lab.db");
}

function db(): DatabaseSync | null {
  if (G.__corbelLab !== undefined) return G.__corbelLab;
  try {
    const f = file();
    if (!existsSync(dirname(f))) mkdirSync(dirname(f), { recursive: true });
    const d = new DatabaseSync(f);
    d.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000;
      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, minute INTEGER NOT NULL, scenario TEXT NOT NULL, block TEXT NOT NULL,
        rule TEXT NOT NULL, traded INTEGER NOT NULL, slashed TEXT NOT NULL, strikes INTEGER NOT NULL, frozen INTEGER NOT NULL)`);
    // the hash chain came later: older files get the two columns, their old rows stay unchained
    const cols = (d.prepare("PRAGMA table_info(decisions)").all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes("prev")) d.exec("ALTER TABLE decisions ADD COLUMN prev TEXT");
    if (!cols.includes("hash")) d.exec("ALTER TABLE decisions ADD COLUMN hash TEXT");
    G.__corbelLab = d;
  } catch {
    G.__corbelLab = null;
  }
  return G.__corbelLab;
}

export function recordRun(r: LabResult) {
  const d = db();
  if (!d) return;
  const minute = Math.floor(Date.now() / 60_000) * 60;
  const ins = d.prepare("INSERT INTO decisions (minute, scenario, block, rule, traded, slashed, strikes, frozen, prev, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  let prev = ((d.prepare("SELECT hash FROM decisions WHERE hash IS NOT NULL ORDER BY id DESC LIMIT 1").get() as { hash: string } | undefined)?.hash) ?? "";
  for (const a of r.attempts) {
    const e = { minute, scenario: r.scenario, block: r.block, rule: a.rule, traded: a.traded, slashed: a.slashed, strikes: a.strikes, frozen: a.frozen };
    const hash = entryHash(prev, e);
    ins.run(minute, r.scenario, r.block, a.rule, a.traded ? 1 : 0, a.slashed, a.strikes, a.frozen ? 1 : 0, prev, hash);
    prev = hash;
  }
  d.exec("DELETE FROM decisions WHERE id <= (SELECT MAX(id) - 500 FROM decisions)");
}

const row = (x: Record<string, unknown>): LogEntry => ({
  id: Number(x.id),
  minute: Number(x.minute),
  scenario: String(x.scenario),
  block: String(x.block),
  rule: String(x.rule),
  traded: x.traded === 1,
  slashed: String(x.slashed),
  strikes: Number(x.strikes),
  frozen: x.frozen === 1,
  prev: x.prev == null ? null : String(x.prev),
  hash: x.hash == null ? null : String(x.hash),
});

export function readLog(limit = 60): { entries: LogEntry[]; totals: { runs: number; traded: number; stopped: number; frozen: number }; chain: ReturnType<typeof verifyChain> } | null {
  const d = db();
  if (!d) return null;
  const entries = (d.prepare("SELECT * FROM decisions ORDER BY id DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map(row);
  const chain = verifyChain((d.prepare("SELECT * FROM decisions ORDER BY id ASC").all() as Record<string, unknown>[]).map(row));
  const t = d.prepare("SELECT COUNT(*) n, SUM(traded) tr, SUM(frozen) fr FROM decisions").get() as { n: number; tr: number | null; fr: number | null };
  return { entries, chain, totals: { runs: t.n, traded: t.tr ?? 0, stopped: t.n - (t.tr ?? 0), frozen: t.fr ?? 0 } };
}
