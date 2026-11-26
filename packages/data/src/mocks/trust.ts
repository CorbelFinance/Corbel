import { TrustReport } from "../schemas";

/** Example response. Not a real token, not a real result. */
export const EXAMPLE_TRUST_REPORT = TrustReport.parse({
  token: "0xEXAMPLE",
  example: true,
  checks: [
    { id: "honeypot", name: "Honeypot", result: "pass", reason: "Simulated sell returned USDG." },
    { id: "exit", name: "Exit now", result: "pass", reason: "Selling a $1,000 position in the simulation moved the price 2.1%.", metric: "−2.1%" },
    { id: "tax", name: "Buy / sell tax", result: "fail", reason: "Sell tax is higher than buy tax." },
    { id: "owner", name: "Owner rights", result: "fail", reason: "Owner can still change fees." },
    { id: "liquidity", name: "Liquidity lock", result: "pass", reason: "Pool tokens are held by a lock contract." },
    { id: "ticker", name: "Ticker vs contract", result: "unknown", reason: "Two contracts use this ticker." },
    { id: "creator", name: "Creator history", result: "unknown", reason: "Creator wallet has no earlier launches." },
  ],
});

export const EXAMPLE_API_REQUEST = `GET /v1/check?token=0xEXAMPLE&chain=robinhood`;
