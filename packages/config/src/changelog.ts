/**
 * The public changelog: what went live, by the UTC day it shipped, newest first. Each entry belongs to a block of
 * tools (the same blocks as the roadmap) and is new, better or fixed. Tags say where it lives (on chain), why it was made
 * (a public review) or that it is an experiment; proof links point at the transaction, contract or commit that shows it.
 * Edit here; /changelog and /changelog.xml (RSS) read it.
 */
import type { RoadBlockId } from "./roadmap";

export type ShipKind = "new" | "better" | "fix";
export type ShipTag = "onchain" | "report" | "experiment";
export type Ship = { title: string; line: string; block: RoadBlockId | "site"; kind: ShipKind; icon: string; href?: string; tags?: ShipTag[]; proof?: { label: string; href: string }[] };
export type ShipDay = { day: string; items: Ship[] };

export const CHANGELOG: ShipDay[] = [
  {
    day: "2026-11-21",
    items: [
      { block: "trade", kind: "new", icon: "layers", title: "Sell many", line: "Pick several small holdings and sell them into ETH one after another from your own wallet, each quoted at the latest block on its best route. Every approval and sale is signed by you; a token whose best route is a v4 pool is skipped, with the reason.", href: "/app/trade/many" },
      { block: "check", kind: "new", icon: "people", title: "Creator dossier", line: "Paste a wallet and see every token it launched on Robinhood Chain and what became of each: still on its curve, trading, or drained.", href: "/app/trust/creator" },
      { block: "check", kind: "better", icon: "api", title: "Token check as an API", line: "The same checks as a GET request, now open.", href: "/app/trust/api" },
      { block: "shield", kind: "new", icon: "shield", title: "Approvals", line: "Which contracts can move your tokens, how much, and how risky each is. A dangerous approval is revoked with one transaction you sign in your own wallet.", href: "/app/wallet/approvals" },
      { block: "stocks", kind: "better", icon: "coins", title: "Loan calculator", line: "What a loan against a stock token can take, now open.", href: "/app/stocks/loan" },
      { block: "check", kind: "fix", icon: "scan", title: "Token check shows every read", line: "The seven reads now light up one by one on every check, also when the answer comes from the last minute's read, and the search field has one clean frame.", href: "/app/trust/check" },
      { block: "trade", kind: "new", icon: "candles", title: "Practice", line: "Trade on paper USDG at real prices, without a wallet. Every buy and sell is quoted at the latest block, the token check runs first, and each trade keeps why you made it.", href: "/app/trade/practice" },
      { block: "agents", kind: "new", icon: "spark", title: "Your agent learns from you", line: "After twenty practice trades your agent drafts its rules from how you trade, then replays your own trades through them: what it would let through, what it would refuse.", href: "/app/agents/learn" },
      { block: "agents", kind: "new", icon: "bars", title: "Survival league", line: "Rules an agent could follow, run on paper over every new pool of the last week and ranked by how many of their picks were drained.", href: "/app/agents/league", tags: ["experiment"] },
      { block: "check", kind: "new", icon: "eye", title: "How accurate is the check", line: "The check's signals measured against what later happened to every pool with a known fate, without hindsight. Results that go against the check are shown too.", href: "/accuracy" },
      { block: "site", kind: "new", icon: "wave", title: "The chain, live on the home page", line: "Launches, pools that reached a DEX and pools found drained, as they happen, with running counts from Corbel's index.", href: "/" },
      { block: "site", kind: "better", icon: "doc", title: "Changelog with proof and RSS", line: "Every change made on chain links to its transaction, fixes from public reviews are marked, and the log has an RSS feed.", href: "/changelog" },
      { block: "site", kind: "new", icon: "doc", title: "The thesis", line: "Why Corbel exists, what it stands on and where it is going.", href: "/thesis" },
      { block: "agents", kind: "new", icon: "spark", title: "Your habits, and rules against them", line: "From your practice record the agent finds panic sells, revenge trades, oversized buys and buys of flagged tokens, and proposes a rule against each, marked by who enforces it.", href: "/app/agents/learn" },
      { block: "agents", kind: "new", icon: "bars", title: "Backtest an exit rule", line: "Take profit, stop, longest hold and how often to enter, run on a pool's real swaps from the chain, with every trade and why it closed.", href: "/app/agents/learn" },
      { block: "agents", kind: "new", icon: "eye", title: "When this happens, your agent does that", line: "Exit rules for your open practice positions, read live from the token check and a quote, each shown as watching or fired.", href: "/app/agents/learn" },
      { block: "agents", kind: "better", icon: "lock", title: "Try a trade against your rules", line: "In the mandate builder, a test trade goes through your rules in the contract's own order and shows where it stops and what that costs the agent.", href: "/app/agents/strategies" },
      { block: "check", kind: "new", icon: "chat", title: "Ask the model panel", line: "For holders: several AI models read the same token check and each says buy, wait or avoid with its reason, with how far they agree.", href: "/app/trust/check" },
      { block: "compute", kind: "new", icon: "chip", title: "GPU desk and bookings", line: "Free holder machines live: how many run now, minutes served today and the free budget used. Book a start hour and the machine starts by itself; every rental keeps a receipt with chain blocks.", href: "/app/ai/gpus" },
      { block: "earn", kind: "better", icon: "coins", title: "Add liquidity, with the risk shown", line: "Before a deposit the token check runs on the pool's token. The estimate uses the pool's own last month, and a price slider shows the pool against simply holding.", href: "/app/account/pools" },
      { block: "agents", kind: "new", icon: "lock", title: "The agent key", line: "The live mandate read from its contract: what the agent may spend, its rules, and where its bond goes when it breaks one, step by step.", href: "/app/agents/limits" },
      { block: "agents", kind: "new", icon: "wallet", title: "A wallet for your agent", line: "Made in your browser and encrypted with your passphrase; fund it and make it your mandate's agent. Its key never reaches Corbel.", href: "/app/agents/limits" },
      { block: "trade", kind: "new", icon: "clock", title: "Orders", line: "Limit buy, take profit, stop, DCA and TWAP. Corbel watches the price while it is open; a ready order opens the swap filled in for your wallet to sign.", href: "/app/trade/orders" },
      { block: "trade", kind: "new", icon: "people", title: "Activity with wallet labels", line: "Swaps and liquidity added or pulled in one list, with the wallet that signed each one marked as the developer, a whale, a sniper or a bot.", href: "/app/trade/terminal" },
      { block: "check", kind: "new", icon: "people", title: "Do buyers still hold?", line: "In a token's holders: of the wallets that first bought in each week since its pool opened, how many hold any now.", href: "/app/trade/terminal" },
      { block: "agents", kind: "new", icon: "target", title: "Prop desk evaluation", line: "Trade the paper account against a tier's rules: profit target, drawdown floor, the day's loss limit and a minimum of trading days.", href: "/app/agents/prop" },
      { block: "compute", kind: "new", icon: "chip", title: "GPU programs", line: "A free holder GPU now opens straight into a picture and video editor, a chat with open models, or a notebook with a Start here guide, already signed in. Your minutes start when it is ready.", href: "/app/ai/gpus" },
      { block: "check", kind: "new", icon: "eye", title: "Launch outcomes", line: "Every launch per launch pad: still on its curve, trading in a pool, not checked yet, or drained.", href: "/app/trust/radar" },
      { block: "data", kind: "new", icon: "bars", title: "Human vs bot volume", line: "How much of the day's DEX volume comes from wallets that trade like bots, by a rule written on the page, per token.", href: "/app/trust/launches" },
      { block: "earn", kind: "fix", icon: "coins", title: "Pool names", line: "Pools paired with USDG were shown as paired with WETH. They now show their real pair.", href: "/app/account/pools" },
      { block: "trade", kind: "fix", icon: "bars", title: "Market data on busy tokens", line: "A busy token's swaps could be too much for one read and the chart came back empty. The read is now split until it fits.", href: "/app/trade/terminal" },
      { block: "site", kind: "fix", icon: "spark", title: "Loading screen that keeps moving", line: "The loading screen draws in its own thread now, so the page starting up behind it can no longer stop it. On phones the live scenes draw lighter.", href: "/" },
      { block: "site", kind: "better", icon: "spark", title: "Smooth on phones", line: "The home page no longer freezes on a phone: the live scenes draw lighter there and pause off screen. In the terminal, Buy and Sell stay at the bottom of the screen.", href: "/" },
    ],
  },
  {
    day: "2026-11-20",
    items: [
      { block: "predict", kind: "better", icon: "fork", title: "Predict with no resolver", tags: ["onchain", "report"], proof: [{ label: "Contract", href: "https://robinhoodchain.blockscout.com/address/0x62230624777b012a316e365c7ab3677159cd73d9" }, { label: "Code", href: "https://github.com/CorbelFinance/Corbel" }], line: "A new Predict contract: price markets now settle from the pool's own time-weighted price, like survival markets from its reserves. Nobody proposes or rules on an outcome.", href: "/app/predict" },
      { block: "agents", kind: "fix", icon: "lock", title: "Revoke a bonded agent", tags: ["onchain", "report"], proof: [{ label: "Revoke on mainnet", href: "https://robinhoodchain.blockscout.com/tx/0xb624936c903bcffe89b0263ffbd981718e6455083575d33f3045dd1b3f7ef4ea" }, { label: "Code", href: "https://github.com/CorbelFinance/Corbel" }], line: "The owner can replace an agent at any time, and the agent's remaining bond goes back to it. New mandate factory on mainnet, with the proof transactions.", href: "/app/account/transparency" },
      { block: "site", kind: "fix", icon: "doc", title: "Status that matches the chain", tags: ["report"], proof: [{ label: "Code", href: "https://github.com/CorbelFinance/Corbel" }], line: "Pages and docs now say what is live and what is not: the mandate factory and Predict are live, orders and the launchpad are not. The FAQ names $CORBEL, and Predict says who settles price markets.", href: "/app/account/transparency" },
      { block: "agents", kind: "fix", icon: "lock", title: "Mandates: approved pools only", tags: ["onchain", "report"], proof: [{ label: "Refused on mainnet", href: "https://robinhoodchain.blockscout.com/tx/0xffbc4d37dc2f4d9a97fc8d93532b227f7307994b1cff597d758e3dd6f63a66b2" }, { label: "Factory", href: "https://robinhoodchain.blockscout.com/address/0xdea049d3e6df029afe5542d95428ea057f2d4d36" }, { label: "Code", href: "https://github.com/CorbelFinance/Corbel" }], line: "An agent could route the owner's money through a pool it made. Now every pool a trade touches must be one the owner approved, near the owner's price mark, or the agent is slashed. New factory on mainnet.", href: "/app/agents/break" },
      { block: "check", kind: "fix", icon: "eye", title: "Token check reads the right pool", tags: ["report"], line: "The check now tests the deepest pool, not the newest, and reads every pool on both sides. Known launchpad lockers count as locked.", href: "/app/trust/check" },
      { block: "check", kind: "better", icon: "spark", title: "Faster token check", line: "A token checked before answers at once while a fresh read runs behind it.", href: "/app/trust/check" },
      { block: "site", kind: "new", icon: "chat", title: "Support in the terminal", line: "A Support button in the corner of the terminal: quick answers to the questions asked most, or a message straight to the team.", href: "/app/trade/terminal" },
      { block: "site", kind: "new", icon: "coins", title: "$CORBEL is live", line: "The token block on the home page shows the contract, a link to the explorer and where to buy it.", href: "/#token" },
      { block: "compute", kind: "new", icon: "chip", title: "AI for holders", line: "Holding $CORBEL opens the AI chat in two levels, Light and Full. It counts the lowest balance of the last week.", href: "/app/ai/studio" },
      { block: "site", kind: "new", icon: "doc", title: "The code is public", proof: [{ label: "GitHub", href: "https://github.com/CorbelFinance/Corbel" }], line: "The site, the token check, the MCP server and the contracts are on GitHub under the MIT licence." },
      { block: "site", kind: "better", icon: "spark", title: "Agents on the front page", line: "The home page and the footer now name all five areas: Check, Swap, Earn, Agents, AI & GPUs." },
      { block: "site", kind: "fix", icon: "eye", title: "Back from the docs", line: "Going from the docs to the home page no longer shows a black screen." },
    ],
  },
  {
    day: "2026-11-19",
    items: [
      { block: "wallet", kind: "new", icon: "lock", title: "Sign in with Google", line: "A second way in from the header's Sign in menu. AI and holder levels still go by your wallet." },
      { block: "site", kind: "better", icon: "layers", title: "One palette", line: "Black and white lead, mint marks what is live. Each area keeps its colour: Swap green, Agents violet, AI orange." },
      { block: "site", kind: "better", icon: "bars", title: "Calmer blocks", line: "Blocks no longer glow green; the colour stays on what you can act on." },
      { block: "site", kind: "fix", icon: "spark", title: "Steady loading screen", line: "The intro waits for its font, so the text no longer jumps a second after it appears." },
    ],
  },
  {
    day: "2026-11-16",
    items: [
      { block: "site", kind: "new", icon: "calendar", title: "Changelog and analytics", line: "This page, and a page of Corbel in numbers: new pools by the hour, big swaps, stakes, agent decisions and models.", href: "/analytics" },
      { block: "site", kind: "new", icon: "chat", title: "Wishes on the roadmap", line: "The roadmap is split by block; pick one and write to us by email or in Telegram.", href: "/roadmap#wish" },
      { block: "site", kind: "better", icon: "spark", title: "The mark at the centre", line: "The home page draws the Corbel mark live: each of its six rings is wired to one area of the app." },
      { block: "compute", kind: "new", icon: "film", title: "Pictures, film and sound", line: "Video, image, upscale, music and voice models listed in AI & GPUs, marked Soon until they open.", href: "/app/ai/models" },
      { block: "compute", kind: "new", icon: "spark", title: "Models you can use", line: "The models we run are marked Available and come first; the rest show as Soon. Each carries its maker's icon.", href: "/app/ai/models" },
      { block: "compute", kind: "better", icon: "lock", title: "Prompts stay private", line: "The privacy policy now says it plainly: prompts and answers are not stored, logged or used to train anything.", href: "/legal/privacy" },
      { block: "check", kind: "new", icon: "doc", title: "Project research", line: "Under every token check: does the website answer and name the contract, how old is the domain, is there recent code, what else the creator launched.", href: "/app/trust/check" },
      { block: "check", kind: "better", icon: "scan", title: "Score out of 90", line: "The Corbel Score tops out at 90: code checks alone never prove a project is safe.", href: "/app/trust/check" },
      { block: "trade", kind: "better", icon: "candles", title: "A faster terminal", line: "Tokens open in about two seconds instead of up to a minute, and older pools that were missing now load.", href: "/app/trade/terminal" },
      { block: "trade", kind: "better", icon: "layers", title: "Panes you can resize", line: "Drag any edge of the terminal: the lists, the chart, the volume pane and the order panel.", href: "/app/trade/terminal" },
      { block: "trade", kind: "better", icon: "list", title: "Token lists by launchpad", line: "The terminal's list splits tokens into trending, newest and the launchpad each came from.", href: "/app/trade/terminal" },
      { block: "predict", kind: "new", icon: "fork", title: "Predict is live", line: "Stake YES or NO in USDG on whether a pool keeps its liquidity. The market settles from the pool's reserves on chain.", href: "/app/predict" },
      { block: "compute", kind: "new", icon: "chip", title: "AI and GPUs", line: "Every AI model and GPU priced side by side: a studio, a model catalogue with a cost calculator, a GPU fit finder.", href: "/app/ai/studio" },
      { block: "site", kind: "better", icon: "layers", title: "The home page as a platform", line: "One balance in the middle, every area around it with a live picture from its own tool." },
      { block: "wallet", kind: "new", icon: "eye", title: "Wallet tools", line: "Exposure, a stress test, a paper account at real fills and a share link that hides the address.", href: "/app/wallet/exposure" },
      { block: "trade", kind: "new", icon: "whale", title: "Big swaps", line: "The largest swaps of the last day and the wallets behind them.", href: "/app/trade/whales" },
      { block: "trade", kind: "new", icon: "split", title: "Sell in parts", line: "One big sell against the same sell in parts, with the price impact of each.", href: "/app/trade/split" },
      { block: "site", kind: "better", icon: "bars", title: "Every tool in its own colour", line: "Tools got their own tones, sub-tabs and live gauges instead of one template." },
    ],
  },
  {
    day: "2026-11-15",
    items: [
      { block: "agents", kind: "new", icon: "gate", title: "Agent guard", line: "A policy every agent trade must pass, checked live, with a map of where each trade lands.", href: "/app/agents/guard" },
      { block: "earn", kind: "new", icon: "coins", title: "Earn board", line: "Pools ranked by what they paid last day, minus what a price move took back.", href: "/app/account/pools" },
      { block: "earn", kind: "new", icon: "target", title: "Your LP positions", line: "Paste an address and see its pool positions, their fees and their range.", href: "/app/account/pools" },
      { block: "check", kind: "new", icon: "people", title: "Holders", line: "Who holds a token and how much the biggest wallets keep.", href: "/app/trust/check" },
      { block: "trade", kind: "new", icon: "route", title: "Swap in the app", line: "Swap from the terminal and the quote page with your own wallet; the route is simulated first.", href: "/app/trade/quote" },
      { block: "stocks", kind: "new", icon: "map", title: "Stock market", line: "A map of every stock token pool on the chain, with breadth and venues.", href: "/app/stocks/market" },
      { block: "stocks", kind: "new", icon: "gap", title: "Weekend gap", line: "Each stock token's chain price against the last market close.", href: "/app/stocks/desk" },
      { block: "trade", kind: "new", icon: "candles", title: "Candle chart", line: "Candles and volume for any token, built from its swaps.", href: "/app/trade/terminal" },
      { block: "check", kind: "better", icon: "radar", title: "Radar, rebuilt", line: "New pools newest first, each with its creator's history.", href: "/app/trust/radar" },
      { block: "data", kind: "new", icon: "doc", title: "Docs", line: "Every mechanic written down, with the math.", href: "/docs/overview" },
    ],
  },
  {
    day: "2026-11-13",
    items: [
      { block: "agents", kind: "new", icon: "bolt", title: "Break the mandate", line: "Attack a real agent mandate on live pools and watch which rule stops it.", href: "/app/agents/break" },
      { block: "agents", kind: "new", icon: "list", title: "Decision log", line: "What the mandate contract decided in each run, block by block.", href: "/app/agents/log" },
      { block: "site", kind: "new", icon: "wallet", title: "Sign in with your wallet", line: "One signature, no email, no password; a watchlist that follows you.", href: "/app" },
      { block: "check", kind: "new", icon: "bars", title: "Launch analytics", line: "Who launches, where, and how many launches survive.", href: "/app/trust/launches" },
      { block: "stocks", kind: "new", icon: "badge", title: "Stock token desk", line: "Robinhood and ST0x stock tokens by issuer code; lookalikes flagged.", href: "/app/stocks/desk" },
      { block: "trade", kind: "new", icon: "route", title: "Swap quote", line: "Every route simulated at the latest block, refusals explained.", href: "/app/trade/quote" },
      { block: "site", kind: "new", icon: "wave", title: "Status page", line: "The chain, the index and every service, live.", href: "/status" },
    ],
  },
  {
    day: "2026-11-12",
    items: [
      { block: "site", kind: "new", icon: "rocket", title: "Corbel opens", line: "The site, the app shell and the first tool on Robinhood Chain: the radar of new pools.", href: "/app" },
    ],
  },
];
