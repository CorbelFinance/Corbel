import { getClient } from "@corbel/data/chain";
import { session } from "@/lib/auth";
import { covered } from "@/lib/earnHistory";
import { guardWait } from "@/lib/guard";
import { mediaDb } from "@/lib/mediaStore";
import { xcheckSnap } from "@/lib/xcheck";
import { allLimits, limit, setLimit } from "@/lib/limits";
import { report } from "@/lib/stats";
import { sameOrigin } from "@/lib/auth";
import { listSignups } from "@/lib/signups";
import { audit } from "@/lib/points";
import { listMessages, setDone } from "@/lib/support";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin → the owner's panel: the checker's last pass in full, generation spend and limits, the pool record's
 * fill, the chain head. Only wallets listed in ADMIN_WALLETS (comma separated, server env) get an answer; everyone
 * else gets a plain 404, so the route does not announce itself.
 */
const admins = () => (process.env.ADMIN_WALLETS ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
const notFound = () => new Response("Not found.", { status: 404 });

export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const s = session(req);
    if (!s) return Response.json({ signedIn: false }, { status: 401 });
    if (!admins().includes(s.address.toLowerCase())) return notFound();

    const day = new Date().toISOString().slice(0, 10);
    const m = mediaDb();
    const spend = (m?.prepare("SELECT day, tokens FROM spend ORDER BY day DESC LIMIT 14").all() ?? []) as { day: string; tokens: number }[];
    let byKind: { kind: string; n: number; wallets: number }[] = [];
    let jobs = 0;
    try {
      byKind = (m?.prepare("SELECT kind, SUM(n) AS n, COUNT(DISTINCT who) AS wallets FROM uses WHERE day = ? GROUP BY kind").all(day) ?? []) as typeof byKind;
      jobs = ((m?.prepare("SELECT COUNT(*) AS n FROM jobs WHERE at > ?").get(Date.now() - 86_400_000) as { n: number } | undefined)?.n ?? 0);
    } catch {
      // tables appear with the first generation
    }

    const earn = (globalThis as unknown as { __corbelEarn?: { snap: { rows: { pair: string; symbol: string; liquidity: number }[] } | null } }).__corbelEarn?.snap?.rows ?? [];
    const client = getClient(process.env.RPC_URL);
    const head = client ? await client.getBlockNumber().then(String).catch(() => null) : null;
    const x = xcheckSnap();

    return Response.json(
      {
        address: s.address,
        at: Date.now(),
        release: process.cwd().match(/releases\/(\d+)/)?.[1] ?? null,
        uptime: Math.round(process.uptime()),
        head,
        xcheck: x && {
          at: x.at,
          ms: x.ms,
          eth: { ours: x.eth.ours, median: x.eth.median, sources: x.eth.outside.length, agree: x.eth.agree },
          node: x.node ?? null,
          tokens: x.tokens.map((t) => ({ token: t.token, symbol: t.symbol, ours: t.ours, second: t.second, holders: t.holders, agree: t.agree, why: t.why })),
        },
        media: {
          on: !!process.env.MEDIA_ADAPTER,
          routed: false,
          budget: limit("mediaTokensDay"),
          limits: { image: limit("imagePerWallet"), video: limit("videoPerWallet"), audio: limit("audioPerWallet") },
          spend,
          today: byKind,
          jobs24h: jobs,
        },
        stats: report(14),
        signups: listSignups(5000),
        rewards: audit(),
        support: listMessages(),
        limits: allLimits(),
        earn: earn.map((r) => ({ pair: r.pair, symbol: r.symbol, liquidity: r.liquidity, days: covered(r.pair) })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } finally {
    g.release();
  }
}

/** POST /api/admin {limits: {key: value}} → sets limits from the panel. Admin wallets only, same origin only. */
export async function POST(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const s = session(req);
    if (!s || !admins().includes(s.address.toLowerCase()) || !sameOrigin(req)) return notFound();
    const j = (await req.json().catch(() => null)) as { limits?: Record<string, unknown>; support?: { id?: unknown; done?: unknown } } | null;
    if (j?.support && Number.isInteger(j.support.id)) {
      setDone(j.support.id as number, j.support.done === true);
      return Response.json({ ok: true, support: listMessages() }, { headers: { "cache-control": "no-store" } });
    }
    const errors: string[] = [];
    for (const [k, v] of Object.entries(j?.limits ?? {})) {
      const e = setLimit(k, v);
      if (e) errors.push(e);
    }
    return Response.json({ ok: errors.length === 0, errors, limits: allLimits() }, { status: errors.length ? 400 : 200, headers: { "cache-control": "no-store" } });
  } finally {
    g.release();
  }
}
