/**
 * Decision log of the mandate contract: every Break it run that actually executed records what the real
 * CorbelMandate decided (traded or slashed, under which rule) at which block. Nothing about the visitor is stored:
 * no IP, no agent string, no session; the time is rounded down to the minute. Kept to the last 500 runs.
 */
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
};

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
  const ins = d.prepare("INSERT INTO decisions (minute, scenario, block, rule, traded, slashed, strikes, frozen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const a of r.attempts) ins.run(minute, r.scenario, r.block, a.rule, a.traded ? 1 : 0, a.slashed, a.strikes, a.frozen ? 1 : 0);
  d.exec("DELETE FROM decisions WHERE id <= (SELECT MAX(id) - 500 FROM decisions)");
}

export function readLog(limit = 60): { entries: LogEntry[]; totals: { runs: number; traded: number; stopped: number; frozen: number } } | null {
  const d = db();
  if (!d) return null;
  const entries = (d.prepare("SELECT * FROM decisions ORDER BY id DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map((x) => ({
    id: Number(x.id),
    minute: Number(x.minute),
    scenario: String(x.scenario),
    block: String(x.block),
    rule: String(x.rule),
    traded: x.traded === 1,
    slashed: String(x.slashed),
    strikes: Number(x.strikes),
    frozen: x.frozen === 1,
  }));
  const t = d.prepare("SELECT COUNT(*) n, SUM(traded) tr, SUM(frozen) fr FROM decisions").get() as { n: number; tr: number | null; fr: number | null };
  return { entries, totals: { runs: t.n, traded: t.tr ?? 0, stopped: t.n - (t.tr ?? 0), frozen: t.fr ?? 0 } };
}
