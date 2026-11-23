import { parseAddress } from "@corbel/data/chain";
import { score, type Check } from "@/components/app/score";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/badge?token=<address> → an SVG badge any site can embed: "Corbel check · 72/90 · CLEAN · block N".
 * Built from the same report as the token check (GET /api/token), cached ten minutes. A token we cannot read shows
 * "not checked", never a made-up score.
 *   <a href="https://corbel.finance/app/trust/check?q=ADDRESS"><img src="https://corbel.finance/api/badge?token=ADDRESS" alt="Corbel check"></a>
 */
const TTL = 600_000;
const G = globalThis as unknown as { __corbelBadge?: Map<string, { at: number; svg: string }> };
const cache = (G.__corbelBadge ??= new Map());
const TONE: Record<string, string> = { CLEAN: "#6fe7a8", OK: "#a9c25d", SKETCHY: "#f4c152", RISKY: "#ff9a5c", TRAP: "#ff5a5a" };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function svg(label: string, value: string, tone: string, foot: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="56" viewBox="0 0 280 56" role="img" aria-label="${esc(`Corbel check: ${label} ${value}`)}">
<rect width="280" height="56" rx="10" fill="#0b0d0c"/><rect x=".5" y=".5" width="279" height="55" rx="9.5" fill="none" stroke="#2a2f2c"/>
<rect x="0" y="10" width="3" height="36" fill="${tone}"/>
<text x="16" y="23" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="10" letter-spacing="1.4" fill="#8a9690">CORBEL CHECK</text>
<text x="16" y="44" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="19" font-weight="700" fill="#ffffff">${esc(value)}</text>
<text x="264" y="23" text-anchor="end" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="11" font-weight="700" letter-spacing="1.2" fill="${tone}">${esc(label)}</text>
<text x="264" y="44" text-anchor="end" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="10" fill="#8a9690">${esc(foot)}</text>
</svg>`;
}

const headers = { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=600", "cross-origin-resource-policy": "cross-origin" };

export async function GET(req: Request) {
  const token = parseAddress(new URL(req.url).searchParams.get("token") ?? "");
  if (!token) return new Response(svg("NO TOKEN", "Pass ?token=0x…", "#8a9690", "corbel.finance"), { status: 400, headers });
  const key = token.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return new Response(hit.svg, { headers });
  let body: string;
  try {
    // the same report the token check shows, from this site's own route (rate limits and caching apply there)
    const r = await fetch(new URL(`/api/token?q=${token}`, req.url), { headers: { "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "" }, signal: AbortSignal.timeout(60_000) });
    const j = (await r.json()) as { checks?: Check[]; meta?: { symbol?: string; block?: string }; holders?: unknown; market?: unknown };
    const notToken = j.checks?.some((c) => /^Not a token contract|^No contract at this address/.test(c.reason));
    if (!r.ok || !j.checks || notToken) {
      body = svg("NOT CHECKED", notToken ? "Not a token" : "Try again later", "#8a9690", "corbel.finance");
    } else {
      const sc = score(j.checks, j.holders as never, j.market as never);
      const sym = (j.meta?.symbol ?? "").slice(0, 10);
      const block = j.meta?.block ? `block ${Number(j.meta.block).toLocaleString("en-US")}` : "latest block";
      body = svg(sc.tag, `${sym ? `${sym} · ` : ""}${sc.total}/90`, TONE[sc.tag] ?? "#6fe7a8", block);
    }
  } catch {
    body = svg("NOT CHECKED", "Try again later", "#8a9690", "corbel.finance");
  }
  cache.set(key, { at: Date.now(), svg: body });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return new Response(body, { headers });
}
