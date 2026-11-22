/**
 * The public roadmap, as data, split by the block of tools each item belongs to. Three stages: live (works today,
 * links to it), next (being built; `done` is our own rough estimate when we have one) and later (planned).
 * Edit here; the /roadmap page reads it.
 */
export type RoadStage = "live" | "next" | "later";
export type RoadBlockId = "trade" | "check" | "stocks" | "predict" | "earn" | "agents" | "compute" | "wallet" | "launch" | "data" | "shield";
export type RoadBlock = { id: RoadBlockId; label: string; line: string; tone: string };
export type RoadItem = { title: string; line: string; block: RoadBlockId; stage: RoadStage; icon: string; href?: string; done?: number };

export const ROAD_STAGES: { id: RoadStage; label: string; short: string; note: string }[] = [
  { id: "live", label: "Live now", short: "Live", note: "Open in the app today." },
  { id: "next", label: "Building", short: "Building", note: "Being built now. The bar is our own estimate." },
  { id: "later", label: "Planned", short: "Planned", note: "Designed, in order. Each ships after the one before it is in use." },
];

export const ROAD_BLOCKS: RoadBlock[] = [
  { id: "trade", label: "Trade", line: "Find a token, read its pool, swap it and plan the exit.", tone: "#2fbf72" },
  { id: "check", label: "Check", line: "Know what a token is before you buy it.", tone: "#4fbfd3" },
  { id: "stocks", label: "Stocks", line: "Stock tokens on the chain against the real market.", tone: "#d9a441" },
  { id: "predict", label: "Predict", line: "Stake on what the chain will show, settled by the chain.", tone: "#8d72e8" },
  { id: "earn", label: "Earn", line: "What pools pay, what a price move takes back.", tone: "#45a98c" },
  { id: "agents", label: "Agents", line: "Rules an AI agent has to pass before it trades your money.", tone: "#6a80e6" },
  { id: "compute", label: "AI", line: "AI models and GPUs, priced side by side, paid from one balance.", tone: "#ff9a5c" },
  { id: "wallet", label: "Wallet", line: "Your wallet as others see it, and what a bad day does to it.", tone: "#e0637c" },
  { id: "launch", label: "Launch", line: "Fair launches with the rules written into the contract.", tone: "#cf7e55" },
  { id: "data", label: "Data", line: "The same reads for developers and agents.", tone: "#9fb0a8" },
  { id: "shield", label: "Shield", line: "A wallet that refuses to be drained.", tone: "#a98ad8" },
];

