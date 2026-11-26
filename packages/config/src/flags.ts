export type LayerStatus = "live" | "preview" | "closed" | "soon";

export type LayerId = "account" | "trust" | "stocks" | "trade" | "agents" | "launch" | "shield";

/** Live: works on mainnet today (reads, or swaps the user signs, or a deployed contract). Preview: shown, not open
 * for funds. Closed or soon: not built. */
export const FLAGS: Record<LayerId | "gapFund" | "openData", LayerStatus> = {
  account: "live",
  trust: "live",
  stocks: "live",
  trade: "live",
  agents: "live",
  launch: "preview",
  shield: "soon",
  gapFund: "closed",
  openData: "closed",
};

/**
 * Tools that are built but held back from the public site: hidden from menus, tabs, the points
 * table and the alerts, their API answers 404 and their roadmap items read Building. Set one to false to ship it.
 */
export const HELD = { fair: false, xray: false, preview: false, drain: false } as const;

/**
 * Tools only $CORBEL holders open, by the lowest tier that opens each (light, plus, full, core). A tool here that is
 * also in HELD stays hidden; once released it answers holders only and tells everyone else which tier opens it.
 */
export const HOLDER_ONLY: { preview: "light" | "plus" | "full" | "core" | null; drain: "light" | "plus" | "full" | "core" | null } = { preview: null, drain: null };

export const STATUS_LABEL: Record<LayerStatus, string> = {
  live: "Live",
  preview: "Preview",
  closed: "Closed",
  soon: "Soon",
};

/** Banner shown above every layer page and app tab, by status. */
export const STATUS_BANNER: Record<LayerStatus, string> = {
  closed: "Not audited. You could lose funds. Not live yet.",
  preview: "Preview: nothing is signed or sent. Corbel contracts are not audited.",
  live: "Not audited. You could lose funds.",
  soon: "In the works. This page shows what is coming, not something you can use yet.",
};
