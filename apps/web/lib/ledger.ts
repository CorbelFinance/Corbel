/**
 * The public record of every check. Each token verdict the check saves (lib/stats, one per token a day) becomes a leaf:
 * keccak256 of "token|block|results". Every hour the new leaves are closed into a batch with a Merkle root (sorted
 * pairs, the usual scheme), so no verdict can be changed or dropped later without breaking the root. A root is posted
 * on chain when a ledger wallet is configured (LEDGER_KEY on the server); until then a batch says "not posted".
 *
 * Outcomes are counted for verdicts a week old or more, against the index: a hit is a verdict with a failed check whose
 * token was drained, a false alarm one with a failed check whose token is still alive, a miss one with no failed check
 * whose token was drained. Every miss and every false alarm stays on the record.
 */
import { createWalletClient, http, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "@corbel/data/chain";
import { tokenDrained } from "@corbel/indexer";
import { statsStore } from "./stats";
import { store } from "./store";

const HOUR = 3_600_000;
const WEEK_DAYS = 7;

type Verdict = { rowid: number; day: string; token: string; block: string | null; results: string };
export type Batch = { id: number; from: number; to: number; count: number; root: Hex; at: number; tx: string | null };

const statsDb = statsStore;
const db = () => store("ledger", "CREATE TABLE IF NOT EXISTS batches (id INTEGER PRIMARY KEY AUTOINCREMENT, from_row INTEGER NOT NULL, to_row INTEGER NOT NULL, count INTEGER NOT NULL, root TEXT NOT NULL, at INTEGER NOT NULL, tx TEXT);");

export const leafOf = (v: Pick<Verdict, "token" | "block" | "results">): Hex => keccak256(toHex(`${v.token.toLowerCase()}|${v.block ?? ""}|${v.results}`));
const pair = (a: Hex, b: Hex): Hex => keccak256(`0x${(a < b ? a + b.slice(2) : b + a.slice(2)).slice(2)}` as Hex);

/** The Merkle root of these leaves (sorted pairs; an odd leaf moves up as it is). */
export function rootOf(leaves: Hex[]): Hex {
  if (!leaves.length) return keccak256("0x");
  let level = leaves;
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? pair(level[i]!, level[i + 1]!) : level[i]!);
    level = next;
  }
  return level[0]!;
}

/** The sibling hashes that prove leaves[i] is in rootOf(leaves). */
export function proofOf(leaves: Hex[], i: number): Hex[] {
  const out: Hex[] = [];
  let level = leaves, k = i;
  while (level.length > 1) {
    const sib = k % 2 === 0 ? k + 1 : k - 1;
    if (sib < level.length) out.push(level[sib]!);
    const next: Hex[] = [];
    for (let j = 0; j < level.length; j += 2) next.push(j + 1 < level.length ? pair(level[j]!, level[j + 1]!) : level[j]!);
    level = next;
    k = Math.floor(k / 2);
  }
  return out;
}

/** Checks a proof the way anyone can, with nothing but the leaf, the proof and the root. */
export const verifyProof = (leaf: Hex, proof: Hex[], root: Hex) => proof.reduce((h, p) => pair(h, p), leaf) === root;

const verdictsBetween = (from: number, to: number) => (statsDb()?.prepare("SELECT rowid, day, token, block, results FROM verdicts WHERE rowid > ? AND rowid <= ? ORDER BY rowid").all(from, to) as Verdict[] | undefined) ?? [];

/** Closes every verdict saved since the last batch into a new one, at most once an hour. Returns the batch made, if any. */
export function closeBatch(force = false): Batch | null {
  const d = db(), s = statsDb();
  if (!d || !s) return null;
  const last = d.prepare("SELECT to_row, at FROM batches ORDER BY id DESC LIMIT 1").get() as { to_row: number; at: number } | undefined;
  if (!force && last && Date.now() - last.at < HOUR) return null;
  const from = last?.to_row ?? 0;
  const top = (s.prepare("SELECT MAX(rowid) AS m FROM verdicts").get() as { m: number | null }).m ?? 0;
  if (top <= from) return null;
  const rows = verdictsBetween(from, top);
  const root = rootOf(rows.map(leafOf));
  const at = Date.now();
  const r = d.prepare("INSERT INTO batches (from_row, to_row, count, root, at) VALUES (?, ?, ?, ?, ?)").run(from, top, rows.length, root, at);
  const id = Number(r.lastInsertRowid);
  void postRoot(id, root);
  return { id, from, to: top, count: rows.length, root, at, tx: null };
}

