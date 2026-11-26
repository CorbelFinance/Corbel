import { AI_ACCESS, hasFull, FULL_TIER } from "@corbel/config";
import { createHash, randomBytes } from "node:crypto";
import { session, sameOrigin } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { mediaDb } from "@/lib/mediaStore";
import { limit } from "@/lib/limits";
import { MEDIA_MODELS, cleanOptions, mediaModel, type MediaKind } from "@/lib/mediaCatalog";
import { mediaOn, mediaStatus, startMedia } from "@/lib/mediaUpstream";
import { allMediaModels, markBroken } from "@/lib/mediaAll";
import { takeUpload } from "@/lib/mediaUploads";
import { isAdmin, tierOf } from "@/lib/tiers";
import { costToday } from "@/lib/sybil";
import { limitKey, noteCost, noteVisit, startLinker } from "@/lib/sybil";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Pictures, film and sound in the chat.
 * GET  /api/media → the models and their options, and how many your wallet has left today, per kind.
 * POST /api/media {kind, model, prompt, options} → {id}: the job starts. Needs a wallet sign-in.
 * GET  /api/media?id=… → {state: "working" | "done" | "failed", url?, type?}. The file comes from /api/media/file.
 * Only a hash of the wallet is kept, with a count per day and the job's id; prompts are passed on, not stored.
 */
// limits from the owner's panel (lib/limits.ts), read on each request
const LIMIT = {
  get image() {
    return limit("imagePerWallet");
  },
  get video() {
    return limit("videoPerWallet");
  },
  get audio() {
    return limit("audioPerWallet");
  },
} as Record<MediaKind, number>;
/** the most upstream tokens all wallets together may spend in a day */
const budget = () => limit("mediaTokensDay");
const MAX_PROMPT = 2000;

const db = mediaDb;
const today = () => new Date().toISOString().slice(0, 10);
const who = (address: string) => createHash("sha256").update(`corbel-media:${address.toLowerCase()}`).digest("hex").slice(0, 32);
const used = (w: string, k: MediaKind) => (db()?.prepare("SELECT n FROM uses WHERE day = ? AND who = ? AND kind = ?").get(today(), w, k) as { n: number } | undefined)?.n ?? 0;
const spent = () => (db()?.prepare("SELECT tokens FROM spend WHERE day = ?").get(today()) as { tokens: number } | undefined)?.tokens ?? 0;
/** The day's counts for this wallet: a top holder's come from the full tier, everyone else's from the panel's limits. */
const limitsFor = (address: string | null): Record<MediaKind, number> => {
  const t = tierOf(address);
  return t ? { image: t.image, video: t.video, audio: t.voice } : LIMIT;
};
const left = (w: string | null, address: string | null = null) => (w ? Object.fromEntries((["image", "video", "audio"] as MediaKind[]).map((k) => [k, Math.max(0, limitsFor(address)[k] - used(w, k))])) : null);
/** Every model: the checked ones open to all, the full set marked for top holders. */
const findModel = (id: string) => mediaModel(id) ?? allMediaModels().find((m) => m.id === id) ?? null;

const publicModels = () => [
  ...MEDIA_MODELS.map((m) => ({ id: m.id, kind: m.kind, label: m.label, maker: m.maker, line: m.line, seconds: m.seconds, options: m.options, top: false })),
  ...allMediaModels().map((m) => ({ id: m.id, kind: m.kind, label: m.label, maker: m.maker, line: m.line, seconds: m.seconds, options: m.options, top: true, needs: m.needs, tool: m.tool })),
];

export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const s = session(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ open: mediaOn(), signedIn: !!s, top: hasFull(tierOf(s?.address)), limits: limitsFor(s?.address ?? null), left: left(s ? who(limitKey(s.address).key) : null, s?.address ?? null), models: publicModels() }, { headers: { "cache-control": "no-store" } });
    if (!s) return Response.json({ error: "Sign in with your wallet." }, { status: 401 });
    const job = db()?.prepare("SELECT chat, who, kind, at, file, type FROM jobs WHERE id = ?").get(id) as { chat: string; who: string; kind: string; at: number; file: string | null; type: string | null } | undefined;
    if (!job || job.who !== who(s.address)) return Response.json({ error: "No such job." }, { status: 404 });
    if (job.file) return Response.json({ state: "done", url: `/api/media/file?id=${id}`, type: job.type }, { headers: { "cache-control": "no-store" } });
    if (Date.now() - job.at > 15 * 60_000) return Response.json({ state: "failed", error: "This took too long. Try again." });
    const st = await mediaStatus(job.chat).catch(() => ({ state: "working" as const }));
    if (st.state === "done") {
      db()?.prepare("UPDATE jobs SET file = ?, type = ? WHERE id = ?").run(st.file, st.type, id);
      return Response.json({ state: "done", url: `/api/media/file?id=${id}`, type: st.type }, { headers: { "cache-control": "no-store" } });
    }
    if (st.state === "failed") return Response.json({ state: "failed", error: st.why });
    return Response.json({ state: "working", since: job.at }, { headers: { "cache-control": "no-store" } });
  } finally {
    g.release();
  }
}

