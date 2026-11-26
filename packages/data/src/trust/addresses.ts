/**
 * Robinhood Chain (4663) contract map. Every address here was read from the chain on 2026-11-12,
 * not copied from docs: symbol()/name() for tokens, factory()/WETH() for the router, event emitters
 * for the factories and the v4 PoolManager.
 */
export const RH = {
  WETH: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
  USDG: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
  V2_FACTORY: "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f", // 148k pairs, emits PairCreated
  V2_ROUTER: "0x89e5db8b5aa49aa85ac63f691524311aeb649eba", // factory() and WETH() match the above
  V4_POOL_MANAGER: "0x8366a39cc670b4001a1121b8f6a443a643e40951", // emits Initialize/Swap
  /** more pair factories of the same V2 kind (found on chain 2026-11-25: 1,157 pairs in a day and a half) */
  V2_FACTORIES_MORE: ["0x0d1ebb179cdbca88d74c923c4255cb2b17474afd"] as string[],
  /** the V3 factory a launchpad graduates into (emits PoolCreated) */
  V3_FACTORY: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
  NATIVE: "0x0000000000000000000000000000000000000000",
} as const;

export const TOPICS = {
  V2_PAIR_CREATED: "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
  V4_INITIALIZE: "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438",
  V3_POOL_CREATED: "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
  /** ModifyLiquidity(bytes32 indexed id, address indexed sender, int24, int24, int256 liquidityDelta, bytes32 salt) */
  V4_MODIFY_LIQUIDITY: "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec",
} as const;

/** The public RPC refuses log queries wider than 30 000 blocks. */
export const LOG_WINDOW = 25_000;

/** Throwaway addresses used only inside eth_call state overrides. Never funded on chain. */
export const SIM_ADDRESS = "0x00000000000000000000000000000000c0be1000";
export const SIM_FROM = "0x00000000000000000000000000000000c0be1001";

/** Holders that count as burned LP. */
export const BURN_ADDRESSES = ["0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000"] as const;

/** Base-token decimals (read from the chain 2026-11-12) and the reserve below which a pool counts as thin. */
export const BASE_DECIMALS = { WETH: 18, USDG: 6 } as const;
export const THIN_RESERVE = { WETH: 5n * 10n ** 16n, USDG: 100n * 10n ** 6n } as const; // 0.05 WETH, 100 USDG

/**
 * Tokens whose issuer keeps admin keys by design (regulated stablecoins). Owner rights read as
 * "issuer-controlled" (caution) instead of a fail. Only addresses verified on chain go here.
 */
export const ISSUER_CONTROLLED: Record<string, string> = {
  [RH.USDG]: "stablecoin USDG",
  [RH.WETH]: "chain's wrapped ETH",
};

/**
 * Balance storage slots for the simulator's own address (SIM_ADDRESS), found by probing on 2026-11-13.
 * Pinned so base tokens never pay for slot discovery. A stale entry only costs one fallback probe.
 */
export const KNOWN_BALANCE_SLOTS: Record<string, `0x${string}`> = {
  [RH.WETH]: "0xf4b17306b302384adb03e83f223a8d2eaa89d6b68ae485cf770f0d9b479d4279",
  [RH.USDG]: "0x6fda4b8757dc8f567a3a0c994e535d7da52c9f15e56caa2bd71087ccfa8ad9fa",
};


/**
 * Contracts that hold launch liquidity for good: a launchpad's locker. A v4 position held here counts as locked,
 * like burned LP. From each launchpad's published contracts (see config/launchpads.ts).
 */
export const KNOWN_LOCKERS: Record<string, string> = {
  "0x267444d099b10fb5ed7c3cc7b7c767adca574952": "the Pons launch locker",
  "0x736d76699c26d0d966744cae304c000d471f7f35": "the Pons V1 locker",
  "0x31ca5e101941a93a7dd6d0497928700625cf54b5": "the Pons legacy locker",
};
