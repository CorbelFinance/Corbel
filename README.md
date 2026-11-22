<div align="center">

<img src=".github/assets/corbel-logo.png" alt="Corbel" width="112" />

# Corbel

**The all-in-one app for Robinhood Chain.**
Check a token before you buy it, swap at the best route, earn from pool fees, run bonded agents and use AI models, from one wallet.

[App](https://corbel.finance) · [Docs](https://corbel.finance/docs) · [Contracts](docs/CONTRACTS.md) · [Security](https://corbel.finance/security) · [X](https://x.com/corbelfinance) · [Telegram](https://t.me/corbelfinance)

<img src=".github/assets/banner.png" alt="Corbel: the all-in-one app for Robinhood Chain" width="760" />

</div>

## What you can do

| | Section | What it does |
|---|---|---|
| 01 | **Check** | Seven checks on any Robinhood Chain token before you buy: a simulated buy and sell, exit now, tax, owner powers, liquidity lock, ticker clones and the creator's record. One score with the reasons behind it. Also: what happened to every new pool, how much of the volume is bots, whether buyers still hold, every token one wallet launched, and how accurate the check has been. |
| 02 | **Trade** | Quotes every route (V2, v4, two hops through ETH or USDG) at the latest block. Practice on paper USDG with no wallet. Orders (limit, take profit, stop, DCA, TWAP) wait in your browser and open the swap for your wallet to sign. Sell many small holdings into ETH, and see every swap with who signed it. |
| 03 | **Earn** | Pool fees and positions in one place, with the numbers each pool actually paid and the token check run before a deposit. |
| 04 | **Wallet** | See which contracts can move your tokens, and revoke the risky ones with one transaction you sign. |
| 05 | **Agents** | Bots that trade inside rules you set. Every agent posts a bond; a trade that breaks a rule is stopped on-chain and the bond pays for it. An agent gets its own wallet, made in your browser. It can draft rules from your practice trades, backtest exits on real swaps, and be scored in a survival league or on the Prop desk. |
| 06 | **AI & GPUs** | Text, image, film and sound models in one chat, free after a wallet sign-in, with more for $CORBEL holders. Full holders get free GPU time with a picture editor, a chat or a notebook. |

Corbel never asks for a key or a seed phrase. Everything a wallet signs is shown in plain words before it is signed.

## Quick start

Requires Node.js 22+ and pnpm.

```bash
pnpm install
cp .env.example apps/web/.env.local   # chain reads stay off until CHAIN_READS=1
pnpm dev                              # http://localhost:3000
```

The site runs without any keys. Chain reads, the AI chat and media need their own keys in `apps/web/.env.local`; without them those parts stay off and everything else works.

### Use Corbel from an AI agent (MCP)

`packages/mcp` is a dependency-free MCP server that gives an agent Corbel's read-only tools: token checks, simulated quotes, a pre-trade guard, the new pool radar and the mandate lab. It never signs or sends anything.

```bash
node --experimental-strip-types packages/mcp/src/server.ts
```

## Contracts (Robinhood Chain, chain ID 4663)

Solidity 0.8.26, via-IR, no external libraries. **Not audited.** Reviewed in-house, demo amounts only. Every live contract is verified on Blockscout.

| Contract | Status | What it guarantees |
|---|---|---|
| `CorbelPredict` | **Live** [`0x6223…73d9`](https://robinhoodchain.blockscout.com/address/0x62230624777b012a316e365c7ab3677159cd73d9) | YES/NO markets in USDG as a pool of stakes, settled from the chain alone: survival markets by the pool's lowest reserve, price markets by the pool's own time-weighted average price. No resolver. If a side is empty, the window is missed or settlement stalls, everyone is refunded. |
| `CorbelMandates` / `CorbelMandate` | **Live** [`0xdea0…4d36`](https://robinhoodchain.blockscout.com/address/0xdea049d3e6df029afe5542d95428ea057f2d4d36) | The agent posts a USDG bond and trades only inside its rules: assets, size, budget, price, time window, and (rule 06) only pools the owner approved, near the owner's price mark. The owner can replace a bonded agent at any time; the bond goes back to it. One demo mandate, run by the team. |
| `CorbelAgentVault` | Not deployed | A bot trades inside caps and only through pairs the owner approved; it can never withdraw. |
| `CorbelOrders` | Not deployed | Limit, DCA and TWAP as one primitive. Input is escrowed; output goes straight to the owner, with a floor per slice. |
| `CorbelLaunch` | Not deployed | Fixed supply, no owner, no mint, no tax. The v4 pool is guarded by a hook until graduation. If the target is not met in time, everyone sells back with no fee. |
| `CorbelVault` | Not deployed | ERC-4626 over USDG. Withdrawals can never be paused. No admin withdraw, sweep or upgrade. |

Retired: the first CorbelPredict (`0x2AC3…0f63`, price markets had a resolver; its one market was the team's own 0.1 USDG test) and three earlier mandate factories (`0x5d4e…de04`, `0x4845…1d81d`, `0xe855…c30b`). Their mandates have every asset unlisted and the owner's funds withdrawn.

**Security fixes from the 2026-11-20 public review:**

| Finding | Fix | Where |
|---|---|---|
| A bonded agent could route through its own pools and take the daily budget | Rule 06: owner-approved pools, price held to the owner's mark | live in `0xdea0…4d36`; refused on mainnet: [tx](https://robinhoodchain.blockscout.com/tx/0xffbc4d37dc2f4d9a97fc8d93532b227f7307994b1cff597d758e3dd6f63a66b2) |
| Same in `CorbelAgentVault` | Owner-approved pairs and price mark | in the source (not deployed) |
| The owner could not revoke a bonded agent | `setAgent` works at any time; the old agent's bond goes back to it | live in `0xdea0…4d36`; on mainnet: [tx](https://robinhoodchain.blockscout.com/tx/0xb624936c903bcffe89b0263ffbd981718e6455083575d33f3045dd1b3f7ef4ea) |
| A launch could be blocked by pre-seeding its v4 pool | `CorbelLaunchGate` hook: only the sale opens the pool before graduation | in the source (not deployed) |
| The Predict resolver proposed outcomes and ruled on challenges to them | Resolver removed: price markets settle from the pool's TWAP | live in `0x6223…73d9` |
| `packages/data` and the contract scripts were missing; the build failed | Included; a clean clone typechecks and builds | in the source |

Full reference: **[docs/CONTRACTS.md](docs/CONTRACTS.md)**.

## Who can do what

| | You (owner) | Agent | Anyone else |
|---|---|---|---|
| Deposit | ✅ | — | ✅ (it's just a transfer) |
| **Withdraw** | ✅ any time | ❌ never | ❌ |
| Trade inside the mandate | ❌ | ✅ only within your rules | ❌ |
| Change rules, revoke the agent | ✅ | ❌ | ❌ |
| Post or unbond the bond | — | ✅ (unbond after a delay) | ❌ |

A trade that breaks a rule does not go through: part of the agent's bond is cut and paid to you, and after a set number of strikes the agent is frozen and the rest of the bond is yours. Your own withdraw can never touch the bond.

## How a token is checked

The score reads what was measured, not only pass or fail: the round trip of a buy and a sell, who holds the supply, owner powers, liquidity across venues and the creator's record. The method, the weights and the caps are in **[docs/TRUST_ENGINE.md](docs/TRUST_ENGINE.md)**.

## Run the tests

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # site and packages
pnpm --filter @corbel/web exec playwright test           # end-to-end
pnpm --filter @corbel/contracts test:contracts           # contracts, local, no network
```

## Repository layout

```
apps/web/              the site and the app (Next.js 16, React, Tailwind 4)
  app/api/             token checks, quotes, holders, pools, chat, media, wallet sign-in
  components/app/      the tools: check, terminal, radar, practice, orders, earn, approvals, agents, AI chat
  lib/                 chain reads, the trust score, the claims check, fair-use limits
packages/config/       brand, chain, flags, facts and every line of copy
packages/contracts/    Solidity contracts, tests and verification inputs
packages/indexer/      a small log indexer for launches and pools
packages/mcp/          read-only MCP server for AI agents
packages/ui/           design tokens and primitives
docs/                  trust engine, chain notes, contracts and copy rules
```

## Security

Found a problem? Write to **contact@corbel.finance**. Please do not open a public issue for a vulnerability.

## License

[MIT](LICENSE)
