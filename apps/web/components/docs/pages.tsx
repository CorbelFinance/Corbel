/**
 * The docs, as data. One module feeds the sidebar, the search palette, the right-hand index, the pager and
 * the sitemap, so they cannot drift apart. Every figure here comes from config, from the real API shapes
 * or from a real report; nothing is invented. Sentences stay short.
 */
import type { ReactNode } from "react";
import { BRAND, FACTS, FLAGS, LAYERS, MANDATE_DEMO, STATUS_BANNER, STATUS_LABEL } from "@corbel/config";
import { DOCS_SAMPLE } from "@corbel/data";
import { StatusChip } from "@corbel/ui";
import { Callout, Code, DTable, Facts, Next, P, Sec, Steps } from "./kit";

const BASE = `https://${BRAND.domains.site}`;
/** Mirrors CorbelPredict: early weight bonus, fee to the Gap Fund, challenge window, stall before refunds. */
const PREDICT = { early: 50, fee: 1, challengeHours: 6, stallDays: 14 } as const;

export type DocSection = { id: string; title: string };
export type Doc = { slug: string; group: string; code: string; title: string; lede: string; sections: DocSection[]; body: () => ReactNode };

const MARK = {
  pass: <span className="text-leaf">✓ Pass</span>,
  warn: <span className="text-text">▲ Caution</span>,
  fail: <span className="text-flesh">✕ Fail</span>,
  unknown: <span className="text-muted">? Unknown</span>,
};

const TOKEN_SAMPLE = `curl "${BASE}/api/token?q=0x5fc5360d0400a0fd4f2af552add042d716f1d168"

{
  "checks": [
    {
      "id": "honeypot",
      "name": "Honeypot",
      "result": "pass",
      "reason": "Bought and sold back in a simulation on the V2 WETH pair.",
      "metric": "−0.60% round trip"
    },
    {
      "id": "liquidity",
      "name": "Liquidity lock",
      "result": "fail",
      "reason": "Most LP tokens are held by wallets that can withdraw.",
      "metric": "0.00% burned · 92.3 WETH"
    }
    // …five more: exit, tax, owner, ticker, creator
  ],
  "meta": { … }
}`;

const QUOTE_SAMPLE = `curl "${BASE}/api/quote?from=ETH&to=USDG&amount=1"

{
  "from": "ETH", "to": "USDG", "amountIn": "1",
  "block": "114498094",
  "best": 0,
  "impact": 0.0107,
  "routes": [
    {
      "hops": [{ "venue": "v2", "fee": 3000, "hooked": false, "pool": "0x8803…1C4d" }],
      "amountOut": "1739243284",
      "gas": 66191,
      "ok": true,
      "reason": null
    },
    {
      "hops": [{ "venue": "v4", "fee": null, "hooked": true }],
      "amountOut": null,
      "ok": false,
      "reason": "The pool's hook refused the swap."
    }
  ]
}`;

/** The V2 pool fee in percent, as the Earn table uses it. */
const POOL_FEE_PCT = 0.3;

const EARN_MATH = `fees        = volume × pool fee            (V2: ${POOL_FEE_PCT}%, before any protocol cut)
yearly      = fees × (24 / hours in window) × 365 / liquidity
IL(r)       = 2·√r / (1 + r) − 1          (r = price now / price then)
net, window = fees / liquidity + IL(r)
your share  = deposit / (liquidity + deposit)`;

const MCP = `{
  "mcpServers": {
    "corbel": {
      "command": "node",
      "args": ["--experimental-strip-types", "packages/mcp/src/server.ts"],
      "env": { "CORBEL_API": "${BASE}" }
    }
  }
}`;

const SKILLS = [
  ["Assets", "Both sides of a trade must be on the owner's list."],
  ["Size", "Each trade stays under a cap per token."],
  ["Budget", "Each token has a daily spending cap, reset at 00:00 UTC."],
  ["Price", "The fill must stay close to the pool's own price."],
  ["Window", "Trades happen only in the owner's hours and days."],
] as const;

