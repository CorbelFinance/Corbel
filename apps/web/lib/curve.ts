/**
 * Bonding-curve progress for tokens still on a launchpad's curve. At launch the curve's supply is minted to the
 * launchpad's contract; buyers take tokens out of it; on graduation what is left moves to a pool. So the share of
 * the minted supply that has left the holder is how far the curve has sold. Read from the chain:
 *  - the holder: the address the launch transaction minted the token to (kept per token, it never changes);
 *  - its balance now, against what was minted to it.
 * Refreshed in the background every few minutes; the newest tokens still on a curve, a few hundred at most.
 */
import { curveLaunches, indexStatus } from "@corbel/indexer";
import { getClient } from "@corbel/data/chain";
import { erc20Abi, type PublicClient } from "viem";

export type Curve = { token: string; symbol: string | null; name: string | null; pad: string; creator: string | null; ago: number; sold: number };
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
const BPS = 4;

type Holder = { holder: string; minted: bigint } | null;
const G = globalThis as unknown as { __corbelCurve?: { holders: Map<string, Holder>; rows: Curve[]; at: number; busy: boolean } };
const box = (G.__corbelCurve ??= { holders: new Map(), rows: [], at: 0, busy: false });

async function holderOf(c: PublicClient, token: string, tx: string): Promise<Holder> {
  const rc = await c.getTransactionReceipt({ hash: tx as `0x${string}` }).catch(() => null);
  if (!rc) return null;
  let best: Holder = null;
  for (const l of rc.logs) {
    if (l.address.toLowerCase() !== token || l.topics[0] !== TRANSFER || l.topics[1] !== ZERO || !l.topics[2]) continue;
    const amt = BigInt(l.data === "0x" ? 0 : l.data);
    const to = `0x${l.topics[2].slice(26)}`.toLowerCase();
    if (!best || amt > best.minted) best = { holder: to, minted: amt };
  }
  return best;
}

async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await f(items[k]!);
      }
    }),
  );
  return out;
}

async function refresh() {
  const c = getClient(process.env.RPC_URL);
  const st = indexStatus();
  if (!c || !st?.high) return;
  const head = st.high;
  const live = curveLaunches(head - 3 * 86_400 * BPS, 4000).filter((r) => !r.pooled).slice(0, 300);
  const rows = await pool(live, 12, async (r): Promise<Curve | null> => {
    const k = r.token.toLowerCase();
    if (!box.holders.has(k)) box.holders.set(k, await holderOf(c, k, r.tx));
    const h = box.holders.get(k);
    if (!h || h.minted === 0n || h.holder === r.creator?.toLowerCase()) return null;
    const bal = await c.readContract({ address: k as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [h.holder as `0x${string}`] }).catch(() => null);
    if (bal === null) return null;
    const sold = Math.max(0, Math.min(1, 1 - Number((bal * 10_000n) / h.minted) / 10_000));
    return { token: r.token, symbol: r.symbol, name: r.name, pad: r.pad, creator: r.creator, ago: Math.round((head - r.block) / BPS), sold };
  });
  // all of it gone at once is not a curve selling (a graduation we do not index, or a plain transfer); a ticker that
  // copies the chain's money is a lookalike, flagged elsewhere, never a candidate
  const MONEY = new Set(["USDG", "USDC", "USDT", "ETH", "WETH", "CBBTC", "BTC", "WBTC"]);
  box.rows = rows.filter((x): x is Curve => !!x && x.sold < 0.98 && !MONEY.has((x.symbol ?? "").toUpperCase()) && !/^test$/i.test(x.symbol ?? "")).sort((a, b) => b.sold - a.sold);
  box.at = Date.now();
}

/** Tokens still on a curve, most sold first. Starts a refresh in the background when the list is older than 3 minutes. */
export function curveProgress(): { at: number; rows: Curve[] } {
  if (!box.busy && Date.now() - box.at > 3 * 60_000) {
    box.busy = true;
    void refresh()
      .catch(() => undefined)
      .finally(() => (box.busy = false));
  }
  return { at: box.at, rows: box.rows };
}
