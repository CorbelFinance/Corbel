// Check a Corbel reward week yourself. Needs Node 20+ and viem (npm i viem).
//   node rewards-verify.mjs 2026-W48
// It downloads the published list, redoes the draw from the seed block's hash, rebuilds the Merkle root from the
// list, and compares both with what was published (the root is also on chain in the reward contract).
import { encodeAbiParameters, encodePacked, keccak256, toHex } from "viem";

const week = process.argv[2];
const r = await (await fetch(`https://corbel.finance/api/rewards/list?week=${week}`)).json();
if (r.pending) throw new Error(r.pending);

// the draw: among everyone eligible except the top three, keccak256(seed ‖ i) mod how many are left
const pool = r.ranking.slice(3).map((x) => x.wallet);
const drawn = [];
for (let i = 0; i < 2 && pool.length; i++) drawn.push(pool.splice(Number(BigInt(keccak256(`${r.seed}${toHex(i, { size: 32 }).slice(2)}`)) % BigInt(pool.length)), 1)[0]);
console.log("top three:", r.ranking.slice(0, 3).map((x) => x.wallet));
console.log("drawn    :", drawn);

// the root: leaf = keccak256(keccak256(abi.encode(wallet, amount))), pairs hashed sorted
let level = r.list.map((i) => keccak256(keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [i.wallet, BigInt(i.amount)]))));
while (level.length > 1) {
  const next = [];
  for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? keccak256(encodePacked(["bytes32", "bytes32"], level[i] < level[i + 1] ? [level[i], level[i + 1]] : [level[i + 1], level[i]])) : level[i]);
  level = next;
}
console.log("root rebuilt :", level[0]);
console.log("root posted  :", r.root, level[0] === r.root ? "MATCH" : "DIFFERENT");
const winners = new Set(r.list.map((i) => i.wallet));
console.log("every drawn winner is paid:", drawn.every((w) => winners.has(w)) ? "yes" : "NO");
