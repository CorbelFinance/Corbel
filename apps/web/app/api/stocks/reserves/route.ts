import { erc20Abi, formatUnits, type Hex } from "viem";
import { getClient, redact } from "@corbel/data/chain";
import { FACTS, STOCK_TOKEN_FILING } from "@corbel/config";
import { loadSnap } from "@/lib/snapshot";
import { guardWait } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/stocks/reserves → what the issuer's stock tokens on Robinhood Chain are worth now, token by token: the
 * supply read from each contract at the latest block times the chain price, next to what the issuer's own filing says
 * backs them (dated, linked). The two are not the same measure: the filing is one date and covers every public stock
 * token, the chain figure is now and covers this chain. Cached 10 minutes.
 */
type Row = { address: string; symbol: string; name: string; issuer?: string; price?: number | null; market?: { price: number } | null };
let cache: { at: number; body: unknown } | null = null;

export async function GET(req: Request) {
  if (cache && Date.now() - cache.at < 600_000) return Response.json(cache.body);
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    const c = getClient(process.env.RPC_URL);
    const snap = loadSnap<{ at: number; rows: Row[] }>("stocks");
    if (!c || !snap?.rows?.length) return Response.json({ error: "The stock list is not read yet. Try again in a minute." }, { status: 503 });
    const issuer = snap.rows.filter((r) => r.issuer === "Robinhood");
    const block = await c.getBlockNumber();
    const rows: { token: string; symbol: string; name: string; supply: number; price: number | null; value: number | null }[] = [];
    // a few at a time: one supply and one decimals read per token
    for (let i = 0; i < issuer.length; i += 8) {
      const part = await Promise.all(
        issuer.slice(i, i + 8).map(async (r) => {
          const a = r.address as Hex;
          const [sup, dec] = await Promise.all([
            c.readContract({ address: a, abi: erc20Abi, functionName: "totalSupply", blockNumber: block }).catch(() => null),
            c.readContract({ address: a, abi: erc20Abi, functionName: "decimals" }).catch(() => null),
          ]);
          if (sup === null || dec === null) return null;
          const supply = Number(formatUnits(sup, dec));
          const price = r.price ?? r.market?.price ?? null;
          return { token: a.toLowerCase(), symbol: r.symbol, name: r.name, supply, price, value: price !== null ? supply * price : null };
        }),
      );
      for (const x of part) if (x) rows.push(x);
    }
    rows.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const priced = rows.filter((r) => r.value !== null);
    const body = {
      block: block.toString(),
      at: Date.now(),
      onChain: { tokens: rows.length, priced: priced.length, value: priced.reduce((s, r) => s + (r.value ?? 0), 0) },
      filing: { issuer: FACTS.stockTokenIssuer.value, backing: FACTS.stockTokenBacking.value, asOf: FACTS.stockTokenBacking.asOf, says: FACTS.stockTokenBacking.source, url: STOCK_TOKEN_FILING },
      rows,
    };
    cache = { at: Date.now(), body };
    return Response.json(body);
  } catch (e) {
    console.error("[api/stocks/reserves]", redact(e));
    return Response.json({ error: "The chain did not answer. Try again in a minute." }, { status: 502 });
  } finally {
    g.release();
  }
}
