import { NATIVE, RH, assetMeta, buildReport, getClient, parseAddress, quote, redact, toRaw } from "@corbel/data/chain";
import { launcherHistory, poolLauncher, sameTicker, v4PoolsBetween, v4PoolsFor } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";
import { score, type Check } from "@/components/app/score";
import { holdersBrief, holdersOf } from "@/lib/holdersOf";
import { byToken, dsTokens } from "@/lib/pairs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/guard → a pre-trade verdict for an agent: may it make this trade under this policy?
 *
 *   token=0x…            the token traded
 *   side=buy|sell        buy: pay → token; sell: token → pay
 *   pay=USDG|ETH|WETH    the other side (default USDG)
 *   amount=…             what the agent puts in (pay units on a buy, token units on a sell)
 *   policy: maxIn, minScore (0–90), maxImpact (0.02 = 2%), must (check ids that may not fail,
 *           default honeypot,tax,exit), hooks=0 (no hooked pools), allow, deny (comma-separated addresses)
 *
 * Deny-first: every rule must pass, and any rule that cannot be checked denies. The trade is simulated at
 * the latest block (eth_call); nothing is signed. Same answer for a human on /app/agents/guard and for a bot.
 */
type Address = `0x${string}`;
const NAMED: Record<string, Address> = { ETH: NATIVE, WETH: RH.WETH as Address, USDG: RH.USDG as Address };
const reports = new Map<string, { at: number; body: { checks: Check[]; meta?: { symbol: string | null } } }>();
const TTL = 60_000;

type Rule = { id: string; name: string; ok: boolean; detail: string };

async function report(client: NonNullable<ReturnType<typeof getClient>>, token: Address) {
  const k = token.toLowerCase();
  const hit = reports.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.body;
  const body = (await buildReport(client, token, token, { v4PoolsFor, launcherHistory, sameTicker, poolLauncher })) as unknown as { checks: Check[]; meta?: { symbol: string | null } };
  if (reports.size > 300) reports.delete(reports.keys().next().value!);
  reports.set(k, { at: Date.now(), body });
  return body;
}

const list = (v: string | null) => (v ?? "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^0x[0-9a-f]{40}$/.test(x));

async function handle(req: Request) {
  const u = new URL(req.url).searchParams;
  const token = parseAddress((u.get("token") ?? "").trim());
  const side = u.get("side") === "sell" ? "sell" : "buy";
  const payKey = (u.get("pay") ?? "USDG").toUpperCase();
  const pay = Object.hasOwn(NAMED, payKey) ? NAMED[payKey]! : null;
  const amount = (u.get("amount") ?? "").trim();
  if (!token) return Response.json({ error: "Pass token=0x… (the token the agent trades)." }, { status: 400 });
  if (!pay) return Response.json({ error: "pay must be USDG, ETH or WETH." }, { status: 400 });
  if (!/^\d{1,30}(\.\d{1,30})?$/.test(amount) || Number(amount) <= 0) return Response.json({ error: "Pass amount above zero." }, { status: 400 });

  const maxIn = u.get("maxIn") ? Number(u.get("maxIn")) : null;
  const minScore = Math.max(0, Math.min(90, Number(u.get("minScore") ?? 60) || 0));
  const maxImpact = Math.max(0, Math.min(1, Number(u.get("maxImpact") ?? 0.02) || 0));
  const must = (u.get("must") ?? "honeypot,tax,exit").split(",").map((x) => x.trim()).filter(Boolean);
  const noHooks = u.get("hooks") === "0";
  const allow = list(u.get("allow")), deny = list(u.get("deny"));

  const client = getClient(process.env.RPC_URL);
  if (!client) return Response.json({ error: "Chain reads are paused. Try again later." }, { status: 503 });

  const t0 = Date.now();
  const from = side === "buy" ? pay : token, to = side === "buy" ? token : pay;
  try {
    const [rep, q] = await Promise.all([
      report(client, token),
      assetMeta(client, from).then((m) => quote(client, from, to, toRaw(amount, m.decimals), { v4PoolsBetween })),
    ]);
    const hb = await Promise.race([holdersOf(token).then(holdersBrief).catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), 6000))]);
    const mk = await Promise.race([dsTokens([token]).then((p) => byToken(p).get(token.toLowerCase()) ?? null).catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), 4000))]);
    const sc = score(rep.checks, hb, mk ? { liquidity: mk.liquidity } : null);
    const best = q.best !== null ? q.routes[q.best] : null;
    const rules: Rule[] = [];
    const t = token.toLowerCase();
    if (deny.length) rules.push({ id: "deny", name: "Not on the deny list", ok: !deny.includes(t), detail: deny.includes(t) ? "The owner blocked this token." : "Not listed." });
    if (allow.length) rules.push({ id: "allow", name: "On the allow list", ok: allow.includes(t), detail: allow.includes(t) ? "Listed by the owner." : "Not on the owner's list: unknown tokens are denied." });
    if (maxIn !== null && Number.isFinite(maxIn)) rules.push({ id: "size", name: "Trade size", ok: Number(amount) <= maxIn, detail: `${amount} in, cap ${maxIn}.` });
    rules.push({ id: "score", name: "Corbel Score", ok: sc.total >= minScore, detail: `${sc.total} of 90 (${sc.tag}), floor ${minScore}. ${sc.why}` });
    for (const id of must) {
      const c = rep.checks.find((x) => x.id === id);
      rules.push({ id: `check:${id}`, name: c?.name ?? id, ok: !!c && c.result !== "fail" && c.result !== "unknown", detail: c ? c.reason : "This check did not run: denied." });
    }
    rules.push({ id: "route", name: "A route fills", ok: !!best?.ok && !!best.amountOut, detail: best?.ok ? `Best of ${q.routes.length} routes fills.` : "No route pays out at the latest block." });
    rules.push({ id: "impact", name: "Price impact", ok: q.impact !== null && q.impact <= maxImpact, detail: q.impact === null ? "Impact could not be measured: denied." : `${(q.impact * 100).toFixed(2)}% against a cap of ${(maxImpact * 100).toFixed(2)}%.` });
    if (noHooks) {
      const hooked = !!best?.hops.some((h) => h.hooked);
      rules.push({ id: "hooks", name: "No hooked pools", ok: !hooked, detail: hooked ? "The best route passes a v4 hook the owner did not approve." : "Route has no hooks." });
    }
    const allowed = rules.every((r) => r.ok);
    return Response.json({
      verdict: allowed ? "allow" : "deny",
      token,
      symbol: rep.meta?.symbol ?? null,
      side,
      pay: payKey,
      amount,
      score: { total: sc.total, tag: sc.tag, parts: sc.parts },
      quote: best ? { amountOut: best.amountOut, decimals: q.to.decimals, symbol: q.to.symbol, impact: q.impact, hops: best.hops.length, block: q.block } : null,
      rules,
      failed: rules.filter((r) => !r.ok).map((r) => r.id),
      ms: Date.now() - t0,
    });
  } catch (e) {
    console.error("[api/guard]", redact(e));
    return Response.json({ verdict: "deny", error: "The chain did not answer, so the trade is denied. Try again in a minute." }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const g = await guardWait(req, "token");
  if ("blocked" in g) return g.blocked;
  try {
    return await handle(req);
  } finally {
    g.release();
  }
}
