import { keepSnap, loadSnap } from "@/lib/snapshot";
import { getClient, readStockDesk, redact, type StockDesk } from "@corbel/data/chain";
import { stockCandidates, v4PoolsBetween } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";
import { byToken, dsTokens } from "@/lib/pairs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/stocks → issuer stock tokens with a simulated one-token price in USDG, plus lookalikes that copy the name
 * but not the issuer code. One shared snapshot, refreshed in the background at most every 3 minutes. Read-only.
 */
const TTL = 180_000;
const G = globalThis as unknown as { __corbelDesk?: { snap: StockDesk | null; running: Promise<void> | null; err: string | null; timer: ReturnType<typeof setInterval> | null } };
// the last desk is kept on disk too: a restart serves it at once (marked stale) while a fresh one is read
const state = (G.__corbelDesk ??= { snap: loadSnap<StockDesk>("stocks"), running: null, err: null, timer: null });

function refresh() {
  if (state.running) return state.running;
  const client = getClient(process.env.RPC_URL);
  const candidates = stockCandidates();
  if (!client || !candidates) {
    state.err = !client ? "Chain reads are paused. Try again later." : "The index is not available yet.";
    return Promise.resolve();
  }
  state.running = readStockDesk(client, candidates, { v4PoolsBetween })
    .then(async (snap) => {
      // all venues on the chain (the pairs index): market price, liquidity and 24h volume per issuer token
      const ds = byToken(await dsTokens(snap.rows.map((r) => r.address.toLowerCase())));
      const rows = snap.rows
        .map((r) => {
          const d = ds.get(r.address.toLowerCase());
          return { ...r, market: d ? { price: d.price, liquidity: d.liquidity, volume: d.volume, change: d.change } : null };
        })
        .sort((a, b) => (b.market?.volume ?? 0) - (a.market?.volume ?? 0) || (b.market?.liquidity ?? 0) - (a.market?.liquidity ?? 0));
      state.snap = { ...snap, rows } as typeof snap;
      state.err = null;
      keepSnap("stocks", state.snap);
    })
    .catch((e) => {
      console.error("[api/stocks]", redact(e));
      state.err = "The chain did not answer. Try again in a minute.";
    })
    .finally(() => {
      state.running = null;
    });
  return state.running;
}

/** Keeps the snapshot warm: once anyone has asked, it refreshes itself on the TTL, so visitors never wait. */
function keepWarm() {
  if (state.timer) return;
  state.timer = setInterval(() => void refresh(), TTL);
  state.timer.unref?.();
}

async function handle() {
  keepWarm();
  const fresh = state.snap && Date.now() - state.snap.at < TTL;
  if (!fresh) {
    const p = refresh();
    if (!state.snap) await Promise.race([p, new Promise((r) => setTimeout(r, 25_000))]);
  }
  if (state.snap) return Response.json({ ...state.snap, stale: !fresh });
  if (state.err) return Response.json({ error: state.err }, { status: 503 });
  return Response.json({ warming: true }, { status: 202 });
}

/** Rate limit and concurrency cap first (lib/guard.ts), then the handler. */
export async function GET(req: Request) {
  const g = await guardWait(req, "stocks");
  if ("blocked" in g) return g.blocked;
  try {
    return await handle();
  } finally {
    g.release();
  }
}
