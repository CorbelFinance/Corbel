import { CHANGELOG } from "@corbel/config";

export const dynamic = "force-static";

const SITE = "https://corbel.finance";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const KIND = { new: "New", better: "Better", fix: "Fixed" } as const;
const TAG = { onchain: "on chain", report: "from a public review", experiment: "experiment" } as const;

/** GET /changelog.xml → the changelog as RSS 2.0, newest first, one item per update. */
export function GET() {
  const items = CHANGELOG.flatMap((d) =>
    d.items.map((it) => {
      const tags = it.tags?.map((t) => TAG[t]).join(", ");
      const proof = it.proof?.map((p) => `${p.label}: ${p.href}`).join(" · ");
      const body = [it.line, tags ? `(${tags})` : "", proof ? `Proof: ${proof}` : ""].filter(Boolean).join(" ");
      return `<item><title>${esc(`${KIND[it.kind]}: ${it.title}`)}</title><link>${SITE}/changelog#d-${d.day}</link><guid isPermaLink="false">${esc(`${d.day}:${it.title}`)}</guid><pubDate>${new Date(`${d.day}T12:00:00Z`).toUTCString()}</pubDate><description>${esc(body)}</description></item>`;
    }),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Corbel changelog</title><link>${SITE}/changelog</link><description>Everything that went live in Corbel, day by day.</description><language>en</language>${items.join("")}</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=600" } });
}
