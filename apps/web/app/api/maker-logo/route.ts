import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/maker-logo?m=anthropic → the AI maker's own icon (its site's icon), fetched once on the server and kept on
 * disk. Only makers in this list; anything else is 404 and the page shows a monogram instead.
 */
const DOMAINS: Record<string, string> = {
  openai: "openai.com",
  anthropic: "anthropic.com",
  google: "gemini.google.com",
  "x-ai": "x.ai",
  deepseek: "deepseek.com",
  "meta-llama": "meta.ai",
  meta: "meta.ai",
  mistralai: "mistral.ai",
  qwen: "qwen.ai",
  moonshotai: "kimi.com",
  "z-ai": "z.ai",
  nvidia: "nvidia.com",
  cohere: "cohere.com",
  amazon: "aws.amazon.com",
  perplexity: "perplexity.ai",
  minimax: "minimax.io",
  tencent: "hunyuan.tencent.com",
  xiaomi: "mi.com",
  baidu: "baidu.com",
  microsoft: "microsoft.com",
  ibm: "ibm.com",
  kuaishou: "klingai.com",
  bytedance: "seed.bytedance.com",
  runway: "runwayml.com",
  alibaba: "wan.video",
  luma: "lumalabs.ai",
  "black-forest-labs": "bfl.ai",
  heygen: "heygen.com",
  ideogram: "ideogram.ai",
  topaz: "topazlabs.com",
  magnific: "magnific.ai",
  suno: "suno.com",
  elevenlabs: "elevenlabs.io",
};
const DIR = process.env.CORBEL_DB ? join(dirname(resolve(/*turbopackIgnore: true*/ process.env.CORBEL_DB)), "logos") : resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "..", "data", "logos");
const missing = new Map<string, number>();

export async function GET(req: Request) {
  const m = (new URL(req.url).searchParams.get("m") ?? "").toLowerCase();
  const domain = DOMAINS[m];
  if (!domain) return new Response(null, { status: 404 });
  const file = join(DIR, `maker-${m}.png`);
  const headers = { "content-type": "image/png", "cache-control": "public, max-age=604800, immutable" };
  if (existsSync(file)) return new Response(readFileSync(file), { headers });
  if (Date.now() - (missing.get(m) ?? 0) < 3600_000) return new Response(null, { status: 404 });
  try {
    const r = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12_000) });
    const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    // a real PNG of some size, not the 16px generic globe
    if (!buf || buf.length < 400 || buf.subarray(0, 4).toString("hex") !== "89504e47") throw new Error("no icon");
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, buf);
    return new Response(buf, { headers });
  } catch {
    missing.set(m, Date.now());
    return new Response(null, { status: 404 });
  }
}
