# Corbel contracts

`packages/contracts`. Solidity 0.8.26, via-IR, Cancun. No external libraries. Not audited.

**On Robinhood Chain (4663):** CorbelPredict `0x2AC31E9188ba7CFE4C42D4372BacA24dBEA80f63`; CorbelMandates (rule 06 POOL) `0xe855bd406386a2f434d4b07f9065fdd8b82cc30b`, verified on Blockscout, with one demo mandate run by the team. Two earlier mandate factories (`0x5d4e2ac5…de04`, `0x484588e4…1d81d`) ran the code before rule 06; their mandates are retired (every asset unlisted, owner funds withdrawn). CorbelOrders, CorbelVault, CorbelAgentVault and CorbelLaunch are not deployed.

| Contract | Layer | What it guarantees |
|---|---|---|
| `CorbelVault` | Account (Corbel One) | ERC-4626 over USDG. Withdrawals can never be paused. The guardian can only pause deposits, set a cap, or renounce. No admin withdraw, sweep or upgrade. A virtual share offset (10^6) blunts first-depositor inflation. Holds USDG idle: yield is a later module. |
| `CorbelLaunchpad`, `CorbelSale`, `CorbelToken` | Launch | Fixed supply (1B), no owner, no mint, no tax. Two-way curve (800M) with a deadline. If the target is not met in time, everyone sells back with no fee; the curve always holds enough ETH. On sell-out: a v4 pool (ETH/token, 1%, spacing 200, no hook) at the curve's last price, full-range liquidity from all raised ETH plus up to 200M tokens, owned by the sale, which has no remove function. Unused tokens burned. Wallet-to-wallet transfers stay off until graduation, so nobody can seed the pool early. A pool initialized by someone else first is pushed back to the curve price within a budget, or graduation refuses. |
| `CorbelOrders` | Trade | Limit, DCA and TWAP as one primitive: N slices, an interval, a floor per slice. Input escrowed; anyone fills a due slice through the V2 router and earns at most 1%. Output goes straight to the owner; the floor is checked on what arrived. The owner cancels any time. |
| `CorbelMandate`, `CorbelMandates` | Agents (main) | The agent posts a USDG bond. Five skills: ASSETS, SIZE, BUDGET, PRICE (V2: pool quote − slippage; v4: the contract sets the price limit itself; pool fee ≤ 1%, no dynamic fee, hooks only if approved), WINDOW (UTC hours, weekdays, cooldown). A broken rule does not revert: no trade, `slashBps` of the bond to the owner, the third strike freezes the agent and seizes the rest. Bond leaves only after a 1-day unbond; the owner can never take it. Factory emits `Created` for the site. |
| `MandateLab` (src/lab) | Site only | Never deployed. Its creation code runs inside one eth_call on /app/agents/break: buys USDG on the real pool, deploys a real mandate, posts a bond, runs the visitor's attack, returns the result. |
| `CorbelAgentVault` | Agents (earlier, simpler) | A bot trades but never withdraws. Listed tokens only, per-trade and per-day input caps, slippage bounded by the pool's own quote in the same block, output stays in the vault, memo per trade (on-chain decision log). The owner withdraws, edits limits, or freezes by setting the agent to zero. |

## Tests

```
pnpm --filter @corbel/contracts test:contracts      # local, no network
pnpm --filter @corbel/contracts relay               # terminal 1: RPC relay (needs CHAIN_READS=1)
pnpm --filter @corbel/contracts test:fork           # terminal 2: forked Robinhood Chain via 127.0.0.1:8547
```

30 tests, all passing on 2026-11-13: Mandate 10 on the fork (NVDA $9,000 stopped and slashed, 99% fee trap pool, 1.5% fee pool, loose minOut, weekend, three strikes and freeze, bond safe from the owner and unbond delay, V2 and v4 trades inside the rules, strangers); Vault 6 (round trip, inflation attack, pause never blocks withdrawals, cap and roles, third-party redeem, taxed asset), Launch 5 against the real v4 PoolManager (curve buy and sell, transfer lock, failed-sale refund, graduation with locked liquidity and a live pool, front-run initialize realigned), Orders 4 and Agent 5 against the real V2 router, WETH and USDG.

## Toolchain without leaks

- Compiler: `tools/solc-windows-amd64-v0.8.26+commit.8a97fa7a.exe`, SHA-256 checked against binaries.soliditylang.org's list. `forge` runs `offline = true` and never downloads.
- Forks: `forge` and `anvil` only talk to `127.0.0.1:8547`. The relay sends every request through the shared rate limiter, starts only with `CHAIN_READS=1`, and refuses any signing or sending method.

## Known limits

- Liquidity shares in v4 are in liquidity units; the full-range bounds use precomputed √prices for ticks ±887200.
- `CorbelOrders` and `CorbelAgentVault` route through V2 only. v4 routing comes with a router adapter.
- Not audited. Nothing here should hold real funds before an audit.

## Mainnet (owner-run)

`packages/contracts/scripts/deploy-mandates.ts` (owner-run, needs `CHAIN_READS=1`): dry run first, `--yes` to send; checks chain 4663 and prints gas. Verification input: `packages/contracts/verify/CorbelMandates.standard-input.json` (solc 0.8.26, via-IR, 200 runs, cancun) for robinhoodchain.blockscout.com.

