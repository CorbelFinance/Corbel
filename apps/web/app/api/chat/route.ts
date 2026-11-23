import { AI_ACCESS, hasFull, FULL_TIER } from "@corbel/config";
import { createHash } from "node:crypto";
import { limit } from "@/lib/limits";
import { limitKey, noteVisit, startLinker } from "@/lib/sybil";
import { allTextModels, askText, textModel } from "@/lib/textAll";
import { tierOf } from "@/lib/tiers";
import { session, sameOrigin } from "@/lib/auth";
import { availReady, isAvailable, models, providerModel } from "@/lib/compute";
import { guardWait } from "@/lib/guard";
import { store } from "@/lib/store";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Compute · Chat.
 * GET  /api/chat → the models you can talk to now, and how many messages your wallet has left today.
 * POST /api/chat {model, messages} → the answer, streamed as server-sent events: {"t": "..."} pieces, then
 *      {"done": true, "left": n}. A wallet sign-in opens the daily limit; without one a visitor gets GUEST_PER_DAY short
 *      messages a day (counted per hashed IP, all guests together capped at GUEST_ALL), text models only, so anyone can
 *      see the chat answer before connecting a wallet. Prompts and answers pass through and are not stored or
 *      logged; the only thing kept is a count of messages per day for a hash of the wallet, for the daily limit.
 */
