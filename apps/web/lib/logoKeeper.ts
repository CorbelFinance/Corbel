/**
 * Logo keeper: a loop inside the web server that never stops looking for pictures. Every 5 minutes it collects every
 * token the site shows (trending, stocks, radar, launchpads, pools), and for each one that still has no real logo and
 * whose "no picture" mark is older than 10 minutes, clears the mark and asks /api/logo again, a few at a time. Pictures
 * that appear later (a launchpad adding artwork, an IPFS gateway coming back) reach the site without anyone asking.
 */
import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { LOGO_DIR } from "./padArt";

const EVERY = 5 * 60_000;
const STALE = 10 * 60_000;
const G = globalThis as unknown as { __corbelKeeper?: { at: number; busy: boolean } };
const box = (G.__corbelKeeper ??= { at: 0, busy: false });
const base = () => `http://127.0.0.1:${process.env.PORT ?? "4663"}`;

async function tokens(): Promise<string[]> {
  const get = (p: string) => fetch(base() + p, { signal: AbortSignal.timeout(60_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [tr, rd, pads, earn] = await Promise.all([get("/api/trending"), get("/api/radar"), get("/api/pads"), get("/api/earn")]);
  const out = new Set<string>();
  const add = (a?: string) => a && /^0x[0-9a-fA-F]{40}$/.test(a) && out.add(a.toLowerCase());
  for (const r of tr?.rows ?? []) add(r.token);
  for (const s of tr?.stocks ?? []) add(s.token);
  for (const r of rd?.rows ?? []) add(r.token);
  for (const p of pads?.pads ?? []) for (const t of p.tokens ?? []) add(t.token);
  for (const r of earn?.rows ?? []) add(r.token);
  return [...out];
}

async function sweep() {
  const list = await tokens();
  let files: string[] = [];
  try {
    files = readdirSync(LOGO_DIR);
  } catch {
    return;
  }
  const now = Date.now();
  const todo = list.filter((a) => !existsSync(join(LOGO_DIR, `${a}.img`)));
  for (const a of todo) {
    for (const f of files) {
      if (!f.startsWith(a + ".") || f.endsWith(".img")) continue;
      try {
        if (now - statSync(join(LOGO_DIR, f)).mtimeMs > STALE) unlinkSync(join(LOGO_DIR, f));
      } catch {
        // gone already
      }
    }
  }
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map((a) => fetch(`${base()}/api/logo?a=${a}&keeper=1`, { signal: AbortSignal.timeout(60_000) }).catch(() => null)));
  }
}

/** Starts a sweep when the last one is older than 15 minutes. Cheap to call often. */
export function keepLogos() {
  if (box.busy || Date.now() - box.at < EVERY) return;
  box.busy = true;
  box.at = Date.now();
  void sweep()
    .catch(() => undefined)
    .finally(() => (box.busy = false));
}
