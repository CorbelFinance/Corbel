/**
 * The checker: a background agent that reads the same figures from independent sources and marks what does not agree.
 * Every three minutes it compares the chain's ETH price with three outside quotes, and for the tokens the site lists
 * (pools, trending, stock tokens) the price and the number of holders an outside explorer counts. A token whose price
 * is off by more than a quarter, or that fewer than 50 wallets hold, is "in doubt": pages show it with a mark and keep
 * it out of headline figures. Keys live only in the server env.
 */
import { createPublicClient, http, type PublicClient } from "viem";
import { getClient, readEthUsd, redact } from "@corbel/data/chain";
import { keepSnap, loadSnap } from "./snapshot";

const EVERY = 3 * 60_000;
/** the free price key allows about 10k calls a month: that source is asked every 15 minutes, its last answer reused between */
const CG_EVERY = 15 * 60_000;
const cg = { at: 0, v: null as number | null };
const PRICE_GAP = 0.25;
const ETH_GAP = 0.02;
const MIN_HOLDERS = 50;
const MAX_TOKENS = 80;

export type TokenCheck = { token: string; symbol: string | null; ours: number | null; second: number | null; holders: number | null; agree: boolean | null; why: string | null };
export type XSnap = {
  at: number;
  eth: { ours: number | null; outside: number[]; median: number | null; agree: boolean | null };
  /** a second, independent node of the chain: its head and the ETH price read through it */
  node: { ours: number | null; second: number | null; lag: number | null; eth: number | null; agree: boolean | null } | null;
  tokens: TokenCheck[];
  ms: number;
};

const G = globalThis as unknown as { __corbelX?: { snap: XSnap | null; queue: Map<string, { symbol: string | null; price: number | null }>; timer: ReturnType<typeof setInterval> | null; running: boolean; checkedAt?: Map<string, number> } };
const st = (G.__corbelX ??= { snap: loadSnap<XSnap>("xcheck"), queue: new Map(), timer: null, running: false, checkedAt: new Map() });

const st2: { c: PublicClient | null } = { c: null };
const on = () => !!(process.env.XCHECK_KEY1 || process.env.XCHECK_KEY2 || process.env.XCHECK_KEY3 || process.env.XCHECK_RPC);
/** blocks the main node may trail the second one before it counts as behind (about ten seconds) */
const MAX_LAG = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** One read; a 429 (the explorer allows about five a second) waits and tries again, up to three times. */
async function get(url: string, headers: Record<string, string> = {}) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(15_000) });
    if (r.status === 429 && i < 3) {
      await sleep(1200 * (i + 1));
      continue;
    }
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return (await r.json()) as Record<string, unknown>;
  }
}
const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : null;
};

async function outsideEth(): Promise<number[]> {
  const e = process.env;
  const got = await Promise.all([
    !e.XCHECK_KEY1
      ? null
      : Date.now() - cg.at < CG_EVERY
        ? cg.v
        : get(e.XCHECK_FEED1_URL ?? "", { [e.XCHECK_FEED1_HEADER ?? "x-api-key"]: e.XCHECK_KEY1 ?? "" })
            .then((j) => ((cg.at = Date.now()), (cg.v = num((j.eth as { usd?: unknown } | undefined)?.usd))))
            .catch(() => null),
    e.XCHECK_KEY2 ? get(e.XCHECK_FEED2_URL ?? "", { "X-API-KEY": e.XCHECK_KEY2 ?? "" }).then((j) => num(j.price)).catch(() => null) : null,
    e.XCHECK_KEY3 ? get(`${process.env.EXPLORER_API_URL ?? ""}/4663/api/v2/stats?apikey=${e.XCHECK_KEY3}`).then((j) => num(j.coin_price)).catch(() => null) : null,
  ]);
  return got.filter((x): x is number => x != null && x > 0);
}

