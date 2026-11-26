import { loadSnap } from "@/lib/snapshot";
import { guardWait } from "@/lib/guard";
import { BOT_GAP_S, BOT_SWAPS } from "@/lib/botRule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/bots → how much of the last day's DEX volume came from bots, from the swaps /api/whales already holds (the
 * tokens Corbel reads swap by swap). A wallet counts as a bot by a stated rule, not a guess: more than BOT_SWAPS swaps
 * in the day, or a median gap of under BOT_GAP_S seconds between its swaps once it has made at least 5. Cached 5 min.
 */
/**
 * A single swap worth more than this is left out: the deepest pool on the chain holds a few hundred thousand dollars,
 * so a bigger "swap" comes from a token whose price reads are broken, not from a real trade.
 */
const MAX_SWAP_USD = 100_000;
// `who` is the address the pool dealt with: for most pools that is a router contract, not a person. Only `from`, the
// transaction's signer (resolved for the larger swaps), says who traded, so only swaps with a signer are counted.
type Swap = { token: string; symbol: string | null; t: number; side: string; usd: number; who: string; from?: string };
let cached: { at: number; body: unknown } | null = null;

function compute() {
  const s = loadSnap<{ at: number; rows: Swap[] }>("whales");
  if (!s?.rows?.length) return null;
  const byWho = new Map<string, Swap[]>();
  const priced = s.rows.filter((r) => r.usd > 0 && r.usd <= MAX_SWAP_USD);
  const dropped = s.rows.length - priced.length;
  const rows = priced.filter((r) => r.from).map((r) => ({ ...r, who: r.from! }));
  const signedShare = priced.reduce((a, r) => a + r.usd, 0) ? rows.reduce((a, r) => a + r.usd, 0) / priced.reduce((a, r) => a + r.usd, 0) : 0;
  for (const r of rows) (byWho.get(r.who.toLowerCase()) ?? byWho.set(r.who.toLowerCase(), []).get(r.who.toLowerCase())!).push(r);
  const isBot = new Map<string, boolean>();
  for (const [w, list] of byWho) {
    const ts = list.map((x) => x.t).sort((a, b) => a - b);
    const gaps = ts.slice(1).map((t, i) => t - ts[i]!).sort((a, b) => a - b);
    const median = gaps.length ? gaps[Math.floor(gaps.length / 2)]! : Infinity;
    isBot.set(w, list.length > BOT_SWAPS || (list.length >= 5 && median < BOT_GAP_S));
  }
  let botUsd = 0, humanUsd = 0, botSwaps = 0, humanSwaps = 0;
  const tokens = new Map<string, { token: string; symbol: string | null; bot: number; human: number }>();
  for (const r of rows) {
    const bot = isBot.get(r.who.toLowerCase())!;
    if (bot) {
      botUsd += r.usd;
      botSwaps++;
    } else {
      humanUsd += r.usd;
      humanSwaps++;
    }
    const t = tokens.get(r.token) ?? { token: r.token, symbol: r.symbol, bot: 0, human: 0 };
    t[bot ? "bot" : "human"] += r.usd;
    tokens.set(r.token, t);
  }
  const bots = [...isBot.values()].filter(Boolean).length;
  const top = [...byWho.entries()]
    .filter(([w]) => isBot.get(w))
    .map(([w, l]) => ({ wallet: w, swaps: l.length, usd: l.reduce((a, x) => a + x.usd, 0) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 8);
  const busiest = [...tokens.values()].filter((t) => t.bot + t.human >= 1000).sort((a, b) => b.bot + b.human - (a.bot + a.human)).slice(0, 12);
  return {
    at: s.at,
    rule: { swaps: BOT_SWAPS, gapSeconds: BOT_GAP_S, maxSwapUsd: MAX_SWAP_USD, dropped, counted: rows.length, signedShare },
    wallets: { total: byWho.size, bots },
    volume: { bot: botUsd, human: humanUsd },
    swaps: { bot: botSwaps, human: humanSwaps },
    topBots: top,
    tokens: busiest,
  };
}

export async function GET(req: Request) {
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    if (cached && Date.now() - cached.at < 300_000) return Response.json(cached.body);
    const body = compute();
    if (!body) return Response.json({ warming: true }, { status: 202 });
    cached = { at: Date.now(), body };
    return Response.json(body);
  } finally {
    g.release();
  }
}
