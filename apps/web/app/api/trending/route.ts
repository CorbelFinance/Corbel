import { LOG_WINDOW, RH, getClient, readEthUsd, redact, asBackground } from "@corbel/data/chain";
import { poolsTokens, stockCandidates, padsOf } from "@corbel/indexer";
import { launchpadOf } from "@corbel/config";
import { byToken, dsPairs, dsTokens } from "@/lib/pairs";
import { keccak256, toHex, decodeAbiParameters } from "viem";
import { guardWait } from "@/lib/guard";
import { keepSnap, loadSnap } from "@/lib/snapshot";
import { doubt, xcheckTokens } from "@/lib/xcheck";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/trending → the tokens traded most on Robinhood Chain in the last few hours, from every V2 pair and
 * every v4 pool, whichever launchpad made them: swaps, unique takers and base volume per token, plus buy share.
 * One shared snapshot, refreshed every two minutes.
 */
const TTL = 120_000;
const WINDOWS = 4;
const V2_SWAP = keccak256(toHex("Swap(address,uint256,uint256,uint256,uint256,address)"));
const V4_SWAP = keccak256(toHex("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"));
type Log = { address: string; topics: string[]; data: `0x${string}`; blockNumber: string };
export type TrendRow = { token: string; symbol: string | null; name: string | null; kind: string; base: string; swaps: number; takers: number; buys: number; volume: number; launcher: string | null; age: number; price?: number | null; change?: number | null; liquidity?: number; created?: number | null; image?: boolean };
export type StockRow = { token: string; symbol: string; name: string; volume: number; liquidity: number; price: number | null; change: number | null; pools: number };
type Snap = { at: number; head: number; from: number; rows: TrendRow[]; stocks: StockRow[]; swaps: number; failed: number; ms: number };
const G = globalThis as unknown as { __corbelTrend?: { snap: Snap | null; running: Promise<void> | null; err: string | null; timer: ReturnType<typeof setInterval> | null } };
const state = (G.__corbelTrend ??= { snap: loadSnap<Snap>("trending"), running: null, err: null, timer: null });

const BASE_DEC: Record<string, number> = { [RH.USDG]: 6 };

