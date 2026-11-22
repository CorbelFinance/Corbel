import { BRAND } from "../brand";
/**
 * Landing copy. English only. Numbers are never written here: use {{factKey}} from facts.ts.
 * Rules: docs/COPY_RULES.md.
 */
export const HERO = {
  label: "ST/00",
  tags: ["01. CHECK", "02. SWAP", "03. EARN", "04. AI & GPUS"],
  title: "Check. Swap. Earn. AI & GPUs.",
  sub: "Token checks, best-route swaps, pool yields and bonded agents. Plus AI models and GPUs, priced live.",
  primary: { label: "Open the app", href: "/app/tools" },
  secondary: { label: "See AI and GPUs", href: "/app/ai/studio" },
  scroll: "Scroll to explore",
  artifactCaption: "Example data. Chain price vs reference across a weekend.",
};

/** Shown in the marquee while no fact is verified. Labels of what we build, not claims. */
export const MARQUEE_FALLBACK = [
  "Refund window on launches",
  "Pre-trade token check",
  "Stock tools for the weekend gap",
  "Gap Fund with capped cover",
  "One balance in a lending vault",
  "Agent limits set in the contract",
];

export const MANIFESTO = {
  label: "01 / WHY",
  paragraphs: [
    "A launch can look like a market and work like an exit. You find out after you buy.",
    "Stock tokens trade all weekend. The stock behind them doesn't. That gap is where money disappears.",
    "We build for both. A balance that earns while it waits, and checks that run before you click buy.",
  ],
  cta: { label: "See the layers", href: "#layers" },
};

/** Pinned scroll story: a graph that grows, then converges to one point. */
export const STORY = {
  label: "ST/01 · How it connects",
  stages: [
    { k: "USDG", title: "It starts as a dollar.", line: "USDG arrives in your account. One currency for every layer." },
    { k: "VAULT", title: "It earns while it waits.", line: "The balance sits in a Morpho vault until you need it." },
    { k: "TRUST", title: "Every token gets checked first.", line: "Before a swap, Trust reads the contract and simulates the exit." },
    { k: "LAYERS", title: "Bots, launches and cover draw from it.", line: "Agents, refund-window launches and the Gap Fund use the same balance." },
    { k: "ONE", title: "One balance. Eight layers on top.", line: "Everything routes back to a single account you control." },
  ],
  cta: { label: "See the layers", href: "#layers" },
};

export const LAYERS_SECTION = {
  label: "02 / LAYERS",
  title: "Eight layers. One account.",
  sub: "Each layer opens on its own, after review.",
};

export const ONE_BALANCE = {
  label: `05 / ${BRAND.products.account}`,
  title: "Swap straight from a balance that earns.",
  steps: [
    {
      tag: "IDLE",
      title: "Your dollars sit as vault shares.",
      line: "USDG goes into a Morpho vault. It is lent out while you wait.",
    },
    {
      tag: "SWAP",
      title: "No withdraw step. No second approval.",
      line: "Your vault shares are redeemed and swapped in the same transaction.",
    },
    {
      tag: "SETTLED",
      title: "You hold the token. The rest keeps earning.",
      line: "Whatever you didn't spend never left the vault.",
    },
  ],
};

export type CellState = "no" | "sometimes" | "planned" | "preview" | "live";

export const COMPARISON = {
  label: "03 / DIFFERENCE",
  title: "Where we differ, and what isn't built yet.",
  columns: ["Typical launchpad", "Typical terminal", BRAND.name],
  rows: [
    { name: "Check before you buy", how: "Seven checks and a simulated sell, no sign-in.", launchpad: "sometimes", terminal: "sometimes", corbel: "live", href: "/app/trust/check" },
    { name: "An AI agent on every launch", how: "Serial creators, copied tickers, drained pools, curves near graduation.", launchpad: "no", terminal: "sometimes", corbel: "live", href: "/app/trust/radar" },
    { name: "Every route simulated before you sign", how: "Each pool and path quoted at the latest block.", launchpad: "no", terminal: "sometimes", corbel: "live", href: "/app/trade/quote" },
    { name: "Sell in parts, simulated", how: "One big sell against the same sell in parts.", launchpad: "no", terminal: "no", corbel: "live", href: "/app/trade/split" },
    { name: "Stock tokens against the real market", how: "The weekend gap, the venues, lookalikes flagged.", launchpad: "no", terminal: "sometimes", corbel: "live", href: "/app/stocks/market" },
    { name: "Agent budget a contract enforces", how: "A trade over the cap is refused on chain and the bond pays you.", launchpad: "no", terminal: "no", corbel: "live", href: "/layers/agents" },
    { name: "Markets the chain settles", how: "Stake on whether a pool keeps its liquidity; nobody votes.", launchpad: "no", terminal: "no", corbel: "planned", href: "/app/predict" },
    { name: "AI models in the same app", how: "Chat with the models we run, priced side by side.", launchpad: "no", terminal: "no", corbel: "live", href: "/app/ai/chat" },
    { name: "Earns while idle", how: "One USDG balance in a lending vault until you swap.", launchpad: "no", terminal: "no", corbel: "preview", href: "/layers/account" },
    { name: "Cover for losses", how: "A fund with fixed rules and a cap.", launchpad: "no", terminal: "no", corbel: "planned", href: "/roadmap" },
  ],
  caption: `Typical setups as we read them in Nov 2026. Not a review of any product. ${BRAND.name} cells show our status, not a promise.`,
} as const;

