/**
 * Abuse guard for the API. Every chain-reading route costs RPC calls, so an attacker hammering
 * /api/portfolio with fresh addresses could starve the site. Two limits:
 *  - per client: a token bucket per route (requests per minute), keyed by the visitor's IP as read from the
 *    header named in CLIENT_IP_HEADER (unset: one shared bucket);
 *  - per route: at most N expensive runs at once for everyone together.
 * Nothing is stored beyond memory, and IPs are hashed with a per-process random salt (never logged).
 */
import { createHash, randomBytes } from "node:crypto";
import { API_KEYS, keyOf, keyOwner } from "./apikeys";
import { tierOf } from "./tiers";

/** A key's lift by its owner's tier: the key's own boost times the tier's (Light 1, Plus 2, Full 5, Core 10), read once a minute. */
const lifts = new Map<string, { at: number; v: number }>();
function liftOf(hash: string): number {
  const hit = lifts.get(hash);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const owner = keyOwner(hash);
  const v = API_KEYS.boost * (tierOf(owner)?.apiBoost ?? 1);
  if (lifts.size > 2000) lifts.clear();
  lifts.set(hash, { at: Date.now(), v });
  return v;
}

type Bucket = { tokens: number; at: number };
const G = globalThis as unknown as { __corbelGuard?: { buckets: Map<string, Bucket>; running: Map<string, number>; salt: string } };
G.__corbelGuard ??= { buckets: new Map(), running: new Map(), salt: randomBytes(16).toString("hex") };
const box = G.__corbelGuard;

const RULES: Record<string, { perMin: number; burst: number; concurrent: number }> = {
  token: { perMin: 20, burst: 6, concurrent: 6 },
  mandate: { perMin: 12, burst: 4, concurrent: 4 },
  quote: { perMin: 30, burst: 8, concurrent: 6 },
  portfolio: { perMin: 6, burst: 3, concurrent: 3 },
  wallet: { perMin: 30, burst: 8, concurrent: 8 },
  radar: { perMin: 240, burst: 60, concurrent: 40 },
  launches: { perMin: 30, burst: 10, concurrent: 10 },
  assets: { perMin: 90, burst: 30, concurrent: 20 },
  stocks: { perMin: 30, burst: 10, concurrent: 10 },
  auth: { perMin: 20, burst: 6, concurrent: 4 },
  account: { perMin: 60, burst: 20, concurrent: 6 },
  market: { perMin: 60, burst: 20, concurrent: 12 },
  // a full holders read takes up to a minute: its own slots, so it never holds the charts' slots
  holders: { perMin: 20, burst: 6, concurrent: 6 },
  // several models per question: a few asks a minute per visitor
  consensus: { perMin: 4, burst: 2, concurrent: 2 },
  // paid model calls with a key: the balance and the key's daily cap bound the spend; this bounds the load
  v1: { perMin: 60, burst: 20, concurrent: 8 },
  logo: { perMin: 1200, burst: 300, concurrent: 48 },
  track: { perMin: 120, burst: 40, concurrent: 10 },
};

function clientKey(req: Request): string {
  const h = req.headers;
  // the header is trusted only when the runtime names it (CLIENT_IP_HEADER); otherwise anyone could forge it
  const name = process.env.CLIENT_IP_HEADER;
  const ip = (name && h.get(name)?.split(",")[0]?.trim()) || "local";
  return createHash("sha256").update(box.salt + ip).digest("hex").slice(0, 16);
}

function sweep(now: number) {
  if (box.buckets.size < 20_000) return;
  for (const [k, b] of box.buckets) if (now - b.at > 10 * 60_000) box.buckets.delete(k);
}

/**
 * The same limits, but a full route makes the caller wait for a free slot (up to `waitMs`) instead of answering
 * "busy" at once: at launch many people open the same tools together, and a short queue beats an error.
 * Over its own rate a caller is still refused at once.
 */
export async function guardWait(req: Request, route: keyof typeof RULES, waitMs = 15_000): Promise<{ blocked: Response } | { release: () => void }> {
  const rule = RULES[route]!;
  const until = Date.now() + waitMs;
  // wait while the route is full, without spending the caller's rate on each look
  while ((box.running.get(route) ?? 0) >= rule.concurrent && Date.now() < until) {
    if (req.signal?.aborted) return { blocked: new Response(null, { status: 499 }) };
    await new Promise((ok) => setTimeout(ok, 120 + Math.random() * 120));
  }
  return guard(req, route);
}

/** Returns a 429 response when the caller is over its limit, else a release function for the concurrency slot. */
export function guard(req: Request, route: keyof typeof RULES): { blocked: Response } | { release: () => void } {
  const base = RULES[route]!;
  const now = Date.now();
  sweep(now);
  // a holder's API key lifts the limit by liftOf (the key boost times the owner's tier), in its own bucket; the visitor's address keeps a bucket of
  // the same lifted size too, so many keys used from one place never add up past it
  const k = keyOf(req);
  if (k === "over") return { blocked: Response.json({ error: `This key has used its ${API_KEYS.perDay} requests for today (UTC).` }, { status: 429, headers: { "retry-after": "3600" } }) };
  const lift = k ? liftOf(k) : 1;
  const rule = k ? { ...base, perMin: base.perMin * lift, burst: base.burst * lift } : base;
  const keys = k ? [`${route}:k${k.slice(0, 16)}`, `${route}:kip${clientKey(req)}`] : [`${route}:${clientKey(req)}`];
  const buckets = keys.map((key) => {
    const b = box.buckets.get(key) ?? { tokens: rule.burst, at: now };
    b.tokens = Math.min(rule.burst, b.tokens + ((now - b.at) / 60_000) * rule.perMin);
    b.at = now;
    box.buckets.set(key, b);
    return b;
  });
  const empty = buckets.find((b) => b.tokens < 1);
  if (empty) {
    const retry = Math.ceil(((1 - empty.tokens) / rule.perMin) * 60);
    return { blocked: Response.json({ error: "Too many requests. Try again in a moment." }, { status: 429, headers: { "retry-after": String(retry) } }) };
  }
  const running = box.running.get(route) ?? 0;
  if (running >= rule.concurrent) {
    return { blocked: Response.json({ error: "Busy right now. Try again in a few seconds." }, { status: 503, headers: { "retry-after": "5" } }) };
  }
  for (const b of buckets) b.tokens -= 1;
  box.running.set(route, running + 1);
  let done = false;
  return {
    release: () => {
      if (done) return;
      done = true;
      box.running.set(route, Math.max(0, (box.running.get(route) ?? 1) - 1));
    },
  };
}
