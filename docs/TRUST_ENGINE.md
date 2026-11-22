# Trust engine (P0, read-only)

`GET /api/token?q=<address | ticker>` runs seven checks against Robinhood Chain (4663). Nothing is ever sent: every read is an `eth_call`.

| Check | How |
|---|---|
| Honeypot | Round-trip loss graded: under 10% pass, under 50% caution, above fail (a sell that works but returns a fraction is a trap too). `contracts/TrustSim.sol` is injected into an `eth_call` via state override, buys the token and sells it straight back. V2 (WETH, USDG) and v4 (native ETH, WETH, USDG, either side). |
| Exit now | Sell the bought amount against the pool as it is now, with no buy in front. Zero or under half the cost back is a caution: holders can only sell into new buys. |
| Buy / sell tax | Same simulation: expected vs received on the buy, sent vs arrived on the sell. |
| Owner rights | `owner()`, EIP-1967 proxy slot, and admin function selectors in the bytecode (mint, pause, blacklist, fees, limits). |
| Liquidity lock | V2: share of LP on burn addresses, plus base-side depth (thin below 0.05 WETH or 100 USDG). v4: ModifyLiquidity events replayed per position; each position's controller classified as burned NFT, the hook, a contract or a wallet. |
| Ticker vs contract | Other indexed tokens with the same symbol (clones). |
| Creator history | Sender of the pool-creation tx; for ERC-4337 bundles, the `sender` of the UserOperationEvent that follows the pool's log, not the bundler (v4: from the event's tx; V2: from the index) and how many pools it launched. |

Base-token balances for the simulation (USDG, WETH) are found with `eth_createAccessList` on `balanceOf` when the RPC offers it (the public Robinhood RPC does not), else by trying Solidity/Vyper mapping slots 0..30 and the OpenZeppelin ERC-7201 slot. A slot counts when `balanceOf` turns non-zero (USDG stores scaled values). Works through proxies.

Simulation rules:
- V2 trade size is the smaller of the default (0.01 WETH, 10 USDG) and 1% of the pair's base reserve. A trade that empties a dust pool sells back for almost nothing lost and would read as a clean pass.
- The pair is `sync()`ed first, so unsynced surplus can't make the round trip look cheaper.
- Sell tax counts only what reached the pair (pair balance delta).
- A sell revert on a pool below 1/1000 of the thin threshold is `unknown`, not `fail`: the pool can't pay out, which says nothing about the token. When every V2 pair is that thin, v4 pools are tried too.
- Of several venues, a clean round trip wins; a run that could not start never hides a revert seen elsewhere.
- Expected round trip on a healthy V2 pair is about 0.6% (two 0.3% fees).

Contract map: `packages/data/src/trust/addresses.ts` (read from the chain 2026-11-12).
Rebuild the simulator: `node packages/data/contracts/compile.cjs packages/data/contracts/TrustSim.sol packages/data/src/trustSimBytecode.ts` (needs `solc@0.8.26`, dev only).

## Index

`pnpm --filter @corbel/indexer start` walks PairCreated (V2) and Initialize (v4) logs in 25 000-block windows (the RPC limit is 30 000), backfills `CORBEL_BACKFILL_DAYS` and follows head. SQLite via `node:sqlite`, file `<repo>/data/corbel.db` (git-ignored). The web API opens it read-only; without it, ticker search is off and v4 pools are found by a bounded live scan.


## Liveness

In follow mode the indexer re-reads pools in rotating batches of 600 every 2 minutes (`dead`, `checked_at` columns). V2: dead when the WETH/USDG side is below 1/1000 of the thin threshold. v4: live when liquidity is in range, otherwise unknown (`null`). Zero in-range liquidity is not proof of death, because a swap crosses ticks to reach positions further out. Creator history counts drained pools only among those whose liveness is known. One-off refresh: `pnpm --filter @corbel/indexer start --once --refresh`.

## Endpoints (all read-only, same origin)

| Endpoint | What |
|---|---|
| `GET /api/token?q=` | Trust report (address) or ticker candidates (index). |
| `GET /api/radar?kind=&before=&limit=` | Newest pools from the index, with launcher pool count and liveness. Index only, no chain call. |
| `GET /api/wallet?address=` | ETH, WETH, USDG balances, tx count, contract or wallet, pools launched. Cached 15 s. |
| `GET /api/net` | Latest block or null. |

App tabs: Trust → Check / Radar / API (live console), Account → Dashboard (address read; Corbel One vault tiles stay "—" until deployed).

## Issuer-controlled tokens

`ISSUER_CONTROLLED` in `addresses.ts` (USDG only, verified on chain): owner/proxy powers read as a caution, not a fail. Stock tokens named "… • Robinhood Token" are not on the list until their issuer is verified.

