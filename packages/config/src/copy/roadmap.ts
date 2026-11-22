/** The full roadmap, branch by branch. Now = built and working, Next = being built, Later = planned. Order, not dates. */
export interface Track {
  id: string;
  name: string;
  line: string;
  now: string[];
  next: string[];
  later: string[];
}

export const ROADMAP_TRACKS: Track[] = [
  {
    id: "trust",
    name: "Trust",
    line: "Know if you can sell before you buy.",
    now: ["Seven checks with a simulated buy and sell", "Exit check against the pool as it is", "Pool radar with launcher history", "Public API"],
    next: ["Alerts on a token you hold", "API keys with higher limits"],
    later: ["Embeddable check for launchpads and wallets", "Trust history: how a token's checks changed"],
  },
  {
    id: "trade",
    name: "Trade",
    line: "Every route, simulated.",
    now: ["Quotes across V2, v4 and two hops", "Price impact and gas from a real simulation", "Orders contract, tested on the live chain"],
    next: ["Limit, DCA and TWAP on mainnet", "Keeper network that fills due orders"],
    later: ["One router for every pool", "MEV protection", "Rakeback"],
  },
  {
    id: "agents",
    name: "Agents",
    line: "A budget a bot can't break.",
    now: ["Mandate contract with a bond and five rules", "Try to break the mandate, on live pools", "MCP server for any agent"],
    next: ["Mandate factory on mainnet, verified", "Slashed today: who lost a bond and why", "Agent leaderboard"],
    later: ["Back an agent: fund its mandate", "Strategy marketplace", "Prop desk"],
  },
  {
    id: "launch",
    name: "Launch",
    line: "Launches buyers can get out of.",
    now: ["Analytics for every pool on the chain", "Launchpad contract, tested on the live chain"],
    next: ["Launchpad on mainnet", "Refund window if a launch misses its target", "Locked v4 liquidity at graduation"],
    later: ["Gap Fund"],
  },
  {
    id: "shield",
    name: "Shield",
    line: "A wallet that refuses to be drained.",
    now: ["Rules written: approvals, drainers, honeypots, trap pools"],
    next: ["EIP-7702 wallet firewall, tested on the live chain", "Approval guard"],
    later: ["Drainer blocklist fed by the radar", "Shield for agents: a mandate for any wallet"],
  },
  {
    id: "stocks",
    name: "Stocks",
    line: "Stock tokens, weekend-aware.",
    now: ["Stock tokens found and labelled in the index", "Loan calculator"],
    next: ["Weekend gap desk with live chain prices", "Issuer check for stock tokens"],
    later: ["Loans with a weekend haircut", "Weekend gap alerts"],
  },
  {
    id: "account",
    name: "Corbel One",
    line: "One balance that earns.",
    now: ["Vault contract, tested", "Address view and portfolio"],
    next: ["Audit", "Capped deposits"],
    later: ["Passkey sign-in", "Sponsored gas", "Earn module"],
  },
  {
    id: "portfolio",
    name: "Portfolio",
    line: "Everything one address holds.",
    now: ["Holdings from the chain", "Spot value and exit quotes", "Fake ticker flags"],
    next: ["Alerts when a holding fails a check"],
    later: ["Profit and loss", "Tax-ready history"],
  },
];