const perWallet = () => limit("chatPerWallet");
/** the longest single message; the history sent along is capped separately */
const MSG_CHARS = 4000;
const PER_DAY = 1500;
const GUEST_PER_DAY = 3;
const GUEST_ALL = 300;
const GUEST_CHARS = 1000;
const GUEST_TURNS = 6;
/** A visitor without a wallet, as a salted hash of the IP from the header the runtime names (CLIENT_IP_HEADER). */
const guestOf = (req: Request) => {
  const name = process.env.CLIENT_IP_HEADER;
  const ip = (name && req.headers.get(name)?.split(",")[0]?.trim()) || "local";
  return `g:${createHash("sha256").update(`corbel-guest:${process.env.SESSION_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 30)}`;
};
const guestsToday = () => ((db()?.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM uses WHERE day = ? AND who LIKE 'g:%'").get(today()) as { n: number } | undefined)?.n ?? 0);
const MAX_CHARS = 24_000;
const MAX_TURNS = 24;
const KINDS = new Set(["text", "code", "vision"]);
/** What the model is told about where it runs, so questions about Corbel get real answers. */
const SYSTEM = [
  "You are the assistant inside Corbel (corbel.finance), an app on Robinhood Chain (chain id 4663).",
  "Corbel's tools: Check (a token check before you buy: can you sell, transfer tax, owner powers, liquidity lock, lookalike name, creator history, with a Corbel Score out of 90, plus project research); Radar (every new pool, with its launchpad and creator); Trade (a terminal with charts, best-route swap quotes simulated at the latest block, Sell in parts, Big swaps); Stocks (Robinhood stock tokens across every venue, the weekend gap); Earn (what liquidity pools paid, minus what a price move took back, and an LP position planner); Predict (YES/NO markets in USDG on whether a pool keeps its liquidity, settled by the chain); Agents (mandates and a guard every agent trade must pass); Wallet tools (exposure, stress test, paper account, share link); AI (this chat, a model catalogue, GPU prices).",
  "Be plain and exact. Never give financial advice or price predictions. Never ask for or accept private keys or seed phrases. If you do not know something about Corbel, say so.",
].join(" ");

const db = () => store("chatuse", "CREATE TABLE IF NOT EXISTS uses (day TEXT NOT NULL, who TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, who)); CREATE TABLE IF NOT EXISTS models (day TEXT NOT NULL, model TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, model));");
const today = () => new Date().toISOString().slice(0, 10);
const who = (address: string) => createHash("sha256").update(`corbel-chat:${address.toLowerCase()}`).digest("hex").slice(0, 32);
const used = (w: string) => ((db()?.prepare("SELECT n FROM uses WHERE day = ? AND who = ?").get(today(), w) as { n: number } | undefined)?.n ?? 0);
const usedAll = () => ((db()?.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM uses WHERE day = ?").get(today()) as { n: number } | undefined)?.n ?? 0);
const bump = (w: string) => db()?.prepare("INSERT INTO uses (day, who, n) VALUES (?, ?, 1) ON CONFLICT(day, who) DO UPDATE SET n = n + 1").run(today(), w);

function chatModels() {
  const m = models();
  if (!m) return [];
  return m.rows
    .filter((r) => KINDS.has(r.kind) && !r.id.includes(":") && !/\(batch\)/i.test(r.name) && isAvailable(r.id))
    .sort((a, b) => b.created - a.created)
    .map((r) => ({ id: r.id, name: r.name, maker: r.maker, ctx: r.ctx, kind: r.kind, pin: r.pin, pout: r.pout }));
}

export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const s = session(req);
    await availReady();
    const lim = tierOf(s?.address)?.text ?? perWallet();
    const guestLeft = s ? null : guestsToday() >= GUEST_ALL ? 0 : Math.max(0, GUEST_PER_DAY - used(guestOf(req)));
    return Response.json({ signedIn: !!s, top: hasFull(tierOf(s?.address)), limit: lim, left: s ? Math.max(0, lim - used(who(limitKey(s.address).key))) : null, guestLeft, guestPerDay: GUEST_PER_DAY, models: [...chatModels(), ...allTextModels()] }, { headers: { "cache-control": "no-store" } });
  } finally {
    g.release();
  }
}

type Msg = { role: "user" | "assistant" | "system"; content: string };

export async function POST(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  let released = false;
  let streaming = false;
  const release = () => {
    if (released) return;
    released = true;
    g.release();
  };
  try {
    if (!sameOrigin(req)) return Response.json({ error: "Wrong origin." }, { status: 403 });
    const s = session(req);
    const guest = !s;
    const base = process.env.AI_BASE_URL, key = process.env.AI_API_KEY;
    const j = (await req.json().catch(() => null)) as { model?: unknown; messages?: unknown } | null;
    const model = typeof j?.model === "string" ? j.model : "";
    // the full set (ids "x:"): top holders only
    const full = model.startsWith("x:");
    const tier = s ? tierOf(s.address) : null;
    if (guest && full) return Response.json({ error: "Sign in with your wallet to use this model." }, { status: 401 });
    if (full && !hasFull(tier)) return Response.json({ error: `This model is for Full holders: ${FULL_TIER.minCoins.toLocaleString("en-US")} $CORBEL held for ${AI_ACCESS.holdDays} days.` }, { status: 403 });
    if (full && !textModel(model)) return Response.json({ error: "This model is not open right now. Pick another one." }, { status: 400 });
    if (!full && (!base || !key)) return Response.json({ error: "Chat is not open right now." }, { status: 503 });
    const route = full ? model : model && isAvailable(model) ? providerModel(model) : null;
    if (!route) return Response.json({ error: "This model is not available to chat with." }, { status: 400 });
    const raw = Array.isArray(j?.messages) ? (j!.messages as unknown[]) : [];
    const msgs: Msg[] = raw
      .filter((m): m is Msg => !!m && typeof m === "object" && ["user", "assistant", "system"].includes((m as Msg).role) && typeof (m as Msg).content === "string")
      .slice(guest ? -GUEST_TURNS : -MAX_TURNS)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
    if (!msgs.length || msgs[msgs.length - 1]!.role !== "user") return Response.json({ error: "Write a message first." }, { status: 400 });
    if (msgs.reduce((a, m) => a + m.content.length, 0) > MAX_CHARS * 2) return Response.json({ error: "The conversation is too long. Start a new one." }, { status: 413 });
    if (s) {
      noteVisit(req, s.address);
      startLinker();
    }
    const w = s ? who(limitKey(s.address).key) : guestOf(req);
    const maxChars = guest ? GUEST_CHARS : (tier?.chars ?? MSG_CHARS), perDay = guest ? GUEST_PER_DAY : (tier?.text ?? perWallet());
    if (guest && guestsToday() >= GUEST_ALL) return Response.json({ error: "Free messages are used up for today. Sign in with your wallet to keep chatting." }, { status: 429 });
    if (msgs[msgs.length - 1]!.content.length > maxChars) return Response.json({ error: `A message is at most ${maxChars.toLocaleString("en")} characters.` }, { status: 413 });
    if (used(w) >= perDay) return Response.json({ error: guest ? `That was today's ${perDay} free messages. Sign in with your wallet to keep chatting.` : `That is today's ${perDay} messages. The count resets at 00:00 UTC.` }, { status: 429 });
    if (usedAll() >= PER_DAY) return Response.json({ error: "Chat is full for today. It opens again at 00:00 UTC." }, { status: 429 });

    if (full) {
      // the model gets one message: the earlier turns go in as plain text above the question
      const last = msgs[msgs.length - 1]!.content;
      const before = msgs.slice(0, -1).filter((m) => m.role !== "system").map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
      const prompt = before ? `The conversation so far:\n\n${before.slice(-12_000)}\n\nAnswer the user's new message:\n${last}` : last;
      bump(w);
      db()?.prepare("INSERT INTO models (day, model, n) VALUES (?, ?, 1) ON CONFLICT(day, model) DO UPDATE SET n = n + 1").run(today(), model);
      const left = Math.max(0, perDay - used(w));
      const enc = new TextEncoder();
      const out = new ReadableStream<Uint8Array>({
        async start(c) {
          const send = (o: unknown) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
          try {
            for await (const t of askText(model, prompt, AbortSignal.any([req.signal, AbortSignal.timeout(200_000)]))) send({ t });
            award(req, "chat"); // points only once the answer came through whole
            send({ done: true, left });
          } catch (e) {
            send({ error: e instanceof Error ? e.message : "The model did not answer.", left });
          } finally {
            c.close();
            release();
          }
        },
        cancel() {
          release();
        },
      });
      streaming = true;
      return new Response(out, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
    }

    const up = await fetch(`${base!.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key!}`, "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ model: route, messages: [{ role: "system", content: SYSTEM }, ...msgs.filter((m) => m.role !== "system")], stream: true, max_tokens: 1500 }),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(120_000)]),
    }).catch(() => null);
    if (!up || !up.ok || !up.body) return Response.json({ error: "The model did not answer. Try again, or pick another one." }, { status: 502 });
    bump(w);
    // a count per model and day for the owner, nothing about who asked or what
    db()?.prepare("INSERT INTO models (day, model, n) VALUES (?, ?, 1) ON CONFLICT(day, model) DO UPDATE SET n = n + 1").run(today(), model);
    const left = Math.max(0, perDay - used(w));

    // re-emit only the text: the client never sees the upstream's fields
    const enc = new TextEncoder(), dec = new TextDecoder();
    let buf = "";
    const out = new ReadableStream<Uint8Array>({
      async start(c) {
        const send = (o: unknown) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
        const reader = up.body!.getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              const l = line.trim();
              if (!l.startsWith("data:")) continue;
              const data = l.slice(5).trim();
              if (data === "[DONE]") continue;
              try {
                const t = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
                if (t) send({ t });
              } catch {
                /* a partial or non-JSON line */
              }
            }
          }
          award(req, "chat"); // points only once the answer came through whole
          send({ done: true, left });
        } catch {
          send({ error: "The answer was cut off.", left });
        } finally {
          c.close();
          release();
        }
      },
      cancel() {
        release();
      },
    });
    streaming = true;
    return new Response(out, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  } catch {
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  } finally {
    // a running stream releases its slot when it ends; every other exit releases it here
    if (!streaming) release();
  }
}
