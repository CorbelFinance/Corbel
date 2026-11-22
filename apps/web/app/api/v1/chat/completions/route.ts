import { guardWait } from "@/lib/guard";
import { autoPick, modeOf } from "@/lib/autopick";
import { isAvailable, models, modelsReady, providerModel, type Model } from "@/lib/compute";
import { charge, MARKUP, modelKeyOf, balance } from "@/lib/credits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/v1/chat/completions: the OpenAI chat shape, paid from Credits with a Corbel model key
 * (Authorization: Bearer cm_…). model is a catalogue id or "auto", "auto:price", "auto:speed", "auto:quality".
 * Priced at the catalogue's list price plus MARKUP, per token used; before a call the most it could cost (its input and
 * max_tokens) must fit in what the key may still spend. The model, the answer and
 * the usage come back, with the cost and the balance left.
 */
const MAX_TOKENS = 8192;
type Msg = { role: string; content: unknown };

const price = (m: Model, inTok: number, outTok: number) => ((inTok * m.pin + outTok * m.pout) / 1e6) * (1 + MARKUP);
const textOf = (c: unknown) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : "")).join(" ") : "");
const err = (message: string, status: number) => Response.json({ error: { message, type: "corbel_error" } }, { status });

export async function POST(req: Request) {
  const g = await guardWait(req, "v1");
  if ("blocked" in g) return g.blocked;
  let streaming = false;
  try {
    const k = modelKeyOf(req);
    if ("error" in k) return err(k.error, k.status);
    const base = process.env.AI_BASE_URL, upKey = process.env.AI_API_KEY;
    if (!base || !upKey) return err("Models are not open right now.", 503);
    const j = (await req.json().catch(() => null)) as { model?: unknown; messages?: unknown; max_tokens?: unknown; temperature?: unknown; stream?: unknown } | null;
    const msgs = (Array.isArray(j?.messages) ? (j!.messages as Msg[]) : []).filter((m) => m && typeof m === "object" && ["system", "user", "assistant"].includes(m.role));
    if (!msgs.length) return err("Send messages: [{role, content}].", 400);
    await modelsReady();
    const all = (models()?.rows ?? []).filter((m) => isAvailable(m.id));
    const asked = typeof j?.model === "string" ? j.model : "auto";
    const mode = modeOf(asked);
    const model = mode ? autoPick(all, mode) : (all.find((m) => m.id === asked) ?? null);
    if (!model) return err(mode ? "No model fits that choice right now." : "Unknown model. GET /api/v1/models lists them.", 400);
    const route = providerModel(model.id);
    if (!route) return err("This model is not open right now.", 400);
    const maxTokens = Math.min(MAX_TOKENS, Math.max(1, Number(j?.max_tokens) || 1024));
    const inEst = Math.ceil(msgs.reduce((a, m) => a + textOf(m.content).length, 0) / 3);
    const most = price(model, inEst, maxTokens);
    if (most > k.left) return err(`This call could cost up to $${most.toFixed(4)}, more than this key may still spend ($${k.left.toFixed(4)}). Top up, raise the key's cap or lower max_tokens.`, 402);
    const stream = j?.stream === true;
    const body: Record<string, unknown> = { model: route, messages: msgs, max_tokens: maxTokens, stream };
    if (typeof j?.temperature === "number") body.temperature = j.temperature;
    if (stream) body.stream_options = { include_usage: true };
    const up = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${upKey}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
    if (!up.ok || !up.body) return err("The model did not answer. Nothing was charged.", 502);

    if (!stream) {
      const r = (await up.json()) as { choices?: { message?: { role: string; content: string }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const pin = r.usage?.prompt_tokens ?? inEst, pout = r.usage?.completion_tokens ?? 0;
      const cost = charge(k.owner, "model", price(model, pin, pout), { key: k.hash, ref: model.id });
      return Response.json({
        object: "chat.completion",
        model: model.id,
        choices: (r.choices ?? []).map((c, i) => ({ index: i, message: { role: c.message?.role ?? "assistant", content: c.message?.content ?? "" }, finish_reason: c.finish_reason ?? "stop" })),
        usage: { prompt_tokens: pin, completion_tokens: pout, total_tokens: pin + pout },
        corbel: { cost_usd: cost, balance_usd: balance(k.owner).balance },
      });
    }

    // streaming: pieces of text pass through as they come; the usage at the end is what gets charged
    const reader = up.body.getReader();
    const enc = new TextEncoder(), dec = new TextDecoder();
    let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
    let outChars = 0;
    const release = () => g.release();
    const out = new ReadableStream({
      async start(ctl) {
        let buf = "";
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              const d = line.startsWith("data:") ? line.slice(5).trim() : "";
              if (!d || d === "[DONE]") continue;
              try {
                const p = JSON.parse(d) as { choices?: { delta?: { content?: string }; finish_reason?: string | null }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
                if (p.usage) usage = p.usage;
                const piece = p.choices?.[0]?.delta?.content ?? "";
                outChars += piece.length;
                if (piece || p.choices?.[0]?.finish_reason) ctl.enqueue(enc.encode(`data: ${JSON.stringify({ object: "chat.completion.chunk", model: model.id, choices: [{ index: 0, delta: piece ? { content: piece } : {}, finish_reason: p.choices?.[0]?.finish_reason ?? null }] })}\n\n`));
              } catch {
                /* a line that is not JSON is skipped */
              }
            }
          }
        } finally {
          const pin = usage?.prompt_tokens ?? inEst, pout = usage?.completion_tokens ?? Math.ceil(outChars / 3);
          const cost = charge(k.owner, "model", price(model, pin, pout), { key: k.hash, ref: model.id });
          ctl.enqueue(enc.encode(`data: ${JSON.stringify({ object: "chat.completion.chunk", model: model.id, choices: [], usage: { prompt_tokens: pin, completion_tokens: pout, total_tokens: pin + pout }, corbel: { cost_usd: cost, balance_usd: balance(k.owner).balance } })}\n\ndata: [DONE]\n\n`));
          ctl.close();
          release();
        }
      },
    });
    streaming = true;
    return new Response(out, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  } finally {
    if (!streaming) g.release();
  }
}
