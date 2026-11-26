/**
 * Reward season: how a week's pool is split. Owner, 2026-11-23: one week, 5M $CORBEL, the split below.
 *
 *   podium  70%  the three highest scores of the week: 30%, 25%, 15%
 *   draw    30%  two people drawn among the other eligible people (not the top three), equal shares
 *
 * Eligible: any wallet with at least MIN_POINTS points that week (no transaction minimum since 2026-11-26), so a
 * prize goes to someone who used Corbel, not to a wallet made for the draw. The draw is seeded by the hash of the first
 * block after the week ends, which nobody, us included, can know in advance; anyone can redo it from that hash.
 */
import { keccak256, toHex, type Hex } from "viem";
import { board, isLive } from "./points";

export const SEASON = {
  poolCoins: 5_000_000, // owner, 2026-11-23: 5M this week, from the team wallet 0x2f83…a60b
  // owner, 2026-11-23: five prizes, the top three and two drawn: 1.5M, 1.25M, 750K, then 750K and 750K
  podium: [0.3, 0.25, 0.15],
  pointsShare: 0,
  drawShare: 0.3,
  drawWinners: 2,
  minPoints: 30,
  weeks: 1,
  claimDays: 14, // owner, 2026-11-23: unclaimed coins are burned after 14 days (CorbelDrop claimWindow at deploy)
} as const;

export type Payout = { wallet: string; nick: string | null; pts: number; podium: number; points: number; draw: number; total: number };

/** Picks `n` distinct winners from `pool` with a seed anyone can recompute: keccak(seed, i) mod remaining. Pure. */
export function drawWinners<T>(pool: T[], n: number, seed: Hex): T[] {
  const left = [...pool];
  const out: T[] = [];
  for (let i = 0; i < n && left.length; i++) {
    const r = BigInt(keccak256(`${seed}${toHex(i, { size: 32 }).slice(2)}` as Hex)) % BigInt(left.length);
    out.push(left.splice(Number(r), 1)[0]!);
  }
  return out;
}

/** The split of one week's pool. Without a seed (the week is not over) the draw part is shown as not drawn yet. */
export async function payouts(week: string, seed: Hex | null): Promise<{ eligible: number; ranking: { wallet: string; pts: number }[]; rows: Payout[]; drawn: boolean }> {
  // everyone with points, no cut-off: a person below any limit would silently drop out of the draw
  const all = board(week, Number.MAX_SAFE_INTEGER);
  const ok: typeof all = [];
  for (const r of all) if (r.pts >= SEASON.minPoints && (await isLive(r.wallet))) ok.push(r);
  const pool = SEASON.poolCoins;
  const sum = ok.reduce((a, r) => a + r.pts, 0) || 1;
  const rows = new Map<string, Payout>(ok.map((r) => [r.wallet, { wallet: r.wallet, nick: r.nick, pts: r.pts, podium: 0, points: (pool * SEASON.pointsShare * r.pts) / sum, draw: 0, total: 0 }]));
  ok.slice(0, 3).forEach((r, i) => (rows.get(r.wallet)!.podium = pool * SEASON.podium[i]!));
  if (seed && ok.length) {
    // the draw is among everyone eligible except the top three, so five different people win
    const won = drawWinners(ok.slice(3).map((r) => r.wallet), SEASON.drawWinners, seed);
    for (const w of won) rows.get(w)!.draw = (pool * SEASON.drawShare) / won.length;
  }
  const out = [...rows.values()].map((p) => ({ ...p, total: Math.floor(p.podium + p.points + p.draw) }));
  // rounding dust goes to first place, so a drawn week pays out the whole pool and nothing is left over
  if (seed && out.length) {
    const dust = pool * (SEASON.podium.slice(0, Math.min(3, ok.length)).reduce((a, b) => a + b, 0) + SEASON.drawShare) - out.reduce((a, p) => a + p.total, 0);
    const top = out.find((p) => p.wallet === ok[0]?.wallet);
    if (top && dust > 0 && dust < 10) top.total += Math.round(dust);
  }
  return { eligible: ok.length, ranking: ok.map((r) => ({ wallet: r.wallet, pts: r.pts })), rows: out.sort((a, b) => b.total - a.total), drawn: !!seed };
}
