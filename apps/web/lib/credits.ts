/**
 * Credits: one USDG balance per wallet for AI models and paid GPU time.
 *
 * A top-up is a plain USDG transfer from the wallet to the credits treasury (CREDITS_TREASURY, server env); the sweep
 * reads those transfers from the chain and credits the sender, once per transaction. Spending is recorded line by
 * line (model calls by key, GPU minutes); the balance is top-ups minus spending. Credits are spent only, never paid
 * back out (owner's rule): the page says so before anyone sends anything.
 *
 * Holders get a bonus on every top-up by their tier (topUpBonus in @corbel/config: Light +5% up to Core +30%), added
 * as its own line next to the deposit, at most BONUS_DAY_CAP dollars a wallet a day. Holding gives no credit by itself
 * and burning $CORBEL is not a way in.
 *
 * Model keys (cm_…) are separate from the read-only API keys: each belongs to a wallet, spends from its balance and
 * has its own daily cap in USD, so a runaway script stops itself. Only a SHA-256 of a key is stored.
 */
import { createHash, randomBytes } from "node:crypto";
import { getClient } from "@corbel/data/chain";
import { store } from "./store";
import { topUpBonusFor } from "@corbel/config";
import { tierOf } from "./tiers";

/** The most top-up bonus one wallet gets in a day, in dollars. */
export const BONUS_DAY_CAP = 50;

/** The base markup on list price (no tier); a holder's own markup comes from lib/markup by tier. */
export const MARKUP = 0.1;
export const CREDITS = { minTopUp: 1, maxKeys: 5, defaultCap: 5, maxCap: 500 } as const;
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const db = () =>
  store(
    "credits",
    `CREATE TABLE IF NOT EXISTS deposits (tx TEXT PRIMARY KEY, wallet TEXT NOT NULL, usd REAL NOT NULL, block INTEGER NOT NULL, at INTEGER NOT NULL);
     CREATE INDEX IF NOT EXISTS deposits_wallet ON deposits (wallet);
     CREATE TABLE IF NOT EXISTS spends (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT NOT NULL, key TEXT, kind TEXT NOT NULL, ref TEXT, usd REAL NOT NULL, at INTEGER NOT NULL, day TEXT NOT NULL);
     CREATE INDEX IF NOT EXISTS spends_wallet ON spends (wallet);
     CREATE INDEX IF NOT EXISTS spends_key ON spends (key, day);
     CREATE TABLE IF NOT EXISTS mkeys (hash TEXT PRIMARY KEY, owner TEXT NOT NULL, label TEXT NOT NULL, tail TEXT NOT NULL, cap REAL NOT NULL, created INTEGER NOT NULL, revoked INTEGER);
     CREATE INDEX IF NOT EXISTS mkeys_owner ON mkeys (owner);
     CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS burns (tx TEXT PRIMARY KEY, wallet TEXT NOT NULL, coins REAL NOT NULL, price REAL NOT NULL, usd REAL NOT NULL, block INTEGER NOT NULL, at INTEGER NOT NULL, day TEXT NOT NULL);
     CREATE INDEX IF NOT EXISTS burns_wallet ON burns (wallet);
     CREATE TABLE IF NOT EXISTS bonuses (tx TEXT PRIMARY KEY, wallet TEXT NOT NULL, usd REAL NOT NULL, rate REAL NOT NULL, at INTEGER NOT NULL, day TEXT NOT NULL);
     CREATE INDEX IF NOT EXISTS bonuses_wallet ON bonuses (wallet, day);`,
    // spending from the daily lock credit is told apart from spending of the paid balance
    (d) => {
      try {
        d.exec("ALTER TABLE spends ADD COLUMN src TEXT NOT NULL DEFAULT 'balance'");
      } catch {
        /* already there */
      }
    },
  );

export const creditsDb = () => db();
const today = () => new Date().toISOString().slice(0, 10);
const hashOf = (key: string) => createHash("sha256").update(key).digest("hex");
export const treasury = () => (process.env.CREDITS_TREASURY ?? "").toLowerCase();
/** USDG top-ups need the treasury address. */
export const treasuryOpen = () => /^0x[0-9a-f]{40}$/.test(treasury());
/** Credits can be held and spent: USDG top-ups, or the $CORBEL ways in (lock credit, burn top-ups). */
export const creditsOpen = () => treasuryOpen();

