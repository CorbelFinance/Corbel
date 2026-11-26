import { store } from "./store";

/**
 * Limits the owner sets from the admin panel. A value set there wins; otherwise the server env; otherwise the default.
 * Read on every request (one indexed row), so a change applies at once, without a restart.
 */
export const LIMIT_KEYS = {
  chatPerWallet: { env: "CHAT_PER_WALLET", def: 25, min: 0, max: 1000, label: "Chat messages per wallet a day" },
  imagePerWallet: { env: "MEDIA_IMAGES", def: 3, min: 0, max: 500, label: "Pictures per wallet a day" },
  videoPerWallet: { env: "MEDIA_VIDEOS", def: 1, min: 0, max: 100, label: "Videos per wallet a day" },
  audioPerWallet: { env: "MEDIA_AUDIO", def: 5, min: 0, max: 500, label: "Sound clips per wallet a day" },
  mediaTokensDay: { env: "MEDIA_TOKENS_DAY", def: 60, min: 0, max: 5000, label: "Generation budget a day, all wallets (upstream tokens)" },
} as const;
export type LimitKey = keyof typeof LIMIT_KEYS;

const db = () => store("settings", "CREATE TABLE IF NOT EXISTS limits (k TEXT PRIMARY KEY, v REAL NOT NULL, at INTEGER NOT NULL);");

export function limit(k: LimitKey): number {
  const row = db()?.prepare("SELECT v FROM limits WHERE k = ?").get(k) as { v: number } | undefined;
  if (row) return row.v;
  const d = LIMIT_KEYS[k];
  const e = Number(process.env[d.env]);
  return Number.isFinite(e) && process.env[d.env] !== undefined ? e : d.def;
}

export function allLimits() {
  return (Object.keys(LIMIT_KEYS) as LimitKey[]).map((k) => {
    const d = LIMIT_KEYS[k];
    const set = db()?.prepare("SELECT v, at FROM limits WHERE k = ?").get(k) as { v: number; at: number } | undefined;
    return { k, label: d.label, value: limit(k), min: d.min, max: d.max, setAt: set?.at ?? null };
  });
}

/** Sets a limit from the panel; a value outside its range is refused. Returns an error to show, or null. */
export function setLimit(k: string, v: unknown): string | null {
  if (!(k in LIMIT_KEYS)) return "Unknown limit.";
  const d = LIMIT_KEYS[k as LimitKey];
  const n = Number(v);
  if (!Number.isFinite(n) || n < d.min || n > d.max) return `${d.label}: ${d.min} to ${d.max}.`;
  db()?.prepare("INSERT INTO limits (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at").run(k, Math.round(n * 10) / 10, Date.now());
  return null;
}