export const DOCS: Doc[] = [
  /* ------------------------------------------------------------------ START */
  {
    slug: "overview",
    group: "Start",
    code: "D-01",
    title: "What Corbel is",
    lede: "One app for Robinhood Chain: check a token before you buy it, swap on the best route, see what pools pay, stake on what the chain will show, give an agent a budget it can't break, and talk to AI models.",
    sections: [
      { id: "status", title: "Where things stand" },
      { id: "real", title: "What is real today" },
      { id: "paths", title: "Pick a path" },
    ],
    body: () => (
      <>
        <Sec id="status" n="01" title="Where things stand">
          <P>Eight layers share one account. Most tools run on Robinhood Chain mainnet today; Launch and Shield are not open yet.</P>
          <DTable
            code="D-01"
            title="LAYERS"
            cols={["#", "Layer", "What it does", "State"]}
            mono={[0]}
            rows={LAYERS.map((l) => [l.num, l.brand ? `${l.brand} · ${l.name}` : l.name, l.title, <StatusChip key={l.id} status={FLAGS[l.id]} />])}
            foot={<span>Live = on mainnet today; anything that moves money is signed in your own wallet</span>}
          />
        </Sec>
        <Sec id="real" n="02" title="What is real today">
          <Facts
            rows={[
              ["Chain", `Robinhood Chain, id ${FACTS.chainId.value}`],
              ["Reads", "Checks, quotes and balances come from the chain at the latest block. Nothing is typed in."],
              ["Signing", "Your wallet signs only what you start: a swap you confirm, a Predict stake, or the sign-in message. A sign-in is a message, never a transaction."],
              ["Contracts", "The Predict and mandate contracts are deployed on mainnet and reviewed in-house, not externally audited."],
              ["Data", "Pools come from Corbel's own index of pool-creation events, read from the chain."],
              ["Score", "The Corbel Score tops out at 90: code checks alone never prove a token is safe."],
            ]}
          />
          <Callout tone="risk">Nothing here is audited. A clean report is not a guarantee, and a simulation is one block of the chain.</Callout>
        </Sec>
        <Sec id="paths" n="03" title="Pick a path">
          <Next
            items={[
              { href: "/docs/quickstart", code: "D-02", title: "Check a token", text: "One address or ticker, seven checks, a minute." },
              { href: "/docs/trust", code: "D-03", title: "Trust checks", text: "What each check runs and how to read it." },
              { href: "/docs/mandate", code: "D-07", title: "The mandate", text: "How a contract keeps an agent inside its rules." },
              { href: "/docs/api", code: "D-08", title: "The API", text: "Every read as a plain GET request." },
              { href: "/docs/trade", code: "D-05", title: "The terminal", text: "Chart, depth and an exit plan for any token." },
              { href: "/docs/earn", code: "D-12", title: "Pool fees", text: "What LPs earned, and what a move took back." },
              { href: "/docs/ai", code: "D-14", title: "AI", text: "Chat with models, compare prices, find a GPU." },
              { href: "/docs/wallet", code: "D-15", title: "Wallet tools", text: "Exposure, stress test, paper trading, share links." },
              { href: "/docs/app-overview", code: "D-24", title: "The Overview page", text: "The whole app on one page, block by block." },
              { href: "/docs/launch-agent", code: "D-25", title: "The launch agent", text: "What it reads, what it flags, curves near graduation." },
              { href: "/docs/networks", code: "D-26", title: "Networks", text: "Robinhood Chain today, Elysium next." },
            ]}
          />
        </Sec>
      </>
    ),
  },
  {
    slug: "quickstart",
    group: "Start",
    code: "D-02",
    title: "Check a token",
    lede: "Paste an address or a ticker. Corbel simulates a buy and a sell against the live pool and shows seven results.",
    sections: [
      { id: "app", title: "In the app" },
      { id: "terminal", title: "From a terminal" },
      { id: "read", title: "Reading the result" },
    ],
    body: () => (
      <>
        <Sec id="app" n="01" title="In the app">
          <Steps
            items={[
              ["Open Trust", <>Go to <a className="text-leaf underline-offset-4 hover:underline" href="/app/trust/check">Trust · Check</a>. No wallet needed.</>],
              ["Paste", "A contract address, or a ticker. A ticker with many contracts shows a list to pick from."],
              ["Read", "Seven results appear one by one. The banner on top says how many failed."],
            ]}
          />
          <Callout>
            A ticker is not an identity. In the sample report, nine other contracts also use USDG. Check the address, not the name.
          </Callout>
        </Sec>
        <Sec id="terminal" n="02" title="From a terminal">
          <P>The app calls one endpoint. You can call it too. It is a plain GET with no key.</P>
          <Code code="D-02" title="REQUEST AND RESPONSE" text={TOKEN_SAMPLE} lang="JSON · shortened" />
        </Sec>
        <Sec id="read" n="03" title="Reading the result">
          <DTable
            code="D-02" title="RESULT STATES" cols={["Mark", "Means", "What to do"]}
            rows={[
              [MARK.pass, "The check ran and found nothing wrong.", "Still read the others."],
              [MARK.warn, "Something to read with care.", "Open the reason line before you buy."],
              [MARK.fail, "The check found a real problem.", "Treat the token as unsafe until you understand why."],
              [MARK.unknown, "The check could not run.", "Missing data is not a pass."],
            ]}
          />
        </Sec>
      </>
    ),
  },
  /* ------------------------------------------------------------------ LAYERS */
  {
    slug: "trust",
    group: "Layers",
    code: "D-03",
    title: "Trust checks",
    lede: "Know if you can sell before you buy. Seven checks, each a simulation or a read of the chain, never an opinion.",
    sections: [
      { id: "seven", title: "Seven checks" },
      { id: "how", title: "How they run" },
      { id: "limits", title: "What a clean report does not tell you" },
    ],
    body: () => (
      <>
        <Sec id="seven" n="01" title="Seven checks">
          <DTable
            code="C-02" title="THE SEVEN" cols={["#", "Check", "What it runs", "Example, from a real report"]} mono={[0]}
            rows={[
              ["01", "Honeypot", "A buy and a sell, simulated against the live pool.", DOCS_SAMPLE.honeypot],
              ["02", "Exit now", "What a buyer-size bag sells for, with nobody buying first.", DOCS_SAMPLE.exit],
              ["03", "Tax", "Expected against received, on both legs.", DOCS_SAMPLE.tax],
              ["04", "Owner", "Admin powers read from the bytecode and proxy slot.", "Issuer can upgrade, freeze or mint"],
              ["05", "Liquidity", "LP burned, or who holds each v4 position.", DOCS_SAMPLE.liquidity],
              ["06", "Ticker", "Other contracts using the same symbol.", "9 other contracts use USDG"],
              ["07", "Creator", "How many pools the launcher made this week.", "Unknown: pair older than the index window"],
            ]}
            foot={<span>Example: USDG, shown in the app as the sample report</span>}
          />
        </Sec>
        <Sec id="how" n="02" title="How they run">
          <Steps
            items={[
              ["Resolve", "An address is checked as is. A ticker is looked up in the index, and you pick the contract."],
              ["Simulate", <>Each check is an <code>eth_call</code> at the latest block. Nothing is sent, nothing is signed.</>],
              ["Report", "Every result has a mark, a reason in plain words and one number."],
            ]}
          />
          <P>The browser never calls the chain. It asks <code>/api/token</code>, which reads the chain and answers once.</P>
        </Sec>
        <Sec id="limits" n="03" title="What a clean report does not tell you">
          <Callout tone="risk" title="READ THIS">
            A clean check is not a guarantee. It reads the chain; it can&apos;t read intent. An owner can change a contract after you check it, if the contract allows it. The simulation runs against the current block, and the next block can differ.
          </Callout>
        </Sec>
      </>
    ),
  },
  {
    slug: "radar",
    group: "Layers",
    code: "D-04",
    title: "Radar and launches",
    lede: "New pools on Robinhood Chain, newest first, with the history of the wallet that launched them.",
    sections: [
      { id: "columns", title: "What a row says" },
      { id: "source", title: "Where the data comes from" },
      { id: "serial", title: "Serial launchers" },
      { id: "agent", title: "The launch agent" },
    ],
    body: () => (
      <>
        <Sec id="columns" n="01" title="What a row says">
          <DTable
            code="R-01" title="COLUMNS" cols={["Column", "Meaning"]}
            rows={[
              ["Age", "Counted from block height, not from a clock."],
              ["Token", "Symbol, name and the start of the contract address."],
              ["Pool", "V2 or v4, the base asset, and a hook tag when the pool has one."],
              ["Launcher", "The wallet that made the pool, and ×N pools from that wallet this week."],
              ["State", <span key="s"><span className="text-leaf">Live</span> pair holds liquidity · <span className="text-flesh">Drained</span> it does not · — not known yet</span>],
            ]}
          />
        </Sec>
        <Sec id="source" n="02" title="Where the data comes from">
          <P>Corbel reads the pool-creation events itself: <code>PairCreated</code> for V2 and <code>Initialize</code> for v4. The index refreshes every minute and covers a rolling week.</P>
          <Callout tone="not" title="NOT BUILT">Older history is not indexed. The creator check on a pair older than the window shows Unknown, not Pass.</Callout>
        </Sec>
        <Sec id="serial" n="03" title="Serial launchers">
          <P>The Launch tab groups wallets by how many pools they launched this week. A wallet with hundreds of pools is worth a look before you buy any of them.</P>
          <Callout>Many launches from one wallet is not proof of a scam. It is a reason to open the Check.</Callout>
        </Sec>
        <Sec id="agent" n="04" title="The launch agent">
          <P>Above the lists, an AI agent writes four lines about the last day of launches and flags what stands out: wallets that launched again and again, tickers that copy the chain&apos;s money, names launched many times, pools already drained, and tokens closest to graduating from their curve to a pool.</P>
          <P>
            Read more in <a href="/docs/launch-agent" className="text-leaf underline underline-offset-2">the launch agent</a>.
          </P>
        </Sec>
      </>
    ),
  },
  {
    slug: "trade",
    group: "Layers",
    code: "D-05",
    title: "Routing and quotes",
    lede: "One route across every pool. Each route is simulated at the latest block, so what you see is what the chain would pay.",
    sections: [
      { id: "terminal", title: "The terminal" },
      { id: "quote", title: "How a quote is made" },
      { id: "refusals", title: "Why a route says no fill" },
      { id: "orders", title: "Orders" },
    ],
    body: () => (
      <>
        <Sec id="terminal" n="01" title="The terminal">
          <P>One token at a time: its pool, a day of swaps, the pool&apos;s depth, the seven checks and a ticket that simulates a trade.</P>
          <DTable
            code="X-02" title="WHAT IT READS" cols={["Part", "From the chain"]}
            rows={[
              ["Price", "The pool's price right after each swap: V2 Sync reserves, v4 sqrtPriceX96. Not the trade's average, so one big swap does not draw a false wick."],
              ["Pool", "The busiest of the deepest V2 pair and the newest unhooked v4 pool against ETH, WETH or USDG."],
              ["Liquidity events", "V2 Mint and Burn, v4 ModifyLiquidity: marked on the chart as added or taken out."],
              ["Depth", "V2 only: how much buying or selling moves the price by each step, from x·y=k."],
              ["Pool maker", "The wallet that created the pool and how many of its pools were drained, from Corbel's index."],
            ]}
          />
          <P>The exit plan takes your bag and what you paid. It simulates a full sale now and a sale in parts, says how far the price must rise to break even, how much buying the pool must see to get there, and a pace that sells no faster than buyers arrive.</P>
          <Callout tone="risk">A thin pool shows a price no real order gets. The terminal says so when liquidity is low.</Callout>
        </Sec>
        <Sec id="quote" n="02" title="How a quote is made">
          <Steps
            items={[
              ["Collect", "Direct V2 and v4 pools, and two-hop paths through ETH or USDG."],
              ["Simulate", "Every route runs as a swap inside an eth_call at the latest block."],
              ["Rank", "Routes are ordered by what they pay out. The best one is marked."],
              ["Show", "Minimum received at your slippage, price impact against a tiny trade, and gas."],
            ]}
          />
          <Code code="T-01" title="REQUEST AND RESPONSE" text={QUOTE_SAMPLE} lang="JSON · shortened · amountOut is in the token's smallest unit" />
        </Sec>
        <Sec id="refusals" n="03" title="Why a route says no fill">
          <DTable
            code="T-02" title="REASONS" cols={["Reason", "Means"]}
            rows={[
              ["The pool's hook refused the swap.", "A v4 hook runs code on every swap, and this one reverted."],
              ["No liquidity on this side of the price.", "The pool would pay nothing for this trade."],
            ]}
          />
        </Sec>
        <Sec id="orders" n="04" title="Orders">
          <Callout tone="not" title="NOT BUILT">
            Limit, DCA and TWAP orders are designed, not deployed. The order contract does not exist yet, and Corbel signs nothing today.
          </Callout>
          <Callout tone="risk">Prices can move between quote and execution. Your slippage limit is the only hard stop. MEV protection reduces sandwich risk; it does not remove it.</Callout>
        </Sec>
      </>
    ),
  },
  {
    slug: "stocks",
    group: "Layers",
    code: "D-06",
    title: "Stock tokens",
    lede: "Robinhood Chain lists tokens that track stocks. Some are the issuer's, some are copies with the same name. The code tells them apart.",
    sections: [
      { id: "code", title: "Issuer or lookalike" },
      { id: "price", title: "How the desk prices a token" },
      { id: "gap", title: "The weekend gap" },
      { id: "state", title: "State of this layer" },
    ],
    body: () => (
      <>
        <Sec id="code" n="01" title="Issuer or lookalike">
          <P>Every stock token the issuer deployed runs the same runtime code. Corbel hashes that code and compares it, byte for byte, with each token that uses the same ticker.</P>
          <DTable
            code="K-10" title="TWO KINDS" cols={["Kind", "Runtime code", "Seen as"]} mono={[1]}
            rows={[
              [<span key="i" className="text-leaf">Issuer</span>, "283 bytes, one fixed hash", "✓ Matches issuer"],
              [<span key="l" className="text-flesh">Lookalike</span>, "44-byte EIP-1167 clone", "✕ Not the issuer"],
            ]}
            foot={<span>Byte counts are from a real pair on the chain</span>}
          />
          <Callout tone="risk">A clone forwards calls to another contract. It can change behaviour without changing its address.</Callout>
        </Sec>
        <Sec id="price" n="02" title="How the desk prices a token">
          <P>The price is a simulated sale of one token to USDG on the live pool. There is no off-chain reference price. Depth shows what a sale of ten does to that price.</P>
        </Sec>
        <Sec id="gap" n="03" title="The weekend gap">
          <P>The stock market closes; the token keeps trading. The desk compares each issuer token&apos;s pool price with the stock&apos;s last regular close.</P>
          <Facts
            rows={[
              ["Chain price", "The pool's mid price from its reserves, in dollars through the WETH/USDG pool."],
              ["Last close", "Public chart data: delayed, read every ten minutes."],
              ["Gap", "Chain price over last close, minus one. Shown in grey when the pool is too thin to trade at size."],
            ]}
          />
          <Callout>The desk&apos;s &quot;sell one token&quot; price measures depth, not value: in a pool worth a few dollars it can read far below the stock. The gap uses the reserves ratio, which tracks the close.</Callout>
        </Sec>
        <Sec id="state" n="04" title="State of this layer">
          <P>Stocks is <b>{STATUS_LABEL[FLAGS.stocks].toLowerCase()}</b> to the public. {STATUS_BANNER[FLAGS.stocks]} This page explains the method; it is not an offer.</P>
          <Callout tone="risk">Stock tokens are debt instruments of Robinhood Assets (Jersey), not shares.</Callout>
        </Sec>
      </>
    ),
  },
  {
    slug: "mandate",
    group: "Layers",
    code: "D-07",
    title: "The mandate",
    lede: "An AI agent trades the owner's money. A contract holds the rules. The agent pays for trying to break them.",
    sections: [
      { id: "steps", title: "How it works" },
      { id: "skills", title: "Five skills" },
      { id: "rules", title: "The twelve rules" },
      { id: "try", title: "Try to break it" },
    ],
    body: () => (
      <>
        <Sec id="steps" n="01" title="How it works">
          <Steps
            items={[
              ["Fund", "The owner puts money in a mandate vault and writes the rules."],
              ["Bond", "The agent posts a bond in USDG before it may trade."],
              ["Trade", "Every trade is checked by the contract, not by the agent."],
              ["Pay", "A broken rule costs the agent part of its bond. The owner gets it."],
            ]}
          />
          <Callout>{MANDATE_DEMO.bondLine}</Callout>
        </Sec>
        <Sec id="skills" n="02" title="Five skills">
          <DTable
            code="M-00" title="THE MANDATE" cols={["#", "Skill", "Rule", "In the demo"]} mono={[0]}
            rows={SKILLS.map(([k, v], i) => [String(i + 1).padStart(2, "0"), <span key={k} className="font-mono text-leaf">{k.toUpperCase()}</span>, v, MANDATE_DEMO.rules[i]?.what ?? ""])}
          />
        </Sec>
        <Sec id="rules" n="03" title="The twelve rules">
          <ol className="mt-2 border-y border-line">
            {MANDATE_DEMO.docRules.map((r, i) => (
              <li key={r} className="grid grid-cols-[3rem_1fr] gap-3 border-b border-line py-3.5 last:border-b-0">
                <span className="font-mono text-xs text-leaf">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-text">{r}</span>
              </li>
            ))}
          </ol>
        </Sec>
        <Sec id="try" n="04" title="Try to break it">
          <P>The site runs a real mandate contract inside a simulation of the live chain. Pick an attack and watch which rule stops it.</P>
          <a href="/app/agents/break" className="ibtn mt-5 inline-flex h-11 px-6">Open Break it</a>
          <Callout tone="not" title="LIVE, OUR OWN DEMO">The mandate factory is live on Robinhood Chain at 0xdea049d3e6df029afe5542d95428ea057f2d4d36, verified on Blockscout. The one live mandate is ours: the owner and the agent are both team wallets, with demo amounts. Mandates on the three earlier factories are retired. Not audited.</Callout>
          <Callout tone="risk">Rules cap losses. They don&apos;t make a strategy profitable. A hook or a token can still behave badly inside the rules.</Callout>
        </Sec>
      </>
    ),
  },
  {
    slug: "earn",
    group: "Layers",
    code: "D-12",
    title: "Earn: pool fees",
    lede: "What an LP kept in each pool over the last 30 days, after the price move took its share back, and a page for every pool.",
    sections: [
      { id: "table", title: "The pools table" },
      { id: "sorts", title: "Three ways to sort" },
      { id: "page", title: "A pool's own page" },
      { id: "math", title: "The math" },
      { id: "source", title: "Where the days come from" },
    ],
    body: () => (
      <>
        <Sec id="table" n="01" title="The pools table">
          <DTable
            code="E-01" title="COLUMNS" cols={["Column", "Meaning"]}
            rows={[
              ["Last 30 days after fees", "A curve of what an LP kept, day after day: fees earned minus what the price move took back."],
              ["Paid", "Days that ended ahead after fees, out of the days recorded, with a bar per day."],
              ["Fees back", "How many days of average fees pay back the window's whole price-move loss."],
              ["Now", "The fee yield of the last day, as a yearly rate."],
              ["Avg APR", "The average daily fee yield over the window, as a yearly rate."],
            ]}
            foot={<span>The past, read from each pool&apos;s own events. Not a promise</span>}
          />
        </Sec>
        <Sec id="sorts" n="02" title="Three ways to sort">
          <P>Highest APR puts the pools that paid most first. Steadiest puts first the pools whose days varied least. Fees back soonest puts first the pools that recover a price move fastest.</P>
        </Sec>
        <Sec id="page" n="03" title="A pool's own page">
          <P>Click a pool&apos;s name, or Day by day in the side panel. The page shows the record (kept, days paid, average APR, fees in the window, fees back, steadiness), the curve with fee bars and a red mark on days the price move took more than the fees, and a table of every day: swaps, volume, fees, fee yield, price-move cost and what was kept.</P>
          <P>The calculator on the right replays the window for an amount you pick: fees earned, what the move took, what was left, and your share of the pool.</P>
        </Sec>
        <Sec id="math" n="04" title="The math">
          <Code code="E-02" title="FORMULAS" lang="Constant-product pools (V2)" text={EARN_MATH} />
        </Sec>
        <Sec id="source" n="05" title="Where the days come from">
          <P>Each pool&apos;s swaps and reserve updates are read from the chain and summed per day. A day with no swap leaves no event, so its reserves are carried from the day before and its fees are zero; that is what happened in the pool.</P>
          <Callout tone="risk">Fees are not guaranteed. Volume can stop and a pool can be drained. Check the token before you provide liquidity. Deposits open with Corbel One.</Callout>
        </Sec>
      </>
    ),
  },
  {
    slug: "ai",
    group: "Layers",
    code: "D-14",
    title: "AI: models, chat and GPUs",
    lede: "Talk to AI models in the browser, compare every model side by side, and see what a GPU costs to run your own.",
    sections: [
      { id: "chat", title: "Chat" },
      { id: "models", title: "Models" },
      { id: "gpus", title: "GPUs and credits" },
      { id: "privacy", title: "What is kept" },
    ],
    body: () => (
      <>
        <Sec id="chat" n="01" title="Chat">
          <Steps
            items={[
              ["Connect a wallet", "Any browser wallet. Connecting only reads the address."],
              ["Sign in", "One signed message, not a transaction. It costs no gas and moves nothing."],
              ["Pick a model and ask", "Models marked Available answer now. The answer streams in as it is written."],
            ]}
          />
          <P>While payments are not open, each wallet gets 30 messages a day. The count resets at 00:00 UTC.</P>
        </Sec>
        <Sec id="models" n="02" title="Models">
          <P>The catalogue lists text, code, vision, image and audio models with their prices per million tokens. Open a model to set it against its nearest rivals: the same kind of model from other makers, priced as a monthly bill for the daily budget you set. Picture, film and sound models are listed as Soon until they open.</P>
        </Sec>
        <Sec id="gpus" n="03" title="GPUs and credits">
          <P>Every GPU type with its hourly rate, and a fit finder: give it a model size and precision and it lights the cheapest GPU that holds it. Renting and credits open with payments; one balance will pay for models and GPUs alike.</P>
        </Sec>
        <Sec id="privacy" n="04" title="What is kept">
          <Facts
            rows={[
              ["Prompts and answers", "Not stored, not logged, not used to train anything. They pass to the model and back."],
              ["Your chats", "Saved in your browser only. Clear them there."],
              ["On the server", "A count of messages per day, for the limit, keyed by a hash of your address."],
            ]}
          />
          <Callout tone="risk">Models make mistakes. Never send keys, seed phrases or passwords to any model.</Callout>
        </Sec>
      </>
    ),
  },
  {
    slug: "wallet",
    group: "Layers",
    code: "D-15",
    title: "Wallet tools",
    lede: "Read any address the way other people read it, before you act on it.",
    sections: [{ id: "tools", title: "The four tools" }],
    body: () => (
      <>
        <Sec id="tools" n="01" title="The four tools">
          <DTable
            code="W-01" title="TOOLS" cols={["Tool", "What it shows"]}
            rows={[
              ["Exposure", "What anyone can learn about a wallet from the chain alone: what it holds, where it traded, which swaps were large."],
              ["Stress test", "The holdings after a fall, token by token, at the depth the real pools have."],
              ["Paper account", "Trade pretend USDG at the fills the real pools would give. No money moves."],
              ["Share link", "A view of a wallet that expires and does not show the address."],
            ]}
          />
          <Callout tone="risk">Anything on chain is public for good. These tools show it; they cannot hide it.</Callout>
        </Sec>
      </>
    ),
  },
  {
    slug: "score",
    group: "Layers",
    code: "D-16",
    title: "The Corbel Score",
    lede: "One number for a token, out of 90, and the four parts that explain it. A clean score is the absence of known traps, not a promise.",
    sections: [
      { id: "parts", title: "The four parts" },
      { id: "caps", title: "Caps that override the total" },
      { id: "why90", title: "Why 90, not 100" },
    ],
    body: () => (
      <>
        <Sec id="parts" n="01" title="The four parts">
          <P>Each check scores pass 100, caution 60, unknown 50, fail 0. A part is the weighted average of its checks; the total is the weighted average of the parts, scaled to 90.</P>
          <DTable
            code="S-01" title="PARTS" cols={["Part", "Weight", "Checks inside (weight)"]} mono={[1]}
            rows={[
              ["Exit", "45%", "Honeypot (3), exit at a loss (2), transfer tax (2)"],
              ["Control", "25%", "Owner powers (2), lookalike ticker (1)"],
              ["Liquidity", "20%", "Liquidity lock (1)"],
              ["Origin", "10%", "Creator history (1)"],
            ]}
          />
        </Sec>
        <Sec id="caps" n="02" title="Caps that override the total">
          <P>Some failures are bad enough that no other result should hide them. The total is capped when one of them fails:</P>
          <DTable
            code="S-02" title="CAPS" cols={["Check fails", "Total at most", "Because"]} mono={[1]}
            rows={[
              ["Honeypot", "10", "it cannot be sold back"],
              ["Lookalike ticker", "25", "it copies another token's name"],
              ["Transfer tax", "30", "a tax takes part of every trade"],
              ["Exit", "35", "a sale returns a fraction of the cost"],
            ]}
          />
        </Sec>
        <Sec id="why90" n="03" title="Why 90, not 100">
          <P>Code checks see the contract and the pool. They cannot see whether a team is real, whether a website tells the truth or what a creator will do tomorrow. The last ten points are left for that, and nothing on the chain can earn them. Project research under each check reads what can be read outside the code.</P>
          <Callout tone="risk">A high score lowers the odds of a known trap. It does not make a token a good buy.</Callout>
        </Sec>
      </>
    ),
  },
  {
    slug: "launchpads",
    group: "Layers",
    code: "D-17",
    title: "Launchpads and launches",
    lede: "How Corbel tells which launchpad a token came from, and why it sees tokens before they have a pool.",
    sections: [
      { id: "tell", title: "Telling launchpads apart" },
      { id: "curve", title: "Before the pool: the curve" },
      { id: "alpha", title: "Alpha on the Radar" },
    ],
    body: () => (
      <>
        <Sec id="tell" n="01" title="Telling launchpads apart">
          <P>Every launchpad leaves a fingerprint on the chain: the hook its pools are created with, or the contract its launch transaction calls. Corbel keeps a list of those fingerprints from each launchpad&apos;s public contracts and labels every pool and launch by them. Pools made straight on Uniswap are labelled as such; fingerprints nobody has published yet stay unlabelled rather than guessed.</P>
        </Sec>
        <Sec id="curve" n="02" title="Before the pool: the curve">
          <P>Many launchpads sell a new token on a bonding curve first and open a DEX pool only when it graduates. A pool index alone would miss them until then. Corbel also reads the launchpads&apos; own contracts: the token minted in a launch transaction is recorded at once, with its creator, and marked on curve until a pool appears.</P>
        </Sec>
        <Sec id="alpha" n="03" title="Alpha on the Radar">
          <P>{`Tokens under ${72} hours old with at least $${1}K traded, ranked by volume, with the share of buys and how many different wallets traded them. It is a list to look at first, never a list to buy: every row opens the check.`}</P>
        </Sec>
      </>
    ),
  },
  {
    slug: "terminal",
    group: "Layers",
    code: "D-18",
    title: "The terminal",
    lede: "Find a token, read its pool, check it, swap it and plan the exit, on one screen.",
    sections: [
      { id: "panes", title: "The panes" },
      { id: "swap", title: "Swapping from the ticket" },
      { id: "exit", title: "The exit plan" },
    ],
    body: () => (
      <>
        <Sec id="panes" n="01" title="The panes">
          <DTable
            code="T-01" title="PANES" cols={["Pane", "What it shows"]}
            rows={[
              ["Tokens", "Trending, new, stock tokens, launchpads and your watchlist; search by ticker or address."],
              ["Market", "Price, volume, liquidity, the Corbel Score and its parts, quick buy and sell sizes, the candle chart from the pool's own swaps."],
              ["Activity", "Every swap, the holders, the pulse of buys and sells, liquidity moves and all checks."],
              ["Ticket", "Simulate a buy or a sell at the latest block, then swap from your wallet."],
            ]}
          />
          <P>Every pane edge drags to resize; the layout is kept in your browser.</P>
        </Sec>
        <Sec id="swap" n="02" title="Swapping from the ticket">
          <Steps
            items={[
              ["Simulate", "An eth_call at the latest block returns what you would get, the minimum after slippage, the price impact and the route."],
              ["Approve, if needed", "A token you pay with needs one approval for the router, once."],
              ["Swap", "Your wallet signs a plain Uniswap router call with the minimum out. No Corbel contract and no Corbel fee."],
            ]}
          />
        </Sec>
        <Sec id="exit" n="03" title="The exit plan">
          <P>Enter what you hold and, if you want, what you paid. Corbel simulates selling all of it now and in four parts, and shows the gain or loss of a full sale at today&apos;s depth.</P>
        </Sec>
      </>
    ),
  },
  {
    slug: "big-swaps",
    group: "Layers",
    code: "D-19",
    title: "Big swaps and selling in parts",
    lede: "Where the large money moved in the last day, and what a big sell costs in one piece against several.",
    sections: [
      { id: "big", title: "Big swaps" },
      { id: "parts", title: "Sell in parts" },
    ],
    body: () => (
      <>
        <Sec id="big" n="01" title="Big swaps">
          <P>{`Single swaps of $${1}K and up in the busiest tokens, kept for 24 hours. The tape lists them newest first; Tokens shows net flow per token; Wallets ranks who moved the most. The wallet is the signer of the transaction once read, not the router the pool paid.`}</P>
        </Sec>
        <Sec id="parts" n="02" title="Sell in parts">
          <P>Pick a token and an amount. Six splits are simulated against the live pool: one sale, then two, three, five, eight and twelve parts. Each part pays its own price impact on a smaller trade, so parts often get more in total, unless the price keeps falling between them.</P>
          <Callout tone="risk">Waiting between parts is a bet that other buyers bring the price back. If they do not, the impact saved is lost to the fall.</Callout>
        </Sec>
      </>
    ),
  },
  {
    slug: "guard",
    group: "Layers",
    code: "D-20",
    title: "Agent guard",
    lede: "A policy every agent trade must pass before it signs, checked live and callable as one GET request.",
    sections: [
      { id: "gates", title: "The gates" },
      { id: "use", title: "Using it from an agent" },
    ],
    body: () => (
      <>
        <Sec id="gates" n="01" title="The gates">
          <DTable
            code="G-01" title="GATES" cols={["Gate", "Refuses a trade when"]}
            rows={[
              ["Size", "it is larger than the cap, in what the agent pays"],
              ["Score", "the token's Corbel Score is under the floor"],
              ["Sells go through", "a simulated sell back fails"],
              ["Exit pays now", "a sale now returns too little of the cost"],
              ["No transfer tax", "a transfer tax is found"],
              ["Route fills", "no route fills at the latest block"],
              ["Impact", "the price impact is over the cap"],
              ["No hooks", "the only route is a v4 pool with an unknown hook"],
            ]}
          />
        </Sec>
        <Sec id="use" n="02" title="Using it from an agent">
          <P>Call the guard before every trade and trade only on allow. Nothing is signed or sent by the guard; it reads and simulates.</P>
          <Code code="G-02" title="REQUEST" lang="HTTP" text={`GET ${BASE}/api/guard?token=0x…&side=buy&pay=USDG&amount=100&minScore=60&maxImpact=0.02&must=honeypot,exit,tax&maxIn=500&hooks=0

→ 200 { "verdict": "allow" | "deny", "rules": [ … ], "failed": [ … ] }`} />
        </Sec>
      </>
    ),
  },
  {
    slug: "security",
    group: "Safety",
    code: "D-21",
    title: "Security in short",
    lede: "Your wallet signs every move. Corbel never holds your keys. The full page lists every tool, what our servers keep, fees and contracts.",
    sections: [{ id: "short", title: "The short version" }],
    body: () => (
      <>
        <Sec id="short" n="01" title="The short version">
          <Facts
            rows={[
              ["Keys", "Never seen, asked for or stored by Corbel."],
              ["Swaps", "A plain Uniswap router call your wallet signs, with a minimum out. No Corbel fee."],
              ["Sign-in", "One signed message, never a transaction."],
              ["Funds held", "Only Predict stakes, in the Predict contract, until a market settles."],
              ["Owner", "Corbel's contracts belong to a 2-of-3 Safe."],
              ["Report", `${BRAND.email}, subject “Security”.`],
            ]}
          />
          <Next items={[{ href: "/security", code: "SEC", title: "The full security page", text: "Every tool, servers, fees, contracts and platforms." }]} />
        </Sec>
      </>
    ),
  },
  {
    slug: "glossary",
    group: "Reference",
    code: "D-22",
    title: "Glossary",
    lede: "The words used across Corbel, in one place.",
    sections: [{ id: "words", title: "Words" }],
    body: () => (
      <>
        <Sec id="words" n="01" title="Words">
          <DTable
            code="W-01" title="GLOSSARY" cols={["Word", "Meaning"]}
            rows={[
              ["Honeypot", "A token you can buy but not sell back."],
              ["Transfer tax", "A cut the token contract takes from every transfer or trade."],
              ["Price impact", "How far your own trade moves the pool's price against you."],
              ["Slippage", "How far the price may move before your swap reverts; set as a minimum out."],
              ["Bonding curve", "A launchpad's own price formula a token sells on before it has a DEX pool."],
              ["Graduation", "When a curve token gets its DEX pool."],
              ["Hook", "Code a Uniswap v4 pool runs on every swap; it can take fees or refuse trades."],
              ["Liquidity lock", "LP tokens burned or locked so the pool cannot be pulled."],
              ["Lookalike", "A token that copies another token's name or ticker."],
              ["Mandate", "The rules an agent's trades must pass, enforced by a contract."],
              ["Bond", "Money an agent puts up that the owner is paid from when it breaks a rule."],
              ["USDG", "The dollar stablecoin on Robinhood Chain that most pools and Predict stakes use."],
              ["Weekend gap", "The difference between a stock token's chain price and the last market close."],
            ]}
          />
        </Sec>
      </>
    ),
  },
  {
    slug: "predict",
    group: "Layers",
    code: "D-11",
    title: "Predict",
    lede: "YES/NO markets on what Corbel watches: whether a pool keeps its liquidity, and where a stock opens after the weekend.",
    sections: [
      { id: "kinds", title: "Two kinds of market" },
      { id: "pool", title: "A pool of stakes" },
      { id: "settle", title: "How a market settles" },
      { id: "state", title: "State" },
    ],
    body: () => (
      <>
        <Sec id="kinds" n="01" title="Two kinds of market">
          <DTable
            code="P-01" title="KINDS" cols={["Kind", "Question", "Settled by"]}
            rows={[
              ["Survival", "Will this pool still hold its line of liquidity at every check next week?", "The chain: the pool's own reserves"],
              ["Price", "Will this pool's token trade at or above a price when the market expires?", "The chain: the pool's own time-weighted price"],
            ]}
          />
        </Sec>
        <Sec id="pool" n="02" title="A pool of stakes">
          <P>YES stakes and NO stakes form two pots. There is no market maker, so a thin market cannot be drained through its price.</P>
          <Steps
            items={[
              ["Stake", `Put USDG on YES or NO until the market closes. A stake placed at the open weighs ${PREDICT.early}% more; the bonus falls to zero at close.`],
              ["Win", "Winners get their stake back plus the losing pot, split by weight."],
              ["Fee", `${PREDICT.fee}% of the losing pot goes to the Gap Fund. Nothing else is taken.`],
            ]}
          />
        </Sec>
        <Sec id="settle" n="03" title="How a market settles">
          <P>Survival: after close anyone can check the pool. The contract keeps the lowest reserve it sees, and reads it once more at expiry. Pulling liquidity at one check is enough for NO; adding it back for a moment cannot buy YES.</P>
          <P>Price: betting closes before an averaging window (half an hour to a day) that ends at expiry. Anyone records the start of the window; after expiry anyone settles. The outcome is the pool&apos;s own time-weighted average price over the window against the line, read from the pool&apos;s cumulative prices. Nobody proposes an outcome and nobody rules on one; a missed window refunds.</P>
          <Callout>{`If either side is empty, if nobody won, or if a market is not settled within ${PREDICT.stallDays} days of expiry, every stake is refunded.`}</Callout>
        </Sec>
        <Sec id="state" n="04" title="State">
          <P>CorbelPredict is live on Robinhood Chain mainnet. The Markets page shows a card for every open market and for every tracked pool that has none yet. Yes or No on a card opens a ticket: pick an amount, see what it pays if that side wins as the pots stand, and stake. On a pool with no market, the first stake opens the market (half of today&apos;s reserve as the line, stakes close in two days, watched for five more) and then stakes: two signatures.</P>
          <P>Every ticket carries research from the chain and our index: how often new pools were drained this week, the creator&apos;s record, the pool&apos;s age, holders and insiders, copied tickers, and the cushion over the line. Each row says which way it leans.</P>
          <Callout tone="not" title="NOT AUDITED">The contract is tested in-house, including a solvency fuzz: every claim together never exceeds what it holds. It has no external audit yet. Stake small.</Callout>
          <Callout tone="risk">A stake can be lost in full. A thin pool&apos;s average price can still be pushed by someone who holds it there for the whole window.</Callout>
        </Sec>
      </>
    ),
  },
  {
    slug: "app-overview",
    group: "Start",
    code: "D-24",
    title: "The Overview page",
    lede: "The first page of the app: the chain as it moves, one page per part of Corbel, and the tools for that part right under it.",
    sections: [
      { id: "stage", title: "The stage" },
      { id: "deck", title: "The deck" },
      { id: "board", title: "The board under it" },
    ],
    body: () => (
      <>
        <Sec id="stage" n="01" title="The stage">
          <P>A drawing of the network over a range of mountains: wallets, pools, agents, models and a vault, with transactions moving between them. The corners hold the latest block, the gas price, swaps in the last 30 hours and launches today.</P>
        </Sec>
        <Sec id="deck" n="02" title="The deck">
          <P>Seven pages: Check, Trade, Stocks, Earn, Agents, Predict, AI and GPUs. Each holds a live figure and the rows behind it, and every row opens the tool it is about. The pages turn on their own; a hover holds them, the arrows and the tabs turn them by hand.</P>
        </Sec>
        <Sec id="board" n="03" title="The board under it">
          <DTable
            code="O-01" title="BLOCKS PER PAGE" cols={["Page", "Blocks"]}
            rows={[
              ["Check", "Check a token by address or ticker · tokens nearest graduation · what the launch agent flagged · the agent's brief"],
              ["Trade", "Quote a swap at the latest block · movers rising and falling · your watchlist · the largest swaps"],
              ["Stocks", "Stock tokens moving · the real market's clock · where stock tokens trade · find a stock token"],
              ["Earn", "What a pool paid for an amount you pick · the steadiest pools · your watchlist"],
              ["Agents", "Ask the guard if a trade is allowed · the contract's decisions · five gates and what each stopped"],
              ["Predict", "Markets with Yes and No · what sits in the pots · how a market settles"],
              ["AI and GPUs", "Ask a model · the cheapest text models · which GPU fits a model"],
            ]}
          />
        </Sec>
      </>
    ),
  },
  {
    slug: "launch-agent",
    group: "Layers",
    code: "D-25",
    title: "The launch agent",
    lede: "An AI agent that reads every launch on Robinhood Chain and says what stands out, every ten minutes.",
    sections: [
      { id: "reads", title: "What it reads" },
      { id: "flags", title: "What it flags" },
      { id: "near", title: "Near graduation" },
      { id: "limits", title: "What it is not" },
    ],
    body: () => (
      <>
        <Sec id="reads" n="01" title="What it reads">
          <P>The last day of launches from Corbel&apos;s own index: tokens created on launchpad curves and pools created directly. The facts are worked out by rule first, then a small model writes them up in four short lines. It only rewords the facts it is handed. If the model is not available, the rules write the lines.</P>
        </Sec>
        <Sec id="flags" n="02" title="What it flags">
          <DTable
            code="L-01" title="FLAGS" cols={["Flag", "Meaning"]}
            rows={[
              ["serial creator", "One wallet launched three or more tokens in a day."],
              ["copies money", "A new token took a ticker of the chain's money, such as USDG or ETH."],
              ["same ticker", "One ticker launched four or more times, from different contracts."],
              ["drained", "New pools that already lost their liquidity."],
            ]}
          />
        </Sec>
        <Sec id="near" n="03" title="Near graduation">
          <P>Tokens still on a launchpad curve, ranked by how far the curve is toward graduating to a pool. Where the launchpad publishes its own progress, that is used; otherwise Corbel reads how much of the curve&apos;s supply has left the launchpad&apos;s contract.</P>
        </Sec>
        <Sec id="limits" n="04" title="What it is not">
          <Callout tone="risk">A flag is a reason to open the Check, not a verdict. A clean brief does not make a token safe.</Callout>
        </Sec>
      </>
    ),
  },
  {
    slug: "networks",
    group: "Start",
    code: "D-26",
    title: "Networks",
    lede: "Corbel runs on Robinhood Chain today. Elysium is next.",
    sections: [
      { id: "live", title: "Live" },
      { id: "next", title: "Next" },
    ],
    body: () => (
      <>
        <Sec id="live" n="01" title="Live">
          <Facts rows={[["Robinhood Chain", `Mainnet, chain id ${FACTS.chainId.value}. Every tool.`]]} />
        </Sec>
        <Sec id="next" n="02" title="Next">
          <Facts rows={[["Elysium", "A Layer 2 for Hyperliquid, gas in HYPE. Check, Radar and swaps first; Predict and agent mandates after their contracts are deployed there. Stock tokens stay on Robinhood Chain."]]} />
          <P>The network switcher in the header lists both. Elysium shows as soon until it opens.</P>
        </Sec>
      </>
    ),
  },
  /* ------------------------------------------------------------------ REFERENCE */
  {
    slug: "api",
    group: "Reference",
    code: "D-08",
    title: "API",
    lede: "Every read in the app is a plain GET request that returns JSON. No key, no signature, nothing is written.",
    sections: [
      { id: "basics", title: "Basics" },
      { id: "endpoints", title: "Endpoints" },
      { id: "limits", title: "Limits and errors" },
    ],
    body: () => (
      <>
        <Sec id="basics" n="01" title="Basics">
          <Facts
            rows={[
              ["Base URL", <code key="b" className="font-mono text-[0.8125rem]">{BASE}</code>],
              ["Method", "GET only. Nothing here writes or signs."],
              ["Format", "JSON. Amounts in raw token units are strings."],
              ["Block", "Reads run at the latest block. Responses carry the block number."],
            ]}
          />
        </Sec>
        <Sec id="endpoints" n="02" title="Endpoints">
          <DTable
            code="D-08" title="ENDPOINTS" cols={["Request", "Returns"]} mono={[0]}
            rows={[
              ["GET /api/token?q=<address|ticker>", "The trust report: seven checks. A ticker with many contracts returns candidates to pick from."],
              ["GET /api/quote?from=&to=&amount=", "Every route, simulated, with the best one marked. from and to: ETH, WETH, USDG or an address."],
              ["GET /api/guard?token=&side=&amount=", "A pre-trade verdict under a policy: allow or deny, with every rule. Policy: maxIn, minScore, maxImpact, must, hooks=0, allow, deny."],
              ["GET /api/radar", "Newest pools from the index, with launcher history and liveness."],
              ["GET /api/launches", "Launch analytics for the week: launchers, venues, hooks, pools per hour."],
              ["GET /api/mandate", "The attack scenarios."],
              ["GET /api/mandate?s=<id>", "Run one: a real mandate inside an eth_call. Shows the rule, the strikes and the bond left."],
              ["GET /api/net", "The head block and the gas price."],
            ]}
          />
          <Code code="D-08" title="QUOTE" text={QUOTE_SAMPLE} lang="JSON · shortened" />
        </Sec>
        <Sec id="limits" n="03" title="Limits and errors">
          <P>Requests are rate-limited per caller. Over the limit you get <code>429</code> and a <code>retry-after</code> header in seconds. Wait that long and ask again.</P>
          <Callout tone="not" title="NOT BUILT">There are no API keys and no higher tiers yet.</Callout>
        </Sec>
      </>
    ),
  },
  {
    slug: "mcp",
    group: "Reference",
    code: "D-09",
    title: "MCP for agents",
    lede: "Add Corbel to any MCP client. The agent gets Trust checks, quotes, a pre-trade guard, the radar and the mandate lab as tools. It reads only; nothing signs.",
    sections: [
      { id: "setup", title: "Add it to a client" },
      { id: "tools", title: "Tools" },
    ],
    body: () => (
      <>
        <Sec id="setup" n="01" title="Add it to a client">
          <Code code="D-09" title="MCP CONFIG" text={MCP} lang="JSON" />
        </Sec>
        <Sec id="tools" n="02" title="Tools">
          <DTable
            code="D-09" title="SIX TOOLS" cols={["Tool", "Arguments", "Does"]} mono={[0, 1]}
            rows={[
              ["trade_guard", "token, side, amount, policy", "Allow or deny one trade under the owner's policy, rule by rule. Trade only on allow."],
              ["trust_check", "query", "Seven checks on a token: an address or a ticker."],
              ["quote", "from, to, amount", "Simulates a swap on every route at the latest block."],
              ["radar", "limit (1 to 50)", "Newest pools with launcher count and drained state."],
              ["mandate_scenarios", "none", "Lists the attacks for the mandate lab."],
              ["mandate_try", "scenario", "Runs one attack against a real mandate in a simulation."],
            ]}
          />
          <Callout tone="risk">An agent that reads a clean report can still lose money. Give it limits, not trust.</Callout>
        </Sec>
      </>
    ),
  },
  /* ------------------------------------------------------------------ SAFETY */
  {
    slug: "risks",
    group: "Safety",
    code: "D-10",
    title: "Risks and limits",
    lede: "What can go wrong, said plainly. Read this before you rely on anything here.",
    sections: [
      { id: "states", title: "What each state means" },
      { id: "wrong", title: "What can go wrong" },
    ],
    body: () => (
      <>
        <Sec id="states" n="01" title="What each state means">
          <DTable
            code="D-10" title="STATES" cols={["State", "Banner you will see"]}
            rows={(["live", "preview", "closed", "soon"] as const).map((s) => [<StatusChip key={s} status={s} />, STATUS_BANNER[s]])}
          />
        </Sec>
        <Sec id="wrong" n="02" title="What can go wrong">
          <Callout tone="risk" title="NOT AUDITED">Nothing here is audited. You could lose everything you put in.</Callout>
          <Callout tone="risk" title="ONE BLOCK">A simulation shows one block. The next block can differ, and an owner can change a contract after you check it.</Callout>
          <Callout tone="risk" title="THE CHAIN">Robinhood Chain runs on one sequencer. If it stops, transactions stop with it. Leaving through the canonical bridge takes days.</Callout>
          <Callout tone="risk" title="STOCK TOKENS">Stock tokens are debt instruments of Robinhood Assets (Jersey), not shares.</Callout>
          <P>Legal pages: <a className="text-leaf underline-offset-4 hover:underline" href="/legal/risk">risk disclosure</a>, <a className="text-leaf underline-offset-4 hover:underline" href="/legal/privacy">privacy</a>.</P>
        </Sec>
      </>
    ),
  },
];

export const GROUPS = ["Start", "Layers", "Reference", "Safety"] as const;
export const docBySlug = (slug: string) => DOCS.find((d) => d.slug === slug);
