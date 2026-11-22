/**
 * Stock token desk: which tokens are really issued as Robinhood stock tokens, and what the chain pays for one.
 *
 * Every issuer stock token on Robinhood Chain runs the same 283-byte proxy with the issuer's address baked into the
 * code, so its runtime code hash is identical across all of them. A lookalike can copy the name and ticker, but not
 * this code without pointing at the issuer. Price = selling exactly one token to USDG along the best route, simulated
 * at the latest block with the same engine as Trade → Quote. No off-chain reference price is used.
 */
import { formatUnits, getAddress, keccak256, type Address, type PublicClient } from "viem";
import { RH } from "./trust/addresses.ts";
import { assetMeta, quote, type QuoteIndex } from "./trust/quote.ts";

/** keccak256 of the issuer proxy's runtime code (checked on 2026-11-13 against 104 tokens). */
export const ISSUER_STOCK_CODEHASH = "0x6c1fdd40002dcb440c7fff6a84171404d279ccb057803b65826f7546acd65630";
/** ST0x (S01 Issuer GmbH) wrapped stock tokens: one shared runtime code, read on chain 2026-11-15 (wtWMT, wtHOOD). */
export const ST0X_CODEHASH = "0xac684843cc8b4f414e3516779bbcbdc1118a997b4125320c6b7192015e645548";
/** Issuers on Robinhood Chain, by runtime code hash. */
export const ISSUERS: Record<string, string> = { [ISSUER_STOCK_CODEHASH]: "Robinhood", [ST0X_CODEHASH]: "ST0x" };

export type StockCandidate = { address: string; symbol: string; name: string; decimals: number | null; pools: number };
export type StockRow = {
  address: Address;
  symbol: string;
  name: string;
  pools: number;
  /** USDG for one token, best route; null when no route pays */
  price: number | null;
  /** venues of the best route, e.g. ["v4"] or ["v2", "v4"] */
  via: string[];
  /** share of the one-token price still paid per token when selling ten (1 = deep pool, near 0 = thin) */
  keep10: number | null;
};
export type Lookalike = { address: Address; symbol: string; name: string; pools: number };
export type StockDesk = { block: string; at: number; rows: StockRow[]; lookalikes: Lookalike[]; checked: number; ms: number };

async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]!);
      }
    }),
  );
  return out;
}

const tidy = (name: string) => name.replace(/\s*•\s*Robinhood Token\s*$/i, "").trim();

/** Reads the desk. `priceTop` caps how many issuer tokens get a simulated price (most pools first). */
export async function readStockDesk(client: PublicClient, candidates: StockCandidate[], index: QuoteIndex, priceTop = 40): Promise<StockDesk> {
  const t0 = Date.now();
  const block = await client.getBlockNumber();
  const coded = await mapLimit(candidates, 6, async (c) => {
    // a failed read is "unknown", never "lookalike": retry once, then leave the token out of both lists
    let code: string | undefined;
    for (let k = 0; k < 2 && code === undefined; k++) code = await client.getCode({ address: c.address as Address, blockNumber: block }).catch(() => undefined);
    const by = !!code && code !== "0x" ? ISSUERS[keccak256(code as `0x${string}`)] : undefined;
    return { c, known: code !== undefined, issuer: !!by, by };
  });
  const issuer = coded.filter((x) => x.issuer).map((x) => ({ ...x.c, by: x.by! }));
  const lookalikes = coded
    .filter((x) => x.known && !x.issuer)
    .map(({ c }) => ({ address: getAddress(c.address), symbol: c.symbol, name: c.name, pools: c.pools }));

  const priced = new Set(issuer.slice(0, priceTop).map((c) => c.address.toLowerCase()));
  const rows = await mapLimit(issuer, 4, async (c): Promise<StockRow> => {
    const address = getAddress(c.address);
    const base = { address, symbol: c.symbol, name: tidy(c.name).replace(/^Wrapped\s+/, "").replace(/\s+ST0x$/, ""), issuer: c.by, pools: c.pools, price: null, via: [] as string[], keep10: null };
    if (!priced.has(c.address.toLowerCase()) || c.pools === 0) return base;
    try {
      const decimals = c.decimals ?? (await assetMeta(client, address)).decimals;
      const one = 10n ** BigInt(decimals);
      const q = await quote(client, address, RH.USDG as Address, one, index);
      if (q.best === null) return base;
      const r = q.routes[q.best]!;
      const price = Number(formatUnits(BigInt(r.amountOut!), q.to.decimals));
      // depth: what ten tokens fetch per token, against the one-token price
      const q10 = await quote(client, address, RH.USDG as Address, one * 10n, index).catch(() => null);
      const out10 = q10 && q10.best !== null ? Number(formatUnits(BigInt(q10.routes[q10.best]!.amountOut!), q10.to.decimals)) : null;
      const keep10 = out10 !== null && price > 0 ? Math.max(0, Math.min(1, out10 / 10 / price)) : null;
      return { ...base, price, via: r.hops.filter((h) => h.venue !== "unwrap").map((h) => h.venue), keep10 };
    } catch {
      return base;
    }
  });
  rows.sort((a, b) => (b.price !== null ? 1 : 0) - (a.price !== null ? 1 : 0) || b.pools - a.pools);
  return { block: block.toString(), at: Date.now(), rows, lookalikes, checked: candidates.length, ms: Date.now() - t0 };
}

/** NYSE regular session from the clock alone (no holiday calendar): open, pre/after hours, or closed. */
export function usSession(now = new Date()): "open" | "extended" | "closed" | "weekend" {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  if (p.weekday === "Sat" || p.weekday === "Sun") return "weekend";
  const m = Number(p.hour) * 60 + Number(p.minute);
  if (m >= 570 && m < 960) return "open";
  if (m >= 240 && m < 1200) return "extended";
  return "closed";
}
