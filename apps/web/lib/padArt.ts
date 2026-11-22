/**
 * Launchpad data the chain does not carry: each token's artwork, and how far its bonding curve is toward graduation.
 * The busiest curve launchpad publishes both in its public launch list. Every 10 minutes the server reads the newest
 * launches (a few pages) and the tokens still on a curve, the same way as every other fetch.
 * Artwork links are kept on disk next to the logo cache so the map grows across restarts.
 */
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Where logos are cached; the artwork map lives beside them. Same place /api/logo uses. */
export const LOGO_DIR = process.env.CORBEL_DB ? join(dirname(resolve(/*turbopackIgnore: true*/ process.env.CORBEL_DB)), "logos") : resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "..", "data", "logos");

const API = `${process.env.PAD_API_URL ?? ""}`;
const EVERY = 2 * 60_000; // new launches get their picture within minutes
const PAGES = 8;
type Item = { address: string; symbol?: string; name?: string; stage?: string; artwork?: string | null; progress?: number | null };
export type PadCurve = { token: string; symbol: string; name: string; progress: number };
const G = globalThis as unknown as { __corbelPadArt?: { map: Map<string, string>; curve: PadCurve[]; at: number; busy: boolean; file: string | null } };
const box = (G.__corbelPadArt ??= { map: new Map(), curve: [], at: 0, busy: false, file: null });

const https = (u: string) => (u.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${u.slice(7).replace(/^ipfs\//, "")}` : u);

function load(dir: string) {
  if (box.file) return;
  box.file = join(dir, "pad-art.json");
  try {
    if (existsSync(box.file)) for (const [k, v] of Object.entries(JSON.parse(readFileSync(box.file, "utf8")) as Record<string, string>)) box.map.set(k, v);
  } catch {
    // a broken file starts the map again
  }
}

async function page(q: string): Promise<{ items: Item[]; next: string | null }> {
  const r = await fetch(`${API}?${q}`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!r?.ok) return { items: [], next: null };
  const j = (await r.json().catch(() => null)) as { items?: Item[]; nextCursor?: string | null } | null;
  return { items: j?.items ?? [], next: j?.nextCursor ?? null };
}

const fresh = new Set<string>();
function keep(items: Item[]) {
  for (const x of items) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(x.address) || !x.artwork) continue;
    const u = https(x.artwork);
    const k = x.address.toLowerCase();
    if (u.startsWith("https://")) {
      if (!box.map.has(k)) fresh.add(k);
      box.map.set(k, u);
    }
  }
}

/** A token that just got its artwork may carry a "no picture" mark from a minute ago: clear it so the next ask fetches. */
function unmiss(dir: string) {
  if (!fresh.size) return;
  try {
    for (const f of readdirSync(dir)) {
      const m = f.match(/^(0x[0-9a-f]{40})\.(none|miss\d*)$/);
      if (m && fresh.has(m[1]!)) unlinkSync(join(dir, f));
    }
  } catch {
    // the mark expires on its own
  }
  fresh.clear();
}

async function refresh() {
  // the newest launches, page after page
  let cursor: string | null = null;
  const pages = box.map.size ? 2 : PAGES; // the first run fills the map; after that, the newest pages are enough
  for (let i = 0; i < pages; i++) {
    const p = await page(`sort=newest&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    keep(p.items);
    if (!p.next) break;
    cursor = p.next;
  }
  // the tokens still on a curve, with how far each is toward graduation
  const c = await page("stage=curve&limit=100");
  keep(c.items);
  if (c.items.length)
    box.curve = c.items
      .filter((x) => x.stage === "curve" && typeof x.progress === "number")
      .map((x) => ({ token: x.address.toLowerCase(), symbol: x.symbol ?? "?", name: x.name ?? "", progress: Math.max(0, Math.min(1, x.progress!)) }))
      .sort((a, b) => b.progress - a.progress);
  if (box.file) {
    unmiss(join(box.file, ".."));
    try {
      writeFileSync(box.file, JSON.stringify(Object.fromEntries(box.map)));
    } catch {
      // the map still serves from memory
    }
  }
}

function tick(dir: string) {
  load(dir);
  if (!box.busy && Date.now() - box.at > EVERY) {
    box.busy = true;
    box.at = Date.now();
    void refresh()
      .catch(() => undefined)
      .finally(() => (box.busy = false));
  }
}

/** Artwork link for a launchpad token, if its launchpad published one. Starts a refresh when the map is stale. */
export function padArt(dir: string, token: string): string | null {
  tick(dir);
  return box.map.get(token) ?? null;
}

/** Tokens on the launchpad's curve, furthest toward graduation first (progress 0..1, from the launchpad itself). */
export function padCurve(dir: string): PadCurve[] {
  tick(dir);
  return box.curve;
}

/** Waits for a running refresh (up to `ms`), so a cold server does not answer "no logo" at once. */
export async function padArtReady(ms = 8000) {
  const t0 = Date.now();
  while (box.busy && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 200));
}
