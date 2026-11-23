/**
 * Telegram: alerts on the watched tokens and wallets, and /check in a chat. Off until TELEGRAM_BOT_TOKEN is set on the
 * server (TELEGRAM_BOT_NAME gives the t.me link). A wallet links its chat with a one-time code from its account page
 * (t.me/<bot>?start=<code>); /stop unlinks. Only the chat id is stored next to the wallet. Requests to Telegram use the
 * process's default network settings.
 *
 * Alerts per wallet follow its tier: the first `alerts` saved items (oldest first) are sent, the rest stay on the site.
 * Full and Core holders' alerts are sent before everyone else's in each sweep.
 */
import { randomBytes } from "node:crypto";
import { AI_ACCESS, hasFull } from "@corbel/config";
import { buildReport, getClient, parseAddress, redact } from "@corbel/data/chain";
import { creatorRecord, launchCreator, launchTx, launcherHistory, poolLauncher, sameTicker, v4PoolsFor } from "@corbel/indexer";
import { store } from "./store";
import { tierOf } from "./tiers";
import { onWatchEvent, type WatchEvent } from "./watchEngine";
import { watchersOf } from "./watchlist";

const SITE = "https://corbel.finance";
const CODE_TTL = 15 * 60_000;
export const telegramOn = () => !!process.env.TELEGRAM_BOT_TOKEN;
export const botName = () => process.env.TELEGRAM_BOT_NAME ?? null;

const db = () =>
  store(
    "telegram",
    `CREATE TABLE IF NOT EXISTS chats (owner TEXT PRIMARY KEY, chat INTEGER NOT NULL, linked INTEGER NOT NULL);
     CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, owner TEXT NOT NULL, at INTEGER NOT NULL);
     CREATE TABLE IF NOT EXISTS state (k TEXT PRIMARY KEY, v INTEGER NOT NULL);`,
  );

async function api(method: string, body: Record<string, unknown>, timeoutMs = 30_000): Promise<{ ok: boolean; result?: unknown }> {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  return (await r.json()) as { ok: boolean; result?: unknown };
}
const send = (chat: number, text: string) => api("sendMessage", { chat_id: chat, text, disable_web_page_preview: true }).catch((e) => (console.error("[telegram]", redact(e)), { ok: false }));

/** A one-time code that links this wallet's chat, and the link that carries it. */
export function linkCode(owner: string): { code: string; url: string | null } {
  const code = randomBytes(8).toString("hex");
  const d = db()!;
  d.prepare("DELETE FROM codes WHERE at < ?").run(Date.now() - CODE_TTL);
  d.prepare("INSERT INTO codes (code, owner, at) VALUES (?, ?, ?)").run(code, owner.toLowerCase(), Date.now());
  const n = botName();
  return { code, url: n ? `https://t.me/${n}?start=${code}` : null };
}
export const linkedChat = (owner: string) => (db()?.prepare("SELECT chat FROM chats WHERE owner = ?").get(owner.toLowerCase()) as { chat: number } | undefined)?.chat ?? null;
export const unlink = (owner: string) => void db()?.prepare("DELETE FROM chats WHERE owner = ?").run(owner.toLowerCase());

/** The reply to /check <address>: the same checks as the site, in a few lines. */
export async function checkText(q: string): Promise<string> {
  const a = parseAddress(q.trim());
  if (!a) return "Send /check followed by a token's 0x address.";
  const client = getClient(process.env.RPC_URL);
  if (!client) return "Chain reads are paused. Try again later.";
  const r = await buildReport(client, a, a, { v4PoolsFor, launcherHistory, sameTicker, poolLauncher, launchCreator, creatorRecord, launchTx });
  const mark: Record<string, string> = { pass: "✓", warn: "▲", fail: "✕", unknown: "?" };
  const lines = r.checks.map((c) => `${mark[c.result] ?? "?"} ${c.name}${c.metric ? ` · ${c.metric}` : ""}`);
  return [`${r.meta?.symbol ?? "Token"} · ${a}`, ...lines, `${SITE}/app/trust/check?q=${a}`].join("\n");
}

