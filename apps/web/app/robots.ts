import type { MetadataRoute } from "next";
import { BRAND } from "@corbel/config";

export default function robots(): MetadataRoute.Robots {
  return {
    // the x402 price list is the one API answer meant for crawlers and agents to find
    rules: [{ userAgent: "*", allow: ["/", "/api/x402$"], disallow: ["/api/"] }],
    sitemap: `https://${BRAND.domains.site}/sitemap.xml`,
  };
}
