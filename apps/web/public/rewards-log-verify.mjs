// Check the Corbel reward board yourself. Node 20+, nothing to install:
//   node rewards-log-verify.mjs            (this week)
//   node rewards-log-verify.mjs 2026-W48   (any week)
// 1. Downloads the week's points log and recomputes every seal of the hash chain.
// 2. Adds up the points of each participant number and compares them with the board.
// Keep the head hash it prints: a later run must still contain every row you saw, unchanged.
import { createHash } from "node:crypto";

const SITE = "https://corbel.finance";
const week = process.argv[2] ?? "";
const q = week ? `?week=${week}` : "";
const log = await (await fetch(`${SITE}/api/rewards/log${q}`)).json();
const board = await (await fetch(`${SITE}/api/rewards`)).json();
const sha = (s) => createHash("sha256").update(s).digest("hex");

let prev = log.start, broken = 0;
for (const e of log.events) {
  const h = sha([prev, e.n, e.id, e.action, e.pts, e.at, e.tx ?? ""].join("|"));
  if (h !== e.hash) { broken++; console.log("BROKEN at row", e.n); }
  prev = e.hash;
}
console.log(`chain: ${log.count} rows, ${broken ? `${broken} broken` : "every seal matches"}`);
console.log(`head: ${log.head}`);

// anchors: each hourly head written on chain must still be a seal in this log (or be the empty start)
const anc = await (await fetch(`${SITE}/api/rewards/anchors`)).json();
const seals = new Set([log.start, ...log.events.map((e) => e.hash)]);
const mine = anc.anchors.filter((x) => x.week === log.week && x.rows > 0);
const lost = mine.filter((x) => !seals.has(x.points));
console.log(`anchors: ${mine.length} on chain for this week, ${lost.length ? `${lost.length} heads missing from the log` : "every anchored head is in the log"}`);
for (const x of mine.slice(0, 3)) console.log(`  ${x.at} rows ${x.rows} head ${x.points.slice(0, 16)}… tx ${x.tx}`);

const sum = new Map();
for (const e of log.events) sum.set(e.id, Math.round(((sum.get(e.id) ?? 0) + e.pts) * 10) / 10);
let off = 0;
if (board.week === log.week)
  for (const r of board.board) {
    const mine = sum.get(r.id) ?? 0;
    if (Math.abs(mine - r.pts) > 0.05) { off++; console.log(`board says #${r.rank} ${r.id} has ${r.pts}, the log adds up to ${mine}`); }
  }
console.log(board.week === log.week ? `board: ${board.board.length} rows, ${off ? `${off} do not match the log` : "every row matches the log"}` : "board: a past week, compare with the frozen list instead");