// ---------------------------------------------------------------- balance and spending

export type Balance = { deposited: number; bonus: number; burned: number; spent: number; balance: number; allowance: number; allowanceLeft: number; spendable: number };

/** The paid balance (USDG top-ups plus burn top-ups, minus what was spent from it) and today's lock credit. */
export function balance(wallet: string): Balance {
  const w = wallet.toLowerCase();
  const d = db();
  const one = (sql: string, ...a: (string | number)[]) => ((d?.prepare(sql).get(...a) as { s: number } | undefined)?.s ?? 0);
  const dep = one("SELECT COALESCE(SUM(usd), 0) AS s FROM deposits WHERE wallet = ?", w);
  const burned = one("SELECT COALESCE(SUM(usd), 0) AS s FROM burns WHERE wallet = ?", w);
  const bonus = one("SELECT COALESCE(SUM(usd), 0) AS s FROM bonuses WHERE wallet = ?", w);
  const sp = one("SELECT COALESCE(SUM(usd), 0) AS s FROM spends WHERE wallet = ? AND src = 'balance'", w);
  // holding gives no daily credit any more; the column stays for lines already written
  const grant = 0;
  const usedToday = one("SELECT COALESCE(SUM(usd), 0) AS s FROM spends WHERE wallet = ? AND src = 'allowance' AND day = ?", w, today());
  const bal = Math.max(0, dep + bonus + burned - sp);
  const left = Math.max(0, grant - usedToday);
  return { deposited: dep, bonus, burned, spent: sp, balance: bal, allowance: grant, allowanceLeft: left, spendable: bal + left };
}

/**
 * Records spending: today's lock credit first, then the paid balance. Never below zero: an amount above what is
 * left is cut to it. Returns what was taken.
 */
