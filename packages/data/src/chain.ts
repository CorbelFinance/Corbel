/**
 * Read-only access to Robinhood Chain. No wallet, no signing, no transactions.
 * Off unless CHAIN_READS=1 and an RPC URL is set: with either missing every read returns null.
 */
import { createPublicClient, defineChain, getAddress, http, isAddress, type Address, type PublicClient } from "viem";
import { z } from "zod";
import { ROBINHOOD_CHAIN } from "@corbel/config";
import { cleanText } from "./text.ts";
import { limitedFetch } from "./limiter.ts";

export const robinhood = defineChain({
  id: ROBINHOOD_CHAIN.id,
  name: ROBINHOOD_CHAIN.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [] } },
});

let cached: { url: string; client: PublicClient } | null = null;

/** Chain reads are off by default; the runtime turns them on with CHAIN_READS=1. */
export const chainReadsOn = () => process.env.CHAIN_READS === "1";

export function getClient(url: string | undefined): PublicClient | null {
  if (!url || !chainReadsOn()) return null;
  if (cached?.url === url) return cached.client;
  const client = createPublicClient({ chain: robinhood, transport: http(url, { timeout: 30_000, retryCount: 3, retryDelay: 500, fetchFn: limitedFetch, batch: { batchSize: 8, wait: 10 } }) });
  cached = { url, client };
  return client;
}

/** Refuses to read anything if the RPC is not the chain we expect. */
export async function assertChain(client: PublicClient): Promise<boolean> {
  const id = await client.getChainId();
  return id === ROBINHOOD_CHAIN.id;
}

export const NetSnapshot = z.object({ block: z.bigint(), gasPriceWei: z.bigint() });
export type NetSnapshot = z.infer<typeof NetSnapshot>;

export async function readNet(client: PublicClient | null): Promise<NetSnapshot | null> {
  if (!client) return null;
  try {
    if (!(await assertChain(client))) return null;
    const [block, gasPriceWei] = await Promise.all([client.getBlockNumber(), client.getGasPrice()]);
    return NetSnapshot.parse({ block, gasPriceWei });
  } catch {
    return null;
  }
}

/** Kept for older callers. */
export async function readBlockNumber(url?: string): Promise<bigint | null> {
  return (await readNet(getClient(url)))?.block ?? null;
}

const ERC20 = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

export const TokenRead = z.object({
  address: z.string(),
  hasCode: z.boolean(),
  name: z.string().nullable(),
  symbol: z.string().nullable(),
  decimals: z.number().int().min(0).max(255).nullable(),
  totalSupply: z.bigint().nullable(),
  /** null = no owner() function; zero address = renounced */
  owner: z.string().nullable(),
});
export type TokenRead = z.infer<typeof TokenRead>;

export const ZERO = "0x0000000000000000000000000000000000000000";

export function parseAddress(input: string): Address | null {
  const s = input.trim();
  return isAddress(s, { strict: false }) ? getAddress(s) : null;
}

/** Plain view calls on a token contract. Each field is null when the call reverts. */
export async function readToken(client: PublicClient, address: Address): Promise<TokenRead | null> {
  if (!(await assertChain(client))) return null;
  const code = await client.getCode({ address });
  const hasCode = !!code && code !== "0x";
  const call = async <T>(fn: (typeof ERC20)[number]["name"]): Promise<T | null> => {
    if (!hasCode) return null;
    try {
      return (await client.readContract({ address, abi: ERC20, functionName: fn })) as T;
    } catch {
      return null;
    }
  };
  const [name, symbol, decimals, totalSupply, owner] = await Promise.all([
    call<string>("name"),
    call<string>("symbol"),
    call<number>("decimals"),
    call<bigint>("totalSupply"),
    call<string>("owner"),
  ]);
  return TokenRead.parse({ address, hasCode, name: cleanText(name), symbol: cleanText(symbol, 32), decimals: decimals === null ? null : Number(decimals), totalSupply, owner });
}