/** "corbel-ledger" then the batch id (8 bytes) and the root: the calldata of a posting, readable by anyone. */
const MARK = toHex("corbel-ledger");

/**
 * Posts a root on chain as a transaction to the ledger wallet itself carrying MARK, the batch id and the root, when
 * LEDGER_KEY is set on the server. A failed post leaves the batch "not posted"; the next close tries the backlog.
 */
async function postRoot(id: number, root: Hex) {
  const key = process.env.LEDGER_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key) || !process.env.RPC_URL) return;
  try {
    const account = privateKeyToAccount(key as Hex);
    const w = createWalletClient({ account, chain: robinhood, transport: http(process.env.RPC_URL) });
    const data = `${MARK}${id.toString(16).padStart(16, "0")}${root.slice(2)}` as Hex;
    const tx = await w.sendTransaction({ to: account.address, value: 0n, data });
    db()?.prepare("UPDATE batches SET tx = ? WHERE id = ?").run(tx, id);
  } catch (e) {
    console.error("[ledger] post failed", (e as Error).message?.slice(0, 120));
  }
}

export function batches(limit = 30): Batch[] {
  return ((db()?.prepare("SELECT id, from_row AS 'from', to_row AS 'to', count, root, at, tx FROM batches ORDER BY id DESC LIMIT ?").all(limit) as Batch[] | undefined) ?? []);
}

/** A token's committed verdicts, each with its batch, root and proof. */
export function proofsFor(token: string): { day: string; block: string | null; results: Record<string, string>; leaf: Hex; batch: number; root: Hex; proof: Hex[]; tx: string | null }[] {
  const s = statsDb(), d = db();
  if (!s || !d) return [];
  const mine = s.prepare("SELECT rowid, day, token, block, results FROM verdicts WHERE token = ? ORDER BY rowid DESC LIMIT 30").all(token.toLowerCase()) as Verdict[];
  const out = [];
  for (const v of mine) {
    const b = d.prepare("SELECT id, from_row, to_row, root, tx FROM batches WHERE from_row < ? AND to_row >= ?").get(v.rowid, v.rowid) as { id: number; from_row: number; to_row: number; root: Hex; tx: string | null } | undefined;
    if (!b) continue;
    const rows = verdictsBetween(b.from_row, b.to_row);
    const leaves = rows.map(leafOf);
    const i = rows.findIndex((r) => r.rowid === v.rowid);
    out.push({ day: v.day, block: v.block, results: JSON.parse(v.results) as Record<string, string>, leaf: leaves[i]!, batch: b.id, root: b.root, proof: proofOf(leaves, i), tx: b.tx });
  }
  return out;
}

/** Hits, false alarms and misses for verdicts at least a week old, judged by the index. */
export function outcomes(): { judged: number; hits: number; falseAlarms: number; misses: number; cleanAlive: number; unknown: number } {
  const s = statsDb();
  const o = { judged: 0, hits: 0, falseAlarms: 0, misses: 0, cleanAlive: 0, unknown: 0 };
  if (!s) return o;
  const cut = new Date(Date.now() - WEEK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const rows = s.prepare("SELECT token, results FROM verdicts WHERE day <= ? ORDER BY rowid DESC LIMIT 20000").all(cut) as { token: string; results: string }[];
  for (const r of rows) {
    const drained = tokenDrained(r.token);
    if (drained === null) {
      o.unknown++;
      continue;
    }
    const flagged = Object.values(JSON.parse(r.results) as Record<string, string>).includes("fail");
    o.judged++;
    if (flagged && drained) o.hits++;
    else if (flagged) o.falseAlarms++;
    else if (drained) o.misses++;
    else o.cleanAlive++;
  }
  return o;
}
