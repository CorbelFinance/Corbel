/**
 * Radar alerts for holders: every 10 minutes the new pools that pass a plain filter become one digest, and each
 * subscribed holder gets it after a delay set by tier, so higher tiers see new pools first. The filter: not drained,
 * paired with ETH, WETH or USDG, and a launcher with at most MAX_LAUNCHES pools (serial launchers are left out).
 * Delivered to the holder's linked Telegram chat when the bot is on, and always kept for the account page.
 */
import { recentPools } from "@corbel/indexer";
import { launchpadName, launchpadOf } from "@corbel/config";
import { store } from "./store";
import { tierOf } from "./tiers";
import { linkedChat, sendTo, telegramOn } from "./telegram";

const DIGEST_MS = 10 * 60_000;
const TICK_MS = 60_000;
const MAX_LAUNCHES = 2;
const MAX_ROWS = 10;
const SITE = "https://corbel.finance";
/** Minutes after a digest is made before each tier receives it: the higher the tier, the earlier. */
export const RADAR_DELAY: Record<string, number> = { core: 0, full: 2, plus: 5, light: 10 };

const db = () =>
  store(
    "radaralerts",
    `CREATE TABLE IF NOT EXISTS subs (owner TEXT PRIMARY KEY, since INTEGER NOT NULL);
     CREATE TABLE IF NOT EXISTS digests (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, text TEXT NOT NULL, n INTEGER NOT NULL);
     CREATE TABLE IF NOT EXISTS sent (digest INTEGER NOT NULL, owner TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (digest, owner));
     CREATE TABLE IF NOT EXISTS state (k TEXT PRIMARY KEY, v TEXT NOT NULL);`,
  );

const delayOf = (owner: string): number | null => {
  const t = tierOf(owner);
  return t && t.id in RADAR_DELAY ? RADAR_DELAY[t.id]! : null;
};

export function radarStatus(owner: string) {
  const o = owner.toLowerCase();
  const on = !!db()?.prepare("SELECT 1 FROM subs WHERE owner = ?").get(o);
  const delay = delayOf(o);
  const recent = (db()?.prepare("SELECT d.at, d.text FROM sent s JOIN digests d ON d.id = s.digest WHERE s.owner = ? ORDER BY s.at DESC LIMIT 5").all(o) as { at: number; text: string }[] | undefined) ?? [];
  return { on, eligible: delay !== null, delayMin: delay, telegram: telegramOn() && linkedChat(o) !== null, recent };
}

/** Turns the alerts on or off. Returns an error to show, or null. */
export function setRadar(owner: string, on: boolean): string | null {
  const o = owner.toLowerCase();
  const d = db();
  if (!d) return "Alerts are not open right now.";
  if (on && delayOf(o) === null) return "Radar alerts open from the Light tier.";
  if (on) d.prepare("INSERT OR IGNORE INTO subs (owner, since) VALUES (?, ?)").run(o, Date.now());
  else d.prepare("DELETE FROM subs WHERE owner = ?").run(o);
  return null;
}

/** One digest of the new pools since the last one that pass the filter, or null when none did. */
function makeDigest(): number | null {
  const d = db();
  const rows = recentPools({ limit: 200 });
  if (!d || !rows?.length) return null;
  const last = Number((d.prepare("SELECT v FROM state WHERE k = 'block'").get() as { v: string } | undefined)?.v ?? 0);
  const head = Math.max(...rows.map((r) => r.block));
  d.prepare("INSERT OR REPLACE INTO state (k, v) VALUES ('block', ?)").run(String(head));
  // the first run only marks where to start: no digest of pools older than the alerts themselves
  if (!last) return null;
  const fresh = rows.filter((r) => r.block > last && r.dead !== 1 && r.base !== null && r.launches <= MAX_LAUNCHES).slice(0, MAX_ROWS);
  if (!fresh.length) return null;
  const lines = fresh.map((r) => {
    const pad = launchpadOf(r.pad, r.hook);
    return `${r.symbol ?? "?"} · ${r.base} · ${pad ? `${launchpadName(pad)} · ` : ""}launcher's pools: ${r.launches}\n${SITE}/app/trust/check?q=${r.token}`;
  });
  const text = `New pools on Robinhood Chain, last 10 minutes (${fresh.length}):\n\n${lines.join("\n\n")}\n\nNot advice: check before you buy.`;
  return Number(d.prepare("INSERT INTO digests (at, text, n) VALUES (?, ?, ?)").run(Date.now(), text, fresh.length).lastInsertRowid);
}

/** Sends each subscriber the digests whose tier delay has passed and that it has not had yet. */
async function deliver() {
  const d = db();
  if (!d) return;
  const now = Date.now();
  const subs = d.prepare("SELECT owner, since FROM subs").all() as { owner: string; since: number }[];
  const digests = d.prepare("SELECT id, at, text FROM digests WHERE at > ? ORDER BY id").all(now - 2 * 3600_000) as { id: number; at: number; text: string }[];
  for (const s of subs) {
    const delay = delayOf(s.owner);
    if (delay === null) continue; // the tier was lost: nothing more until it is back
    for (const g of digests) {
      if (g.at < s.since || now - g.at < delay * 60_000) continue;
      const r = d.prepare("INSERT OR IGNORE INTO sent (digest, owner, at) VALUES (?, ?, ?)").run(g.id, s.owner, now);
      if (Number(r.changes) === 0) continue;
      const chat = telegramOn() ? linkedChat(s.owner) : null;
      if (chat !== null) await sendTo(chat, g.text);
    }
  }
  d.prepare("DELETE FROM digests WHERE at < ?").run(now - 7 * 86_400_000);
  d.prepare("DELETE FROM sent WHERE at < ?").run(now - 7 * 86_400_000);
}

const G = globalThis as unknown as { __corbelRadarAlerts?: { timer: ReturnType<typeof setInterval> | null; lastDigest: number; busy: boolean } };
const st = (G.__corbelRadarAlerts ??= { timer: null, lastDigest: 0, busy: false });

export function startRadarAlerts() {
  if (st.timer) return;
  st.timer = setInterval(async () => {
    if (st.busy) return;
    st.busy = true;
    try {
      if (Date.now() - st.lastDigest >= DIGEST_MS) {
        st.lastDigest = Date.now();
        makeDigest();
      }
      await deliver();
    } catch {
      // the next tick tries again
    } finally {
      st.busy = false;
    }
  }, TICK_MS);
  st.timer.unref?.();
}
