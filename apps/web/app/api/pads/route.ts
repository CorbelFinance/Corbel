import { DIRECT_PAD, LAUNCHPADS, launchpadOf } from "@corbel/config";
import { curveLaunches, indexStatus, launchesSince } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";
import { blocksPerSecond } from "@/lib/blockRate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/pads → every launchpad we can tell apart on Robinhood Chain with the tokens that came out of it in the
 * last three days, newest first: name, symbol, age, and whether the pool is already drained. Grouped from our own
 * index by each pool's hook and creating contract. Cached 30 seconds.
 */
const KEEP = 40; // newest tokens kept per launchpad
type Tok = { token: string; symbol: string | null; name: string | null; ago: number; dead: 0 | 1 | null; base: string | null; kind: string; lookalike?: boolean; stage: "curve" | "pool"; creator?: string | null };
/** Tickers of the chain's money; a new token that takes one of them is a lookalike, whatever it claims. */
const MONEY = new Set(["USDG", "USDC", "USDT", "ETH", "WETH", "CBBTC", "BTC", "WBTC"]);
type Pad = { id: string; name: string; tone: string; url: string | null; day: number; total: number; dead: number; checked: number; tokens: Tok[] };
const G = globalThis as unknown as { __corbelPads?: { at: number; body: unknown } };

export async function GET(req: Request) {
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    if (G.__corbelPads && Date.now() - G.__corbelPads.at < 30_000) return Response.json(G.__corbelPads.body);
    const st = indexStatus();
    if (!st?.high) return Response.json({ error: "The index is not available yet." }, { status: 503 });
    const head = st.high;
    // blocks become seconds at the rate measured from the chain, not a fixed guess
    const BPS = await blocksPerSecond();
    const rows = launchesSince(head - 3 * 86_400 * BPS, 12_000) ?? [];
    const pads = new Map<string, Pad>();
    const seen = new Set<string>();
    const meta = (id: string) => {
      const l = LAUNCHPADS.find((x) => x.id === id);
      return l ? { name: l.name, tone: l.tone, url: l.url ?? null } : id === DIRECT_PAD.id ? { name: DIRECT_PAD.name, tone: DIRECT_PAD.tone, url: null } : { name: "Not labelled", tone: "#7d8a83", url: null };
    };
    // tokens born on a launchpad's own contracts, before or without a pool (curve launches)
    const pending: Tok[] = [];
    for (const r of curveLaunches(head - 3 * 86_400 * BPS)) {
      const id = r.pad;
      const p = pads.get(id) ?? { id, ...meta(id), day: 0, total: 0, dead: 0, checked: 0, tokens: [] };
      p.total++;
      if (head - r.block <= 86_400 * BPS) p.day++;
      const key = r.token.toLowerCase();
      if (!seen.has(key) && p.tokens.length < KEEP) {
        const t: Tok = { token: r.token, symbol: r.symbol, name: r.name, ago: Math.round((head - r.block) / BPS), dead: null, base: null, kind: "curve", stage: r.pooled ? "pool" : "curve", creator: r.creator, ...(MONEY.has((r.symbol ?? "").toUpperCase()) ? { lookalike: true } : {}) };
        p.tokens.push(t);
        pending.push(t);
      }
      seen.add(key);
      pads.set(id, p);
    }
    for (const r of rows) {
      const id = launchpadOf(r.pad, r.hook) ?? "other";
      const key = r.token.toLowerCase();
      // a curve launch that now has a pool was counted at its launch: mark it graduated, count it once
      const grad = pending.find((x) => x.token.toLowerCase() === key);
      if (grad) {
        grad.stage = "pool";
        continue;
      }
      const p = pads.get(id) ?? { id, ...meta(id), day: 0, total: 0, dead: 0, checked: 0, tokens: [] };
      p.total++;
      if (head - r.block <= 86_400 * BPS) p.day++;
      if (r.dead !== null) p.checked++;
      if (r.dead === 1) p.dead++;
      // a token shows once, under the launchpad of its first pool in the window (rows run newest first)
      if (seen.has(key)) {
        pads.set(id, p);
        continue;
      }
      if (p.tokens.length < KEEP) p.tokens.push({ token: r.token, symbol: r.symbol, name: r.name, ago: Math.round((head - r.block) / BPS), dead: r.dead, base: r.base, kind: r.kind, stage: "pool", ...(MONEY.has((r.symbol ?? "").toUpperCase()) ? { lookalike: true } : {}) });
      seen.add(key);
      pads.set(id, p);
    }
    for (const p of pads.values()) p.tokens.sort((a, b) => a.ago - b.ago);
    const rank = (p: Pad) => (p.id === "other" ? 2 : p.id === DIRECT_PAD.id ? 1 : 0);
    const list = [...pads.values()].sort((a, b) => rank(a) - rank(b) || b.day - a.day || b.total - a.total);
    const body = { head, window: "3d", pads: list };
    G.__corbelPads = { at: Date.now(), body };
    return Response.json(body);
  } finally {
    g.release();
  }
}
