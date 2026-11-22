/**
 * Auto pick: a request for "auto", "auto:price", "auto:speed" or "auto:quality" goes to one model from the live
 * catalogue, by a stated rule.
 *  - price: the cheapest text model with at least 32K of context (input plus three times output, per 1M tokens)
 *  - speed: the cheapest of the small, fast lines (mini, flash, haiku, nano, lite, small, turbo, 8b) with 16K+ context
 *  - quality: the dearest text model up to $30 per 1M output tokens: price stands in for the makers' own ranking
 * "auto" alone is price. Models that only draw, speak or read images are left out.
 */
import type { Model } from "./compute";

export type Mode = "price" | "speed" | "quality";
const FAST = /\b(mini|flash|haiku|nano|lite|small|turbo|8b|7b|9b)\b/i;
const cost = (m: Model) => m.pin + 3 * m.pout;

export function modeOf(id: string): Mode | null {
  if (id === "auto") return "price";
  const m = /^auto:(price|speed|quality)$/.exec(id);
  return m ? (m[1] as Mode) : null;
}

export function autoPick(models: Model[], mode: Mode): Model | null {
  const text = models.filter((m) => (m.kind === "text" || m.kind === "code") && m.out.includes("text") && m.pin >= 0 && m.pout > 0);
  if (mode === "price") return [...text].filter((m) => m.ctx >= 32_000).sort((a, b) => cost(a) - cost(b))[0] ?? null;
  if (mode === "speed") return [...text].filter((m) => m.ctx >= 16_000 && FAST.test(`${m.id} ${m.name}`)).sort((a, b) => cost(a) - cost(b))[0] ?? null;
  return [...text].filter((m) => m.pout <= 30).sort((a, b) => b.pout - a.pout || b.ctx - a.ctx)[0] ?? null;
}
