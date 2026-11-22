import { stockCandidates } from "@corbel/indexer";
import { redact, asBackground } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { keepSnap, loadSnap } from "@/lib/snapshot";
import { dsAllPairs, type DsPair } from "@/lib/pairs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/stockmarket → the stock-token market on Robinhood Chain across every venue: per stock, per venue and
 * per pool, with breadth and concentration. Pool figures come from the pairs index (all venues); which tokens count as
 * stock tokens comes from our index. One shared snapshot, refreshed every five minutes.
 */
const TTL = 300_000;
export type MStock = { token: string; symbol: string; name: string; volume: number; liquidity: number; trades: number; change: number | null; price: number | null; pools: number; venues: number };
export type MVenue = { id: string; volume: number; liquidity: number; trades: number; pools: number; stocks: number };
export type MPool = { pair: string; venue: string; symbol: string; quote: string; volume: number; liquidity: number; trades: number; price: number | null; gap: number | null; turnover: number | null };
type Snap = {
  at: number;
  totals: { volume: number; liquidity: number; trades: number; pools: number; reporting: number; stocks: number; venues: number };
  stocks: MStock[];
  venues: MVenue[];
  pools: MPool[];
  breadth: { up: number; down: number; flat: number; upVol: number; downVol: number };
  concentration: { stocks: number[]; pools: number[] };
  links: { venue: string; token: string; volume: number; liquidity: number; pools: number }[];
};
const G = globalThis as unknown as { __corbelSM?: { snap: Snap | null; running: Promise<void> | null; timer: ReturnType<typeof setInterval> | null } };
const state = (G.__corbelSM ??= { snap: loadSnap<Snap>("stockmarket"), running: null, timer: null });

const tidy = (n: string) => n.replace(/\s*•\s*Robinhood Token\s*$/i, "").replace(/\s+Robinhood Token$/i, "").trim();
const venueName = (p: DsPair) => {
  const v = p.dexId.length > 20 ? "Unlabelled DEX" : p.dexId.charAt(0).toUpperCase() + p.dexId.slice(1);
  const l = p.labels?.find((x) => /^v\d$/i.test(x));
  return l ? `${v} ${l}` : v;
};

function share(vals: number[], cuts: number[]) {
  const s = [...vals].sort((a, b) => b - a);
  const total = s.reduce((a, b) => a + b, 0) || 1;
  return cuts.map((c) => s.slice(0, c).reduce((a, b) => a + b, 0) / total);
}

