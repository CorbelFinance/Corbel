/**
 * Sign-in with Ethereum (EIP-4361). The wallet signs a plain message (no transaction, no gas); the server checks the
 * domain, chain, nonce and time, verifies the signature (EOA, or ERC-1271/6492 smart wallets when chain reads are
 * on), then sets a session cookie: address + expiry, HMAC-signed. For fair use, lib/sybil.ts keeps a salted IP and device hash for 24 hours.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { getClient } from "@corbel/data/chain";

export const COOKIE = "corbel_session";
/**
 * Over https a cookie name carries the __Host- prefix: the browser then refuses it from any subdomain and without Secure and Path=/, so no subdomain can plant or replace a sign-in.
 */
export const hostName = (name: string, secure: boolean) => (secure ? `__Host-${name}` : name);
const SESSION_S = 7 * 24 * 3600;
const NONCE_MS = 5 * 60_000;
const CHAIN_ID = 4663;

const G = globalThis as unknown as { __corbelAuth?: { secret: Buffer; nonces: Map<string, number> } };
const box = (G.__corbelAuth ??= {
  // a configured secret keeps sessions across restarts; without one they last until the process restarts
  secret: process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32 ? Buffer.from(process.env.SESSION_SECRET) : randomBytes(32),
  nonces: new Map(),
});

const b64 = (b: Buffer) => b.toString("base64url");
const sign = (payload: string) => b64(createHmac("sha256", box.secret).update(payload).digest());

/** Signs and checks small cookie payloads for other sign-in kinds (lib/google.ts) with the same server secret. */
export const sealValue = (v: unknown) => {
  const payload = b64(Buffer.from(JSON.stringify(v)));
  return `${payload}.${sign(payload)}`;
};
export function openValue<T>(raw: string | undefined | null): T | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(payload)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as T;
  } catch {
    return null;
  }
}
/** A stable, private id from a secret-keyed hash: the raw value never leaves this process. */
export const keyedId = (v: string) => createHmac("sha256", box.secret).update(`id:${v}`).digest("hex").slice(0, 24);
export const readCookie = (req: Request, name: string) => req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

export function newNonce(): string {
  const now = Date.now();
  if (box.nonces.size > 20_000) for (const [n, exp] of box.nonces) if (exp < now) box.nonces.delete(n);
  const n = randomBytes(12).toString("hex");
  box.nonces.set(n, now + NONCE_MS);
  return n;
}

function takeNonce(n: string): boolean {
  const exp = box.nonces.get(n);
  box.nonces.delete(n); // single use, even when stale
  return !!exp && exp > Date.now();
}

/** Checks a signed SIWE message for this host. Returns the address, or a reason. */
export async function verifySignIn(message: string, signature: string, host: string): Promise<{ address: string } | { error: string }> {
  if (message.length > 2000 || !/^0x[0-9a-fA-F]{130,}$/.test(signature)) return { error: "Malformed sign-in." };
  const m = parseSiweMessage(message);
  if (!m.address || !isAddress(m.address) || !m.nonce || !m.domain) return { error: "Malformed sign-in." };
  if (m.domain !== host) return { error: "This message was made for another site." };
  if (m.chainId !== CHAIN_ID) return { error: "Sign in on Robinhood Chain." };
  if (m.version !== "1") return { error: "Unsupported message version." };
  const now = Date.now();
  if (!m.issuedAt || Math.abs(now - m.issuedAt.getTime()) > NONCE_MS) return { error: "The message is too old. Try again." };
  if (m.expirationTime && m.expirationTime.getTime() < now) return { error: "The message expired. Try again." };
  if (!takeNonce(m.nonce)) return { error: "This sign-in was already used or expired. Try again." };

  const client = getClient(process.env.RPC_URL);
  let ok = false;
  try {
    ok = client
      ? await client.verifyMessage({ address: m.address, message, signature: signature as Hex }) // EOA + smart wallets
      : await verifyMessage({ address: m.address, message, signature: signature as Hex }); // EOA only, offline
  } catch {
    ok = false;
  }
  return ok ? { address: getAddress(m.address) } : { error: "The signature does not match the address." };
}

export function sessionCookie(address: string, secure: boolean) {
  const payload = b64(Buffer.from(JSON.stringify({ a: address, e: Math.floor(Date.now() / 1000) + SESSION_S })));
  return `${hostName(COOKIE, secure)}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_S}${secure ? "; Secure" : ""}`;
}

export const clearCookie = (secure: boolean) => `${hostName(COOKIE, secure)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

/** The signed-in address, or null. */
export function session(req: Request): { address: string; exp: number } | null {
  // over https only the prefixed name counts: a plain one may have come from a subdomain
  const name = hostName(COOKIE, isSecure(req));
  const raw = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString()) as { a: string; e: number };
    return isAddress(v.a) && v.e > Date.now() / 1000 ? { address: v.a, exp: v.e } : null;
  } catch {
    return null;
  }
}

/** Same-origin check for state-changing requests (the cookie is SameSite=Lax; this closes the rest). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const isSecure = (req: Request) => (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https";
