/**
 * Credits: one USDG balance per wallet for AI models and paid GPU time.
 *
 * A top-up is a plain USDG transfer from the wallet to the credits treasury (CREDITS_TREASURY, server env); the sweep
 * reads those transfers from the chain and credits the sender, once per transaction. Spending is recorded line by
 * line (model calls by key, GPU minutes); the balance is top-ups minus spending. Credits are spent only, never paid
 * back out (owner's rule): the page says so before anyone sends anything.
 *
 * Model keys (cm_…) are separate from the read-only API keys: each belongs to a wallet, spends from its balance and
 * has its own daily cap in USD, so a runaway script stops itself. Only a SHA-256 of a key is stored.
 */
import { createHash, randomBytes } from "node:crypto";
import { getClient } from "@corbel/data/chain";
import { store } from "./store";

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
     CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);`,
  );

const today = () => new Date().toISOString().slice(0, 10);
const hashOf = (key: string) => createHash("sha256").update(key).digest("hex");
export const treasury = () => (process.env.CREDITS_TREASURY ?? "").toLowerCase();
export const creditsOpen = () => /^0x[0-9a-f]{40}$/.test(treasury());

// ---------------------------------------------------------------- balance and spending

export function balance(wallet: string): { deposited: number; spent: number; balance: number } {
  const w = wallet.toLowerCase();
  const d = db();
  const dep = ((d?.prepare("SELECT COALESCE(SUM(usd), 0) AS s FROM deposits WHERE wallet = ?").get(w) as { s: number } | undefined)?.s ?? 0);
  const sp = ((d?.prepare("SELECT COALESCE(SUM(usd), 0) AS s FROM spends WHERE wallet = ?").get(w) as { s: number } | undefined)?.s ?? 0);
  return { deposited: dep, spent: sp, balance: Math.max(0, dep - sp) };
}

/** Records spending. Never takes the balance below zero: an amount above it is cut to what is left. */
export function charge(wallet: string, kind: "model" | "gpu", usd: number, opts: { key?: string | null; ref?: string } = {}): number {
  const d = db();
  if (!d || !(usd > 0)) return 0;
  const take = Math.min(usd, balance(wallet).balance);
  if (take <= 0) return 0;
  d.prepare("INSERT INTO spends (wallet, key, kind, ref, usd, at, day) VALUES (?, ?, ?, ?, ?, ?, ?)").run(wallet.toLowerCase(), opts.key ?? null, kind, opts.ref ?? null, take, Date.now(), today());
  return take;
}

/** Gives back an unused reservation (paid GPU time not used) as a negative charge: it stays on the balance. */
export function refund(wallet: string, usd: number, ref: string) {
  if (!(usd > 0)) return;
  db()?.prepare("INSERT INTO spends (wallet, key, kind, ref, usd, at, day) VALUES (?, NULL, 'gpu', ?, ?, ?, ?)").run(wallet.toLowerCase(), ref, -usd, Date.now(), today());
}

export function history(wallet: string) {
  const w = wallet.toLowerCase();
  const d = db();
  const deps = (d?.prepare("SELECT tx, usd, block, at FROM deposits WHERE wallet = ? ORDER BY at DESC LIMIT 50").all(w) ?? []) as { tx: string; usd: number; block: number; at: number }[];
  const spends = (d?.prepare("SELECT kind, ref, usd, at FROM spends WHERE wallet = ? ORDER BY at DESC LIMIT 100").all(w) ?? []) as { kind: string; ref: string | null; usd: number; at: number }[];
  return { deposits: deps, spends };
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
  const bal = balance(row.owner).balance;
  if (bal <= 0) return { error: "The balance is empty. Top up Credits on Corbel.", status: 402 };
  return { owner: row.owner, hash: h, left: Math.min(capLeft, bal) };
}

// ---------------------------------------------------------------- top-ups read from the chain

const S = globalThis as unknown as { __corbelCredits?: { timer: ReturnType<typeof setInterval> | null; busy: boolean } };
const st = (S.__corbelCredits ??= { timer: null, busy: false });
const meta = (k: string) => (db()?.prepare("SELECT v FROM meta WHERE k = ?").get(k) as { v: string } | undefined)?.v ?? null;
const setMeta = (k: string, v: string) => db()?.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)").run(k, v);

/** Reads USDG transfers into the treasury since the last block read and credits each sender once per transaction. */
export async function scanTopUps(): Promise<number> {
  if (st.busy || !creditsOpen()) return 0;
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
        if (r && Number(r.changes) > 0) added++;
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

export function startCreditsSweep() {
  if (st.timer || !creditsOpen()) return;
  st.timer = setInterval(() => void scanTopUps(), 30_000);
  st.timer.unref?.();
  void scanTopUps();
}