async function checkToken(token: string, symbol: string | null, ours: number | null): Promise<TokenCheck> {
  const key = process.env.XCHECK_KEY3;
  if (!key) return { token, symbol, ours, second: null, holders: null, agree: null, why: null };
  try {
    const j = await get(`${process.env.EXPLORER_API_URL ?? ""}/4663/api/v2/tokens/${token}?apikey=${key}`);
    const second = num(j.exchange_rate);
    const holders = num(j.holders_count ?? j.holders);
    const gap = ours && second ? Math.abs(ours - second) / second : null;
    const why =
      holders != null && holders < MIN_HOLDERS
        ? `only ${holders} wallets hold it`
        : gap != null && gap > PRICE_GAP
          ? `a second source prices it ${gap > 1 ? `${gap.toFixed(0)}×` : `${Math.round(gap * 100)}%`} away`
          : null;
    return { token, symbol, ours, second, holders, agree: why ? false : gap != null || holders != null ? true : null, why };
  } catch {
    return { token, symbol, ours, second: null, holders: null, agree: null, why: null };
  }
}

async function run() {
  if (st.running || !on()) return;
  st.running = true;
  const t0 = Date.now();
  try {
    const client = getClient(process.env.RPC_URL);
    // its own client: getClient keeps one shared client, and the site's reads must stay on the main node
    const second = process.env.XCHECK_RPC ? (st2.c ??= createPublicClient({ transport: http(process.env.XCHECK_RPC, { timeout: 20_000, retryCount: 1 }) }) as PublicClient) : null;
    const [ours, outside, h1, h2, eth2] = await Promise.all([
      client ? readEthUsd(client).catch(() => null) : null,
      outsideEth(),
      client ? client.getBlockNumber().then(Number).catch(() => null) : null,
      second ? second.getBlockNumber().then(Number).catch(() => null) : null,
      second ? readEthUsd(second).catch(() => null) : null,
    ]);
    const lag = h1 != null && h2 != null ? h2 - h1 : null;
    const node = second
      ? { ours: h1, second: h2, lag, eth: eth2 || null, agree: lag == null ? null : lag <= MAX_LAG && (!ours || !eth2 || Math.abs(ours - eth2) / eth2 <= 0.005) }
      : null;
    const med = median(outside);
    // every queued token keeps its last result; each pass rechecks the ones looked at longest ago (new ones first),
    // so a long queue never drops a token's mark
    const last = new Map((st.snap?.tokens ?? []).map((x) => [x.token, x]));
    const seenAt = (st.checkedAt ??= new Map<string, number>());
    const list = [...st.queue.entries()].sort((a, b) => (seenAt.get(a[0]) ?? 0) - (seenAt.get(b[0]) ?? 0)).slice(0, MAX_TOKENS);
    const fresh = new Map<string, TokenCheck>();
    // one at a time, a quarter second apart: under the explorer's rate limit
    for (const [t, v] of list) {
      fresh.set(t, await checkToken(t, v.symbol, v.price));
      seenAt.set(t, Date.now());
      await sleep(250);
    }
    const tokens: TokenCheck[] = [...st.queue.keys()].map((k) => fresh.get(k) ?? last.get(k)).filter((x): x is TokenCheck => !!x);
    st.snap = {
      at: Date.now(),
      eth: { ours: ours || null, outside, median: med, agree: ours && med ? Math.abs(ours - med) / med <= ETH_GAP : null },
      node,
      tokens,
      ms: Date.now() - t0,
    };
    keepSnap("xcheck", st.snap);
  } catch (e) {
    console.error("[xcheck]", redact(e));
  } finally {
    st.running = false;
  }
}

/** Hands the checker the tokens a page lists, with the price the site shows; starts the agent on first use. */
export function xcheckTokens(rows: { token: string; symbol: string | null; price: number | null }[]) {
  // re-listed tokens move to the back, so the ones a page still shows are never the ones dropped
  for (const r of rows)
    if (r.token) {
      const k = r.token.toLowerCase();
      st.queue.delete(k);
      st.queue.set(k, { symbol: r.symbol, price: r.price });
    }
  // keep the newest MAX_TOKENS
  while (st.queue.size > MAX_TOKENS * 2) st.queue.delete(st.queue.keys().next().value!);
  if (!st.timer && on()) {
    st.timer = setInterval(() => void run(), EVERY);
    st.timer.unref?.();
    setTimeout(() => void run(), 15_000).unref?.();
  }
}

/** Why a token is in doubt, or null when the checker found nothing (or has not looked yet). */
export function doubt(token: string): string | null {
  return st.snap?.tokens.find((t) => t.token === token.toLowerCase())?.why ?? null;
}

export function xcheckSnap() {
  return st.snap;
}
