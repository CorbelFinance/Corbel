import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Read-only share links: a token that names an address and an expiry, signed with HMAC so nobody can forge or
 * extend one. The address never appears in the link or reaches the viewer's browser: the server reads the
 * portfolio for the viewer and leaves the address out. Without SESSION_SECRET, links die when the server restarts.
 */
const G = globalThis as unknown as { __corbelShare?: Buffer };
const secret = (G.__corbelShare ??= process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32 ? Buffer.from(process.env.SESSION_SECRET) : randomBytes(32));
const mac = (payload: string) => createHmac("sha256", secret).update(`share:${payload}`).digest().subarray(0, 18).toString("base64url");

export const SHARE_HOURS = [1, 24, 168] as const;

export function signShare(address: string, hours: number): { t: string; exp: number } {
  const exp = Math.floor(Date.now() / 1000) + Math.round(hours * 3600);
  const body = Buffer.from(`${address.toLowerCase().slice(2)}${exp.toString(16)}`, "hex").toString("base64url");
  return { t: `${body}.${mac(body)}`, exp };
}

export function readShare(t: string): { address: `0x${string}`; exp: number } | null {
  if (typeof t !== "string" || t.length > 200) return null;
  const [body, sig] = t.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const hex = Buffer.from(body, "base64url").toString("hex");
  if (hex.length < 41) return null;
  const exp = parseInt(hex.slice(40), 16);
  if (!(exp * 1000 > Date.now())) return null;
  return { address: `0x${hex.slice(0, 40)}`, exp };
}
