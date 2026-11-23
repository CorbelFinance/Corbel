import { encodeFunctionData, formatUnits, parseUnits, stringToHex, hexToString, type Hex } from "viem";
import { guardWait } from "@/lib/guard";
import { devClient, devchain, devSend, devWarp } from "@/lib/devchain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Price markets of CorbelPredict on the local test chain. Three presets over one contract function (createPrice):
 *   updown  YES if the pool's 30-minute average price at the end is at or above today's price
 *   grid    five markets on one date with lines at -5%, -2%, 0, +2% and +5% of today's price
 *   monday  YES if a stock token's first 30 minutes after Monday's open average at or above Friday's close (the line);
 *           with a gap, weekend cover: two lines at the close ± the gap
 * Two test wallets ("a", the main one, and "b") can take sides, so a market can settle with a winner.
 *   GET → markets, pots, each wallet's stake and what it can claim
 *   POST {action:"create", preset, minutes?, token?, line?} · {action:"bet", id, yes, amount, who}
 *   POST {action:"start", id} · {action:"settle", id} · {action:"claim", id, who} · {action:"warp", minutes}
 */
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73" as Hex;
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Hex;
const FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f" as Hex;
const WINDOW = 30 * 60;
const Q112 = 2n ** 112n;
const B = "0xc0de000000000000000000000000000000000003" as Hex; // not the fee fund (…0002), so its balance shows only its own stakes

