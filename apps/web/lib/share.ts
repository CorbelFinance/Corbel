import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Read-only share links: a token that names an address and an expiry, encrypted and authenticated with AES-256-GCM,
 * so nobody can read the address out of the link, forge one or extend it. The server decrypts it, reads the portfolio
 * for the viewer and leaves the address out. Without SESSION_SECRET, links die when the server restarts.
 *
 * Token: base64url( 12-byte nonce | encrypted (20-byte address | 6-byte expiry) | 16-byte tag ).
 */
const G = globalThis as unknown as { __corbelShareKey?: Buffer };
const key = (G.__corbelShareKey ??= createHash("sha256")
  .update("corbel-share-v2:")
  .update(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32 ? process.env.SESSION_SECRET : randomBytes(32).toString("hex"))
  .digest());
const AAD = Buffer.from("share:v2");

export const SHARE_HOURS = [1, 24, 168] as const;

export function signShare(address: string, hours: number): { t: string; exp: number } {
  const exp = Math.floor(Date.now() / 1000) + Math.round(hours * 3600);
  const plain = Buffer.alloc(26);
  Buffer.from(address.toLowerCase().slice(2), "hex").copy(plain, 0);
  plain.writeUIntBE(exp, 20, 6);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(AAD);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return { t: Buffer.concat([iv, body, c.getAuthTag()]).toString("base64url"), exp };
}

export function readShare(t: string): { address: `0x${string}`; exp: number } | null {
  if (typeof t !== "string" || t.length > 200 || !/^[A-Za-z0-9_-]+$/.test(t)) return null;
  const raw = Buffer.from(t, "base64url");
  if (raw.length !== 12 + 26 + 16) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12), { authTagLength: 16 });
    d.setAAD(AAD);
    d.setAuthTag(raw.subarray(38));
    const plain = Buffer.concat([d.update(raw.subarray(12, 38)), d.final()]);
    const exp = plain.readUIntBE(20, 6);
    if (!(exp * 1000 > Date.now())) return null;
    return { address: `0x${plain.subarray(0, 20).toString("hex")}`, exp };
  } catch {
    // a changed byte anywhere fails the tag: not valid
    return null;
  }
}
