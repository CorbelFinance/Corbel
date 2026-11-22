/** Uploaded input files (a picture or a video a top holder's model starts from), kept in memory for an hour, tied to
 * the wallet that sent them. Only the provider's file object is kept, never the file. */
import { createHash } from "node:crypto";
import type { UpFile } from "./mediaUpstream";

type Up = { file: UpFile; who: string; at: number; kind: "image" | "video" };
const G = globalThis as unknown as { __corbelUploads?: Map<string, Up> };
const uploads = (G.__corbelUploads ??= new Map());
const who = (address: string) => createHash("sha256").update(`corbel-media:${address.toLowerCase()}`).digest("hex").slice(0, 32);

export function keepUpload(id: string, address: string, file: UpFile, kind: "image" | "video") {
  if (uploads.size > 2000) for (const [k, v] of uploads) if (Date.now() - v.at > 3600_000) uploads.delete(k);
  uploads.set(id, { file, who: who(address), at: Date.now(), kind });
}

/** The provider file behind an upload id, when it belongs to this wallet and is under an hour old. */
export function takeUpload(id: string, address: string): { file: UpFile; kind: "image" | "video" } | null {
  const u = uploads.get(id);
  if (!u || u.who !== who(address) || Date.now() - u.at > 3600_000) return null;
  return { file: u.file, kind: u.kind };
}
