/**
 * An X account's latest posts, from a reader module on the server (SOCIAL_ADAPTER: an absolute path to it).
 * Cached six hours per handle. Null when no reader is set or the account does not answer.
 */
import { pathToFileURL } from "node:url";

export type XRead = { at: number; texts: string[]; followers: number | null; posts: number | null; days: number | null };
type Reader = { xPosts(handle: string, n: number): Promise<XRead | null> };

let cached: { path: string; p: Promise<Reader | null> } | null = null;
const posts = new Map<string, XRead>();

function reader(): Promise<Reader | null> {
  const path = process.env.SOCIAL_ADAPTER;
  if (!path) return Promise.resolve(null);
  if (cached?.path !== path) {
    const p = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(path).href)
      .then((m: { default?: Reader } & Reader) => m.default ?? m)
      .catch(() => null);
    cached = { path, p };
  }
  return cached.p;
}

export async function xPosts(handle: string, n = 20): Promise<XRead | null> {
  const key = `${handle.toLowerCase()}:${n}`;
  const hit = posts.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit;
  const r = await reader();
  const got = r ? await r.xPosts(handle, n).catch(() => null) : null;
  if (got) posts.set(key, got);
  return got;
}
