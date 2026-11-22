/**
 * What a token contract lets its owner do, read from bytecode and storage. A function selector
 * present in the dispatcher (PUSH4 <selector>) means the function exists; it says nothing about
 * who may call it, so results are combined with owner() status.
 */
import { getAddress, toFunctionSelector, type Address, type PublicClient } from "viem";

const GROUPS: Record<string, string[]> = {
  mint: ["mint(address,uint256)", "mint(uint256)", "_mint(address,uint256)", "mintTo(address,uint256)"],
  pause: ["pause()", "setPaused(bool)", "pauseTrading()", "setTradingPaused(bool)"],
  blacklist: [
    "blacklist(address)",
    "addToBlacklist(address)",
    "setBlacklist(address,bool)",
    "setIsBlacklisted(address,bool)",
    "setBots(address[],bool)",
    "blockBots(address[])",
    "addBots(address[])",
    "setBlacklisted(address,bool)",
  ],
  fees: [
    "setFee(uint256)",
    "setFees(uint256,uint256)",
    "setTaxes(uint256,uint256)",
    "setBuyFee(uint256)",
    "setSellFee(uint256)",
    "updateFees(uint256,uint256)",
    "setTaxFeePercent(uint256)",
    "setSwapFees(uint256,uint256)",
    "setBuyTax(uint256)",
    "setSellTax(uint256)",
  ],
  limits: ["setMaxTxAmount(uint256)", "setMaxWalletSize(uint256)", "setMaxWallet(uint256)", "updateMaxTxnAmount(uint256)", "setMaxTx(uint256)"],
  tradingGate: ["enableTrading()", "openTrading()", "setTradingEnabled(bool)", "startTrading()"],
};

const SELECTORS = Object.fromEntries(Object.entries(GROUPS).map(([k, sigs]) => [k, sigs.map((s) => toFunctionSelector(s).slice(2))]));

// EIP-1967 implementation slot
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

export interface ContractFacts {
  hasCode: boolean;
  proxy: boolean;
  implementation: string | null;
  abilities: string[]; // keys of GROUPS present in bytecode
  codeSize: number;
}

export function scanSelectors(code: string): string[] {
  const c = code.toLowerCase();
  return Object.entries(SELECTORS)
    .filter(([, sels]) => sels.some((s) => c.includes("63" + s)))
    .map(([k]) => k);
}

export async function readContractFacts(client: PublicClient, token: Address): Promise<ContractFacts> {
  const code = (await client.getCode({ address: token })) ?? "0x";
  if (code === "0x") return { hasCode: false, proxy: false, implementation: null, abilities: [], codeSize: 0 };
  let implementation: string | null = null;
  let scanCode = code;
  try {
    const slot = await client.getStorageAt({ address: token, slot: IMPL_SLOT });
    if (slot && BigInt(slot) !== 0n) {
      implementation = getAddress("0x" + slot.slice(-40));
      scanCode = (await client.getCode({ address: implementation as Address })) ?? code;
    }
  } catch {
    /* no storage access: treat as non-proxy */
  }
  return { hasCode: true, proxy: implementation !== null, implementation, abilities: scanSelectors(scanCode), codeSize: (code.length - 2) / 2 };
}
