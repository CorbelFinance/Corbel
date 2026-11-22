import type { MetadataRoute } from "next";
import { BRAND } from "@corbel/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `https://${BRAND.domains.site}/sitemap.xml`,
  };
}
