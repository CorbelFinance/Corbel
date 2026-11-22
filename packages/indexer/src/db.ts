/** SQLite store (node:sqlite, built into Node ≥ 22.5). One file, safe to delete and rebuild. */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Repo root = nearest folder with pnpm-workspace.yaml, so the indexer and the web app share one file. */
function repoRoot(from = process.cwd()): string {
  let d = resolve(/*turbopackIgnore: true*/ from);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(d, "pnpm-workspace.yaml"))) return d;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return resolve(/*turbopackIgnore: true*/ from);
}

export const DEFAULT_DB = resolve(/*turbopackIgnore: true*/ process.env.CORBEL_DB ?? join(repoRoot(), "data", "corbel.db"));

export function openDb(path = DEFAULT_DB, readonly = false) {
  if (!readonly) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, readonly ? { readOnly: true } : {});
  if (readonly) db.exec("PRAGMA busy_timeout = 8000"); // the indexer may be mid-write
  if (!readonly) {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 8000;
      CREATE TABLE IF NOT EXISTS pools (
        id TEXT PRIMARY KEY,           -- v2: pair address, v4: pool id
        kind TEXT NOT NULL,            -- 'v2' | 'v4'
        token0 TEXT NOT NULL,
        token1 TEXT NOT NULL,
        fee INTEGER, tick_spacing INTEGER, hooks TEXT,
        block INTEGER NOT NULL,
        tx TEXT NOT NULL,
        launcher TEXT,                 -- tx.from of the creating transaction
        base_reserve TEXT              -- v2 only: base-side reserve at the last refresh
      );
      CREATE INDEX IF NOT EXISTS pools_t0 ON pools(token0);
      CREATE INDEX IF NOT EXISTS pools_t1 ON pools(token1);
      CREATE INDEX IF NOT EXISTS pools_launcher ON pools(launcher);
      CREATE TABLE IF NOT EXISTS tokens (
        address TEXT PRIMARY KEY,
        symbol TEXT, name TEXT, decimals INTEGER,
        first_block INTEGER
      );
      CREATE INDEX IF NOT EXISTS tokens_symbol ON tokens(symbol COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS progress (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    `);
    // added later: via = "aa" (ERC-4337 user op, launcher = op sender) or "eoa"; liveness of each pool (1 = drained or dust, 0 = trading, null = not known), and when it was last read
    // pad = the contract the creating transaction went through (a launchpad's factory, a position manager), lowercase
    // funded = 1 once the pool was seen with liquidity at its price. dead = 1 only for a funded pool found dry later:
    // a pool that never had liquidity is not drained, only empty (dead stays null)
    for (const col of ["dead INTEGER", "checked_at INTEGER", "via TEXT", "pad TEXT", "funded INTEGER"]) {
      try {
        db.exec(`ALTER TABLE pools ADD COLUMN ${col}`);
      } catch {
        /* already there */
      }
    }
    db.exec(`CREATE INDEX IF NOT EXISTS pools_block ON pools(block)`);
    // one-time move to the funded rule: a pool seen alive was funded; old "dead" marks did not know whether the pool was
    // ever funded (most were pairs nobody filled), so they are cleared and found again by the refresh
    try {
      const done = db.prepare(`SELECT value FROM progress WHERE key = 'liveness_rule'`).get() as { value: number } | undefined;
      if (!done || done.value < 2) {
        db.exec(`BEGIN; UPDATE pools SET funded = 1 WHERE dead = 0; UPDATE pools SET dead = NULL, checked_at = NULL WHERE dead = 1 AND funded IS NULL; INSERT OR REPLACE INTO progress (key, value) VALUES ('liveness_rule', 2); COMMIT;`);
      }
    } catch {
      /* progress table is created above; a failed move is retried on the next open */
    }
    db.exec(`CREATE INDEX IF NOT EXISTS pools_pad ON pools(pad)`);
  }
  return db;
}

export type Db = ReturnType<typeof openDb>;