function refresh() {
  if (state.running) return state.running;
  // a refresh is background work: visitors' own reads go ahead of it
  state.running = asBackground(async () => {
    const cands = stockCandidates(300) ?? [];
    const known = new Map(cands.map((c) => [c.address.toLowerCase(), c]));
    // a stock can sit on either side of a pair (TSLA/USDG or SPY/TSLA): count the pair for each stock side,
    // flipped so the stock is the base and the price is the stock's
    const raw = await dsAllPairs([...known.keys()]);
    const pairs: DsPair[] = [];
    for (const p of raw) {
      if (known.has(p.baseToken.address.toLowerCase())) pairs.push(p);
      if (known.has(p.quoteToken.address.toLowerCase()) && p.baseToken.address.toLowerCase() !== p.quoteToken.address.toLowerCase()) {
        const pn = Number((p as DsPair & { priceNative?: string }).priceNative ?? 0), pu = Number(p.priceUsd ?? 0);
        pairs.push({ ...p, pairAddress: `${p.pairAddress}#q`, baseToken: { address: p.quoteToken.address, name: p.quoteToken.symbol, symbol: p.quoteToken.symbol }, quoteToken: { address: p.baseToken.address, symbol: p.baseToken.symbol }, priceUsd: pn > 0 && pu > 0 ? String(pu / pn) : undefined, priceChange: undefined });
      }
    }
    const seen = new Set<string>();
    const uniq = pairs.filter((p) => (seen.has(p.pairAddress.toLowerCase()) ? false : (seen.add(p.pairAddress.toLowerCase()), true)));

    const byStock = new Map<string, DsPair[]>();
    for (const p of uniq) {
      const k = p.baseToken.address.toLowerCase();
      byStock.set(k, [...(byStock.get(k) ?? []), p]);
    }
    const headline = new Map<string, number>();
    const stocks: MStock[] = [];
    for (const [k, ps] of byStock) {
      const c = known.get(k)!;
      const deepest = [...ps].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]!;
      const price = deepest.priceUsd ? Number(deepest.priceUsd) : null;
      if (price) headline.set(k, price);
      stocks.push({
        token: c.address,
        symbol: c.symbol,
        name: tidy(c.name),
        volume: ps.reduce((a, p) => a + (p.volume?.h24 ?? 0), 0),
        liquidity: ps.reduce((a, p) => a + (p.liquidity?.usd ?? 0), 0),
        trades: ps.reduce((a, p) => a + (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0), 0),
        change: deepest.priceChange?.h24 ?? null,
        price,
        pools: ps.length,
        venues: new Set(ps.map(venueName)).size,
      });
    }
    stocks.sort((a, b) => b.volume - a.volume);

    const vmap = new Map<string, MVenue & { set: Set<string> }>();
    for (const p of uniq) {
      const id = venueName(p);
      let v = vmap.get(id);
      if (!v) vmap.set(id, (v = { id, volume: 0, liquidity: 0, trades: 0, pools: 0, stocks: 0, set: new Set() }));
      v.volume += p.volume?.h24 ?? 0;
      v.liquidity += p.liquidity?.usd ?? 0;
      v.trades += (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0);
      v.pools++;
      v.set.add(p.baseToken.address.toLowerCase());
    }
    const venues = [...vmap.values()].map(({ set, ...v }) => ({ ...v, stocks: set.size })).sort((a, b) => b.volume - a.volume);

    const pools: MPool[] = uniq
      .filter((p) => !p.pairAddress.endsWith("#q"))
      .map((p) => {
        const k = p.baseToken.address.toLowerCase();
        const price = p.priceUsd ? Number(p.priceUsd) : null;
        const h = headline.get(k);
        const liq = p.liquidity?.usd ?? 0;
        const vol = p.volume?.h24 ?? 0;
        return { pair: p.pairAddress, venue: venueName(p), symbol: known.get(k)!.symbol, quote: p.quoteToken.symbol, volume: vol, liquidity: liq, trades: (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0), price, gap: price && h ? price / h - 1 : null, turnover: liq > 0 ? vol / liq : null };
      })
      .sort((a, b) => b.volume - a.volume);

    // venue × stock: who trades where
    const lmap = new Map<string, { venue: string; token: string; volume: number; liquidity: number; pools: number }>();
    for (const p of uniq) {
      const k = `${venueName(p)}|${p.baseToken.address.toLowerCase()}`;
      let l = lmap.get(k);
      if (!l) lmap.set(k, (l = { venue: venueName(p), token: known.get(p.baseToken.address.toLowerCase())!.address, volume: 0, liquidity: 0, pools: 0 }));
      l.volume += p.volume?.h24 ?? 0;
      l.liquidity += p.liquidity?.usd ?? 0;
      l.pools++;
    }
    const links = [...lmap.values()];
    const real = uniq.filter((p) => !p.pairAddress.endsWith("#q"));
    const traded = stocks.filter((s) => s.volume > 0 && s.change !== null);
    const up = traded.filter((s) => s.change! > 0.05), down = traded.filter((s) => s.change! < -0.05);
    state.snap = {
      at: Date.now(),
      totals: {
        // each real pool once, even when both sides are stocks
        volume: real.reduce((a, p) => a + (p.volume?.h24 ?? 0), 0),
        liquidity: real.reduce((a, p) => a + (p.liquidity?.usd ?? 0), 0),
        trades: real.reduce((a, p) => a + (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0), 0),
        pools: real.length,
        reporting: real.filter((p) => (p.volume?.h24 ?? 0) > 0).length,
        stocks: stocks.length,
        venues: venues.length,
      },
      stocks: stocks.slice(0, 120),
      venues,
      pools: pools.slice(0, 80),
      breadth: { up: up.length, down: down.length, flat: traded.length - up.length - down.length, upVol: up.reduce((a, s) => a + s.volume, 0), downVol: down.reduce((a, s) => a + s.volume, 0) },
      links,
      concentration: { stocks: share(stocks.map((s) => s.volume), [1, 5, 10, 25]), pools: share(pools.map((p) => p.volume), [1, 5, 12]) },
    };
  })
    .catch((e) => console.error("[api/stockmarket]", redact(e)))
    .finally(() => {
      state.running = null;
      keepSnap("stockmarket", state.snap);
    });
  return state.running;
}

export async function GET(req: Request) {
  const g = await guardWait(req, "stocks");
  if ("blocked" in g) return g.blocked;
  try {
    if (!state.timer) {
      state.timer = setInterval(() => void refresh(), TTL);
      state.timer.unref?.();
    }
    const fresh = state.snap && Date.now() - state.snap.at < TTL;
    if (!fresh) {
      const p = refresh();
      if (!state.snap) await Promise.race([p, new Promise((r) => setTimeout(r, 20_000))]);
    }
    if (state.snap) return Response.json(state.snap);
    return Response.json({ warming: true }, { status: 202 });
  } finally {
    g.release();
  }
}
