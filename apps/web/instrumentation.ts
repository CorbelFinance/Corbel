/**
 * Runs once when the server starts. The token's transfer index (lib/sybil) feeds holder tiers and the reward
 * multipliers; it used to start only on the first sign-in after a restart, so a quiet day left it hours behind.
 * Starting it here keeps it current from boot (one pass every 15 minutes; the state lives on globalThis, so a later
 * startLinker() from a route never starts a second timer).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startLinker } = await import("./lib/sybil");
  startLinker();
}
