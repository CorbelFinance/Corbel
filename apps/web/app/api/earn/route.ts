import { RH, getClient, readEthUsd, readMarket, readMid, redact, type Market, asBackground } from "@corbel/data/chain";
import { recentPools, stockCandidates } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";
import { keepSnap, loadSnap } from "@/lib/snapshot";
import { covered, history, syncHistory } from "@/lib/earnHistory";
import { doubt, xcheckTokens } from "@/lib/xcheck";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/earn → the deepest V2 pools (WETH/USDG and the issuer stock tokens) with what their LPs earned:
 * the last ~day of swaps × the 0.3% pool fee, against the pool's liquidity now. Past, not promised.
 * One shared snapshot, refreshed in the background every 10 minutes.
 */
const TTL = 600_000;
const POOLS = 15;
const MIN_LIQUIDITY = 1000;
/** How many of the deepest pools get the full day of swaps. */
const DEEP = 15;
type Row = {
  token: string;
  symbol: string;
  name: string;
  pair: string;
  base: string;
  liquidity: number;
  volume: number;
  fees: number;
  hours: number;
  apr: number | null;
  swaps: number;
  hourly: number[];
  price: number | null;
  /** dollars for one unit of the pool's base (ETH from the chain's price feed, USDG at 1) */
  baseUsd?: number;
  /** fees over liquidity plus the impermanent loss from the window's first to last price (negative) */
  net: number | null;
  move: number | null;
  /** for the day-by-day record: which reserve is the base, and the token's decimals */
  baseIs0?: boolean;
  tokenDec?: number;
};
type Snap = { at: number; rows: Row[]; hidden: number; ms: number };
const G = globalThis as unknown as { __corbelEarn?: { snap: Snap | null; running: Promise<void> | null; err: string | null; timer: ReturnType<typeof setInterval> | null } };
const state = (G.__corbelEarn ??= { snap: loadSnap<Snap>("earn"), running: null, err: null, timer: null });

