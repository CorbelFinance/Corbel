/**
 * Example figures for product mock-ups on the landing. Labelled "Example" wherever shown.
 * Not prices, not yields, not user data.
 */
export const ACCOUNT_EXAMPLE = {
  balanceBefore: "1,250.00",
  spend: "200.00",
  balanceAfter: "1,050.00",
  shares: "1,250.00",
  sharesAfter: "1,050.00",
  token: "TOKEN-A",
  received: "4,812.3",
  minOut: "4,788.2",
  slippage: "0.5%",
};

export const LAUNCH_EXAMPLE = {
  name: "Sample Token",
  ticker: "SMPL",
  window: "72 h",
  curve: "38%",
};

/** The "x-ray" on the landing: a launch that charts like a market and is built like an exit. Example only. */
export const XRAY_EXAMPLE = {
  ticker: "MOON",
  findings: [
    { at: 0.18, code: "mint()", line: "Owner can print more" },
    { at: 0.4, code: "LP", line: "Liquidity not locked" },
    { at: 0.62, code: "tax", line: "Sell tax 99%" },
    { at: 0.82, code: "transfer", line: "Blocked after you buy" },
  ],
  buy: "0.1 ETH → 1.2M MOON",
  sell: "1.2M MOON → reverted",
  exitBack: "0.4%",
};
