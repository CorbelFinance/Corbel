import { HELD } from "../flags";
import { BRAND } from "../brand";
import type { FactKey } from "../facts";
import type { LayerId } from "../flags";

export interface Tab {
  id: string;
  label: string;
  /** Short paragraphs. {{factKey}} is replaced by a fact. */
  body: string[];
  /** Special widget the tab renders below the body. */
  widget?:
    | "terminal"
    | "exit-split"
    | "whale-radar"
    | "agent-guard"
    | "agent-hub"
    | "stock-market"
    | "earn-pools"
    | "trust-check"
    | "trust-radar"
    | "trust-api"
    | "trade-quote"
    | "launch-analytics"
    | "mandate-lab"
    | "stock-desk"
    | "loan-calc"
    | "decision-log"
    | "agent-versus"
    | "fair-launch"
    | "address-check"
    | "steps"
    | "empty-balance"
    | "risk-matrix"
    | "contracts"
    | "order-types"
    | "filler-desk"
    | "prop-desk"
    | "shield-rules"
    | "strategies"
    | "launch-dashboard"
    | "agent-limits"
    | "alerts"
    | "creator-dossier"
    | "sell-many"
    | "practice"
    | "agent-learn"
    | "strategy-league";
  empty?: string;
  /** Set on tabs that form the layer's main path, in order; a few words on what the step answers. */
  step?: string;
}

export interface Layer {
  id: LayerId;
  num: string;
  name: string;
  /** Product name shown with the layer, when it has one (e.g. Corbel One). */
  brand?: string;
  /** One line on the landing card. */
  line: string;
  /** Layer page H1: a result, not a feature. */
  title: string;
  sub: string;
  cta: { label: string; href: string };
  steps: [string, string][];
  terms: { label: string; fact: FactKey }[];
  doesnt: string[];
  faq: { q: string; a: string }[];
  risks: string[];
  tabs: Tab[];
}

const riskTab = (): Tab => ({
  id: "risk",
  label: "Risk",
  body: ["What can fail, and what each failure means for you."],
  widget: "risk-matrix",
});

const ACCOUNT_RISKS = [
  `Smart contract risk. ${BRAND.name} contracts are not audited.`,
  "Vault risk. The Morpho vault can lose value if a borrower's collateral fails to cover its loan.",
  "One sequencer runs the chain. If it stops, transactions stop with it.",
  "Leaving through the canonical bridge takes days, not minutes.",
];

const TRUST_RISKS = [
  "A clean check is not a guarantee. It reads the chain; it can't read intent.",
  "An owner can change a contract after you check it, if the contract allows it.",
  "Simulation runs against the current block. The next block can differ.",
];

const STOCKS_RISKS = [
  "Stock tokens are debt instruments of Robinhood Assets (Jersey), not shares.",
  "On weekends the token can drift far from the last close. No mint or burn pulls it back.",
  "A loan against a stock token can be liquidated over a weekend move.",
];

const TRADE_RISKS = [
  "Prices can move between quote and execution. Your slippage limit is the only hard stop.",
  "MEV protection reduces sandwich risk. It does not remove it.",
  "Each part is its own swap and can fill worse than its quote.",
];

const AGENTS_RISKS = [
  "A strategy can lose all the capital it was given.",
  "Limits cap the size of losses. They don't prevent them.",
  "A public decision log shows what an agent did, not whether it was right.",
];