const PRED = [
  { type: "function", name: "count", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function", name: "markets", stateMutability: "view", inputs: [{ type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "kind", type: "uint8" }, { name: "state", type: "uint8" }, { name: "outcome", type: "bool" }, { name: "createdAt", type: "uint64" }, { name: "closeAt", type: "uint64" }, { name: "expiry", type: "uint64" }, { name: "proposedAt", type: "uint64" }, { name: "pair", type: "address" }, { name: "base", type: "address" }, { name: "minReserve", type: "uint256" }, { name: "lowest", type: "uint256" }, { name: "pokes", type: "uint32" }, { name: "lastPoke", type: "uint64" }, { name: "question", type: "bytes32" }, { name: "strike", type: "uint256" }, { name: "challenger", type: "address" }, { name: "yesPot", type: "uint256" }, { name: "noPot", type: "uint256" }, { name: "yesWeight", type: "uint256" }, { name: "noWeight", type: "uint256" },
    ] }],
  },
  { type: "function", name: "stake", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "claimable", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "twap", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint64" }, { type: "uint64" }, { type: "uint256" }] },
  { type: "function", name: "createPrice", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes32" }, { type: "uint64" }, { type: "uint64" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "bet", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "bool" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "startTwap", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "settlePrice", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
] as const;
const PAIR = [
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const ERC20 = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
const GETPAIR = [{ type: "function", name: "getPair", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] }] as const;
const STATES = ["open", "proposed", "settled", "void"] as const;

/** The pair's price of its non-base token, in base per token, as the UQ112x112 raw number the contract compares. */
async function rawPrice(pair: Hex, base: Hex): Promise<bigint> {
  const c = devClient()!;
  const [[r0, r1], t0] = await Promise.all([c.readContract({ address: pair, abi: PAIR, functionName: "getReserves" }), c.readContract({ address: pair, abi: PAIR, functionName: "token0" })]);
  const baseIs0 = t0.toLowerCase() === base.toLowerCase();
  return baseIs0 ? (BigInt(r0) * Q112) / BigInt(r1) : (BigInt(r1) * Q112) / BigInt(r0);
}
/** UQ112x112 raw → base per whole token, given both decimals. */
const human = (raw: bigint, baseDec: number, tokDec: number) => (Number((raw * 10n ** 12n) / Q112) / 1e12) * 10 ** (tokDec - baseDec);

async function state() {
  const d = devchain()!, c = devClient()!;
  const block = await c.getBlock();
  const n = Number(await c.readContract({ address: d.predict, abi: PRED, functionName: "count" }));
  const markets = [];
  for (let id = 0; id < n; id++) {
    const m = await c.readContract({ address: d.predict, abi: PRED, functionName: "markets", args: [BigInt(id)] });
    if (m.kind !== 1) continue;
    const [, startedAt] = await c.readContract({ address: d.predict, abi: PRED, functionName: "twap", args: [BigInt(id)] });
    const who = { a: d.dev, b: B };
    const mine = Object.fromEntries(
      await Promise.all(
        Object.entries(who).map(async ([k, w]) => {
          const [y, no, cl] = await Promise.all([
            c.readContract({ address: d.predict, abi: PRED, functionName: "stake", args: [BigInt(id), w, 1n] }),
            c.readContract({ address: d.predict, abi: PRED, functionName: "stake", args: [BigInt(id), w, 0n] }),
            c.readContract({ address: d.predict, abi: PRED, functionName: "claimable", args: [BigInt(id), w] }),
          ]);
          return [k, { yes: Number(formatUnits(y, 6)), no: Number(formatUnits(no, 6)), claimable: Number(formatUnits(cl, 6)) }];
        }),
      ),
    );
    // the pair's other token (not the base) is what the line prices
    const [t0, t1] = await Promise.all([c.readContract({ address: m.pair, abi: PAIR, functionName: "token0" }), c.readContract({ address: m.pair, abi: PAIR, functionName: "token1" })]);
    const tok = t0.toLowerCase() === m.base.toLowerCase() ? t1 : t0;
    const tokDec = Number(await c.readContract({ address: tok, abi: ERC20, functionName: "decimals" }).catch(() => 18));
    const baseDec = m.base.toLowerCase() === USDG ? 6 : 18;
    const now = await rawPrice(m.pair, m.base).catch(() => 0n);
    markets.push({
      id, question: hexToString(m.question, { size: 32 }).replace(/\0+$/, ""), state: STATES[m.state] ?? "open", outcome: m.outcome,
      closeAt: Number(m.closeAt), expiry: Number(m.expiry), line: human(m.strike, baseDec, tokDec), now: human(now, baseDec, tokDec),
      yesPot: Number(formatUnits(m.yesPot, 6)), noPot: Number(formatUnits(m.noPot, 6)), twapStarted: Number(startedAt) > 0, mine,
    });
  }
  const bal = async (w: Hex) => Number(formatUnits(await c.readContract({ address: USDG, abi: ERC20, functionName: "balanceOf", args: [w] }), 6));
  return { mode: "test", chain: { block: Number(block.number), time: Number(block.timestamp) }, predict: d.predict, wallets: { a: { address: d.dev, usdg: await bal(d.dev) }, b: { address: B, usdg: await bal(B) } }, markets: markets.reverse() };
}

export async function GET(req: Request) {
  if (!devchain()) return Response.json({ mode: "off" }, { status: 503 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    return Response.json(await state(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: `The test chain did not answer: ${(e as Error).message.split("\n")[0]}` }, { status: 502 });
  } finally {
    g.release();
  }
}

export async function POST(req: Request) {
  const d = devchain(), c = devClient();
  if (!d || !c) return Response.json({ error: "The test chain is off." }, { status: 503 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const now = Number((await c.getBlock()).timestamp);
    const id = BigInt(Number(b.id ?? 0));
    const from = b.who === "b" ? B : d.dev;
    if (b.action === "create") {
      const create = async (pair: Hex, base: Hex, strike: bigint, q: string, closeAt: number, expiry: number) =>
        devSend(d.predict, encodeFunctionData({ abi: PRED, functionName: "createPrice", args: [pair, base, strike, BigInt(WINDOW), stringToHex(q.slice(0, 31), { size: 32 }), BigInt(closeAt), BigInt(expiry)] }));
      const pairOf = (t: Hex) => c.readContract({ address: FACTORY, abi: GETPAIR, functionName: "getPair", args: [t, USDG] });
      if (b.preset === "monday") {
        const token = String(b.token ?? "") as Hex;
        const line = Number(b.line);
        if (!/^0x[0-9a-fA-F]{40}$/.test(token) || !(line > 0)) return Response.json({ error: "Give the stock token and Friday's close." }, { status: 400 });
        const pair = await pairOf(token);
        if (/^0x0+$/.test(pair)) return Response.json({ error: "That token has no USDG pool to read." }, { status: 400 });
        const tokDec = Number(await c.readContract({ address: token, abi: ERC20, functionName: "decimals" }));
        const strike = (parseUnits(String(line), 6) * Q112) / 10n ** BigInt(tokDec);
        // the next Monday's 13:30 UTC open; bets close at the open, the line is checked on the first 30 minutes
        const t = new Date(now * 1000);
        const open = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + ((8 - t.getUTCDay()) % 7 || 7), 13, 30) / 1000;
        // weekend cover: with a gap, two lines at Friday's close ± the gap; YES on the upper line or NO on the lower one
        // pays when Monday opens beyond the gap, which is the cover a holder buys on Friday
        const gap = Math.max(0, Math.min(50, Number(b.gap) || 0));
        if (gap > 0) {
          const bp = BigInt(Math.round(gap * 100));
          await create(pair, USDG, (strike * (10_000n + bp)) / 10_000n, `Monday opens +${gap}% or more`, open, open + WINDOW);
          await create(pair, USDG, (strike * (10_000n - bp)) / 10_000n, `Monday opens above -${gap}%`, open, open + WINDOW);
        } else await create(pair, USDG, strike, "Opens Monday above Friday's close", open, open + WINDOW);
      } else {
        const pair = await pairOf(WETH);
        const p = await rawPrice(pair, USDG);
        const mins = Math.max(31, Math.min(1440, Number(b.minutes) || 60));
        const closeAt = now + mins * 60 - WINDOW, expiry = now + mins * 60;
        const lines = b.preset === "grid" ? [-500, -200, 0, 200, 500] : [0];
        for (const bp of lines) await create(pair, USDG, (p * BigInt(10_000 + bp)) / 10_000n, bp ? `ETH ${bp > 0 ? "+" : ""}${bp / 100}% in ${mins}m` : `ETH up in ${mins}m`, closeAt, expiry);
      }
    } else if (b.action === "bet") {
      const amt = parseUnits(String(Math.max(1, Number(b.amount) || 10)), 6);
      if (from === B && (await c.readContract({ address: USDG, abi: ERC20, functionName: "balanceOf", args: [B] })) < amt) await devSend(USDG, encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [B, amt * 10n] }));
      await devSend(USDG, encodeFunctionData({ abi: ERC20, functionName: "approve", args: [d.predict, amt] }), 0n, from);
      await devSend(d.predict, encodeFunctionData({ abi: PRED, functionName: "bet", args: [id, b.yes === true, amt] }), 0n, from);
    } else if (b.action === "start") await devSend(d.predict, encodeFunctionData({ abi: PRED, functionName: "startTwap", args: [id] }));
    else if (b.action === "settle") await devSend(d.predict, encodeFunctionData({ abi: PRED, functionName: "settlePrice", args: [id] }));
    else if (b.action === "claim") await devSend(d.predict, encodeFunctionData({ abi: PRED, functionName: "claim", args: [id] }), 0n, from);
    else if (b.action === "warp") await devWarp(Math.max(60, Math.min(7 * 86_400, Math.round((Number(b.minutes) || 30) * 60))));
    else return Response.json({ error: "Unknown action." }, { status: 400 });
    return Response.json(await state());
  } catch (e) {
    return Response.json({ error: (e as Error).message.split("\n")[0] }, { status: 400 });
  } finally {
    g.release();
  }
}
