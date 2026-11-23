import { session } from "@/lib/auth";
import { telegramOn } from "@/lib/telegram";
import { guardWait } from "@/lib/guard";
import { ACTIONS, MIN_TXS, MULT, REPORTS, board, isLive, mine, weekOf } from "@/lib/points";
import { SEASON, payouts } from "@/lib/season";
import { frozenWeek, roundOf, weekEnd } from "@/lib/payout";
import { BRAND, HELD, ROAD_BLOCKS } from "@corbel/config";
import { getClient } from "@corbel/data/chain";
import { parseAbi } from "viem";

const CLAIMED = parseAbi(["function claimedBy(uint256, address) view returns (bool)"]);
/** The ISO week before `week`. */
const prevWeek = () => weekOf(Date.now() - 7 * 86_400_000);

/** What the signed-in wallet can claim from last week's frozen list, and whether it already has. */
async function claimOf(wallet: string) {
  const drop = process.env.REWARDS_DROP;
  if (!drop) return null;
  const w = prevWeek();
  const f = await frozenWeek(w).catch(() => null);
  if (!f || "pending" in f) return null;
  const item = f.list.find((i) => i.wallet === wallet.toLowerCase());
  if (!item) return null;
  const c = getClient(process.env.RPC_URL);
  const done = c ? ((await c.readContract({ address: drop as `0x${string}`, abi: CLAIMED, functionName: "claimedBy", args: [BigInt(f.round), wallet as `0x${string}`] }).catch(() => false)) as boolean) : false;
  return { week: w, round: f.round, amount: item.amount, proof: item.proof, claimed: done, drop };
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/rewards → this week's season: the board (nickname or short address, tier, points), the signed-in wallet's
 * own points and rank, the points table per tool, the split of the pool, and an estimate of each eligible person's
 * share if the week ended now (the draw part shows only once the week is over and its block is known).
 */
export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const week = weekOf();
    const s = session(req);
    const me = s ? { ...mine(s.address), live: await isLive(s.address), wallet: s.address, claim: await claimOf(s.address) } : null;
    const est = await payouts(week, null);
    return Response.json(
      {
        week,
        season: SEASON,
        drop: process.env.REWARDS_DROP ?? null,
        // the HoodLock proof page of the pool's lock, set once the owner has locked it
        lock: /^https:\/\/hoodlock\.tech\/proof\/lock\/\d+$/.test(process.env.REWARDS_LOCK ?? "") ? process.env.REWARDS_LOCK! : null,
        endsAt: weekEnd(week),
        // Telegram linking counts once the project bot is running; until then it shows as coming
        actions: Object.entries(ACTIONS).filter(([id]) => !(id === "xray" && HELD.xray) && !(id === "preview" && HELD.preview)).map(([id, a]) => ({ id, ...a, ...(id === "telegram" && !telegramOn() ? { soon: true } : {}) })),
        // the roadmap blocks the actions belong to, in roadmap order, with their colour
        blocks: ROAD_BLOCKS.filter((b) => Object.values(ACTIONS).some((a) => a.block === b.id)).map((b) => ({ id: b.id, label: b.label, tone: b.tone })),
        // next week's pool, announced ahead with its own lock: REWARDS_NEXT = "<coins>|<HoodLock proof link>"
        next: (() => {
          const [coins, href] = (process.env.REWARDS_NEXT ?? "").split("|");
          return Number(coins) > 0 && /^https:\/\/hoodlock\.tech\/proof\/lock\/\d+$/.test(href ?? "") ? { coins: Number(coins), lock: href! } : null;
        })(),
        mult: MULT,
        // bug reports and ideas: added by hand after a check, sent by DM on X or Telegram
        reports: Object.entries(REPORTS).map(([id, r]) => ({ id, ...r })),
        social: { x: BRAND.social.x, telegram: "https://t.me/corbelfinance?direct" },
        minTxs: MIN_TXS,
        board: board(week, 100).map((r) => ({ ...r, wallet: `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}`, estimate: Math.floor(est.rows.find((p) => p.wallet === r.wallet)?.total ?? 0), eligible: est.ranking.some((p) => p.wallet === r.wallet) })),
        eligible: est.eligible,
        me,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } finally {
    g.release();
  }
}