export function charge(wallet: string, kind: "model" | "gpu", usd: number, opts: { key?: string | null; ref?: string } = {}): number {
  const d = db();
  if (!d || !(usd > 0)) return 0;
  const b = balance(wallet);
  const fromGrant = Math.min(usd, b.allowanceLeft);
  const fromBal = Math.min(usd - fromGrant, b.balance);
  const ins = d.prepare("INSERT INTO spends (wallet, key, kind, ref, usd, at, day, src) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  if (fromGrant > 0) ins.run(wallet.toLowerCase(), opts.key ?? null, kind, opts.ref ?? null, fromGrant, Date.now(), today(), "allowance");
  if (fromBal > 0) ins.run(wallet.toLowerCase(), opts.key ?? null, kind, opts.ref ?? null, fromBal, Date.now(), today(), "balance");
  return fromGrant + fromBal;
}

/**
 * Settles a reservation made with charge(…, { ref }): `used` dollars of it are kept, the rest goes back where it came
 * from. What was used is taken from the day's lock credit first (it lapses anyway), so the paid balance gets back
 * its own part first; lock credit not used goes back to the day it was taken from and lapses with that day. A lock
 * credit can never turn into paid balance this way. Returns what went back to the paid balance.
 */
export function settle(wallet: string, reserveRef: string, used: number, ref: string): number {
  const d = db();
  if (!d) return 0;
  const w = wallet.toLowerCase();
  const rows = d.prepare("SELECT src, day, usd FROM spends WHERE wallet = ? AND ref = ? AND usd > 0").all(w, reserveRef) as { src: string; day: string; usd: number }[];
  const fromGrant = rows.filter((r) => r.src === "allowance").reduce((a, r) => a + r.usd, 0);
  const fromBal = rows.filter((r) => r.src === "balance").reduce((a, r) => a + r.usd, 0);
  const keep = Math.max(0, Math.min(used, fromGrant + fromBal));
  const keepGrant = Math.min(keep, fromGrant), keepBal = keep - keepGrant;
  const backBal = Math.round((fromBal - keepBal) * 1e6) / 1e6, backGrant = Math.round((fromGrant - keepGrant) * 1e6) / 1e6;
  const ins = d.prepare("INSERT INTO spends (wallet, key, kind, ref, usd, at, day, src) VALUES (?, NULL, 'gpu', ?, ?, ?, ?, ?)");
  if (backBal > 0) ins.run(w, ref, -backBal, Date.now(), today(), "balance");
  const day = rows.find((r) => r.src === "allowance")?.day;
  if (backGrant > 0 && day) ins.run(w, ref, -backGrant, Date.now(), day, "allowance");
  return backBal;
}

export function history(wallet: string) {
  const w = wallet.toLowerCase();
  const d = db();
  const deps = (d?.prepare("SELECT tx, usd, block, at FROM deposits WHERE wallet = ? ORDER BY at DESC LIMIT 50").all(w) ?? []) as { tx: string; usd: number; block: number; at: number }[];
  const spends = (d?.prepare("SELECT kind, ref, usd, at, src FROM spends WHERE wallet = ? ORDER BY at DESC LIMIT 100").all(w) ?? []) as { kind: string; ref: string | null; usd: number; at: number; src: string }[];
  const burns = (d?.prepare("SELECT tx, coins, price, usd, block, at FROM burns WHERE wallet = ? ORDER BY at DESC LIMIT 50").all(w) ?? []) as { tx: string; coins: number; price: number; usd: number; block: number; at: number }[];
  const bonuses = (d?.prepare("SELECT tx, usd, rate, at FROM bonuses WHERE wallet = ? ORDER BY at DESC LIMIT 50").all(w) ?? []) as { tx: string; usd: number; rate: number; at: number }[];
  return { deposits: deps, spends, burns, bonuses };
}

// ---------------------------------------------------------------- model keys with a daily cap

export type ModelKey = { id: string; label: string; tail: string; cap: number; spentToday: number; created: number };

export function listModelKeys(owner: string): ModelKey[] {
  const rows = (db()?.prepare("SELECT hash, label, tail, cap, created FROM mkeys WHERE owner = ? AND revoked IS NULL ORDER BY created").all(owner.toLowerCase()) ?? []) as { hash: string; label: string; tail: string; cap: number; created: number }[];
  return rows.map((r) => ({ id: r.hash.slice(0, 12), label: r.label, tail: r.tail, cap: r.cap, spentToday: keySpentToday(r.hash), created: r.created }));
}

const clampCap = (cap: number) => Math.max(0.5, Math.min(CREDITS.maxCap, Number.isFinite(cap) ? cap : CREDITS.defaultCap));

export function createModelKey(owner: string, label: string, cap: number): { key: string } | { error: string } {
  const d = db();
  if (!d) return { error: "Keys are not available right now." };
  if (listModelKeys(owner).length >= CREDITS.maxKeys) return { error: `A wallet can hold ${CREDITS.maxKeys} model keys. Revoke one first.` };
  const key = `cm_${randomBytes(24).toString("hex")}`;
  const name = label.replace(/[^\w .-]/g, "").trim().slice(0, 32) || "My key";
  d.prepare("INSERT INTO mkeys (hash, owner, label, tail, cap, created) VALUES (?, ?, ?, ?, ?, ?)").run(hashOf(key), owner.toLowerCase(), name, key.slice(-4), clampCap(cap), Date.now());
  return { key };
}

export function setKeyCap(owner: string, id: string, cap: number): boolean {
  if (!/^[0-9a-f]{12}$/.test(id)) return false;
  const r = db()?.prepare("UPDATE mkeys SET cap = ? WHERE owner = ? AND substr(hash, 1, 12) = ? AND revoked IS NULL").run(clampCap(cap), owner.toLowerCase(), id);
  return !!r && Number(r.changes) > 0;
}

export function revokeModelKey(owner: string, id: string): boolean {
  if (!/^[0-9a-f]{12}$/.test(id)) return false;
  const r = db()?.prepare("UPDATE mkeys SET revoked = ? WHERE owner = ? AND substr(hash, 1, 12) = ? AND revoked IS NULL").run(Date.now(), owner.toLowerCase(), id);
  return !!r && Number(r.changes) > 0;
}

const keySpentToday = (hash: string) => ((db()?.prepare("SELECT COALESCE(SUM(usd), 0) AS s FROM spends WHERE key = ? AND day = ?").get(hash, today()) as { s: number } | undefined)?.s ?? 0);

/**
 * The model key a request carries (Authorization: Bearer cm_…): its owner, hash, and how much it may still spend now
 * (the lower of the wallet's balance and what is left of the key's daily cap). An error to show otherwise.
 */
export function modelKeyOf(req: Request): { owner: string; hash: string; left: number } | { error: string; status: number } {
  const raw = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!/^cm_[0-9a-f]{48}$/.test(raw)) return { error: "Send your Corbel model key as Authorization: Bearer cm_…", status: 401 };
  const h = hashOf(raw);
  const row = db()?.prepare("SELECT owner, cap FROM mkeys WHERE hash = ? AND revoked IS NULL").get(h) as { owner: string; cap: number } | undefined;
  if (!row) return { error: "This key is not valid or was revoked.", status: 401 };
  const capLeft = row.cap - keySpentToday(h);
  if (capLeft <= 0) return { error: `This key reached its daily cap of $${row.cap.toFixed(2)}. It resets at 00:00 UTC.`, status: 429 };
  const bal = balance(row.owner).spendable;
  if (bal <= 0) return { error: "The balance is empty. Top up Credits on Corbel, burn $CORBEL for them, or lock $CORBEL for a daily credit.", status: 402 };
  return { owner: row.owner, hash: h, left: Math.min(capLeft, bal) };
}

