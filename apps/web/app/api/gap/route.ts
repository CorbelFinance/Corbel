import { ISSUERS, RH, getClient, quote, readEthUsd, readMid, redact } from "@corbel/data/chain";
import { keccak256 } from "viem";
import { stockCandidates, v4PoolsBetween } from "@corbel/indexer";
import { guardWait } from "@/lib/guard";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/gap → the weekend gap for issuer stock tokens: the pool's mid price on Robinhood Chain against
 * the stock's last regular-session close. Closes come from public chart data (delayed). One shared snapshot, refreshed every 10 minutes.
 */
const TTL = 600_000;
const TOKENS = 80;
export type GapRow = { token: string; symbol: string; name: string; chain: number; liquidity: number | null; pool: "v2" | "v4"; base: string; close: number | null; closeAt: number | null; last: number | null; gap: number | null };
type Snap = { at: number; rows: GapRow[]; source: string; ms: number };
const G = globalThis as unknown as { __corbelGap?: { snap: Snap | null; running: Promise<void> | null; err: string | null; timer: ReturnType<typeof setInterval> | null } };
const state = (G.__corbelGap ??= { snap: null, running: null, err: null, timer: null });

/**
 * Closes already read, kept on disk: a close changes once a day, so one good read a day is enough and a restart must not forget it.
 */
const db = () => store("closes", "CREATE TABLE IF NOT EXISTS closes (symbol TEXT PRIMARY KEY, close REAL NOT NULL, at INTEGER NOT NULL, last REAL NOT NULL, read_at INTEGER NOT NULL);");
const closes = {
  get(symbol: string): { close: number; at: number; last: number } | undefined {
    const r = db()?.prepare("SELECT close, at, last FROM closes WHERE symbol = ?").get(symbol) as { close: number; at: number; last: number } | undefined;
    return r ?? undefined;
  },
  set(symbol: string, v: { close: number; at: number; last: number }) {
    db()?.prepare("INSERT INTO closes(symbol, close, at, last, read_at) VALUES(?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET close = excluded.close, at = excluded.at, last = excluded.last, read_at = excluded.read_at").run(symbol, v.close, v.at, v.last, Date.now());
  },
  fresh(symbol: string) {
    const r = db()?.prepare("SELECT read_at FROM closes WHERE symbol = ?").get(symbol) as { read_at: number } | undefined;
    return !!r && Date.now() - r.read_at < 3 * 3600_000;
  },
};

async function lastClose(symbol: string) {
  // read at most every three hours per symbol; between reads the stored close stands
  if (closes.fresh(symbol)) return closes.get(symbol) ?? null;
  for (let i = 0; i < 3; i++) {
    const r = await readClose(symbol).catch(() => null);
    if (r) {
      closes.set(symbol, r);
      return r;
    }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
  return closes.get(symbol) ?? null;
}

/** Last completed regular-session close for a US ticker, from the public chart endpoint. */
async function readClose(symbol: string): Promise<{ close: number; at: number; last: number } | null> {
  const r = await fetch(`${process.env.CLOSES_API_URL ?? ""}/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) return null;
  const j = (await r.json()) as { chart?: { result?: { meta: { regularMarketPrice: number; regularMarketTime: number }; timestamp: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] } };
  const res = j.chart?.result?.[0];
  if (!res) return null;
  const closes = res.indicators.quote[0]?.close ?? [];
  let i = closes.length - 1;
  while (i >= 0 && closes[i] == null) i--;
  if (i < 0) return null;
  return { close: closes[i]!, at: res.timestamp[i]!, last: res.meta.regularMarketPrice };
}

function refresh() {
  if (state.running) return state.running;
  const client = getClient(process.env.RPC_URL);
  const stocks = stockCandidates(TOKENS);
  if (!client || !stocks) {
    state.err = !client ? "Chain reads are paused. Try again later." : "The index is not available yet.";
    return Promise.resolve();
  }
  const t0 = Date.now();
  state.running = (async () => {
    const usd = await readEthUsd(client).catch(() => 0);
    // only tokens that run the issuer's code: a lookalike copies the name, never the code
    const issued = (
      await Promise.all(
        stocks.map(async (s) => {
          const code = await client.getCode({ address: s.address as `0x${string}` }).catch(() => undefined);
          return code && code !== "0x" && ISSUERS[keccak256(code as `0x${string}`)] ? s : null;
        }),
      )
    ).filter((s): s is NonNullable<typeof s> => !!s);
    const rows: GapRow[] = [];
    for (let i = 0; i < issued.length; i += 4) {
      const got = await Promise.all(
        issued.slice(i, i + 4).map(async (s) => {
          const [mid, ref] = await Promise.all([readMid(client, s.address as `0x${string}`, usd).catch(() => null), lastClose(s.symbol).catch(() => null)]);
          let price = mid?.price ?? null;
          let pool: "v2" | "v4" = "v2";
          let liquidity: number | null = mid?.liquidity ?? null;
          let base = mid?.base ?? "USDG";
          if (!mid) {
            // no V2 pair: sell a hundredth of a token to USDG through every route (v4 included); tiny, so the price is near mid
            const amt = 10n ** BigInt(Math.max(0, (s.decimals ?? 18) - 2));
            const q = await quote(client, s.address as `0x${string}`, RH.USDG as `0x${string}`, amt, { v4PoolsBetween }).catch(() => null);
            const best = q && q.best !== null && q.best >= 0 ? q.routes[q.best] : null;
            if (!best?.ok || best.amountOut === null) return null;
            price = Number(best.amountOut) / 1e6 / 0.01;
            pool = "v4";
            liquidity = null;
            base = "USDG";
          }
          if (price === null) return null;
          return { token: s.address, symbol: s.symbol, name: s.name, chain: price, liquidity, pool, base, close: ref?.close ?? null, closeAt: ref?.at ?? null, last: ref?.last ?? null, gap: ref ? price / ref.close - 1 : null };
        }),
      );
      for (const r of got) if (r) rows.push(r);
    }
    rows.sort((a, b) => (b.liquidity ?? -1) - (a.liquidity ?? -1));
    state.snap = { at: Date.now(), rows, source: "public chart data (delayed)", ms: Date.now() - t0 };
    state.err = null;
  })()
    .catch((e) => {
      console.error("[api/gap]", redact(e));
      state.err = "The chain did not answer. Try again in a minute.";
    })
    .finally(() => {
      state.running = null;
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
  if (state.snap) return Response.json({ ...state.snap, stale: !fresh });
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