export const JOURNEY = {
  label: "06 / THE JOURNEY",
  title: "Five steps, one balance.",
  steps: [
    { name: "Deposit", line: "Add USDG once. It becomes vault shares." },
    { name: "Earn", line: "The vault lends it out while you wait." },
    { name: "Check", line: "Run the token through Trust before you buy." },
    { name: "Trade", line: "Swap from the balance in one transaction." },
    { name: "Rest", line: "What you didn't spend goes back to earning." },
  ],
};

export const SAFETY = {
  label: "07 / SAFETY",
  title: "Checked before you buy. Checked before you sign.",
  how: [
    { k: "BEFORE YOU BUY", line: "Seven checks read from the chain: exit, tax, owner, holders, liquidity, creator and ticker." },
    { k: "BEFORE AN AGENT SIGNS", line: "Guard checks each transaction against the rule you set and refuses the rest." },
    { k: "IN WORDS AND IN FACT", line: "A project's claims are quoted from its own pages and set against the chain." },
  ],
  checks: [
    { k: "Exit", v: "A buy and a sell are simulated, and the loss is measured." },
    { k: "Tax", v: "What each buy and each sell keeps, read from the contract." },
    { k: "Owner", v: "Who can mint, pause, blacklist or change the fees." },
    { k: "Holders", v: "The top wallets outside pools, insiders and the creator." },
    { k: "Liquidity", v: "Across every venue, and whether the pool tokens are burned." },
    { k: "Creator", v: "Past launches from the same wallet, and how many were drained." },
    { k: "Ticker", v: "Lookalikes that copy a known name with another contract." },
  ],
  keys: [
    { k: "Sign-in", v: "A message, never a transaction" },
    { k: "Keys and seed phrase", v: "Never asked for" },
    { k: "Every transaction", v: "Shown in full before you sign" },
  ],
  notTitle: "What a check cannot do",
  not: [
    "Tell you where a price goes next.",
    "Undo a transaction you already signed.",
    "Stop a team that changes its code after you buy.",
    "Turn a pass into a promise: it is a reason to look, not a guarantee.",
  ],
  honest: "A check reads the chain at one moment. Read it again before every trade.",
};

export const OPEN_DATA = {
  label: "04 / OPEN DATA",
  title: "Data anyone can check.",
  rows: [
    { year: "2026", name: "Human vs bot volume", kind: "Dashboard", q: "How much DEX volume comes from bots?", status: "live", href: "/app/trust/launches" },
    { year: "2026", name: "Cohort retention", kind: "Dashboard", q: "Do buyers still hold after the first week?", status: "soon", href: "/app/trade/terminal" },
    { year: "2026", name: "Launch outcomes", kind: "Dashboard", q: "How many launches reach a pool, stall or get drained?", status: "live", href: "/app/trust/radar" },
    { year: "2026", name: "Weekend gap", kind: "Dashboard", q: "How far do stock tokens drift from the last close?", status: "soon", href: "/app/stocks/desk" },
  ],
} as const;

export const TOKEN = {
  label: "08 / TOKEN",
  title: ["$CORBEL is live.", "Fixed supply, one billion.", "Hold it to open more of Corbel."],
  aside: "Holding opens AI today. The other jobs below are the design intent, not a promise. Nothing here is an offer.",
  contract: "0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1",
  explorer: "https://robinhoodchain.blockscout.com/token/0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1",
  buy: "https://ponsfamily.com/launchpad/0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1",
  items: [
    {
      name: "AI for holders",
      kicker: "AI & GPUs",
      line: "Holding $CORBEL opens the AI chat. Light opens selected models; Full opens every model at full quality.",
      rows: [
        ["Measured by", "Lowest balance, last 7 days"],
        ["Tiers", "Two, by coins held"],
        ["One person", "One limit"],
        ["Status", "Live"],
      ],
    },
    {
      name: "First-loss stake",
      kicker: "Gap Fund",
      line: "Stakers take the first losses of the Gap Fund, before anyone else.",
      rows: [
        ["Role", "Backstop for cover"],
        ["Risk", "Stake can be cut to zero"],
        ["Status", "Design intent"],
      ],
    },
    {
      name: "Fee tier",
      kicker: "Trade",
      line: "Locking lowers your fees and raises your rakeback.",
      rows: [
        ["Role", "Fee and rakeback tier"],
        ["Lock length", "Not set"],
        ["Status", "Design intent"],
      ],
    },
    {
      name: "Bond",
      kicker: "Launch · Agents",
      line: "Launch creators and strategy authors post a bond that can be slashed.",
      rows: [
        ["Role", "Skin in the game"],
        ["Slashed when", "Window or limit rules break"],
        ["Status", "Design intent"],
      ],
    },
    {
      name: "Curator stake",
      kicker: "Trust",
      line: "People who label tokens stake behind each label. A label proven wrong is slashed; labels that hold share Trust API fees.",
      rows: [
        ["Role", "Skin in the data"],
        ["Slashed when", "A label is proven wrong"],
        ["Status", "Design intent"],
      ],
    },
    {
      name: "Access by time at risk",
      kicker: "Launch · Raise",
      line: "Launch access goes by how long you have backed the Gap Fund, not by your balance.",
      rows: [
        ["Role", "Rewards risk taken, not wealth"],
        ["Measured by", "Time staked as first loss"],
        ["Status", "Design intent"],
      ],
    },
    {
      name: "What we won't do",
      kicker: "Commitment",
      line: "No buyback-and-burn as a reason to hold. Demand has to come from use.",
      rows: [
        ["Buyback pitch", "No"],
        ["Burn pitch", "No"],
        ["Status", "Commitment"],
      ],
    },
    {
      name: "How activity is counted",
      kicker: "Subject to legal review",
      line: "Time in the vault, net fees, Trust API use, referrals active after {{referralHoldDays}}, refund-window launches.",
      rows: [
        ["Amounts", "None published"],
        ["Dates", "None published"],
        ["Status", "Legal review first"],
      ],
    },
  ],
};