export async function POST(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    if (!sameOrigin(req)) return Response.json({ error: "Wrong origin." }, { status: 403 });
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet to make pictures, video and sound." }, { status: 401 });
    if (!mediaOn()) return Response.json({ error: "Pictures, video and sound are not open right now." }, { status: 503 });
    const j = (await req.json().catch(() => null)) as { model?: unknown; prompt?: unknown; options?: Record<string, unknown>; file?: unknown } | null;
    const m = typeof j?.model === "string" ? findModel(j.model) : null;
    if (!m) return Response.json({ error: "Pick a model." }, { status: 400 });
    const tier = tierOf(s.address);
    if (m.id.startsWith("x:") && !hasFull(tier)) return Response.json({ error: `This model is for ${FULL_TIER.name} holders and above: ${FULL_TIER.minCoins.toLocaleString("en-US")} $CORBEL held for ${AI_ACCESS.holdDays} days.` }, { status: 403 });
    // a model that starts from a file gets the one this wallet uploaded; tools may run with no words at all
    const needs = (m as { needs?: "image" | "video" | null }).needs ?? null;
    const isTool = !!(m as { tool?: boolean }).tool;
    const input = needs ? takeUpload(typeof j?.file === "string" ? j.file : "", s.address) : null;
    if (needs && (!input || input.kind !== needs)) return Response.json({ error: `Attach the ${needs} ${m.label} starts from.` }, { status: 400 });
    const prompt = typeof j?.prompt === "string" ? j.prompt.trim().slice(0, m.maxPrompt ?? MAX_PROMPT) : "";
    if (!prompt && !isTool) return Response.json({ error: "Describe what to make." }, { status: 400 });
    const opts = cleanOptions(m, j?.options);
    const cost = m.cost(opts, prompt.length);
    noteVisit(req, s.address);
    startLinker();
    const lk = limitKey(s.address);
    if (lk.state === "suspect") return Response.json({ error: "Pictures, video and sound are paused for this wallet while it is reviewed. Text chat still works." }, { status: 403 });
    const w = who(lk.key);
    const lim = limitsFor(s.address);
    const admin = isAdmin(s.address);
    if (!admin && used(w, m.kind) >= lim[m.kind]) return Response.json({ error: `That is today's ${lim[m.kind]} for ${m.kind === "image" ? "pictures" : m.kind === "video" ? "videos" : "sound"}. The count resets at 00:00 UTC.` }, { status: 429 });
    // a tier's cap in credits a day, whatever the counts allow
    if (!admin && tier && tier.cap > 0 && costToday(lk.key) + cost > tier.cap) return Response.json({ error: `That is today's ${tier.cap} credits for this wallet. It resets at 00:00 UTC.` }, { status: 429 });
    if (spent() + cost > budget()) return Response.json({ error: "Generation is full for today. It opens again at 00:00 UTC." }, { status: 429 });

    const chat = await startMedia(m.kind, m.ai, m.type, prompt, { ...m.fixed, ...(m.map ? m.map(opts) : opts) }, input ? [input.file] : []).catch((e: unknown) => {
      const why = e instanceof Error ? e.message.slice(0, 200) : "error";
      console.error("[api/media] refused", m.id, why);
      markBroken(m.id, why);
      return null;
    });
    if (!chat) return Response.json({ error: "The model did not take this request. Try again, or pick another one." }, { status: 502 });
    const id = randomBytes(12).toString("base64url");
    const d = db();
    // the job belongs to the wallet that asked; the count belongs to its group
    d?.prepare("INSERT INTO jobs (id, chat, who, kind, at) VALUES (?, ?, ?, ?, ?)").run(id, chat, who(s.address), m.kind, Date.now());
    d?.prepare("INSERT INTO uses (day, who, kind, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, who, kind) DO UPDATE SET n = n + 1").run(today(), w, m.kind);
    d?.prepare("INSERT INTO spend (day, tokens) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET tokens = tokens + excluded.tokens").run(today(), cost);
    noteCost(lk.key, "open", cost);
    d?.prepare("INSERT INTO models (day, model, kind, n, tokens) VALUES (?, ?, ?, 1, ?) ON CONFLICT(day, model) DO UPDATE SET n = n + 1, tokens = tokens + excluded.tokens").run(today(), m.id, m.kind, cost);
    return Response.json({ id, seconds: m.seconds, left: left(w, s.address) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  } finally {
    g.release();
  }
}
