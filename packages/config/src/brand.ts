/**
 * Names and addresses, in one place (chosen 2026-11-12). Not trademark-checked yet.
 * Change a name or a domain here and nowhere else.
 */
export const BRAND = {
  /** The brand on the site. */
  name: "Corbel",
  /** The team behind it: footer, metadata, handles. */
  company: "Corbel Labs",
  /** Shown in <title> and meta description. */
  description: "Token checks, best-route swaps, pool yields, bonded AI agents, and AI models with GPUs. One app for Robinhood Chain.",
  products: {
    /** The Account layer: one balance that earns. */
    account: "Corbel One",
    /** Contracts, audits and documentation. */
    protocol: "Corbel Protocol",
    /** Internal name of the balance contract and the code packages (@corbel/*). Not shown on the site. */
    core: "Corbel Core",
  },
  /** Public contact address (forwarded; the destination inbox is never shown). */
  email: "contact@corbel.finance",
  /** Community channels. null = not open yet: the site shows "Soon" and links nowhere. */
  social: { telegram: "https://t.me/corbelfinance" as string | null, x: "https://x.com/corbelfinance" as string | null, github: "https://github.com/CorbelFinance/corbel" as string | null, chart: null as string | null },
  domains: {
    site: "corbel.finance",
    app: "app.corbel.finance",
    docs: "docs.corbel.finance",
  },
  /** corbel.finance is live (app. and docs. are not set up). */
  domainsLive: true,
} as const;