export const LAYERS: Layer[] = [
  {
    id: "account",
    num: "001",
    name: "Earn",
    brand: BRAND.products.account,
    line: "What every pool paid over 30 days, after the price move. One earning balance next.",
    title: "One balance that earns while it waits.",
    sub: "A smart account with a passkey and paid gas. Your USDG sits in a Morpho vault.",
    cta: { label: "Read how it works", href: "#how" },
    steps: [
      ["Create", "Sign up with a passkey. No seed phrase to write down."],
      ["Deposit", "Add USDG. It is placed in a Morpho vault as shares."],
      ["Earn", "The vault lends to borrowers. Interest accrues to your shares."],
      ["Spend", "Swap from the balance. Shares are redeemed in the same transaction."],
      ["Leave", "Withdraw to any address on Robinhood Chain."],
    ],
    terms: [{ label: "Canonical exit to Ethereum", fact: "canonicalWithdraw" }],
    doesnt: [
      "It doesn't promise a rate. Vault yield is history, not a promise.",
      "It doesn't hold your keys. The passkey stays on your device.",
    ],
    faq: [
      { q: "Where is my money?", a: "In a Morpho vault, as shares owned by your smart account." },
      { q: "Who pays gas?", a: "We plan to sponsor it. The limits are not set yet." },
    ],
    risks: ACCOUNT_RISKS,
    tabs: [
      {
        id: "pools",
        step: "Where fees are paid",
        label: "Pools",
        body: ["What liquidity providers earned in the deepest pools over the last day, read from the chain. Pick one to see your share."],
        widget: "earn-pools",
      },
      {
        id: "overview",
        label: "Overview",
        body: [
          "One USDG balance, held as vault shares, that you can swap from directly.",
          "Sign in with a passkey. Gas is designed to be sponsored.",
        ],
        widget: "steps",
      },
      {
        id: "dashboard",
        step: "Track your money",
        label: "Dashboard",
        body: ["Read any address on Robinhood Chain. Nothing is signed or sent."],
        widget: "empty-balance",
      },
      riskTab(),
      {
        id: "transparency",
        label: "Transparency",
        body: ["Every contract behind this layer, what it guarantees, and the tests that prove it."],
        widget: "contracts",
      },
    ],
  },
  {
    id: "trust",
    num: "002",
    name: "Check",
    line: "Simulate a buy and a sell before you hold anything.",
    title: "Know if you can sell before you buy.",
    sub: "Paste a token. We simulate a buy and a sell and read what its owner can do.",
    cta: { label: "Check a token", href: "/app/trust/check" },
    steps: [
      ["Paste", "Enter a contract address or a ticker."],
      ["Simulate", "A buy and a sell run against the current block."],
      ["Read", "Taxes, owner rights and liquidity lock come from the contract."],
      ["Match", "The ticker is matched to the contract, and the creator to past launches."],
      ["Decide", "Each check returns pass, fail or unknown with one line of reason."],
    ],
    terms: [],
    doesnt: [
      "It doesn't tell you whether a token will go up.",
      "It doesn't read off-chain promises or team intent.",
    ],
    faq: [
      { q: "Is there an API?", a: "Yes, planned. The same checks as JSON, with a public rate limit." },
      { q: "Can a token pass and still fail me?", a: "Yes. A check reads the chain at one moment." },
    ],
    risks: TRUST_RISKS,
    tabs: [
      {
        id: "launches",
        label: "Launch analytics",
        body: [
          "Every pool launched on Robinhood Chain this week, read from our index. Who launches, where, and what survives.",
        ],
        widget: "launch-analytics",
      },
      { id: "check", label: "Check", body: ["Paste a contract address or a ticker."], widget: "trust-check" },
      {
        id: "radar",
        label: "Radar",
        body: ["New pools on Robinhood Chain, newest first. Check any of them in one click."],
        widget: "trust-radar",
      },
      {
        id: "creator",
        label: "Creator",
        body: ["Paste a wallet: every token it launched on Robinhood Chain and what became of each."],
        widget: "creator-dossier",
      },
      { id: "address", label: "Address", body: ["Paste any address: a person, a contract or a relay, what it moved and who it moves with."], widget: "address-check" },
      ...(HELD.fair ? [] : [{ id: "fair", label: "Fair launch", body: ["Paste a token: who made it, who was waived the launch fee, who holds it and who stayed."], widget: "fair-launch" } satisfies Tab]),
      {
        id: "api",
        label: "API",
        body: ["One request, one JSON answer. Holders can make a key for higher limits."],
        widget: "trust-api",
      },
      riskTab(),
    ],
  },
  {
    id: "stocks",
    num: "003",
    name: "Stocks",
    line: "See a stock token's premium to the real share, weekends included.",
    title: "See the weekend gap before you trade it.",
    sub: "Chain price next to the reference, session status, and how much of the float sits in meme pools.",
    cta: { label: "Open the desk", href: "/app/stocks/desk" },
    steps: [
      ["Pick", "Choose a stock token."],
      ["Compare", "Chain price against the reference price, with the premium or discount."],
      ["Session", "See whether mint and burn are open ({{mintBurnWindow}})."],
      ["Float", "See what share of the token sits in meme-coin pools."],
      ["Borrow", "Size a Morpho loan against it, with the liquidation price."],
    ],
    terms: [{ label: "Morpho LLTV, stock tokens vs USDG", fact: "morphoLltv" }],
    doesnt: [
      "It doesn't make a weekend price fair. It shows how far off it is.",
      "It doesn't give you the share itself.",
    ],
    faq: [
      {
        q: "Why does the price drift on weekends?",
        a: "The token trades all week. Mint, burn and the oracle run on weekdays only.",
      },
    ],
    risks: STOCKS_RISKS,
    tabs: [
      {
        id: "market",
        label: "Market",
        body: ["The stock-token market on Robinhood Chain across every venue."],
        widget: "stock-market",
      },
      {
        id: "desk",
        label: "Desk",
        body: ["Every stock token the issuer deployed, priced by a simulated sale. Lookalikes flagged."],
        widget: "stock-desk",
      },
      {
        id: "loan",
        label: "Loan",
        body: ["Type your numbers: what you hold, what you borrow, the lender's liquidation limit. Nothing is pre-filled and nothing is signed."],
        widget: "loan-calc",
      },
      { id: "alerts", label: "Alerts", body: ["Weekend gap alerts. Closed for now."], widget: "alerts" },
      riskTab(),
    ],
  },
  {
    id: "trade",
    num: "004",
    name: "Trade",
    line: "Route across Uniswap pools and launch curves, simulated before you sign.",
    title: "One route across every pool.",
    sub: "Uniswap V2 and v4 pools and launch curves in one quote. Limit, DCA and TWAP orders come later: the contract is written and tested, not deployed.",
    cta: { label: "See order types", href: "/app/trade/orders" },
    steps: [
      ["Quote", "One quote across Uniswap pools and launch curves."],
      ["Simulate", "Every route is simulated at the latest block before you sign."],
      ["Split", "A big sell compared with the same sell in parts."],
      ["Later", "Limit, DCA and TWAP orders from an escrow contract. Written and tested, not deployed."],
    ],
    terms: [],
    doesnt: ["It doesn't guarantee the best price. It compares the pools it reads."],
    faq: [{ q: "What is the fee?", a: "Not set. Fees are targets until launch." }],
    risks: TRADE_RISKS,
    tabs: [
      {
        id: "terminal",
        label: "Terminal",
        step: "Find it, read the chart",
        body: ["Pick a token. Its chart, swaps and pool depth are read from the chain; the ticket simulates a trade."],
        widget: "terminal",
      },
      {
        id: "check",
        label: "Check",
        step: "Can you sell it",
        body: ["Paste a contract address or a ticker."],
        widget: "trust-check",
      },
      {
        id: "quote",
        label: "Swap",
        step: "Best route, then sign",
        body: ["Every route is simulated at the latest block. What you see is what the chain would pay."],
        widget: "trade-quote",
      },
      {
        id: "split",
        label: "Sell in parts",
        body: ["One big sell against the same sell in parts, each simulated at the latest block."],
        widget: "exit-split",
      },
      {
        id: "practice",
        label: "Practice",
        body: ["Paper money, real prices. Every buy and sell is quoted at the latest block; nothing is signed."],
        widget: "practice",
      },
      {
        id: "many",
        label: "Sell many",
        body: ["Pick the small holdings you want out of. Each is quoted at the latest block, then sold into ETH."],
        widget: "sell-many",
      },
      {
        id: "whales",
        label: "Big swaps",
        body: ["The largest single swaps in the busiest tokens, and the wallets behind them."],
        widget: "whale-radar",
      },
      {
        id: "overview",
        label: "Overview",
        body: ["One router, one balance, orders that wait for your price."],
        widget: "steps",
      },
      {
        id: "orders",
        label: "Orders",
        body: ["Three order types, one contract. Your input waits in escrow until the pool pays your floor."],
        widget: "order-types",
      },
      {
        id: "filler",
        label: "Filler desk",
        body: ["For keepers who fill due Corbel orders and earn the tip. Not open yet."],
        widget: "filler-desk",
      },
      riskTab(),
    ],
  },
  {
    id: "agents",
    num: "005",
    name: "Agents",
    line: "Give a bot a budget it can't exceed and a log anyone can read.",
    title: "Give a bot a budget it can't break.",
    sub: "Limits live in the contract. Raising one waits {{agentLimitDelay}}. Lowering one is instant.",
    cta: { label: "Read the limits", href: "/app/agents/limits" },
    steps: [
      ["Fund", "Move part of your balance to an agent account."],
      ["Limit", "Set size, loss and daily caps in the contract."],
      ["Run", "The bot trades inside the caps. Withdrawals are blocked."],
      ["Stop", "A drawdown limit halts it automatically."],
      ["Log", "Every decision is written to a public log."],
    ],
    terms: [{ label: "Delay before a raised limit applies", fact: "agentLimitDelay" }],
    doesnt: ["It doesn't pick a strategy for you.", "It doesn't let an agent withdraw your money."],
    faq: [
      { q: "What is the prop desk?", a: "Pay a fee for a trial. Pass it and trade capital from the vault." },
      {
        q: "Can I take the starting capital?",
        a: "No. You share profit. The starting capital can't be withdrawn.",
      },
    ],
    risks: AGENTS_RISKS,
    tabs: [
      {
        id: "learn",
        label: "Learn",
        step: "Teach it",
        body: ["Your agent learns from how you practise: it drafts its rules from your paper trades and replays them."],
        widget: "agent-learn",
      },
      {
        id: "strategies",
        label: "Mandate",
        step: "Write the rules",
        body: ["Every live mandate, its bond and its strikes, read from the factory."],
        widget: "strategies",
      },
      {
        id: "guard",
        label: "Guard",
        step: "Check every trade",
        body: ["The rules an agent must pass before each trade, checked live. Bots call the same check."],
        widget: "agent-guard",
      },
      {
        id: "break",
        label: "Break it",
        step: "Attack the contract",
        body: [
          "An agent with a bond trades under five rules. Pick an attack. The real contract runs it against live pools.",
        ],
        widget: "mandate-lab",
      },
      { id: "versus", label: "Versus", step: "Two agents, one market", body: ["Two mandates on one market, run side by side by the real contract.", "See what each traded, what it refused and the bond it lost."], widget: "agent-versus" },
      {
        id: "league",
        label: "League",
        step: "Compare the rules",
        body: ["Agent rules tested on last week's new pools, ranked by how many picks were drained."],
        widget: "strategy-league",
      },
      { id: "log", label: "Decision log", step: "What it decided", body: ["What the mandate contract decided in recent Break it runs, block by block."], widget: "decision-log" },
      {
        id: "overview",
        label: "Overview",
        body: ["Bots and people trade under limits that the contract enforces."],
        widget: "agent-hub",
      },
      {
        id: "limits",
        label: "Limits",
        body: [
          "Raising a limit waits {{agentLimitDelay}}. Lowering one applies at once.",
          "An agent can't send funds out. They can only return to your account.",
        ],
        widget: "agent-limits",
      },
      {
        id: "prop",
        label: "Prop desk",
        body: ["Pay the fee. Get funded. Hit targets. Split the profit."],
        widget: "prop-desk",
      },
      riskTab(),
    ],
  },

];

export const layerById = (id: string) => LAYERS.find((l) => l.id === id);

export const TERMS_CAPTION = "Targets, not live quotes.";