export const ROAD_ITEMS: RoadItem[] = [
  // new in the November update
  { block: "earn", stage: "live", icon: "wave", title: "Add liquidity, with the risk shown", line: "The token check runs before a deposit; the estimate uses the pool's own month and a slider shows the pool against holding.", href: "/app/account/pools" },
  { block: "agents", stage: "live", icon: "lock", title: "The agent key", line: "The live mandate read from its contract: what the agent may spend, its rules, and where its bond goes when it breaks one.", href: "/app/agents/limits" },
  { block: "agents", stage: "live", icon: "eye", title: "Your habits", line: "Panic sells, revenge trades and oversized bets, read from your own record, each with what would stop it.", href: "/app/agents/learn" },
  { block: "agents", stage: "live", icon: "bars", title: "Backtest an exit rule", line: "Take-profit, stop and hold time run over a token's real history before an agent uses them.", href: "/app/agents/learn" },
  { block: "agents", stage: "live", icon: "bell", title: "Triggers", line: "When this happens, the agent does that: each rule shown as watching or fired.", href: "/app/agents/learn" },
  { block: "agents", stage: "live", icon: "target", title: "Try a trade", line: "Any trade against the mandate's rules, in the order the contract checks them.", href: "/app/agents/strategies" },
  { block: "check", stage: "live", icon: "rocket", title: "Launch outcomes", line: "Every launch per launch pad: still on its curve, trading in a pool, or drained.", href: "/app/trust/radar" },
  { block: "data", stage: "live", icon: "people", title: "Human vs bot volume", line: "The share of a day's DEX volume made by wallets that trade like bots, by a stated rule, per token.", href: "/app/trust/launches" },
  { block: "compute", stage: "next", icon: "spark", title: "GPU programs", line: "A free GPU opens straight into a picture and video editor, a chat with open models, or a notebook, already signed in." },

  // Trade
  { block: "trade", stage: "live", icon: "candles", title: "Terminal", line: "Token lists by launchpad, candle chart, swaps, depth and an exit plan. Every pane resizes.", href: "/app/trade/terminal" },
  { block: "trade", stage: "live", icon: "route", title: "Swap quote", line: "Every route simulated at the latest block, refusals explained.", href: "/app/trade/quote" },
  { block: "trade", stage: "live", icon: "split", title: "Sell in parts", line: "One big sell against the same sell in parts: what each costs in price impact.", href: "/app/trade/split" },
  { block: "trade", stage: "live", icon: "whale", title: "Big swaps", line: "The largest swaps of the last day and the wallets behind them.", href: "/app/trade/whales" },
  { block: "trade", stage: "live", icon: "book", title: "Curve as a book", line: "The pool's own curve as an order book beside the chart, for V2 and v4 pools.", href: "/app/trade/terminal" },
  { block: "trade", stage: "later", icon: "clock", title: "Orders", line: "Limit, DCA and TWAP that wait in escrow until the pool pays your floor." },
  // Check
  { block: "check", stage: "live", icon: "scan", title: "Token check", line: "Seven checks and a Corbel Score out of 90 before you buy. No sign-in.", href: "/app/trust/check" },
  { block: "check", stage: "live", icon: "doc", title: "Project research", line: "Is there a working project behind the token: its site, records, code and the creator's wallet.", href: "/app/trust/check" },
  { block: "check", stage: "live", icon: "radar", title: "Radar", line: "Every new pool on the chain, with its creator's history.", href: "/app/trust/radar" },
  { block: "check", stage: "live", icon: "bell", title: "Launch agent", line: "An AI agent reads every launch and flags serial creators, copied tickers and drained pools.", href: "/app/trust/radar" },
  { block: "check", stage: "live", icon: "rocket", title: "Near graduation", line: "Tokens still on a launchpad curve, ranked by how much of the curve is already sold.", href: "/app/trust/radar" },
  { block: "check", stage: "live", icon: "bars", title: "Launch analytics", line: "Who launches, where, and how many launches survive.", href: "/app/launch/analytics" },
  { block: "check", stage: "live", icon: "people", title: "Holders and insiders", line: "Who holds a token, how much the creator and linked wallets keep, inside the score.", href: "/app/trust/check" },
  { block: "check", stage: "later", icon: "bell", title: "Alerts", line: "Liquidity pulled, a lookalike appears, a weekend gap crosses your line." },
  // Stocks
  { block: "stocks", stage: "live", icon: "badge", title: "Stock token desk", line: "Robinhood and ST0x stock tokens, priced across every venue; lookalikes flagged.", href: "/app/stocks/desk" },
  { block: "stocks", stage: "live", icon: "gap", title: "Weekend gap", line: "Each stock token's chain price against the last market close.", href: "/app/stocks/desk" },
  { block: "stocks", stage: "live", icon: "map", title: "Stock market", line: "Map, breadth, venues and every stock pool on the chain, live.", href: "/app/stocks/market" },
  { block: "stocks", stage: "live", icon: "coins", title: "Loan calculator", line: "What you can borrow against a stock token, and the price that ends the loan.", href: "/app/stocks/loan" },
  { block: "stocks", stage: "later", icon: "umbrella", title: "Weekend cover", line: "Pay a premium on Friday, get paid if Monday opens beyond a set gap." },
  // Predict
  { block: "predict", stage: "next", icon: "fork", title: "Liquidity markets", line: "Will a pool keep its liquidity? Stake YES or NO in USDG; the chain settles it.", href: "/app/predict" },
  { block: "predict", stage: "live", icon: "doc", title: "How settlement works", line: "Stakes, timing weight and the chain as the judge, written down.", href: "/docs/predict" },
  { block: "predict", stage: "next", icon: "gap", title: "Monday open markets", line: "Will a stock token open Monday above its Friday close." },
  // Earn
  { block: "earn", stage: "live", icon: "coins", title: "Pool fees", line: "What liquidity providers earned last day, minus what a price move took back.", href: "/app/account/pools" },
  { block: "earn", stage: "live", icon: "target", title: "Position planner", line: "Fees against the price move for any pool, the band where fees win, and your positions.", href: "/app/account/pools" },
  { block: "earn", stage: "live", icon: "calendar", title: "Earn, per pool", line: "Days paid out of 30, when fees cover your costs, the average APR, sorted three ways.", href: "/app/account/pools" },
  { block: "earn", stage: "later", icon: "wallet", title: "Corbel One", line: "One USDG balance that earns while it waits and spends in one step." },
  // Agents
  { block: "agents", stage: "live", icon: "sliders", title: "Mandate builder", line: "Draft an agent's rules and see the worst day they allow, before it trades.", href: "/app/agents/strategies" },
  { block: "agents", stage: "live", icon: "gate", title: "Agent guard", line: "A policy each agent trade must pass, checked live; bots call it as an API.", href: "/app/agents/guard" },
  { block: "agents", stage: "live", icon: "bolt", title: "Break the mandate", line: "Attack a real agent mandate on live pools and watch which rule stops it.", href: "/app/agents/break" },
  { block: "agents", stage: "live", icon: "list", title: "Decision log", line: "What the mandate contract decided in each run, block by block.", href: "/app/agents/log" },
  { block: "agents", stage: "live", icon: "plug", title: "Agent tools (MCP)", line: "Checks, quotes and the radar as tools any AI agent can call.", href: "/docs/mcp" },
  { block: "agents", stage: "live", icon: "lock", title: "Mandates on chain", line: "Agents trade under rules a contract enforces; a bond pays you when they break one.", href: "/app/account/transparency" },
  // Compute
  { block: "compute", stage: "live", icon: "chip", title: "Studio", line: "Every model and GPU on one board, priced live.", href: "/app/ai/studio" },
  { block: "compute", stage: "live", icon: "spark", title: "AI models", line: "Hundreds of text, code and vision models compared; the ones we run marked Available.", href: "/app/ai/models" },
  { block: "compute", stage: "live", icon: "film", title: "Pictures, film and sound", line: "Video, image, upscale, music and voice models next to the text ones.", href: "/app/ai/chat" },
  { block: "compute", stage: "live", icon: "spark", title: "AI for holders", line: "Holders open the chat's models by tier, set by the lowest balance of the week.", href: "/#token" },
  { block: "compute", stage: "later", icon: "spark", title: "More for holders", line: "We keep adding to what holders get: new models, new tools and new perks as they ship.", href: "/#token" },
  { block: "compute", stage: "next", icon: "card", title: "Credits", line: "One balance for models and GPUs, topped up in USDG from your own wallet.", href: "/app/ai/credits" },
  { block: "compute", stage: "live", icon: "gpu", title: "Free GPU for holders", line: "A real GPU for Full holders, opened through Corbel: pictures and video, a chat, or code. Book a start hour; every rental keeps a receipt.", href: "/app/ai/gpus" },
  { block: "compute", stage: "next", icon: "gpu", title: "Paid GPU rental", line: "Any wallet rents a GPU from its Credits, billed by the minute from the moment it is ready; what is not used goes back to the balance.", href: "/app/ai/gpus" },
  { block: "compute", stage: "later", icon: "chat", title: "Playground", line: "Run any available model in the browser and keep the outputs." },
  // Wallet
  { block: "wallet", stage: "live", icon: "eye", title: "Exposure", line: "What anyone can learn about a wallet from the chain.", href: "/app/wallet/exposure" },
  { block: "wallet", stage: "live", icon: "wave", title: "Stress test", line: "Your holdings after a fall, token by token.", href: "/app/wallet/stress" },
  { block: "wallet", stage: "live", icon: "paper", title: "Paper account", line: "Trade pretend USDG at real fills from the real pools.", href: "/app/wallet/paper" },
  { block: "wallet", stage: "live", icon: "link", title: "Share link", line: "A view of a wallet that expires and hides the address.", href: "/app/wallet/share" },
  // Launch
  { block: "launch", stage: "next", icon: "rocket", title: "Protected launch", line: "Token, pool and every launch wallet's buy in one transaction, with a refund window for buyers." },
  { block: "launch", stage: "later", icon: "gavel", title: "Raise", line: "Open auctions for new projects; access by time staked as first loss, not by balance." },
  { block: "launch", stage: "later", icon: "bars", title: "Creator dashboard", line: "What a fair launch shows its buyers, live." },
  // Data
  { block: "data", stage: "live", icon: "doc", title: "Docs", line: "Every mechanic written down, with the math.", href: "/docs/overview" },
  { block: "data", stage: "live", icon: "api", title: "Public API", line: "The same checks and quotes as plain GET requests. Holders make a key for higher limits.", href: "/app/trust/api" },
  { block: "data", stage: "next", icon: "link", title: "Elysium", line: "Check, Radar and swaps on Elysium, the Layer 2 for Hyperliquid, next to Robinhood Chain." },
  { block: "data", stage: "next", icon: "layers", title: "Every venue indexed", line: "All DEXs on Robinhood Chain in our own index: checks and quotes across every pool.", done: 35 },
  // Shield
  { block: "shield", stage: "later", icon: "shield", title: "Shield", line: "A wallet that refuses to sign a transaction that drains it." },
  { block: "shield", stage: "later", icon: "eye", title: "Transaction preview", line: "Before you sign, see every balance the transaction would move." },
  { block: "shield", stage: "later", icon: "bell", title: "Drain alarm", line: "A watch on your wallet that warns the moment funds start leaving." },
  // more, per block: what comes after what is above
  { block: "trade", stage: "live", icon: "layers", title: "Sell many at once", line: "Clear several small holdings into ETH, one after another, each on its best route.", href: "/app/trade/many" },
  { block: "trade", stage: "later", icon: "bolt", title: "Swaps without ETH", line: "Pay the gas out of the token you sell, so an empty ETH balance never blocks you." },
  { block: "trade", stage: "later", icon: "shield", title: "Private route", line: "Send a swap past the public queue so nobody can trade in front of it." },
  { block: "check", stage: "live", icon: "people", title: "Creator dossier", line: "Every token one wallet created, what each became, on one page.", href: "/app/trust/creator" },
  { block: "check", stage: "later", icon: "eye", title: "Watchlist", line: "Tokens you follow get checked again whenever their contract or pool changes." },
  { block: "check", stage: "later", icon: "scan", title: "Failed sell replay", line: "Replay a sell that reverted and see the exact line of code that stopped it." },
  { block: "stocks", stage: "later", icon: "doc", title: "Issuer reserves", line: "What backs each stock token, read from the issuer's own reports." },
  { block: "stocks", stage: "later", icon: "layers", title: "Stock baskets", line: "Buy a set of stock tokens in one swap, weighted the way you choose." },
  { block: "predict", stage: "next", icon: "scan", title: "Market research", line: "Drain rates, the creator's record, holders and the cushion over the line, for every market.", href: "/app/predict" },
  { block: "predict", stage: "next", icon: "clock", title: "Up or down rounds", line: "5-minute to daily rounds on ETH and stock tokens, settled by the pool's own price average, no resolver.", done: 20 },
  { block: "predict", stage: "later", icon: "target", title: "Price levels grid", line: "Stake on where the price ends: a grid of levels and rounds, each with its own payout." },
  { block: "predict", stage: "next", icon: "rocket", title: "Launch survival markets", line: "Will a token launched today still have its pool tomorrow." },
  { block: "predict", stage: "later", icon: "list", title: "Your positions", line: "Every stake you hold, its odds now and when it settles." },
  { block: "earn", stage: "later", icon: "wave", title: "Fees back in", line: "Collected fees go back into the pool on a schedule you set." },
  { block: "earn", stage: "later", icon: "eye", title: "Pool health", line: "Who holds a pool's liquidity, and how fast it could leave." },
  { block: "agents", stage: "live", icon: "doc", title: "Mandate templates", line: "Ready rules for three jobs: a treasury bot, an active trader, a launch hunter.", href: "/app/agents/strategies" },
  { block: "agents", stage: "live", icon: "wallet", title: "A wallet per agent", line: "Each agent trades from its own wallet, made in your browser, funded by you and capped by its mandate.", href: "/app/agents/limits" },
  { block: "agents", stage: "later", icon: "people", title: "Agents for hire", line: "A public list of trading agents, each with its record and its bond. Pick one and give it a budget." },
  { block: "agents", stage: "later", icon: "coins", title: "Pay per call", line: "An agent pays for each tool call it makes, with no account and no key." },
  { block: "compute", stage: "next", icon: "plug", title: "API keys", line: "Call the models from your own code, paid from the same balance.", href: "/app/ai/credits" },
  { block: "compute", stage: "next", icon: "sliders", title: "Spending caps", line: "A daily limit on each key, so a runaway script stops itself.", href: "/app/ai/credits" },
  { block: "compute", stage: "next", icon: "route", title: "Auto pick", line: "Ask for auto:price, auto:speed or auto:quality and each request goes to the model that fits, by a rule written in the docs.", href: "/app/ai/credits" },
  { block: "compute", stage: "live", icon: "fork", title: "Model panel", line: "Several models read the same token at once, each with its own score and reason.", href: "/app/ai/chat" },
  { block: "compute", stage: "later", icon: "chip", title: "Your own model", line: "Bring your weights; a GPU starts on the first request and stops when idle." },
  { block: "compute", stage: "later", icon: "spark", title: "Train on your files", line: "Teach a small model your documents, with the price shown before it starts." },
  { block: "compute", stage: "later", icon: "doc", title: "Receipts on chain", line: "Every paid request leaves a receipt on the chain that anyone can check." },
  { block: "compute", stage: "later", icon: "bolt", title: "Agents buy compute", line: "An agent pays for model calls and GPU time inside its own mandate." },
  { block: "wallet", stage: "live", icon: "shield", title: "Approval cleanup", line: "Every spending approval you ever gave, and the risky ones revoked in one go.", href: "/app/wallet/approvals" },
  { block: "wallet", stage: "later", icon: "doc", title: "Tax file", line: "Every swap with its price at the time, as a file for your accountant." },
  { block: "data", stage: "later", icon: "bell", title: "Webhooks", line: "Your server gets a call when a pool, a wallet or a token changes." },
  // the next big update
  { block: "trade", stage: "next", icon: "list", title: "Pool activity in the terminal", line: "Liquidity added and pulled next to the swaps, with the creator's wallet, whales and snipers marked." },
  { block: "trade", stage: "later", icon: "people", title: "Wallet labels", line: "Creator, sniper, whale and steady holder marked on every swap, from the wallet's own record." },
  { block: "check", stage: "later", icon: "people", title: "Buyer retention", line: "Of the wallets that bought a token in its first week, how many still hold it." },
  { block: "check", stage: "later", icon: "scan", title: "Copycat finder", line: "Tokens that copy a name, a logo or a contract of one that already exists." },
  { block: "stocks", stage: "later", icon: "gap", title: "Gap history", line: "Every weekend gap of every stock token, and how often Monday closed it." },
  { block: "earn", stage: "later", icon: "bars", title: "Pool fee history", line: "Fees paid by every pool, day by day, from the chain, back to its first block." },
  { block: "agents", stage: "later", icon: "fork", title: "Agent vs agent", line: "Two mandates on the same market side by side: trades, refusals and result." },
  { block: "compute", stage: "later", icon: "chat", title: "Models on your GPU", line: "Pick a model from a list and it is downloaded and ready when the machine opens." },
  { block: "wallet", stage: "later", icon: "bars", title: "Wallet report", line: "One page per wallet: what it holds, what it traded, what it paid in fees and gas." },
  { block: "data", stage: "later", icon: "layers", title: "Data downloads", line: "Pools, launches and swaps as files, the same data our pages read." },
];
