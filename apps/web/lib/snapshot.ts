/**
 * Snapshots of the slow, shared reads (trending, stock market, pool fees) kept on disk next to the database,
 * so a restart serves the last good answer at once and refreshes it in the background instead of making the
 * first visitors wait for a full chain scan.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DIR = process.env.CORBEL_DB ? join(dirname(resolve(/*turbopackIgnore: true*/ process.env.CORBEL_DB)), "snapshots") : resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "..", "data", "snapshots");
const saved = new Map<string, number>();

export function loadSnap<T extends { at: number }>(name: string): T | null {
  try {
    const f = join(DIR, `${name}.json`);
    if (!existsSync(f)) return null;
    const v = JSON.parse(readFileSync(f, "utf8")) as T;
    saved.set(name, v.at);
    return v;
  } catch {
    return null;
  }
}

/** Writes the snapshot when it changed since the last write. Cheap to call on every request. */
export function keepSnap<T extends { at: number }>(name: string, snap: T | null) {
  if (!snap || saved.get(name) === snap.at) return;
  saved.set(name, snap.at);
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    const f = join(DIR, `${name}.json`);
    writeFileSync(`${f}.tmp`, JSON.stringify(snap));
    renameSync(`${f}.tmp`, f);
  } catch {
    // a lost snapshot only costs one slow first read
  }
}
