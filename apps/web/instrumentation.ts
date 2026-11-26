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
  // the Telegram bot answers in the group and posts the feed from boot, not from the first account visit
  const { startTelegram } = await import("./lib/telegram");
  startTelegram();
  warmOnBoot();
  warmExamples();
}

/**
 * The background refreshers (market, big swaps, trending, the CORBEL report, burns, stocks) start on their first
 * request. After a restart nobody should be that first request and wait: once the server listens, it asks its own
 * API once, one path at a time, and every refresher keeps itself going from there.
 */
const WARM = ["/api/net", "/api/trending", "/api/market?token=0x0bd7d308f8e1639fab988df18a8011f41eacad73&w=4", "/api/whales?min=1000", "/api/token?q=0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1", "/api/burns", "/api/stocks", "/api/rewards"];
function warmOnBoot() {
  const a = process.argv, i = a.findIndex((x) => x === "-p" || x === "--port");
  const port = process.env.PORT ?? (i >= 0 ? a[i + 1] : null) ?? "3000";
  setTimeout(async () => {
    for (const p of WARM) await fetch(`http://127.0.0.1:${port}${p}`, { signal: AbortSignal.timeout(120_000) }).catch(() => null);
  }, 8_000).unref?.();
}

/**
 * The address check and the X-ray open on examples: the three example addresses of the address check, and the busiest
 * wallets of the big-swaps feed that the X-ray offers. Each read takes up to a minute, so they are read here every eight
 * minutes and a visitor opening one gets the answer at once.
 */
const ADDRESS_EXAMPLES = ["0x8e649485f2800ec9cb8f1382c6b27c5cb7782f98", "0x0bd7d308f8e1639fab988df18a8011f41eacad73", "0x8366a39cc670b4001a1121b8f6a443a643e40951"];
function warmExamples() {
  const a = process.argv, i = a.findIndex((x) => x === "-p" || x === "--port");
  const base = `http://127.0.0.1:${process.env.PORT ?? (i >= 0 ? a[i + 1] : null) ?? "3000"}`;
  const get = (p: string) => fetch(base + p, { signal: AbortSignal.timeout(180_000) }).then((r) => r.json() as Promise<Record<string, unknown>>).catch(() => null);
  // a read answers 202 while it runs on; asking again joins the same run
  const settle = async (p: string) => {
    for (let n = 0; n < 6; n++) if (!(await get(p))?.pending) return;
  };
  const pass = async () => {
    for (const x of ADDRESS_EXAMPLES) await settle(`/api/address?a=${x}`);
    const w = (await get("/api/whales")) as { rows?: { who: string }[] } | null;
    const seen = new Set<string>();
    const busy = (w?.rows ?? []).map((r) => r.who.toLowerCase()).filter((x) => /^0x[0-9a-f]{40}$/.test(x) && !seen.has(x) && !!seen.add(x)).slice(0, 2);
    for (const x of busy) await settle(`/api/xray?address=${x}`);
  };
  setTimeout(() => {
    void pass();
    setInterval(() => void pass(), 8 * 60_000).unref?.();
  }, 60_000).unref?.();
  // who holds the busiest tokens, so lists can show it without reading the chain per row: one at a time, every 12 min
  const holders = async () => {
    const tr = (await get("/api/trending")) as { rows?: { token: string; symbol: string | null; volume: number }[] } | null;
    const skip = new Set(["ETH", "WETH", "USDG", "USDC"]);
    const top = (tr?.rows ?? []).filter((r) => r.volume > 0 && !skip.has((r.symbol ?? "").toUpperCase()) && /^0x[0-9a-fA-F]{40}$/.test(r.token)).sort((a, b) => b.volume - a.volume).slice(0, 16);
    for (const r of top) await get(`/api/holders?token=${r.token}`);
  };
  setTimeout(() => {
    void holders();
    setInterval(() => void holders(), 12 * 60_000).unref?.();
  }, 150_000).unref?.();
}
