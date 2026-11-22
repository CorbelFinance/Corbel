/**
 * Compute catalogue: AI models and GPUs with their live list prices, read from public catalogues on the server and
 * cached. No keys, nothing bought: these are the prices the market shows right now.
 */
import { gpuProvider } from "./gpuProvider";
import { keepSnap, loadSnap } from "./snapshot";

export type Model = {
  id: string;
  name: string;
  maker: string;
  ctx: number;
  /** dollars per 1M tokens */
  pin: number;
  pout: number;
  /** dollars per image when the model draws */
  pimg: number | null;
  in: string[];
  out: string[];
  created: number;
  about: string;
  kind: "text" | "code" | "image" | "audio" | "video" | "vision";
};
export type Gpu = { id: string; name: string; vram: number; secure: number | null; community: number | null; lowest: number | null };

const OR = process.env.MODELS_API_URL ?? "";
const H = { "user-agent": "Mozilla/5.0", accept: "application/json" };
const G = globalThis as unknown as { __corbelCompute?: { models: { at: number; rows: Model[] } | null; gpus: { at: number; rows: Gpu[] } | null; busy: Set<string> } };
const box = (G.__corbelCompute ??= { models: loadSnap("models"), gpus: loadSnap("gpus"), busy: new Set() });

const per1M = (v: unknown) => (v == null || v === "" ? 0 : Math.max(0, Number(v) * 1e6));
function kindOf(id: string, out: string[], inp: string[]): Model["kind"] {
  if (out.includes("image")) return "image";
  if (out.includes("audio")) return "audio";
  if (out.includes("video")) return "video";
  if (/coder|codex|code|devstral|codestral/i.test(id)) return "code";
  if (inp.includes("image")) return "vision";
  return "text";
}

