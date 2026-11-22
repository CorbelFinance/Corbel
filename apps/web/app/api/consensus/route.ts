import { isAddress } from "viem";
import { session, sameOrigin } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { availReady, panelModels } from "@/lib/compute";
import { tierOf } from "@/lib/tiers";
import { GET as tokenCheck } from "../token/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/consensus {token} → a panel of AI models from different makers reads the same facts (Corbel's token check
 * at the latest block) and each answers buy, wait or avoid with a score from −100 to 100 and one reason. Returns every
 * answer and how far they agree. For signed-in holders (it runs several models per question). Cached 10 min per token.
 * The models see only the check's facts, never the visitor's wallet.
 */
type Check = { checks?: { id: string; name: string; result: string; reason?: string }[]; meta?: Record<string, unknown>; error?: string };
type Answer = { model: string; verdict: "buy" | "wait" | "avoid"; score: number; reason: string } | { model: string; error: string };
const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 10 * 60_000;

const SYSTEM = `You are one of several independent reviewers of a token on Robinhood Chain. Use ONLY the facts given: the results of an on-chain token check made at the latest block. Do not invent prices, news or people. Decide whether a careful buyer should buy now, wait, or avoid it.
Answer with one JSON object and nothing else: {"verdict":"buy"|"wait"|"avoid","score":<integer from -100 (avoid strongly) to 100 (buy strongly)>,"reason":"<one sentence, at most 25 words, naming the fact that decided it>"}`;

/** Readable model name without the provider's routing prefix. */
const nameOf = (id: string) => (id.split("/").pop() ?? id).replace(/[-_:]+/g, " ").replace(/\b(\w)/g, (m) => m.toUpperCase()).trim();

async function ask(model: string, facts: string): Promise<Answer> {
  const base = process.env.AI_BASE_URL, key = process.env.AI_API_KEY;
  if (!base || !key) return { model: nameOf(model), error: "unavailable" };
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: facts }], max_tokens: 300, temperature: 0.2 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) return { model: nameOf(model), error: "no answer" };
    const j = (await r.json()) as { choices?: { message?: { content?: string | { text?: string }[] | null } }[] };
    const c = j.choices?.[0]?.message?.content;
    const txt = Array.isArray(c) ? c.map((x) => x?.text ?? "").join("") : (c ?? "");
    const o = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)) as { verdict?: string; score?: number; reason?: string };
    const verdict = o.verdict === "buy" || o.verdict === "avoid" || o.verdict === "wait" ? o.verdict : null;
    if (!verdict) return { model: nameOf(model), error: "unclear answer" };
    const score = Math.max(-100, Math.min(100, Math.round(Number(o.score) || 0)));
    return { model: nameOf(model), verdict, score, reason: String(o.reason ?? "").slice(0, 220) };
  } catch {
    return { model: nameOf(model), error: "no answer" };
  }
}

export async function POST(req: Request) {
  // cheap refusals and cached answers first; the rate limit counts only questions that reach the models
  if (!sameOrigin(req)) return Response.json({ error: "Refused." }, { status: 403 });
  const s = session(req);
  if (!s) return Response.json({ error: "Sign in with your wallet to ask the panel." }, { status: 401 });
  if (!tierOf(s.address)) return Response.json({ error: "The model panel is for $CORBEL holders (Light or Full)." }, { status: 403 });
  const j = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof j?.token === "string" ? j.token.trim().toLowerCase() : "";
  if (!isAddress(token)) return Response.json({ error: "Paste a token address." }, { status: 400 });
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);
  const g = await guardWait(req, "consensus");
  if ("blocked" in g) return g.blocked;
  try {

    // the facts: our own token check, run in this process through its handler (no network hop, same cache and limits)
    const check = (await tokenCheck(new Request(`http://local/api/token?q=${token}`, { headers: req.headers }))
      .then((r) => r.json())
      .catch(() => null)) as Check | null;
    if (!check?.checks?.length) return Response.json({ error: check?.error ?? "The token check did not answer. Try again in a minute." }, { status: 502 });
    const meta = check.meta ?? {};
    const facts = [`Token ${token}${meta.symbol ? ` ($${String(meta.symbol)})` : ""} on Robinhood Chain.`, ...check.checks.map((c) => `- ${c.name}: ${c.result.toUpperCase()}. ${c.reason ?? ""}`)].join("\n");

    await availReady();
    const models = panelModels(4);
    if (!models.length) return Response.json({ error: "No models are open right now." }, { status: 503 });
    const answers = await Promise.all(models.map((m) => ask(m, facts)));
    const ok = answers.filter((a): a is Extract<Answer, { verdict: string }> => "verdict" in a);
    const count = { buy: 0, wait: 0, avoid: 0 } as Record<"buy" | "wait" | "avoid", number>;
    for (const a of ok) count[a.verdict]++;
    const majority = ok.length ? (Object.entries(count).sort((a, b) => b[1] - a[1])[0]![0] as "buy" | "wait" | "avoid") : null;
    const body = {
      token,
      at: Date.now(),
      answers,
      count,
      majority,
      agreement: ok.length && majority ? count[majority] / ok.length : null,
      meanScore: ok.length ? Math.round(ok.reduce((s2, a) => s2 + a.score, 0) / ok.length) : null,
      checks: check.checks.map((c) => ({ name: c.name, result: c.result })),
    };
    if (ok.length) cache.set(token, { at: Date.now(), body });
    return Response.json(body);
  } finally {
    g.release();
  }
}
