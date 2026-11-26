/**
 * $CORBEL's price in USD for Credits: the token's own ETH pool on the v4 PoolManager (slot0, read like the portfolio
 * does) times ETH in USDG from the deepest WETH/USDG V2 pair. A sample is kept every minute; a coin is valued at the
 * LOWER of the spot price and the 30-minute average, so a price pushed up for one block buys nothing extra.
 */
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { getClient, RH } from "@corbel/data/chain";

/** The pool $CORBEL graduated into: ETH/CORBEL, fee 0, tick spacing 200, the launchpad's hook. */
export const CORBEL_POOL_ID = "0x3a59df3bd5870dee024ca508d8f89e46e3c47fdb024fc0d8f0c5cf3e5e6ef3a9" as Hex;
const EXTSLOAD = [{ type: "function", name: "extsload", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bytes32" }] }] as const;
const FACTORY = [{ type: "function", name: "getPair", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] }] as const;
const PAIR = [
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const WINDOW = 30 * 60_000;

type Sample = { at: number; usd: number };
const G = globalThis as unknown as { __corbelPrice?: { samples: Sample[]; last: number } };
const box = (G.__corbelPrice ??= { samples: [], last: 0 });

/** Spot USD per whole $CORBEL right now, or null when a read failed. */
export async function corbelSpot(): Promise<number | null> {
  const client = getClient(process.env.RPC_URL);
  if (!client) return null;
  try {
    const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [CORBEL_POOL_ID, 6n]));
    const [w, pair] = await Promise.all([
      client.readContract({ address: RH.V4_POOL_MANAGER as Address, abi: EXTSLOAD, functionName: "extsload", args: [slot] }),
      client.readContract({ address: RH.V2_FACTORY as Address, abi: FACTORY, functionName: "getPair", args: [RH.WETH as Address, RH.USDG as Address] }),
    ]);
    const sqrt = BigInt(w) & ((1n << 160n) - 1n);
    if (sqrt === 0n) return null;
    // currency0 is ETH, currency1 is CORBEL (both 18 decimals): price = CORBEL per ETH = (sqrt / 2^96)^2
    const corbelPerEth = (Number(sqrt) / 2 ** 96) ** 2;
    const [[r0, r1], t0] = await Promise.all([
      client.readContract({ address: pair, abi: PAIR, functionName: "getReserves" }),
      client.readContract({ address: pair, abi: PAIR, functionName: "token0" }),
    ]);
    const wethIs0 = t0.toLowerCase() === RH.WETH.toLowerCase();
    const eth = Number(wethIs0 ? r0 : r1) / 1e18, usdg = Number(wethIs0 ? r1 : r0) / 1e6;
    if (!(eth > 0 && corbelPerEth > 0)) return null;
    return usdg / eth / corbelPerEth;
  } catch {
    return null;
  }
}

/** Takes a sample at most once a minute; returns the value used for Credits: min(spot, 30-minute average). */
export async function corbelCreditPrice(): Promise<{ spot: number; average: number; used: number; samples: number } | null> {
  const now = Date.now();
  const last = box.samples.at(-1);
  if (!last || now - box.last >= 60_000) {
    const s = await corbelSpot();
    box.last = now;
    if (s !== null) box.samples.push({ at: now, usd: s });
  }
  box.samples = box.samples.filter((s) => now - s.at <= WINDOW);
  const cur = box.samples.at(-1);
  if (!cur) return null;
  const average = box.samples.reduce((a, s) => a + s.usd, 0) / box.samples.length;
  return { spot: cur.usd, average, used: Math.min(cur.usd, average), samples: box.samples.length };
}
