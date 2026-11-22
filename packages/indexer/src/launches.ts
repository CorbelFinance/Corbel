/**
 * Launch watch: tokens born on launchpads, from the moment they are created, before they have a pool. Launchpads
 * that sell on a bonding curve first (and only open a DEX pool on graduation) are invisible to the pool index until
 * then; this reads their own contracts instead. For every transaction that touched a known launchpad contract, the
 * receipt's mint transfers (from the zero address) name the token that was created; the transaction's signer is the
 * creator. Read-only, restart-safe (its own progress keys), and cheap: one getLogs per window plus one receipt per
 * launch transaction.
 */
import type { PublicClient } from "viem";
import { LAUNCHPADS, launchpadOf } from "../../config/src/launchpads.ts";
import type { Db } from "./db.ts";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TOPIC = "0x" + "0".repeat(64);
const SKIP = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73", // WETH
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168", // USDG
]);
const WATCHED = [...new Set(LAUNCHPADS.flatMap((l) => l.contracts ?? []))];
const ERC20 = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export function initLaunches(db: Db) {
  db.exec(`CREATE TABLE IF NOT EXISTS launches (
    token TEXT PRIMARY KEY, pad TEXT NOT NULL, block INTEGER NOT NULL, tx TEXT NOT NULL, creator TEXT,
    symbol TEXT, name TEXT
  );
  CREATE INDEX IF NOT EXISTS launches_block ON launches(block);
  CREATE INDEX IF NOT EXISTS launches_pad ON launches(pad);`);
}

type Log = { address: string; topics: string[]; transactionHash: string; blockNumber: string };

/** Reads one window of blocks; returns how many new launches it stored. */
export async function launchWindow(client: PublicClient, db: Db, from: bigint, to: bigint, clean: (s: string) => string | null): Promise<number> {
  if (!WATCHED.length) return 0;
  const logs = (await client.request({
    method: "eth_getLogs",
    params: [{ fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, address: WATCHED }],
  } as never)) as Log[];
  const txs = new Map<string, { block: number; via: string }>();
  for (const l of logs) if (!txs.has(l.transactionHash)) txs.set(l.transactionHash, { block: Number(l.blockNumber), via: l.address.toLowerCase() });
  const has = db.prepare(`SELECT 1 FROM launches WHERE token = ?`);
  const isPool = db.prepare(`SELECT 1 FROM pools WHERE id = ?`);
  const ins = db.prepare(`INSERT OR IGNORE INTO launches(token, pad, block, tx, creator, symbol, name) VALUES(?,?,?,?,?,?,?)`);
  let n = 0;
  for (const [hash, at] of txs) {
    const rc = await client.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
    if (!rc || rc.status !== "success") continue;
    // the tokens minted from nothing in this transaction (ERC-20 only: three topics)
    const minted = new Set(
      rc.logs
        .filter((x) => x.topics[0] === TRANSFER && x.topics.length === 3 && x.topics[1] === ZERO_TOPIC)
        .map((x) => x.address.toLowerCase())
        .filter((a) => !SKIP.has(a) && !WATCHED.includes(a)),
    );
    if (!minted.size) continue;
    const pad = launchpadOf(rc.to ?? at.via, null) ?? launchpadOf(at.via, null) ?? "other";
    for (const token of minted) {
      if (has.get(token)) continue;
      const [symbol, name] = await Promise.all(
        (["symbol", "name"] as const).map((fn) =>
          client
            .readContract({ address: token as `0x${string}`, abi: ERC20, functionName: fn })
            .then((v) => (clean(String(v)) ?? "").slice(0, 40) || null)
            .catch(() => null),
        ),
      );
      // an LP or receipt token minted alongside is not a launch; a launch always names itself
      if (!symbol || /^(UNI-V2|.*-LP|LP)$/i.test(symbol) || isPool.get(token)) continue;
      ins.run(token, pad, at.block, hash, rc.from.toLowerCase(), symbol, name ?? null);
      n++;
    }
  }
  return n;
}
