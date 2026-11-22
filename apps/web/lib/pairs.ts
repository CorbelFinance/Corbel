/**
 * A public pairs index's API for Robinhood Chain (no key; about 300 requests a minute). Server-side only:
 * the browser never calls it. Used for 24h volume across every pool of a token (including pools older than
 * our index), the project's image, and to name v4 pools our index has not seen.
 */
export type DsPair = {
  pairAddress: string;
  dexId: string;
  labels?: string[];
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  volume?: { h24?: number; h6?: number; h1?: number };
  priceChange?: { h24?: number; h1?: number };
  txns?: { h24?: { buys: number; sells: number } };
  liquidity?: { usd?: number };
  fdv?: number;
  pairCreatedAt?: number;
  url?: string;
  info?: { imageUrl?: string; websites?: { label?: string; url: string }[]; socials?: { type: string; url: string }[] };
};

/** Project links from a pair's info: https only, at most six, deduplicated. Third-party data, shown as links only. */
export function dsLinks(pairs: DsPair[]): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  const ok = (u: string) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" && u.length < 200;
    } catch {
      return false;
    }
  };
  for (const p of pairs) {
    for (const w of p.info?.websites ?? []) if (ok(w.url) && !seen.has(w.url)) seen.add(w.url), out.push({ label: "Site", url: w.url });
    for (const s of p.info?.socials ?? []) if (ok(s.url) && !seen.has(s.url)) seen.add(s.url), out.push({ label: s.type === "twitter" ? "X" : s.type === "telegram" ? "Telegram" : s.type === "discord" ? "Discord" : "Link", url: s.url });
  }
  return out.slice(0, 6);
}

const BASE = `${process.env.PAIRS_API_URL ?? ""}`;

/** Up to three tries: the API answers 429 in bursts; a dropped batch would silently shrink every total. */
async function get<T>(path: string): Promise<T | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(BASE + path, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      if (r.ok) return (await r.json()) as T;
    } catch {
      // retry below
    }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
  return null;
}

/** Every pair of up to 30 tokens per request. */
export async function dsTokens(addresses: string[]): Promise<DsPair[]> {
  const out: DsPair[] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    const got = await get<DsPair[]>(`/tokens/v1/robinhood/${addresses.slice(i, i + 30).join(",")}`);
    if (got) out.push(...got);
  }
  return out;
}

/** Every pair of each token (token-pairs answers all pools of one token; tokens/v1 only the top pair). */
export async function dsAllPairs(addresses: string[], lanes = 4): Promise<DsPair[]> {
  const out: DsPair[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (i < addresses.length) {
        const a = addresses[i++]!;
        const got = await get<DsPair[]>(`/token-pairs/v1/robinhood/${a}`);
        if (got) out.push(...got);
      }
    }),
  );
  return out;
}

/** Pairs by pair address or v4 pool id, up to 30 per request. */
export async function dsPairs(ids: string[]): Promise<DsPair[]> {
  const out: DsPair[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const got = await get<{ pairs?: DsPair[] }>(`/latest/dex/pairs/robinhood/${ids.slice(i, i + 30).join(",")}`);
    if (got?.pairs) out.push(...got.pairs);
  }
  return out;
}

/** Per token: summed 24h volume and liquidity across its pairs, the deepest pair's price, an image if any. */
export function byToken(pairs: DsPair[]) {
  const m = new Map<string, { volume: number; liquidity: number; price: number | null; change: number | null; buys: number; sells: number; image: string | null; created: number | null; name: string; symbol: string; best: number }>();
  for (const p of pairs) {
    const k = p.baseToken.address.toLowerCase();
    const liq = p.liquidity?.usd ?? 0;
    let r = m.get(k);
    if (!r) m.set(k, (r = { volume: 0, liquidity: 0, price: null, change: null, buys: 0, sells: 0, image: null, created: null, name: p.baseToken.name, symbol: p.baseToken.symbol, best: -1 }));
    r.volume += p.volume?.h24 ?? 0;
    r.liquidity += liq;
    r.buys += p.txns?.h24?.buys ?? 0;
    r.sells += p.txns?.h24?.sells ?? 0;
    if (!r.image && p.info?.imageUrl) r.image = p.info.imageUrl;
    if (p.pairCreatedAt && (!r.created || p.pairCreatedAt < r.created)) r.created = p.pairCreatedAt;
    if (liq > r.best) {
      r.best = liq;
      r.price = p.priceUsd ? Number(p.priceUsd) : null;
      r.change = p.priceChange?.h24 ?? null;
    }
  }
  return m;
}
