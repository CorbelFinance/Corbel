/** CorbelPredict on Robinhood Chain (deployed 2026-11-15, block 115055097). Shared by the API and the app. */
/** CorbelPredict v2 (2026-11-20, block 119405539): no resolver; survival and price markets both settle from the chain. */
export const PREDICT = "0x62230624777b012a316e365c7ab3677159cd73d9" as const;
/** The first CorbelPredict (resolver for price markets), retired: its one market was the team's own 0.1 USDG test. */
export const PREDICT_V1 = "0x2AC31E9188ba7CFE4C42D4372BacA24dBEA80f63" as const;
export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as const;

/** The project Safe (multisig) that owns Corbel's contracts. */
export const SAFE = "0xcAEC58545DbCEF852ac834577Cd029CD3301741b" as const;
/** The mandate factory and the first live mandate (an agent with a 1 USDG bond), deployed 2026-11-17. */
export const MANDATES = { factory: "0x5d4e2ac56fa803e2f9a6403853f6f69acc24de04", mandate: "0x72Bf6Cc2Ea70EAA6Fa887c96C9374516Ba048ef3", block: 116441669,
  honest: "0x4123e918c4bf8c69e8269c0ede8f283ab9c302f1ca78b359d6c6ca7c41ccd5d3", stopped: "0x43b9712c227200e39313221ea5e4a3feae0f21fc3ea25f9efbeac8c645ff703e" } as const;
/** The mandate factory v4 (2026-11-20, block 119405093): rule 06 POOL and revoking a bonded agent. Its proof mandate: a trade
 *  through a pool the owner never approved was refused and slashed, the same trade after approval went through, and the
 *  owner replaced the bonded agent, whose bond went back to it. */
export const MANDATES_POOL = { factory: "0xdea049d3e6df029afe5542d95428ea057f2d4d36", mandate: "0xc5a6CAe3eCDd2d09A6d308543F27a3325acDa94E", block: 119405093,
  refused: "0xffbc4d37dc2f4d9a97fc8d93532b227f7307994b1cff597d758e3dd6f63a66b2", traded: "0xa3d349505cb872a9ac63c9c49c4919a5927a0b1c33c6578f25f31fa4fd49a411",
  revoked: "0xb624936c903bcffe89b0263ffbd981718e6455083575d33f3045dd1b3f7ef4ea" } as const;
/** The mandate factory v5 (2026-11-23, block 121560370): a lifetime cap per token and an end date at most 90 days
 *  ahead, and a refused trade no longer counts toward either budget. Its proof mandate: 0.02 USDG traded inside a 0.03
 *  lifetime cap, then 0.02 more refused as over the cap and slashed. */
export const MANDATES_V5 = { factory: "0x9e72135ed1e82830eb2705c263033648738637df", mandate: "0x17569593Fcff8e1924F627d11114ff0481808fB7", block: 121560370,
  traded: "0xa57a2d4d41cae24266570076b2a324a9fa2a2ee84024ad02fd83b36f139d28d5", refused: "0x34e938dc9d9f34e0c629256cd8eea3594bd31e4251d375a17158a32ee6f6b9e7" } as const;
export const PREDICT_DEPLOY = { tx: "0x12d4ea31e3abf8a4eeb3727697b94556db913f9424311359e16e49a896b79c39", block: 119405539 } as const;
