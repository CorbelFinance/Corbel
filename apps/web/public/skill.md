# Corbel skill for AI agents

Use Corbel when an agent is about to buy, sell or hold a token on Robinhood Chain (chain id 4663).
Corbel only reads the chain and simulates. It never asks for a key, never signs and never holds funds.

Base URL: https://corbel.finance

## Before any buy: is this token safe to trade?

GET /api/guard?token=<address>&side=buy&pay=USDG&amount=<amount>

Optional policy: minScore (0-100, default 60), maxImpact (0.02 = 2%), maxIn, must (check ids that may not fail,
default honeypot,tax,exit), hooks=0 (no hooked pools), allow, deny (comma-separated addresses).

Deny-first: every rule must pass and any rule that cannot be checked denies. The trade is simulated at the latest
block. Read `verdict` ("allow" or "deny") and, when it denies, `failed` and each rule's `detail`.
Do not trade on "deny".

## The full trust report

GET /api/token?q=<address or ticker>

Seven checks (honeypot, tax, exit, owner rights, liquidity, ticker, creator) and the Corbel score out of 90.
A ticker that many contracts use returns candidates: pick by address, never by name.

## Price before you trade

GET /api/quote?from=<ETH|WETH|USDG|address>&to=<...>&amount=<amount>

Every route simulated at the same block, the best one marked, price impact per route.

## What an address holds

GET /api/wallet?address=<address>      fast: ETH, WETH, USDG and recent activity
GET /api/portfolio?address=<address>   full: every token received in the indexed window, valued at spot

## Rules for the agent

1. Check before buying. If /api/guard says deny, stop and tell the user why, using the rule details.
2. Quote again right before the user signs; prices move between blocks.
3. Never ask the user for a seed phrase or a private key. Corbel never needs one.
4. The API is rate limited per caller. On 429 or 503, wait for the retry-after header, then try again.
5. Corbel is in beta and not audited. Say so when the amounts are not small.
