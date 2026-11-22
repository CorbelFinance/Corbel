/**
 * The demo mandate's parameters and the attack scenarios' labels. These numbers are not market claims: they
 * are the rules the demo contract enforces, mirrored from packages/contracts/src/lab/MandateLab.sol and
 * checked by the fork tests (test/fork/Mandate.t.sol). Change them there and here together.
 */
export const MANDATE_DEMO = {
  bond: "500 USDG",
  bondUnits: 500,
  slash: "10%",
  freezeAfter: 3,
  rules: [
    { id: "Assets", n: "01", what: "USDG, WETH, ETH and NVDA only" },
    { id: "Size", n: "02", what: "1,000 USDG or 0.5 WETH per trade" },
    { id: "Budget", n: "03", what: "2,000 USDG or 1 WETH per day" },
    { id: "Price", n: "04", what: "1% from the pool; pool fee 1% max; no unknown hooks" },
    { id: "Window", n: "05", what: "Weekdays only (UTC)" },
    { id: "Pool", n: "06", what: "Only the WETH/USDG pool the owner approved" },
  ],
  /** The pool-price tolerance in the demo's rule 04. */
  slippage: "1%",
  bondLine: "Bond 500 USDG. Each violation takes 10% to the owner. The third freezes the agent and takes the rest.",
  scenarios: {
    "nvda-9000": { title: "Buy NVDA for $9,000", attempt: "USDG 9,000 → NVDA" },
    "trap-pool": { title: "Buy $100 of NVDA through a 99% fee pool", attempt: "USDG 100 → NVDA, pool fee 99.25%" },
    "loose-price": { title: "Accept 5% slippage", attempt: "WETH 0.1 → USDG, minOut 5% under the pool" },
    unlisted: { title: "Buy a token the owner never listed", attempt: "WETH 0.1 → PEPE" },
    weekend: { title: "Trade on Saturday", attempt: "WETH 0.1 → USDG on a Saturday" },
    budget: { title: "Blow the daily budget", attempt: "USDG 900 → WETH, three times" },
    "three-strikes": { title: "Break it three times", attempt: "USDG 9,000 → NVDA, three times" },
    honest: { title: "An honest trade", attempt: "WETH 0.2 → USDG within 0.5% of the pool" },
  } as Record<string, { title: string; attempt: string }>,
  /** The twelve rules, as published on /docs. */
  docRules: [
    "Only listed assets, on both sides of the trade.",
    "No trade larger than the per-trade cap.",
    "No more than the daily budget per token.",
    "On V2, the minimum output is the pool's quote minus the allowed slippage.",
    "On v4, the contract sets the price limit itself. The agent can't loosen it.",
    "No pool with a fee above 1%, a dynamic fee, or a hook the owner didn't approve.",
    "Trades only inside the trading hours, and on weekdays if the owner says so.",
    "A cooldown between trades, if the owner sets one.",
    "Only pools the owner approved, and only while the pool's price stays near the owner's mark.",
    "No bond, no trade. Each violation takes 10% of the bond to the owner.",
    "The third violation freezes the agent and sends the rest of the bond to the owner.",
    "Output stays in the vault. Only the owner withdraws, and never the agent's bond.",
  ],
} as const;
