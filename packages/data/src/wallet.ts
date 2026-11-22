/** Read-only snapshot of one address on Robinhood Chain: native and base-token balances. No signing. */
import { formatUnits, type Address, type PublicClient } from "viem";
import { assertChain } from "./chain";
import { BASE_DECIMALS, RH } from "./trust/addresses.ts";

const BAL = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;

export interface WalletRead {
  address: Address;
  block: string;
  isContract: boolean;
  txCount: number;
  balances: { symbol: "ETH" | "WETH" | "USDG"; raw: string; value: string }[];
}

export async function readWallet(client: PublicClient, address: Address): Promise<WalletRead | null> {
  if (!(await assertChain(client))) return null;
  const block = await client.getBlockNumber();
  const [eth, weth, usdg, code, txCount] = await Promise.all([
    client.getBalance({ address, blockNumber: block }),
    client.readContract({ address: RH.WETH as Address, abi: BAL, functionName: "balanceOf", args: [address], blockNumber: block }),
    client.readContract({ address: RH.USDG as Address, abi: BAL, functionName: "balanceOf", args: [address], blockNumber: block }),
    client.getCode({ address, blockNumber: block }),
    client.getTransactionCount({ address, blockNumber: block }),
  ]);
  const row = (symbol: "ETH" | "WETH" | "USDG", raw: bigint, dec: number) => ({ symbol, raw: raw.toString(), value: formatUnits(raw, dec) });
  return {
    address,
    block: block.toString(),
    isContract: !!code && code !== "0x",
    txCount,
    balances: [row("ETH", eth, 18), row("WETH", weth, BASE_DECIMALS.WETH), row("USDG", usdg, BASE_DECIMALS.USDG)],
  };
}