function refresh() {
  if (state.running) return state.running;
  const client = getClient(process.env.RPC_URL);
  if (!client) {
    state.err = "Chain reads are paused. Try again later.";
    return Promise.resolve();
  }
  const t0 = Date.now();
  // a refresh is background work: visitors' own reads go ahead of it
  state.running = asBackground(async () => {
    const head = Number(await client.getBlockNumber());
    const usd = await readEthUsd(client).catch(() => 0);
    const logs: Log[] = [];
    let failed = 0;
    for (let i = 0; i < WINDOWS; i++) {
      const to = head - i * LOG_WINDOW, from = to - LOG_WINDOW + 1;
      const range = { fromBlock: toHex(from), toBlock: toHex(to) };
      // one failed window (the RPC sheds load in bursts) is retried, then skipped, never fatal
      const get = async (q: Record<string, unknown>) => {
        for (let k = 0; k < 3; k++) {
          try {
            return (await client.request({ method: "eth_getLogs", params: [{ ...range, ...q }] } as never)) as Log[];
          } catch {
            await new Promise((r) => setTimeout(r, 800 * (k + 1)));
          }
        }
        failed++;
        return [] as Log[];
      };
      const b = await get({ topics: [V2_SWAP] });
      // v4 is busier: the same window in five slices keeps each answer under the RPC's result cap
      const a: Log[] = [];
      const step = Math.ceil(LOG_WINDOW / 5);
      for (let s = from; s <= to; s += step) {
        const sub = { fromBlock: toHex(s), toBlock: toHex(Math.min(to, s + step - 1)) };
        a.push(...(await get({ ...sub, address: RH.V4_POOL_MANAGER, topics: [V4_SWAP] })));
      }
      logs.push(...a, ...b);
    }
    const ids = [...new Set(logs.map((l) => (l.topics[0] === V4_SWAP ? l.topics[1]! : l.address).toLowerCase()))];
    const map = poolsTokens(ids) ?? new Map();
    const agg = new Map<string, TrendRow & { who: Set<string> }>();
    for (const l of logs) {
      const id = (l.topics[0] === V4_SWAP ? l.topics[1]! : l.address).toLowerCase();
      const p = map.get(id);
      if (!p) continue;
      const k = p.token.toLowerCase();
      if (k === RH.WETH || k === RH.USDG) continue;
      // only pools priced against WETH, ETH or USDG: their volume converts to dollars
      const bk = p.base.toLowerCase();
      if (bk !== RH.WETH && bk !== RH.USDG && bk !== RH.NATIVE) continue;
      let r = agg.get(k);
      if (!r) agg.set(k, (r = { token: p.token, symbol: p.symbol, name: p.name, kind: p.kind, base: p.base, swaps: 0, takers: 0, buys: 0, volume: 0, launcher: p.launcher, age: Math.max(0, head - p.block), who: new Set() }));
      r.swaps++;
      // taker: v4 sender (topic 2), V2 recipient (topic 2)
      r.who.add(l.topics[2] ?? "");
      const baseIs0 = p.base.toLowerCase() < p.token.toLowerCase();
      const dec = BASE_DEC[p.base.toLowerCase()] ?? 18;
      const k$ = p.base.toLowerCase() === RH.USDG ? 1 : usd;
      try {
        if (l.topics[0] === V4_SWAP) {
          const [a0, a1] = decodeAbiParameters([{ type: "int128" }, { type: "int128" }], l.data) as readonly bigint[];
          const db = baseIs0 ? a0! : a1!;
          // v4 deltas are the caller's: paying base (negative) is a buy
          if (db < 0n) r.buys++;
          r.volume += (Math.abs(Number(db)) / 10 ** dec) * k$;
        } else {
          const [a0In, a1In, a0Out, a1Out] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], l.data) as readonly bigint[];
          const bIn = baseIs0 ? a0In! : a1In!, bOut = baseIs0 ? a0Out! : a1Out!;
          if (bIn > 0n) r.buys++;
          r.volume += (Number(bIn > 0n ? bIn : bOut) / 10 ** dec) * k$;
        }
      } catch {
        // an undecodable log still counts as a swap
      }
    }
    // pools our index has not seen (older than its week, or missed): name the busiest through the pairs index
    const count = new Map<string, number>();
    for (const l of logs) {
      const id = (l.topics[0] === V4_SWAP ? l.topics[1]! : l.address).toLowerCase();
      count.set(id, (count.get(id) ?? 0) + 1);
    }
    const unknown = [...count.entries()].filter(([id]) => !map.has(id)).sort((x, y) => y[1] - x[1]).slice(0, 150);
    const named = await dsPairs(unknown.map(([id]) => id));
    for (const p of named) {
      const qa = p.quoteToken.address.toLowerCase();
      if (qa !== RH.WETH && qa !== RH.USDG && qa !== RH.NATIVE) continue;
      const k = p.baseToken.address.toLowerCase();
      if (k === RH.WETH || k === RH.USDG) continue;
      const n = count.get(p.pairAddress.toLowerCase()) ?? 0;
      const r = agg.get(k);
      if (r) r.swaps += n;
      else agg.set(k, { token: p.baseToken.address, symbol: p.baseToken.symbol, name: p.baseToken.name, kind: p.labels?.includes("v4") ? "v4" : "v2", base: qa, swaps: n, takers: 0, buys: 0, volume: 0, launcher: null, age: Number.MAX_SAFE_INTEGER, who: new Set() });
    }
    // 24h volume, price and image for the busiest tokens, across all their pools
    const top = [...agg.values()].sort((x, y) => y.swaps - x.swaps).slice(0, 150);
    const ds = byToken(await dsTokens(top.map((r) => r.token.toLowerCase())));
    const rows = top
      .map(({ who, ...r }) => {
        const d = ds.get(r.token.toLowerCase());
        return { ...r, takers: who.size, volume: d?.volume || r.volume, price: d?.price ?? null, change: d?.change ?? null, liquidity: d?.liquidity ?? 0, created: d?.created ?? null, image: !!d?.image, buys: d ? d.buys : r.buys, swaps: d ? d.buys + d.sells || r.swaps : r.swaps, symbol: r.symbol ?? d?.symbol ?? null, name: r.name ?? d?.name ?? null };
      })
      .sort((x, y) => y.volume - x.volume)
      .slice(0, 80);
    // stock tokens by real trading volume, not by pool count
    const sc = stockCandidates(200) ?? [];
    const sd = byToken(await dsTokens(sc.map((s) => s.address.toLowerCase())));
    const stocks: StockRow[] = sc
      .map((s) => {
        const d = sd.get(s.address.toLowerCase());
        return { token: s.address, symbol: s.symbol, name: s.name, volume: d?.volume ?? 0, liquidity: d?.liquidity ?? 0, price: d?.price ?? null, change: d?.change ?? null, pools: s.pools };
      })
      .sort((x, y) => y.volume - x.volume || y.liquidity - x.liquidity);
    state.snap = { at: Date.now(), head, from: head - WINDOWS * LOG_WINDOW + 1, rows, stocks, swaps: logs.length, failed, ms: Date.now() - t0 };
    state.err = null;
  })
    .catch((e) => {
      console.error("[api/trending]", redact(e));
      state.err = "The chain did not answer. Try again in a minute.";
    })
    .finally(() => {
      state.running = null;
      keepSnap("trending", state.snap);
    });
  return state.running;
}

async function handle() {
  if (!state.timer) {
    state.timer = setInterval(() => void refresh(), TTL);
    state.timer.unref?.();
  }
  const fresh = state.snap && Date.now() - state.snap.at < TTL;
  if (!fresh) {
    const p = refresh();
    if (!state.snap) await Promise.race([p, new Promise((r) => setTimeout(r, 20_000))]);
  }
  if (state.snap) {
    // each token's launchpad from the local index (a few indexed lookups, done per answer so new pads show at once)
    const pads = padsOf(state.snap.rows.map((r) => r.token));
    const padOf = (t: string) => {
      const p = pads.get(t.toLowerCase());
      return p ? launchpadOf(p.pad, p.hooks) : null;
    };
    xcheckTokens([...state.snap.rows.slice(0, 30), ...state.snap.stocks.slice(0, 20)].map((r) => ({ token: r.token, symbol: r.symbol, price: r.price ?? null })));
    return Response.json({ ...state.snap, rows: state.snap.rows.map((r) => ({ ...r, pad: padOf(r.token), doubt: doubt(r.token) })), stale: !fresh });
  }
  if (state.err) return Response.json({ error: state.err }, { status: 503 });
  return Response.json({ warming: true }, { status: 202 });
}

export async function GET(req: Request) {
  const g = await guardWait(req, "radar");
  if ("blocked" in g) return g.blocked;
  try {
    return await handle();
  } finally {
    g.release();
  }
}