/** One more try after a pause: the public RPC sheds load in bursts. */
async function retry<T>(fn: () => Promise<T>): Promise<T | null> {
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch {
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  return null;
}

const baseAddr = (sym: string) => (sym.toUpperCase() === "USDG" ? RH.USDG : RH.WETH).toLowerCase();

function row(m: Market): Row | null {
  if (m.pool.kind !== "v2" || !m.reserves) return null;
  const usd = m.base.usd || 0;
  const liquidity = m.reserves.base * 2 * usd;
  const volume = m.trades.reduce((s, t) => s + t.base, 0) * usd;
  const hours = Math.max(1, (Date.now() / 1000 - m.since) / 3600);
  const fees = volume * 0.003;
  const end = Date.now() / 1000;
  const hourly = Array.from({ length: 24 }, (_, i) => m.trades.filter((t) => t.t >= end - (24 - i) * 3600 && t.t < end - (23 - i) * 3600).reduce((s, t) => s + t.base * usd, 0));
  const first = m.trades[m.trades.length - 1]?.price, last = m.trades[0]?.price;
  const ratio = first && last ? last / first : null;
  const ilw = ratio ? (2 * Math.sqrt(ratio)) / (1 + ratio) - 1 : 0;
  return {
    net: liquidity > 0 ? fees / liquidity + ilw : null,
    move: ratio ? ratio - 1 : null,
    token: m.token.address,
    // the pool's base comes as a symbol (WETH, USDG): its address decides which side of the pair it is
    baseIs0: baseAddr(m.pool.base) < m.token.address.toLowerCase(),
    tokenDec: m.token.decimals,
    symbol: m.token.symbol,
    name: m.token.name,
    pair: m.pool.id,
    base: m.pool.base,
    liquidity,
    volume,
    fees,
    hours,
    apr: liquidity > 0 ? ((fees * (24 / hours)) * 365) / liquidity : null,
    swaps: m.trades.length,
    hourly,
    price: m.price === null ? null : m.price * usd,
    baseUsd: usd,
  };
}

function refresh() {
  if (state.running) return state.running;
  const client = getClient(process.env.RPC_URL);
  if (!client) {
    state.err = "Chain reads are paused. Try again later.";
    return Promise.resolve();
  }
  const t0 = Date.now();
  // candidates: the WETH/USDG pair, issuer stock tokens, and recent V2 pairs that still hold liquidity
  const live = (recentPools({ kind: "v2", limit: 600 }) ?? []).filter((r) => r.dead === 0).map((r) => r.token);
  const candidates = [...new Set([RH.WETH, ...(stockCandidates(60) ?? []).map((s) => s.address), ...live.slice(0, 200)].map((a) => a.toLowerCase()))];
  // a refresh is background work: visitors' own reads go ahead of it
  state.running = asBackground(async () => {
    // pass 1, cheap: reserves only (a few reads per token), to find the deep pools among many
    const usd = await readEthUsd(client).catch(() => 0);
    const depth: { token: string; liquidity: number }[] = [];
    for (let i = 0; i < candidates.length; i += 4) {
      const got = await Promise.all(candidates.slice(i, i + 4).map(async (a) => ({ token: a, mid: await retry(() => readMid(client, a as `0x${string}`, usd)) })));
      for (const g of got) if (g.mid && g.mid.liquidity >= MIN_LIQUIDITY) depth.push({ token: g.token, liquidity: g.mid.liquidity });
    }
    depth.sort((a, b) => b.liquidity - a.liquidity);
    const tokens = depth.slice(0, DEEP).map((d) => d.token);
    const scanned = candidates.length;
    // pass 2, full: a day of swaps for the deepest pools only
    const out: Row[] = [];
    for (let i = 0; i < tokens.length; i += 3) {
      const got = await Promise.all(tokens.slice(i, i + 3).map((a) => retry(() => readMarket(client, a as `0x${string}`, []))));
      for (const m of got) {
        const r = m && row(m);
        if (r && r.liquidity > 0) out.push(r);
      }
      // publish as it goes: the table fills in while the rest is read
      const part = [...out].sort((x, y) => y.liquidity - x.liquidity).filter((x) => x.liquidity >= MIN_LIQUIDITY);
      if (!state.snap || part.length > state.snap.rows.length) state.snap = { at: Date.now(), rows: part.slice(0, POOLS), hidden: scanned - part.length, ms: Date.now() - t0 };
    }
    // a pool that failed to read this time keeps its last row for up to an hour, so one bad circuit does not empty the table
    const prev = state.snap && Date.now() - state.snap.at < 3_600_000 ? state.snap.rows : [];
    for (const r of prev) if (!out.some((o) => o.pair === r.pair)) out.push(r);
    out.sort((a, b) => b.liquidity - a.liquidity);
    // a yearly rate on a dust pool means nothing: pools under MIN_LIQUIDITY are counted, not listed
    const deep = out.filter((r) => r.liquidity >= MIN_LIQUIDITY);
    state.snap = { at: Date.now(), rows: deep.slice(0, POOLS), hidden: scanned - deep.length, ms: Date.now() - t0 };
    state.err = null;
    // the day-by-day record: top up to the head, backfill toward thirty days (background, never twice at once)
    syncHistory(client, state.snap.rows.filter((r) => r.baseIs0 !== undefined).map((r) => ({ pair: r.pair.toLowerCase(), baseIs0: !!r.baseIs0, baseDec: r.base.toUpperCase() === "USDG" || r.base.toLowerCase() === RH.USDG.toLowerCase() ? 6 : 18, tokenDec: r.tokenDec ?? 18 })));
  })
    .catch((e) => {
      console.error("[api/earn]", redact(e));
      state.err = "The chain did not answer. Try again in a minute.";
    })
    .finally(() => {
      state.running = null;
      keepSnap("earn", state.snap);
    });
  return state.running;
}

/**
 * Thirty days of a pool, as an LP would have lived them: each day's fees over that day's liquidity, minus what the
 * day's price move took back (impermanent loss against holding), all valued at today's price of the base.
 *   paid      days that ended ahead after fees
 *   curve     the running result, day by day ("the last 30 days after fees")
 *   avgApr    the average daily fee yield, yearly
 *   feesBack  days of average fees it takes to pay back the window's whole price-move loss
 *   steadiness one minus the spread of daily net results (higher is calmer)
 */
function withDays(r: Row) {
  const known = history(r.pair).filter((d) => d.rb && d.rt);
  const cov = covered(r.pair);
  // a day with no swap has no row, but the pool was there: its reserves did not move (no Sync) and it earned nothing.
  // Fill every covered day, carrying the reserves of the nearest recorded day.
  const today = Math.floor(Date.now() / 86_400_000);
  const span = Math.min(30, Math.max(cov, known.length ? today - known[0]!.day + 1 : 0));
  const byDay = new Map(known.map((d) => [d.day, d]));
  const days: typeof known = [];
  let carry = known[0];
  // never invent days before the first one on record: the window starts where the record does
  for (let day = Math.max(today - span + 1, known[0]?.day ?? today); day <= today && carry; day++) {
    const k = byDay.get(day);
    if (k) carry = k;
    days.push(k ?? { ...carry, day, vol: 0, swaps: 0 });
  }
  if (days.length < 2) return { ...r, days: null, covered: Math.max(0, days.length - 1) };
  // the base's dollar value: the pool's liquidity now over its base reserve now (2 x base x usd = liquidity)
  // the base's dollar value from its own price (ETH feed, USDG 1), never from reserves that may be a drained day's
  const lastRb = days[days.length - 1]!.rb;
  const baseUsd = r.baseUsd ?? (lastRb > 0 ? r.liquidity / (2 * lastRb) : 0);
  const net: number[] = [];
  // the same window day by day, for the pool's own page
  const daily: { day: number; swaps: number; vol: number; fees: number; liq: number; move: number; fy: number; il: number; net: number }[] = [];
  const yields: number[] = [];
  let prevPx = days[0]!.rb / days[0]!.rt;
  for (const d of days.slice(1)) {
    const liq = 2 * d.rb * baseUsd;
    const px = d.rb / d.rt;
    // a day the pool was nearly empty (opened, drained, refilled) says nothing about an LP's day: left out
    if (liq < 1_000 || !(px > 0)) {
      prevPx = px > 0 ? px : prevPx;
      continue;
    }
    const fy = (d.vol * baseUsd * 0.003) / liq;
    const ratio = prevPx > 0 ? px / prevPx : 1;
    // more than 100% in fees in one day is a measuring artefact (a refill mid-day), not a yield
    if (fy > 1) {
      prevPx = px;
      continue;
    }
    const il = (2 * Math.sqrt(ratio)) / (1 + ratio) - 1;
    prevPx = px;
    yields.push(fy);
    net.push(fy + il);
    daily.push({ day: d.day, swaps: d.swaps, vol: d.vol * baseUsd, fees: d.vol * baseUsd * 0.003, liq, move: ratio - 1, fy, il, net: fy + il });
  }
  if (net.length < 2) return { ...r, days: null, covered: net.length };
  let acc = 1;
  const curve = net.map((x) => (acc *= 1 + x) - 1);
  const avg = yields.reduce((a, b) => a + b, 0) / Math.max(1, yields.length);
  const first = days[0]!.rb / days[0]!.rt, last = days[days.length - 1]!.rb / days[days.length - 1]!.rt;
  const ratio = first > 0 ? last / first : 1;
  const ilAll = -((2 * Math.sqrt(ratio)) / (1 + ratio) - 1);
  const mean = net.reduce((a, b) => a + b, 0) / net.length;
  const sd = Math.sqrt(net.reduce((a, b) => a + (b - mean) ** 2, 0) / net.length);
  return {
    ...r,
    covered: Math.min(cov, net.length),
    days: {
      n: net.length,
      paid: net.filter((x) => x > 0).length,
      curve,
      avgApr: avg * 365,
      feesBack: avg > 0 ? ilAll / avg : null,
      steadiness: 1 - Math.min(1, sd * 20),
      total: curve[curve.length - 1] ?? 0,
      daily,
    },
  };
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
    xcheckTokens(state.snap.rows.map((r) => ({ token: r.token, symbol: r.symbol, price: r.price })));
    return Response.json({ ...state.snap, rows: state.snap.rows.map((r) => ({ ...withDays(r), doubt: doubt(r.token) })), stale: !fresh });
  }
  if (state.err) return Response.json({ error: state.err }, { status: 503 });
  return Response.json({ warming: true }, { status: 202 });
}

export async function GET(req: Request) {
  const g = await guardWait(req, "stocks");
  if ("blocked" in g) return g.blocked;
  try {
    return await handle();
  } finally {
    g.release();
  }
}