async function loadModels() {
  const r = await fetch(`${OR}/models`, { headers: H, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`models ${r.status}`);
  const j = (await r.json()) as { data: { id: string; name: string; context_length?: number; created?: number; description?: string; pricing?: Record<string, string>; architecture?: { input_modalities?: string[]; output_modalities?: string[] } }[] };
  const rows: Model[] = j.data
    .filter((m) => !m.id.endsWith(":free") && !m.id.startsWith("~") && !m.id.includes("/router"))
    .map((m) => {
      const inp = m.architecture?.input_modalities ?? ["text"];
      const out = m.architecture?.output_modalities ?? ["text"];
      const img = m.pricing?.image ? Number(m.pricing.image) : null;
      return {
        id: m.id,
        name: m.name.replace(/^[^:]+:\s*/, ""),
        maker: m.id.split("/")[0]!,
        ctx: m.context_length ?? 0,
        pin: per1M(m.pricing?.prompt),
        pout: per1M(m.pricing?.completion),
        // "image" on a model that only reads images is the price of an input image, not of a drawing
        pimg: img && img > 0 && out.includes("image") ? img : null,
        in: inp,
        out,
        created: m.created ?? 0,
        about: (m.description ?? "").split(/(?<=\.)\s/)[0]!.slice(0, 200),
        kind: kindOf(m.id, out, inp),
      };
    });
  box.models = { at: Date.now(), rows };
  keepSnap("models", box.models);
}

async function loadGpus() {
  // the price list comes through the private provider module (lib/gpuProvider): no provider name or API in this code
  const p = await gpuProvider();
  if (!p?.prices) throw new Error("gpus: no provider");
  const rows: Gpu[] = (await p.prices()).sort((a, b) => Math.min(a.community ?? 1e9, a.secure ?? 1e9) - Math.min(b.community ?? 1e9, b.secure ?? 1e9));
  box.gpus = { at: Date.now(), rows };
  keepSnap("gpus", box.gpus);
}

/** Serve what is cached at once; refresh behind it when older than `ttl`. */
function refresh(key: "models" | "gpus", ttl: number) {
  const cur = box[key];
  if (cur && Date.now() - cur.at < ttl) return;
  if (box.busy.has(key)) return;
  box.busy.add(key);
  (key === "models" ? loadModels() : loadGpus())
    .catch((e) => console.error(`[compute] ${key}`, (e as Error).message))
    .finally(() => box.busy.delete(key));
}

export function models() {
  refresh("models", 30 * 60_000);
  return box.models;
}
export function gpus() {
  refresh("gpus", 10 * 60_000);
  return box.gpus;
}


/**
 * Which catalogue models our own provider runs: its /models list, read once an hour with the key from env
 * (AI_BASE_URL, AI_API_KEY). Names are matched loosely ("claude-opus-5.5" = "anthropic/claude-opus-5-5");
 * "uncensored" variants are never offered.
 */
const AV = globalThis as unknown as { __corbelAvail?: { at: number; ids: Set<string>; route: Map<string, string>; busy: boolean; tried: number } };
const norm = (s: string) => s.toLowerCase().replace(/^orig\//, "").replace(/^[a-z0-9-]+\//, "").replace(/\./g, "-").replace(/[^a-z0-9-]/g, "");
/** Fills the lookup from the provider's ids. */
function setAvail(a: { ids: Set<string>; route: Map<string, string> }, ids: string[]) {
  a.ids = new Set(ids.map(norm));
  // the provider's own id for each model, to send requests under
  a.route = new Map();
  for (const id of ids) if (!a.route.has(norm(id))) a.route.set(norm(id), id);
}
// the last list read is kept on disk, so a restart serves it at once instead of "0 open" while the first read is out
const av = (AV.__corbelAvail ??= (() => {
  const a = { at: 0, ids: new Set<string>(), route: new Map<string, string>(), busy: false, tried: 0 };
  const snap = loadSnap<{ at: number; ids: string[] }>("avail");
  if (snap?.ids?.length) {
    setAvail(a, snap.ids);
    a.at = snap.at;
  }
  return a;
})());

let availing: Promise<void> | null = null;
function refreshAvail(): Promise<void> | null {
  const base = process.env.AI_BASE_URL, key = process.env.AI_API_KEY;
  if (!base || !key) return null;
  if (av.busy) return availing;
  if (Date.now() - av.at < 3600_000) return null;
  // after a failed read, wait a minute before the next one; the old list keeps serving meanwhile
  if (av.ids.size && Date.now() - av.tried < 60_000) return null;
  av.busy = true;
  av.tried = Date.now();
  availing = fetch(`${base.replace(/\/$/, "")}/models`, { headers: { authorization: `Bearer ${key}`, accept: "application/json" }, signal: AbortSignal.timeout(20_000) })
    .then((r) => (r.ok ? (r.json() as Promise<{ data?: { id: string }[] }>) : null))
    .then((j) => {
      const ids = (j?.data ?? []).map((m) => m.id).filter((id) => !/uncensored/i.test(id));
      // an empty or broken answer never wipes a list we already have
      if (!ids.length) return;
      setAvail(av, ids);
      av.at = Date.now();
      keepSnap("avail", { at: av.at, ids });
    })
    .catch(() => undefined)
    .finally(() => (av.busy = false));
  return availing;
}
/** Waits (up to `ms`) for the first read of which models our provider runs, so a fresh server never answers empty. */
export async function availReady(ms = 9000) {
  if (av.ids.size) return;
  const p = refreshAvail();
  if (p) await Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

/** True when our provider runs this catalogue model. */
export function isAvailable(id: string) {
  refreshAvail();
  return av.ids.has(norm(id));
}
export const providerOn = () => !!process.env.AI_API_KEY && av.ids.size > 0;
/** The provider's id for a catalogue model we run, or null. */
export function providerModel(id: string) {
  refreshAvail();
  return av.route.get(norm(id)) ?? null;
}

/** Waits for the list of models we run to be read (after a restart it loads in the background). */
export async function modelsReady() {
  await refreshAvail();
}

/**
 * A panel of independent models for a second opinion: one per maker, in a fixed order of makers, up to `n`. Different
 * makers, so the answers do not share one training. Empty when none is open.
 */
export function panelModels(n = 4): string[] {
  refreshAvail();
  const ids = [...av.route.values()];
  const makers = [/claude|anthropic/i, /gpt-|openai/i, /gemini|google/i, /deepseek/i, /qwen/i, /grok|x-ai/i, /kimi|moonshot/i, /glm|z-ai/i, /llama|meta-/i, /mistral/i];
  const out: string[] = [];
  for (const re of makers) {
    // the maker's smaller, faster models first: a verdict needs a few words, not a long think
    const theirs = ids.filter((id) => re.test(id) && !/vision|embed|image|audio|tts|realtime|search|preview|thinking|reason|-r1|o1|o3/i.test(id));
    const pick = theirs.find((id) => /mini|flash|haiku|small|lite|8b|7b|turbo|chat/i.test(id)) ?? theirs[0];
    if (pick && !out.includes(pick)) out.push(pick);
    if (out.length >= n) break;
  }
  return out;
}

/** A small, fast model we run, for short machine-written briefs (launch watch). Null when none is open. */
export function briefModel() {
  refreshAvail();
  const ids = [...av.route.values()];
  for (const re of [/gpt-4o-mini|gpt-4\.1-mini|gpt-5-mini/i, /haiku/i, /flash/i, /llama.*(8b|70b)/i, /qwen/i, /mistral|deepseek/i]) {
    const hit = ids.find((id) => re.test(id));
    if (hit) return hit;
  }
  return ids[0] ?? null;
}