## Quotes

`trust/quote.ts`, `GET /api/quote`. Every route (direct V2 pair, indexed v4 pools, two hops through ETH/WETH or USDG, with a 1:1 WETH unwrap between hops) runs as a real swap inside `eth_call` (`quoteV2` / `quoteV4` in TrustSim). Output is what arrived, so fees, hooks and taxes are included. Impact = the same route at 1/1000 size. A swap that runs but pays nothing is reported as an empty side of the price, not an error.

## RPC pool (lanes)

`limiter.ts`. Every chain request goes through lanes: `RPC_LANES` per endpoint (`RPC_URLS`). The least-loaded ready lane takes each request. A 429 pauses only that lane (Retry-After, else exponential) and the request moves on. 5xx, 403 or a node-specific JSON-RPC error (window, plan, pruning) send it to another lane, and five failures in a row rest a lane for 30 s. `eth_getLogs` wider than an endpoint's window (`#logs=N`) never goes to it. Each endpoint is checked for chain 4663 before use. Per lane: `RPC_CONCURRENCY` (4), `RPC_SPACING_MS` (60).

Free keyless endpoints tested 2026-11-13: `rpc.mainnet.chain.robinhood.com` (getLogs 25k+, state overrides, 30 parallel OK) and `robinhood.drpc.org` (getLogs up to 10k blocks on the free plan, state overrides OK). Paid providers with a key are an option for more traffic.

Base-token balance slots are pinned (`KNOWN_BALANCE_SLOTS`) so quotes never pay for slot discovery.

## Corbel score v2 (2026-11-19)

The score used to add up fixed points per result (pass 100, caution 60, unknown 50, fail 0), so tokens with the same
results got the same number. Now each check carries what was measured (`value`) and the score reads that number:

| Part | Weight | Measured as |
| --- | --- | --- |
| Exit | 35% | round-trip loss above the 0.6% pool fees cost (4 points per 1%), share of cost a buyer-size bag gets back, buy + sell tax (4 points per 1%) |
| Holders | 20% | from a full holders read: top 10 outside pools above 20% (1.2 per 1%), insiders (1.5 per 1%), creator above 5% (1 per 1%), under 200 holders (up to 20) |
| Control | 20% | owner powers and ticker, by result |
| Liquidity | 15% | USD liquidity across every venue on the chain ($1K = 0, $1M = 100, log scale) 70%, LP burned 30%; without the market, pool depth against the thin-pool line |
| Origin | 10% | creator result, 3 off per launch beyond the second, 40 off when most were drained |

A part with no data is left out and the rest re-weighted (a missing read never counts as a pass). Issuer stocks and
base assets are custodied by design, so their holders are not scored against them. Caps on top: cannot sell ≤ 10,
lookalike ≤ 25, transfer tax ≤ 30, exit returns a fraction ≤ 35, one wallet over half the supply ≤ 25, a measured exit
that gets back under half the cost ≤ 35, a measured round-trip loss over 25% ≤ 30. A pool whose LP check fails scores
at most 40 on liquidity, scaled by its depth. Ceiling 90.

Holders that are contracts (code on the chain: pools, lockers, vesting, routers) are tagged and kept out of the top 10
and the largest wallet, so a token whose supply sits in its own pool or locker is not read as held by one wallet.

## Claims against reality (2026-11-19)

`/api/reality` reads what a project says about itself and sets it against what can be checked:

1. Sources: its site and the pages it links, the token's own metadata, its public Telegram channel, its X profile
   text and its latest 20 own posts, its public code.
2. A model lists the claims a buyer relies on (shipped, planned, partner, metric, team), each with a quote. A claim is
   kept only when its quote runs in the fetched text in order (at most 15% of words off); otherwise it is dropped as
   not the project's words.
3. Only evidence of deeds backs or contradicts a claim: the site names this contract, code pushed in 30 days, the
   contracts it names have code on the chain. That a site loads or an account exists backs nothing.
4. The score is computed by code, never by the model: 50, +8 per backed claim (up to +32), −15 per contradicted,
   −3 per shipped or metric claim with nothing behind it (up to −15), contract named +6 / not −8, code +10, domain
   or X account under 30 days −8 each, insiders over 20% −10, creator with drained pools −15, no site and no X −20.
5. The word: REAL ≥ 75, LIKELY REAL ≥ 60, PARTLY REAL ≥ 40. "LARP" is said only on evidence against the project
   (a contradicted claim, or a score under 20); when nothing can be checked either way the word is UNPROVEN.
   Issuer stocks, base assets and bridged copies of outside assets get no score.