/** Handles one incoming message; returns the reply (or null for none). Exported for tests. */
export async function onMessage(chat: number, text: string): Promise<string | null> {
  const [cmd, arg = ""] = text.trim().split(/\s+/, 2) as [string, string?];
  const d = db()!;
  if (cmd === "/start" && arg) {
    const row = d.prepare("SELECT owner, at FROM codes WHERE code = ?").get(arg) as { owner: string; at: number } | undefined;
    if (!row || Date.now() - row.at > CODE_TTL) return "That link has expired. Make a new one on your Corbel account page.";
    d.prepare("DELETE FROM codes WHERE code = ?").run(arg);
    d.prepare("INSERT INTO chats (owner, chat, linked) VALUES (?, ?, ?) ON CONFLICT(owner) DO UPDATE SET chat = excluded.chat, linked = excluded.linked").run(row.owner, chat, Date.now());
    return `Linked to ${row.owner.slice(0, 6)}…${row.owner.slice(-4)}. Alerts on your saved tokens and wallets come here. /check <address> checks a token, /stop unlinks.`;
  }
  if (cmd === "/start") return "Corbel checks tokens on Robinhood Chain. /check <address> checks one. To get alerts, link this chat from your Corbel account page.";
  if (cmd === "/stop") {
    d.prepare("DELETE FROM chats WHERE chat = ?").run(chat);
    return "Unlinked. No more alerts here.";
  }
  if (cmd === "/check") return checkText(arg).catch(() => "The chain did not answer. Try again in a minute.");
  return null;
}

/** Sends one watch event to every linked owner who watches it, within their tier's alert count; top tiers first. */
async function deliver(e: WatchEvent) {
  const d = db();
  if (!d) return;
  const who = watchersOf(e.token)
    .map((w) => ({ ...w, chat: linkedChat(w.owner), tier: tierOf(w.owner) }))
    .filter((w) => w.chat !== null && w.tier && (w.tier.alerts === null || w.rank < w.tier.alerts))
    .sort((a, b) => Number(hasFull(b.tier)) - Number(hasFull(a.tier)));
  const link = e.kind === "drain" ? `${SITE}/app/portfolio?address=${e.token}` : `${SITE}/app/trust/check?q=${e.token}`;
  for (const w of who) await send(w.chat!, `${e.symbol}: ${e.text}\n${link}`);
}

const G = globalThis as unknown as { __corbelTg?: { on: boolean } };
/** Starts the bot once per process: the long-poll for messages and the alert delivery. Off without a token. */
export function startTelegram() {
  if (!telegramOn() || G.__corbelTg?.on) return;
  G.__corbelTg = { on: true };
  onWatchEvent((e) => void deliver(e));
  void (async () => {
    const d = db();
    let offset = ((d?.prepare("SELECT v FROM state WHERE k = 'offset'").get() as { v: number } | undefined)?.v ?? 0) as number;
    for (;;) {
      try {
        const r = (await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] }, 40_000)) as { ok: boolean; result?: { update_id: number; message?: { chat: { id: number }; text?: string } }[] };
        for (const u of r.result ?? []) {
          offset = u.update_id + 1;
          const m = u.message;
          if (m?.text) {
            const reply = await onMessage(m.chat.id, m.text).catch(() => null);
            if (reply) await send(m.chat.id, reply);
          }
        }
        d?.prepare("INSERT INTO state (k, v) VALUES ('offset', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(offset);
      } catch (e) {
        console.error("[telegram]", redact(e));
        await new Promise((ok) => setTimeout(ok, 10_000));
      }
    }
  })();
}

/** How many saved items a tier sends to Telegram, for the account page. */
export const alertsFor = (owner: string) => tierOf(owner)?.alerts ?? AI_ACCESS.tiers[0]!.alerts;