export const ROADMAP = {
  label: "09 / ROADMAP",
  title: "Order, not dates.",
  sub: "Each phase ships after the previous one is audited and in use.",
  phases: [
    { n: "P0", name: "Read the chain", state: "done", items: ["Trust Check, seven checks", "Pool radar", "Every-route quotes", "Portfolio", "Launch analytics", "Mandate lab", "MCP for agents"] },
    { n: "P1", name: "Mandates on chain", state: "next", items: ["Mandate factory, verified", "Slashed today feed", "Agent leaderboard", "Public audit"] },
    { n: "P2", name: "Trade and launch", state: "later", items: ["Limit, DCA and TWAP", "Launchpad with refund window", "Locked v4 liquidity", "Gap Fund"] },
    { n: "P3", name: "Account", state: "later", items: ["Corbel One balance", "Passkey sign-in", "Sponsored gas", "Rakeback"] },
    { n: "P4", name: "Shield", state: "later", items: ["Wallet firewall (EIP-7702)", "Approval guard", "Drainer blocklist from the radar", "Shield for agents"] },
    { n: "P5", name: "Stocks and markets", state: "later", items: ["Weekend gap desk", "Loans with a weekend haircut", "Strategy marketplace", "Prop desk"] },
  ],
};

export const CLOSING = {
  title: "Check first. Swap in one step. Let the rest earn.",
  cta: { label: "Check a token", href: "/app/trust/check" },
};

export const FOOTER = {
  columns: [
    {
      title: "Product",
      links: [
        { label: "Account", href: "/layers/account" },
        { label: "Trust", href: "/layers/trust" },
        { label: "Stocks", href: "/layers/stocks" },
        { label: "Trade", href: "/layers/trade" },
        { label: "Agents", href: "/layers/agents" },
      ],
    },
    {
      title: "Learn",
      links: [
        { label: "Safety", href: "/#safety" },
        { label: "Open data", href: "/#data" },
        { label: "Token", href: "/#token" },
        { label: "FAQ", href: "/#faq" },
        { label: "Roadmap", href: "/roadmap" },
        { label: "Changelog", href: "/changelog" },
        { label: "Accuracy", href: "/accuracy" },
        { label: "Thesis", href: "/thesis" },
        { label: "Analytics", href: "/analytics" },
        { label: "Security", href: "/security" },
        { label: "Status", href: "/status" },
      ],
    },
    {
      title: "Community",
      links: [
        { label: "X", href: "https://x.com/corbelfinance" },
        { label: "Telegram", href: "https://t.me/corbelfinance" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Terms", href: "/legal/terms" },
        { label: "Privacy", href: "/legal/privacy" },
        { label: "Risk disclosure", href: "/legal/risk" },
        { label: "Cookies", href: "/legal/cookies" },
      ],
    },
  ],
  risk: "Tokens can fall to zero. Stock tokens are debt instruments of Robinhood Assets (Jersey), not shares. Nothing here is financial advice.",
  disclaimer:
    `${BRAND.name} is built by ${BRAND.company}, an independent team. Not affiliated with Robinhood, Morpho or Uniswap. Not registered with any financial regulator.`,
  signature: "Check a token",
};

export const NAV = [
  { label: "Safety", href: "/#safety" },
  { label: "Token", href: "/#token" },
  { label: "FAQ", href: "/#faq" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Changelog", href: "/changelog" },
  { label: "Analytics", href: "/analytics" },
  { label: "Docs", href: "/docs" },
  { label: "Security", href: "/security" },
];
