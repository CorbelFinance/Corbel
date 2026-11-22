/**
 * How public figures are counted. When a rule changes, its version and date change here, the pages that show the
 * figure say so, and the changelog gets an entry the same day. A figure published under an older rule is never
 * silently replaced.
 */
export const DRAIN_RULE = {
  version: 2,
  since: "22 Nov 2026",
  text: "A pool counts as drained only if it once had liquidity and lost it. A pair that never got liquidity is empty, not drained.",
  before: "Until 22 Nov 2026 pairs that never got liquidity were counted as drained too, so earlier figures were much higher.",
} as const;
