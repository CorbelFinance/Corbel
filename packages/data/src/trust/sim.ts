/**
 * Buy-and-sell simulation through eth_call with state overrides. The simulator contract
 * (contracts/TrustSim.sol) is injected at a throwaway address with an ETH balance, and, when the pool's
 * base is an ERC-20 (WETH, USDG), with a base-token balance written straight into that token's storage.
 * Nothing is sent; nothing leaves the call.
 */
import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, hexToString, keccak256, parseEther, type Address, type Hex, type PublicClient } from "viem";
import { TRUST_SIM_ABI, TRUST_SIM_RUNTIME } from "../trustSimBytecode.ts";
import { redact } from "../redact.ts";
import { KNOWN_BALANCE_SLOTS, RH, SIM_ADDRESS, SIM_FROM } from "./addresses.ts";

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export type SimStage = "ok" | "funding" | "buy-reverted" | "transfer-reverted" | "sell-reverted" | "call-failed" | "unsupported";
const STAGES: SimStage[] = ["ok", "funding", "buy-reverted", "transfer-reverted", "sell-reverted"];

export interface SimResult {
  venue: "v2" | "v4";
  base: "ETH" | "WETH" | "USDG";
  stage: SimStage;
  /** 0..1, share of the bought tokens that did not arrive (token-level tax, pool fee excluded) */
  buyTax: number | null;
  sellTax: number | null;
  /** 0..1, base lost on a buy + immediate sell, including pool fees and price impact */
  roundTripLoss: number | null;
  amountIn: string;
  amountBack: string | null;
  /** tokens that reached the simulator on the buy (raw units) */
  bought: string | null;
  gasBuy: number | null;
  gasSell: number | null;
  reason: string | null;
}

const ZERO = "0x0000000000000000000000000000000000000000";
const BAL_OF = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const DEC = [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }] as const;
const FUND = 10n ** 30n; // plenty of any base token, written into storage for the simulation only
const FUND_HEX = `0x${FUND.toString(16).padStart(64, "0")}` as Hex;

const ratioLoss = (expected: bigint, got: bigint) => (expected > 0n ? Math.max(0, 1 - Number((got * 1_000_000n) / expected) / 1_000_000) : null);

function decodeReason(hex: string): string | null {
  if (!hex || hex === "0x") return null;
  if (hex.startsWith("0x08c379a0") && hex.length > 138) {
    const len = Number(BigInt("0x" + hex.slice(74, 138)));
    try {
      return hexToString(`0x${hex.slice(138, 138 + len * 2)}`);
    } catch {
      return hex.slice(0, 10);
    }
  }
  try {
    const s = hexToString(hex as Hex);
    if (/^[\x20-\x7e]+$/.test(s)) return s;
  } catch {
    /* fall through */
  }
  return `custom error ${hex.slice(0, 10)}`;
}

/**
 * Find the storage slot that holds `holder`'s balance in `token` (works through proxies and namespaced
 * storage): ask the node which keys balanceOf touches, then confirm by overriding each one.
 */
const slotCache = new Map<string, { address: Address; slot: Hex } | null>();
export async function balanceSlot(client: PublicClient, token: Address, holder: Address = SIM_ADDRESS): Promise<{ address: Address; slot: Hex } | null> {
  const k = `${token}:${holder}`.toLowerCase();
  if (slotCache.has(k)) return slotCache.get(k)!;
  const data = encodeFunctionData({ abi: BAL_OF, functionName: "balanceOf", args: [holder] });
  const works = async (address: Address, slot: Hex) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await client.call({ to: token, data, stateOverride: [{ address, stateDiff: [{ slot, value: FUND_HEX }] }] });
        // > 0, not === FUND: some tokens (USDG) store balances scaled or packed; the probe address holds 0 on chain
        return !!r.data && BigInt(r.data) > 0n;
      } catch {
        await new Promise((res) => setTimeout(res, 250)); // public RPCs rate-limit bursts: retry once
      }
    }
    return false;
  };
  let found: { address: Address; slot: Hex } | null = null;
  // 0) pinned slots for base tokens (checked once, so a token upgrade can't leave a stale one in use)
  const pinned = holder.toLowerCase() === SIM_ADDRESS ? KNOWN_BALANCE_SLOTS[token.toLowerCase()] : undefined;
  if (pinned && (await works(token, pinned))) {
    found = { address: token, slot: pinned };
    slotCache.set(k, found);
    return found;
  }
  // 1) ask the node which keys balanceOf touches (not every RPC offers this)
  try {
    const list = (await client.request({ method: "eth_createAccessList", params: [{ to: token, data }, "latest"] } as never)) as { accessList: { address: Address; storageKeys: Hex[] }[] };
    outer: for (const entry of list.accessList)
      for (const slot of entry.storageKeys)
        if (await works(entry.address, slot)) {
          found = { address: entry.address, slot };
          break outer;
        }
  } catch {
    /* method not available: fall back to known layouts */
  }
  // 2) known layouts: Solidity and Vyper mappings at slots 0..30, OpenZeppelin ERC-7201 namespace
  if (!found) {
    const cands: Hex[] = [];
    for (let n = 0n; n <= 60n; n++) {
      cands.push(keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [holder, n])));
      cands.push(keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "address" }], [n, holder])));
    }
    const OZ_ERC20 = 0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00n; // erc7201:openzeppelin.storage.ERC20
    cands.push(keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [holder, OZ_ERC20])));
    // most tokens keep balances in slots 0..9 or the OZ namespace: try those first, in small parallel
    // batches (each probe retries on its own, so a rate-limited call cannot hide the right slot)
    const order = [...cands.slice(0, 20), cands[cands.length - 1]!, ...cands.slice(20, -1)];
    for (let i = 0; i < order.length && !found; i += 8) {
      const chunk = order.slice(i, i + 8);
      const ok = await Promise.all(chunk.map((slot) => works(token, slot)));
      const j = ok.indexOf(true);
      if (j >= 0) found = { address: token, slot: chunk[j]! };
    }
  }
  if (found) slotCache.set(k, found); // a miss is not cached: it may have been a busy RPC
  return found;
}

