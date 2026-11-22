/**
 * Sign-in with Google (OpenID Connect, authorization code flow with PKCE). No Google script runs on our pages:
 * the button is a plain link, Google sends the visitor back with a one-time code, and the server swaps it for an
 * ID token directly with Google over TLS. We keep no email and no name: only a keyed hash of Google's account id,
 * so the same Google account maps to the same limits, and nothing readable is stored.
 *
 * Off until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set on the server.
 */
import { createHash, randomBytes } from "node:crypto";
import { hostName, isSecure, keyedId, openValue, readCookie, sealValue, session } from "./auth";

export const G_COOKIE = "corbel_google";
const FLOW = "corbel_gflow";
const SESSION_S = 7 * 24 * 3600;
const FLOW_S = 10 * 60;

export const googleOn = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
const b64 = (b: Buffer) => b.toString("base64url");
const redirectUri = (origin: string) => `${origin}/api/auth/google/callback`;

/** The public origin as the visitor sees it (behind the proxy the request URL is the local one). */
export function originOf(req: Request) {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}
const safeBack = (v: string | null) => (v && /^\/(?!\/)[\w\-./?=&%#]*$/.test(v) ? v : "/app/ai/chat");
const cookie = (name: string, value: string, maxAge: number, secure: boolean, path = "/") =>
  `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

/** Step 1: the redirect to Google, with state, nonce and a PKCE verifier kept in a short signed cookie. */
export function startGoogle(req: Request, secure: boolean) {
  const state = b64(randomBytes(16)), verifier = b64(randomBytes(32)), nonce = b64(randomBytes(16));
  const challenge = b64(createHash("sha256").update(verifier).digest());
  const back = safeBack(new URL(req.url).searchParams.get("back"));
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(originOf(req)),
    response_type: "code",
    scope: "openid",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const flow = sealValue({ state, verifier, nonce, back, e: Math.floor(Date.now() / 1000) + FLOW_S });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, cookie: cookie(FLOW, flow, FLOW_S, secure, "/api/auth/google") };
}

/** Step 2: the code back from Google → a session. Returns the session id and where to send the visitor, or an error. */
export async function finishGoogle(req: Request, secure: boolean): Promise<{ id: string; back: string; cookies: string[] } | { error: string }> {
  const u = new URL(req.url);
  const flow = openValue<{ state: string; verifier: string; nonce: string; back: string; e: number }>(readCookie(req, FLOW));
  if (!flow || flow.e < Date.now() / 1000) return { error: "The sign-in took too long. Try again." };
  if (u.searchParams.get("error")) return { error: "Google sign-in was cancelled." };
  const code = u.searchParams.get("code");
  if (!code || u.searchParams.get("state") !== flow.state) return { error: "The sign-in did not match. Try again." };

  // the code is swapped server to server: an ID token received this way comes straight from Google over TLS
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(originOf(req)),
      grant_type: "authorization_code",
      code_verifier: flow.verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const fail = { error: "Google did not confirm the sign-in. Try again." };
  if (!r?.ok) return fail;
  const j = (await r.json().catch(() => null)) as { id_token?: string } | null;
  const parts = j?.id_token?.split(".");
  if (!parts || parts.length !== 3) return fail;
  let c: { iss?: string; aud?: string; sub?: string; exp?: number; nonce?: string };
  try {
    c = JSON.parse(Buffer.from(parts[1]!, "base64url").toString());
  } catch {
    return fail;
  }
  const now = Math.floor(Date.now() / 1000);
  const issOk = c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com";
  if (!c.sub || c.aud !== process.env.GOOGLE_CLIENT_ID || !issOk || !c.exp || c.exp < now || c.nonce !== flow.nonce) return fail;

  const id = `google:${keyedId(`google:${c.sub}`)}`;
  return { id, back: flow.back, cookies: [cookie(FLOW, "", 0, secure, "/api/auth/google"), cookie(hostName(G_COOKIE, secure), sealValue({ g: id, e: now + SESSION_S }), SESSION_S, secure)] };
}

export function googleSession(req: Request): { id: string; exp: number } | null {
  const v = openValue<{ g: string; e: number }>(readCookie(req, hostName(G_COOKIE, isSecure(req))));
  return v && /^google:[0-9a-f]{24}$/.test(v.g) && v.e > Date.now() / 1000 ? { id: v.g, exp: v.e } : null;
}
export const clearGoogle = (secure: boolean) => cookie(hostName(G_COOKIE, secure), "", 0, secure);

/**
 * Who is using the AI tools: a signed-in wallet first, else a Google account. `address` is the key every limit,
 * job and file is filed under; a Google key never matches a wallet, so holder tiers and admin rights stay wallet-only.
 */
export function aiSession(req: Request): { address: string; exp: number; kind: "wallet" | "google" } | null {
  const w = session(req);
  if (w) return { ...w, kind: "wallet" };
  const g = googleSession(req);
  return g ? { address: g.id, exp: g.exp, kind: "google" } : null;
}
