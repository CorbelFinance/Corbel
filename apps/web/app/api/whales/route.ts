import { guardWait } from "@/lib/guard";
import { keepSnap, loadSnap } from "@/lib/snapshot";
import { asBackground, getClient } from "@corbel/data/chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/whales?min=100 → the largest single swaps of the last 24 hours in the tokens Corbel reads swap by
 * swap (the busiest trending tokens and stock leaders, kept warm by /api/market). No chain reads of its own:
 * once a minute it collects the swaps already in that cache into a 24-hour store, kept on disk across restarts.
 */
type Trade = { t: number; side: "buy" | "sell"; price: number; token: number; base: number; tx: string; who: string };
type Body = { none?: boolean; token?: { address: string; symbol: string }; base?: { usd: number }; trades?: Trade[] };
/** The chain's base assets by address (their contracts do not always answer a symbol read), else a short address. */
const KNOWN: Record<string, string> = { "0x0000000000000000000000000000000000000000": "ETH", "0x0bd7d308f8e1639fab988df18a8011f41eacad73": "WETH", "0x5fc5360d0400a0fd4f2af552add042d716f1d168": "USDG" };
const nameOf = (address: string, symbol: string | undefined) =>
  KNOWN[address.toLowerCase()] ?? (symbol && symbol !== "?" && symbol.trim() ? symbol : `${address.slice(0, 6)}…${address.slice(-4)}`);
type Row = { token: string; symbol: string; t: number; side: "buy" | "sell"; usd: number; amount: number; price: number; who: string; tx: string; from?: string };
type Store = { at: number; rows: Row[]; tokens: string[] };

const DAY = 86_400;
/** Swaps under this are not kept at all: the store holds the big ones. */
const FLOOR = 25;
const G = globalThis as unknown as {
  __corbelMarketCache?: Map<string, { at: number; body: unknown }>;
  __corbelWhales?: { store: Map<string, Row>; tokens: Set<string>; timer: ReturnType<typeof setInterval> | null; saved: number };
};
const W = (G.__corbelWhales ??= (() => {
  const s = loadSnap<Store>("whales");
  return { store: new Map((s?.rows ?? []).map((r) => [`${r.tx}:${r.token.toLowerCase()}:${r.side}:${r.amount.toPrecision(9)}`, r])), tokens: new Set(s?.tokens ?? []), timer: null, saved: Date.now() };
})());

function collect() {
  const cache = G.__corbelMarketCache;
  if (cache) {
    for (const v of cache.values()) {
      const b = v.body as Body;
      const k = b?.base?.usd || 0;
      if (!b || b.none || !b.token || !b.trades || !k) continue;
      W.tokens.add(b.token.address);
      for (const x of b.trades) {
        const usd = x.base * k;
        if (usd < FLOOR) continue;
        // one swap read in two windows gets slightly different estimated times: the key leaves time out
        const key = `${x.tx}:${b.token.address.toLowerCase()}:${x.side}:${x.token.toPrecision(9)}`;
        if (!W.store.has(key)) W.store.set(key, { token: b.token.address, symbol: nameOf(b.token.address, b.token.symbol), t: x.t, side: x.side, usd, amount: x.token, price: x.price * k, who: x.who, tx: x.tx });
      }
    }
  }
  const cut = Date.now() / 1000 - DAY;
  for (const [key, r] of W.store) if (r.t < cut) W.store.delete(key);
  if (Date.now() - W.saved > 5 * 60_000) {
    W.saved = Date.now();
    const snap: Store = { at: Date.now(), rows: [...W.store.values()], tokens: [...W.tokens] };
    keepSnap("whales", snap);
  }
}

/**
 * The wallet behind a swap is the transaction's signer, not the address the pool paid (on v4 that is the router).
 * Read once per transaction for swaps of $500 and up, a few per minute in the background, kept with the row.
 */
const FROM_MIN = 500;
let resolving = false;
async function resolveSigners() {
  if (resolving) return;
  const client = getClient(process.env.RPC_URL);
  if (!client) return;
  resolving = true;
  try {
    const todo = [...W.store.values()].filter((r) => !r.from && r.usd >= FROM_MIN).sort((a, b) => b.usd - a.usd).slice(0, 25);
    const byTx = new Map<string, string>();
    for (const r of todo) {
      if (!byTx.has(r.tx)) {
        const tx = await asBackground(() => client.getTransaction({ hash: r.tx as `0x${string}` })).catch(() => null);
        if (tx) byTx.set(r.tx, tx.from.toLowerCase());
      }
      const f = byTx.get(r.tx);
      if (f) r.from = f;
    }
  } finally {
    resolving = false;
  }
}

// the market warm-up calls this after each cycle, so the store fills even when nobody has this page open
(globalThis as unknown as { __corbelWhalesCollect?: () => void }).__corbelWhalesCollect = collect;

export async function GET(req: Request) {
  const g = await guardWait(req, "token");
  if ("blocked" in g) return g.blocked;
  try {
    if (!W.timer) {
      W.timer = setInterval(() => {
        collect();
        void resolveSigners();
      }, 60_000);
      W.timer.unref?.();
    }
    collect();
    void resolveSigners();
    const min = Math.max(0, Math.min(1e7, Number(new URL(req.url).searchParams.get("min") ?? 100) || 0));
    const all = [...W.store.values()];
    const rows = all.filter((r) => r.usd >= min).sort((a, b) => b.usd - a.usd).slice(0, 400).sort((a, b) => b.t - a.t);
    // a loop, not Math.min(...all): the store holds over a hundred thousand swaps, too many arguments for one call
    const since = all.length ? all.reduce((m, r) => (r.t < m ? r.t : m), Infinity) : null;
    // the wallet shown is the signer when known; the pool's counterparty otherwise
    return Response.json({ rows: rows.map(({ from, ...r }) => ({ ...r, symbol: nameOf(r.token, r.symbol), who: from ?? r.who, signer: !!from })), tokens: W.tokens.size, since, kept: all.length, min }, { headers: { "cache-control": "public, max-age=20" } });
  } finally {
    g.release();
  }
}
