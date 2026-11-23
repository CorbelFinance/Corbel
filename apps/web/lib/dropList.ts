/**
 * The week's payout list for CorbelDrop: each (wallet, amount in wei) as a leaf the contract accepts,
 * keccak256(bytes.concat(keccak256(abi.encode(wallet, amount)))), a sorted-pair Merkle tree (lib/ledger's rootOf and
 * proofOf use the same pairing), the root to post and every wallet's proof to claim with. Published in full so anyone
 * can rebuild the root from the list.
 */
import { encodeAbiParameters, keccak256, parseEther, type Hex } from "viem";
import { proofOf, rootOf } from "./ledger";
import { payouts } from "./season";

export const dropLeaf = (wallet: string, amount: bigint): Hex => keccak256(keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [wallet as Hex, amount])));

export function buildList(rows: { wallet: string; total: number }[]) {
  const items = rows.filter((r) => r.total > 0).map((r) => ({ wallet: r.wallet.toLowerCase(), amount: parseEther(String(Math.floor(r.total))) }));
  const leaves = items.map((i) => dropLeaf(i.wallet, i.amount));
  const root = rootOf(leaves);
  const total = items.reduce((a, i) => a + i.amount, 0n);
  return { root, total: total.toString(), list: items.map((i, k) => ({ wallet: i.wallet, amount: i.amount.toString(), proof: proofOf(leaves, k) })) };
}

/** The final list of a finished week, from the draw seed (the hash of the first block after the week ended). */
export async function weekList(week: string, seed: Hex) {
  const p = await payouts(week, seed);
  // the ranking of everyone eligible, in order: with the seed, anyone redoes the podium and the draw
  return { week, seed, eligible: p.eligible, ranking: p.ranking, ...buildList(p.rows) };
}
