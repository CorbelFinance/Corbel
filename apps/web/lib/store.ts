/** Small SQLite files next to the index (node:sqlite). One connection per file per process. */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const G = globalThis as unknown as { __corbelStores?: Map<string, DatabaseSync | null> };
const stores = (G.__corbelStores ??= new Map());

function dir() {
  return process.env.CORBEL_DB ? dirname(resolve(/*turbopackIgnore: true*/ process.env.CORBEL_DB)) : resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "..", "data");
}

/** Opens (once) `<data dir>/<name>.db` and runs `schema` on first open. Null when the disk is not writable. */
export function store(name: string, schema: string): DatabaseSync | null {
  if (stores.has(name)) return stores.get(name)!;
  try {
    const f = join(dir(), `${name}.db`);
    if (!existsSync(dirname(f))) mkdirSync(dirname(f), { recursive: true });
    const d = new DatabaseSync(f);
    d.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000; ${schema}`);
    stores.set(name, d);
  } catch {
    stores.set(name, null);
  }
  return stores.get(name)!;
}
