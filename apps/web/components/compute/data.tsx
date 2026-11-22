"use client";

/** Shared data and helpers for the Compute pages: the model and GPU catalogues from /api/compute. */
import { useEffect, useState } from "react";

export type Model = { id: string; name: string; maker: string; ctx: number; pin: number; pout: number; pimg: number | null; in: string[]; out: string[]; created: number; about: string; kind: "text" | "code" | "image" | "audio" | "video" | "vision"; avail?: boolean; media?: boolean };
export type Gpu = { id: string; name: string; vram: number; secure: number | null; community: number | null; lowest: number | null };

export function useCatalog<T>(what: "models" | "gpus") {
  const [rows, setRows] = useState<T[] | null>(null);
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    let off = false;
    let t: ReturnType<typeof setTimeout>;
    const load = () =>
      fetch(`/api/compute?what=${what}`)
        .then(async (r) => ({ code: r.status, j: (await r.json()) as { rows?: T[]; at?: number; provider?: boolean } }))
        .then(({ code, j }) => {
          if (off) return;
          if (code === 202 || !j.rows) t = setTimeout(load, 4000);
          else {
            setRows(j.rows);
            setAt(j.at ?? null);
            // the list of models we run was not read yet: show the prices now and ask again for the open ones
            if (what === "models" && j.provider === false) t = setTimeout(load, 6000);
          }
        })
        .catch(() => !off && (t = setTimeout(load, 8000)));
    void load();
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [what]);
  return { rows, at };
}

/** A stable colour per maker, from a small dark-ground palette. */
const PAL = ["#ff9a5c", "#f2c46d", "#ff8fa3", "#9b86e4", "#6cc0d0", "#6fe7a8", "#93a6ff", "#e8a07a", "#d9b8ff", "#7fd1b9"];
export const makerColor = (m: string) => PAL[[...m].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7) % PAL.length]!;
export const makerName = (m: string) =>
  ({ openai: "OpenAI", anthropic: "Anthropic", google: "Google", "x-ai": "xAI", deepseek: "DeepSeek", "meta-llama": "Meta", meta: "Meta", mistralai: "Mistral", qwen: "Qwen", moonshotai: "Moonshot", "z-ai": "Zhipu", nvidia: "NVIDIA", cohere: "Cohere", amazon: "Amazon", perplexity: "Perplexity", minimax: "MiniMax", tencent: "Tencent", xiaomi: "Xiaomi", kuaishou: "Kuaishou", bytedance: "ByteDance", runway: "Runway", alibaba: "Alibaba", luma: "Luma AI", "black-forest-labs": "Black Forest Labs", heygen: "HeyGen", higgsfield: "Higgsfield", ideogram: "Ideogram", topaz: "Topaz Labs", magnific: "Magnific", suno: "Suno", elevenlabs: "ElevenLabs" })[m] ?? m.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const money = (v: number) => (v === 0 ? "$0" : v < 0.01 ? `$${v.toPrecision(2)}` : v < 10 ? `$${v.toFixed(2)}` : `$${v.toLocaleString("en", { maximumFractionDigits: 0 })}`);
export const ctxK = (n: number) => (n >= 1e6 ? `${Number((n / 1e6).toFixed(1))}M` : `${Math.round(n / 1000)}K`);
/** The makers people ask for by name come first in picks. */
export const LEADS = ["anthropic", "openai", "google", "x-ai", "deepseek", "qwen", "moonshotai", "meta-llama", "mistralai", "z-ai"];
/** The newest model of each lead maker that does a task, then other makers, never a batch variant. */
export function leadPicks(rows: Model[], fit: (m: Model) => boolean, n: number): Model[] {
  const pool = rows.filter((m) => fit(m) && !m.media && !m.id.includes(":") && !/\(batch\)/i.test(m.name)).sort((a, b) => b.created - a.created);
  const out: Model[] = [];
  const seen = new Set<string>();
  const rank = (m: Model) => (LEADS.includes(m.maker) ? LEADS.indexOf(m.maker) : 99);
  // models our provider runs first, then the makers people ask for by name, newest first
  for (const m of [...pool].sort((a, b) => Number(!!b.avail) - Number(!!a.avail) || rank(a) - rank(b) || b.created - a.created)) {
    if (seen.has(m.maker) || out.length >= n) continue;
    seen.add(m.maker);
    out.push(m);
  }
  return out;
}
export const KINDS = [
  { id: "text", label: "Write" },
  { id: "code", label: "Code" },
  { id: "vision", label: "See" },
  { id: "image", label: "Draw" },
  { id: "video", label: "Film" },
  { id: "audio", label: "Hear" },
] as const;

/** The maker's own icon on a light tile; its monogram while the icon loads or when there is none. */
export function Monogram({ maker, size = 34 }: { maker: string; size?: number }) {
  const c = makerColor(maker);
  const [ok, setOk] = useState<boolean | null>(null);
  return (
    <span aria-hidden className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl font-semibold" style={{ width: size, height: size, background: ok ? "#f4efe9" : `color-mix(in srgb, ${c} 18%, #120c0a)`, color: c, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 35%, transparent)`, fontSize: size * 0.36 }}>
      {!ok && makerName(maker).slice(0, 2)}
      {ok !== false && (
        // eslint-disable-next-line @next/next/no-img-element -- a small icon served by our own API
        <img src={`/api/maker-logo?m=${encodeURIComponent(maker)}`} alt="" width={size} height={size} onLoad={() => setOk(true)} onError={() => setOk(false)} className={ok ? "absolute inset-[18%] h-[64%] w-[64%] object-contain" : "absolute h-0 w-0 opacity-0"} />
      )}
    </span>
  );
}
