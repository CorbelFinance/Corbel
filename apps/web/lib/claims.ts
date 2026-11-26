/**
 * A token's team claims its Corbel check page (CLAIMS_OPEN=1). The creator wallet (as the launchpad recorded it) burns
 * $CORBEL with the token's own burn() for CLAIM_BURN_USD (default $20, valued at min(spot, 30-minute average)), then
 * adds links, team wallets and a short note. The page shows them as said by the team, next to the transaction that
 * paid for it. The checks and the score never change: a claim is a label, not a verdict.
 *
 * A claim burn goes to the zero address (burn()), a Credits top-up to the dead address: one burn never pays for both.
 */
import { TOKEN } from "@corbel/config";
import { getClient } from "@corbel/data/chain";
import { launchCreator } from "@corbel/indexer";
import { corbelCreditPrice } from "./corbelPrice";
import { store } from "./store";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO32 = `0x${"0".repeat(64)}`;
const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
export const claimsOpen = () => process.env.CLAIMS_OPEN === "1";
export const claimUsd = () => num(process.env.CLAIM_BURN_USD, 20);

export type Claim = { token: string; wallet: string; tx: string; coins: number; usd: number; website: string | null; x: string | null; telegram: string | null; team: string[]; note: string | null; at: number; updated: number };

const db = () =>
  store(
    "claims",
    `CREATE TABLE IF NOT EXISTS claims (token TEXT PRIMARY KEY, wallet TEXT NOT NULL, tx TEXT NOT NULL UNIQUE, coins REAL NOT NULL, usd REAL NOT NULL,
       website TEXT, x TEXT, telegram TEXT, team TEXT NOT NULL, note TEXT, at INTEGER NOT NULL, updated INTEGER NOT NULL);`,
  );

const rowToClaim = (r: Record<string, unknown>): Claim => ({ ...(r as Omit<Claim, "team">), team: JSON.parse(String(r.team ?? "[]")) as string[] });

export function claimOf(token: string): Claim | null {
  const r = db()?.prepare("SELECT * FROM claims WHERE token = ?").get(token.toLowerCase()) as Record<string, unknown> | undefined;
  return r ? rowToClaim(r) : null;
}

