/**
 * The project or company behind a token: what it does, its tags, its own links, money raised and who backed it. Read
 * from a directory module on the server (COMPANY_ADAPTER: an absolute path to it), kept a week in memory. Null when
 * no module is set or the directory has no clear match.
 */
import { pathToFileURL } from "node:url";

export type Company = {
  name: string;
  line: string | null;
  about: string;
  tags: string[];
  links: { site?: string; x?: string; linkedin?: string; github?: string; docs?: string; blog?: string };
  funding: number | null;
  backers: { name: string; x?: string; lead: boolean }[];
};
type Directory = { companyOf(symbol: string, name: string): Promise<Company | null> };

const WEEK = 7 * 86_400_000;
const G = globalThis as unknown as { __corbelCompany?: Map<string, { at: number; v: Company | null }> };
const cache = (G.__corbelCompany ??= new Map());
let mod: { path: string; p: Promise<Directory | null> } | null = null;

function directory(): Promise<Directory | null> {
  const path = process.env.COMPANY_ADAPTER;
  if (!path) return Promise.resolve(null);
  if (mod?.path !== path) {
    const p = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(path).href)
      .then((m: { default?: Directory } & Directory) => m.default ?? m)
      .catch(() => null);
    mod = { path, p };
  }
  return mod.p;
}

/** The project for a token's ticker and name, or null when there is no clear match. */
export async function companyOf(symbol: string, name: string): Promise<Company | null> {
  const k = `${symbol.toUpperCase()}|${name.toLowerCase()}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < WEEK) return hit.v;
  const d = await directory();
  const v = d ? await d.companyOf(symbol, name).catch(() => null) : null;
  cache.set(k, { at: Date.now(), v });
  return v;
}
