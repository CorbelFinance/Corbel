/**
 * Robinhood Chain. Every field is [VERIFY] against the official docs.
 * Nothing here is used to send transactions.
 */
export const ROBINHOOD_CHAIN = {
  id: 4663, // verified 2026-11-12: eth_chainId on the public RPC returned 0x1237
  name: "Robinhood Chain",
  network: "mainnet",
  stack: "Arbitrum Orbit", // [VERIFY]
  verified: true,
  /** Server-side env only. The browser never calls the RPC; it calls /api/net and /api/token. */
  rpcEnvKey: "RPC_URL",
} as const;
