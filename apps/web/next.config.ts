import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Security headers for every response. CSP without nonces (pages stay static, per Next's CSP guide):
 * scripts only from this origin, and connect-src 'self' means a page can only ever talk to our own /api,
 * so even injected code could not send data anywhere else. No frames, no plugins, no foreign forms.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // effective over TLS only; browsers ignore it on plain http
  // short while the domain is new: raise to max-age=31536000; includeSubDomains after a few stable days
  { key: "Strict-Transport-Security", value: "max-age=300" },
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
      // API answers are data, never pages: no caching by intermediaries unless a route says so
      { source: "/api/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      // the check badge is made to be shown on other sites: only this one route may be loaded cross-origin
      { source: "/api/badge", headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }] },
    ];
  },
};

export default config;