async function amountFor(client: PublicClient, base: Address): Promise<{ amount: bigint; label: SimResult["base"] }> {
  if (base.toLowerCase() === ZERO) return { amount: parseEther("0.002"), label: "ETH" };
  if (base.toLowerCase() === RH.WETH) return { amount: parseEther("0.01"), label: "WETH" };
  const d = Number(await client.readContract({ address: base, abi: DEC, functionName: "decimals" }).catch(() => 6));
  return { amount: 10n * 10n ** BigInt(d), label: "USDG" }; // 10 dollars
}

async function run(
  client: PublicClient,
  fn: "simV2" | "simV4",
  args: readonly unknown[],
  venue: "v2" | "v4",
  base: Address,
  amount: bigint,
  label: SimResult["base"],
  wrap: boolean,
): Promise<SimResult> {
  const out: SimResult = { venue, base: label, stage: "call-failed", buyTax: null, sellTax: null, roundTripLoss: null, amountIn: amount.toString(), amountBack: null, bought: null, gasBuy: null, gasSell: null, reason: null };
  const overrides: { address: Address; code?: Hex; balance?: bigint; stateDiff?: { slot: Hex; value: Hex }[] }[] = [{ address: SIM_ADDRESS, code: TRUST_SIM_RUNTIME, balance: parseEther("10") }];
  if (base.toLowerCase() !== ZERO && !wrap) {
    const s = await balanceSlot(client, base);
    if (!s) return { ...out, stage: "unsupported", reason: "Could not fund the base token for a simulation." };
    overrides.push({ address: s.address, stateDiff: [{ slot: s.slot, value: FUND_HEX }] });
  }
  try {
    const data = encodeFunctionData({ abi: TRUST_SIM_ABI, functionName: fn, args } as never);
    const res = await client.call({ account: SIM_FROM, to: SIM_ADDRESS, data, gas: 30_000_000n, stateOverride: overrides });
    const [v, stageN, reason] = decodeFunctionResult({ abi: TRUST_SIM_ABI, functionName: fn, data: res.data! } as never) as unknown as [readonly bigint[], number, Hex];
    const stage = STAGES[stageN] ?? "call-failed";
    const [buyExp, got, sent, arrived, , back, gb, gs] = v as unknown as bigint[];
    return {
      ...out,
      stage,
      buyTax: buyExp! > 0n && got! > 0n ? ratioLoss(buyExp!, got!) : null,
      sellTax: stage === "ok" ? ratioLoss(sent!, arrived!) : null,
      roundTripLoss: stage === "ok" ? ratioLoss(amount, back!) : null,
      amountBack: stage === "ok" ? back!.toString() : null,
      bought: got! > 0n ? got!.toString() : null,
      gasBuy: gb ? Number(gb) : null,
      gasSell: gs ? Number(gs) : null,
      reason: decodeReason(reason),
    };
  } catch (e) {
    return { ...out, reason: redact((e as { shortMessage?: string }).shortMessage ?? "simulation call failed") };
  }
}

/** V2 pair against WETH (wrapped from ETH) or USDG (funded through storage). */
export async function simulateV2(client: PublicClient, pair: Address, token: Address, base: Address = RH.WETH, reserve?: bigint): Promise<SimResult> {
  const std = await amountFor(client, base);
  const label = std.label;
  // at most 1% of the pool's base side: a trade that empties a dust pool sells back for almost nothing lost
  const amount = reserve && reserve > 0n && reserve / 100n < std.amount ? (reserve / 100n > 0n ? reserve / 100n : 1n) : std.amount;
  const wrap = base.toLowerCase() === RH.WETH;
  return run(client, "simV2", [base, wrap, pair, token, amount], "v2", base, amount, label, wrap);
}

/** v4 pool on either side, base = the other currency (native ETH, WETH or USDG). */
export async function simulateV4(client: PublicClient, key: PoolKey, token: Address): Promise<SimResult> {
  const tokenIs1 = key.currency1.toLowerCase() === token.toLowerCase();
  const base = tokenIs1 ? key.currency0 : key.currency1;
  const { amount, label } = await amountFor(client, base);
  return run(client, "simV4", [RH.V4_POOL_MANAGER, key, tokenIs1, amount], "v4", base, amount, label, false);
}