/** Plain, checked fields only: https links, an X handle, a t.me link, up to 5 wallets, a note of 200 characters. */
export function cleanFields(j: Record<string, unknown>): { website: string | null; x: string | null; telegram: string | null; team: string[]; note: string | null } | { error: string } {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const website = str(j.website) || null;
  if (website && (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[\w\-./?=&%#]*)?$/i.test(website) || website.length > 120)) return { error: "The website must be an https:// link." };
  const xs = str(j.x).replace(/^@/, "").replace(/^https?:\/\/(x|twitter)\.com\//i, "");
  const x = xs ? (/^\w{1,15}$/.test(xs) ? xs : null) : null;
  if (xs && !x) return { error: "The X account must be a handle like @name." };
  const tg = str(j.telegram).replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "");
  const telegram = tg ? (/^[A-Za-z0-9_]{4,32}$/.test(tg) ? tg : null) : null;
  if (tg && !telegram) return { error: "Telegram must be a public name like t.me/name." };
  const team = Array.isArray(j.team) ? (j.team as unknown[]).map((a) => str(a).toLowerCase()).filter(Boolean) : [];
  if (team.length > 5 || team.some((a) => !/^0x[0-9a-f]{40}$/.test(a))) return { error: "Up to 5 team wallets, each a 0x address." };
  const note = str(j.note).replace(/[<>]/g, "").slice(0, 200) || null;
  return { website, x, telegram, team: [...new Set(team)], note };
}

/** The coins a claim needs right now, or null without a price. */
export async function claimPrice(): Promise<{ usd: number; coins: number; price: number } | null> {
  const p = await corbelCreditPrice();
  if (!p) return null;
  return { usd: claimUsd(), coins: Math.ceil(claimUsd() / p.used), price: p.used };
}

/**
 * Records a claim for `token` by `wallet`. A new claim needs `tx`: a transaction from `wallet` that burned at least the
 * price in $CORBEL with burn() (a Transfer to the zero address), after CLAIMS_FROM_BLOCK, not used before. The same
 * wallet may later edit the fields without a new burn.
 */
export async function makeClaim(wallet: string, token: string, tx: string | null, fields: Record<string, unknown>): Promise<{ ok: true; claim: Claim } | { error: string; status: number }> {
  if (!claimsOpen()) return { error: "Claims are not open yet.", status: 403 };
  const w = wallet.toLowerCase(), t = token.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(t)) return { error: "Send the token's address.", status: 400 };
  const f = cleanFields(fields);
  if ("error" in f) return { error: f.error, status: 400 };
  const d = db();
  if (!d) return { error: "Claims are not available right now.", status: 503 };
  const creator = launchCreator(t);
  if (!creator) return { error: "We only know the creator of tokens made on a launchpad we read. This token cannot be claimed yet.", status: 400 };
  if (creator !== w) return { error: "Only the wallet that created this token can claim its page.", status: 403 };
  const now = Date.now();
  const have = claimOf(t);
  if (have) {
    if (have.wallet !== w) return { error: "This page is already claimed.", status: 409 };
    d.prepare("UPDATE claims SET website = ?, x = ?, telegram = ?, team = ?, note = ?, updated = ? WHERE token = ?").run(f.website, f.x, f.telegram, JSON.stringify(f.team), f.note, now, t);
    return { ok: true, claim: claimOf(t)! };
  }
  if (!tx || !/^0x[0-9a-f]{64}$/i.test(tx)) return { error: "Send the transaction of your burn.", status: 400 };
  if (d.prepare("SELECT 1 FROM claims WHERE tx = ?").get(tx.toLowerCase())) return { error: "That burn already paid for a claim.", status: 409 };
  const price = await claimPrice();
  if (!price) return { error: "No price for $CORBEL right now. Try again in a minute.", status: 503 };
  const client = getClient(process.env.RPC_URL);
  if (!client) return { error: "Chain reads are paused.", status: 503 };
  const r = await client.getTransactionReceipt({ hash: tx as `0x${string}` }).catch(() => null);
  if (!r || r.status !== "success") return { error: "That transaction is not confirmed yet, or it failed.", status: 400 };
  if (Number(r.blockNumber) < num(process.env.CLAIMS_FROM_BLOCK, 0)) return { error: "That burn is older than claims.", status: 400 };
  let burned = 0n;
  for (const l of r.logs) {
    if (l.address.toLowerCase() !== TOKEN.contract.toLowerCase() || l.topics[0] !== TRANSFER || l.topics[2] !== ZERO32) continue;
    if (`0x${(l.topics[1] ?? "").slice(26)}`.toLowerCase() !== w) continue;
    burned += BigInt(l.data);
  }
  const coins = Number(burned / 10n ** 12n) / 1e6;
  if (coins < price.coins * 0.98) return { error: `That burn was ${Math.round(coins).toLocaleString("en-US")} $CORBEL; a claim needs ${price.coins.toLocaleString("en-US")} now.`, status: 400 };
  d.prepare("INSERT INTO claims (token, wallet, tx, coins, usd, website, x, telegram, team, note, at, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(t, w, tx.toLowerCase(), coins, Math.round(coins * price.price * 100) / 100, f.website, f.x, f.telegram, JSON.stringify(f.team), f.note, now, now);
  return { ok: true, claim: claimOf(t)! };
}

/** Every claim burn so far, for the token page. */
export function claimTotals(): { claims: number; coins: number } {
  const r = db()?.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(coins), 0) AS c FROM claims").get() as { n: number; c: number } | undefined;
  return { claims: r?.n ?? 0, coins: r?.c ?? 0 };
}