// ---------------------------------------------------------------- top-ups read from the chain

const S = globalThis as unknown as { __corbelCredits?: { timer: ReturnType<typeof setInterval> | null; busy: boolean } };
const st = (S.__corbelCredits ??= { timer: null, busy: false });
const meta = (k: string) => (db()?.prepare("SELECT v FROM meta WHERE k = ?").get(k) as { v: string } | undefined)?.v ?? null;
const setMeta = (k: string, v: string) => db()?.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)").run(k, v);

/** Reads USDG transfers into the treasury since the last block read and credits each sender once per transaction. */
export async function scanTopUps(): Promise<number> {
  if (st.busy || !treasuryOpen()) return 0;
  const client = getClient(process.env.RPC_URL);
  if (!client) return 0;
  st.busy = true;
  let added = 0;
  try {
    const head = Number(await client.getBlockNumber());
    const startEnv = Number(process.env.CREDITS_FROM_BLOCK ?? "");
    let from = Number(meta(`from:${treasury()}`) ?? (Number.isFinite(startEnv) && startEnv > 0 ? startEnv : head - 50_000));
    const to32 = `0x000000000000000000000000${treasury().slice(2)}`;
    const STEP = 20_000;
    while (from <= head) {
      const to = Math.min(head, from + STEP - 1);
      const logs = (await client.request({ method: "eth_getLogs", params: [{ address: USDG, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [TRANSFER, null, to32] }] } as never)) as { topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string }[];
      for (const l of logs) {
        const wallet = `0x${l.topics[1]!.slice(26)}`.toLowerCase();
        const usd = Number(BigInt(l.data)) / 1e6;
        const r = db()?.prepare("INSERT OR IGNORE INTO deposits (tx, wallet, usd, block, at) VALUES (?, ?, ?, ?, ?)").run(`${l.transactionHash}:${Number(l.logIndex)}`, wallet, usd, Number(l.blockNumber), Date.now());
        if (r && Number(r.changes) > 0) {
          added++;
          addBonus(`${l.transactionHash}:${Number(l.logIndex)}`, wallet, usd);
        }
      }
      setMeta(`from:${treasury()}`, String(to + 1));
      from = to + 1;
    }
  } catch {
    /* the next sweep goes on from the last block it finished */
  } finally {
    st.busy = false;
  }
  return added;
}

/** The holder's bonus on one top-up, by tier at the moment it is read, capped per wallet per day. */
export function addBonus(tx: string, wallet: string, usd: number) {
  const rate = topUpBonusFor(tierOf(wallet));
  if (!(rate > 0) || !(usd > 0)) return;
  const day = new Date().toISOString().slice(0, 10);
  const got = (db()?.prepare("SELECT COALESCE(SUM(usd), 0) AS s FROM bonuses WHERE wallet = ? AND day = ?").get(wallet, day) as { s: number } | undefined)?.s ?? 0;
  const give = Math.min(usd * rate, Math.max(0, BONUS_DAY_CAP - got));
  if (give > 0) db()?.prepare("INSERT OR IGNORE INTO bonuses (tx, wallet, usd, rate, at, day) VALUES (?, ?, ?, ?, ?, ?)").run(tx, wallet, give, rate, Date.now(), day);
}

export function startCreditsSweep() {
  if (st.timer || !creditsOpen()) return;
  const sweep = () => {
    void scanTopUps();
  };
  st.timer = setInterval(sweep, 30_000);
  st.timer.unref?.();
  sweep();
}
