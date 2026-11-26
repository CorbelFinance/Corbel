import type { NextConfig } from "next";

/**
 * Security headers for every response. The page Content Security Policy, with a per-request nonce, is set in
 * proxy.ts; API answers get a policy that allows nothing to run.
 */

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // effective over TLS only; browsers ignore it on plain http
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const config: NextConfig = {
  transpilePackages: ["@corbel/ui", "@corbel/config", "@corbel/data", "@corbel/indexer"],
  poweredByHeader: false,
  devIndicators: false, // replaced by the Corbel devkit (components/devkit)
  productionBrowserSourceMaps: false,
  // Launch and Shield are not built: their old pages go to the roadmap; launch analytics moved under Check
  async redirects() {
    return [
      { source: "/layers/launch", destination: "/roadmap", permanent: false },
      { source: "/layers/shield", destination: "/roadmap", permanent: false },
      { source: "/app/launch/analytics", destination: "/app/trust/launches", permanent: true },
      { source: "/app/launch/:path*", destination: "/roadmap", permanent: false },
      { source: "/app/shield/:path*", destination: "/app/wallet/approvals", permanent: false },
      { source: "/app/agents/pay", destination: "/app/agents/x402", permanent: true },
      { source: "/app/compute", destination: "/app/ai/chat", permanent: true },
      { source: "/app/compute/:path*", destination: "/app/ai/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // pages get their policy with a fresh nonce from proxy.ts; data answers never run scripts at all
      { source: "/api/(.*)", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }] },
      // API answers are data, never pages: no caching by intermediaries unless a route says so
      { source: "/api/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      // the check badge is made to be shown on other sites: only this one route may be loaded cross-origin
      { source: "/api/badge", headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }] },
    ];
  },
};

export default config;
