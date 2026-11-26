import type { MetadataRoute } from "next";
import { BRAND, FLAGS, LAYERS } from "@corbel/config";
import { DOCS } from "@/components/docs/pages";

const BASE = `https://${BRAND.domains.site}`;
const LEGAL = ["terms", "privacy", "risk", "cookies"];

/** Public pages only. App tabs are listed for layers that are open (preview or live). */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = ["", ...DOCS.map((d) => `/docs/${d.slug}`), "/roadmap", "/burn", "/changelog", "/accuracy", "/thesis", "/analytics", "/security", "/status", ...LAYERS.map((l) => `/layers/${l.id}`), ...LEGAL.map((d) => `/legal/${d}`)];
  const app = LAYERS.filter((l) => FLAGS[l.id] === "preview" || FLAGS[l.id] === "live").flatMap((l) => l.tabs.map((t) => `/app/${l.id}/${t.id}`));
  return [...site, ...app, "/app/predict", "/app/portfolio"].map((p) => ({ url: `${BASE}${p}` }));
}
