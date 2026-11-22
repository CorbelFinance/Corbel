/**
 * Structured data for the app's spec tabs: contract register, order types, filler interface, shield rules,
 * prop desk terms. Everything here describes code in packages/contracts as it is; nothing is deployed yet.
 */
import type { LayerId } from "../flags";

export type ContractEntry = {
  name: string;
  layer: LayerId | "site";
  role: string;
  guarantees: string[];
  /** Forge tests that prove the guarantees (fork = against a fork of the live chain). */
  tests: { name: string; kind: "unit" | "fork" }[];
  deployed: false | { address: string; note: string };
};

const t = (kind: "unit" | "fork", ...names: string[]) => names.map((name) => ({ name, kind }));

export const CONTRACTS: ContractEntry[] = [
  {
    name: "CorbelVault",
    layer: "account",
    role: "ERC-4626 vault over USDG.",
    guarantees: [
      "Withdrawals can never be paused.",
      "The guardian can only pause deposits, set a cap, or renounce.",
      "No admin withdraw, sweep or upgrade.",
      "A virtual share offset blunts first-depositor inflation.",
    ],
    tests: t(
      "unit",
      "Deposit and redeem round trip",
      "Inflation attack does not pay",
      "Pause blocks deposits, never withdrawals",
      "Cap and guardian only",
      "Allowance for third-party redeem",
      "Taxed asset rejected",
    ),
    deployed: false,
  },
  {
    name: "CorbelOrders",
    layer: "trade",
    role: "Limit, DCA and TWAP as one primitive.",
    guarantees: [
      "Input is escrowed in the contract.",
      "Anyone may fill a due slice and earns a small tip.",
      "Output goes straight to the owner; the floor is checked on what arrived.",
      "The owner cancels any time and gets the rest back. No admin.",
    ],
    tests: t(
      "fork",
      "Limit fills at or above the price",
      "Limit above market waits",
      "DCA keeps its clock, cancel refunds",
      "Path must match the order",
    ),
    deployed: false,
  },
  {
    name: "CorbelLaunchpad",
    layer: "launch",
    role: "Bonding curve sale that graduates into a locked v4 pool.",
    guarantees: [
      "Fixed supply token: no owner, no mint, no tax.",
      "If the target is missed in time, everyone sells back with no fee.",
      "On sell-out, liquidity goes into a v4 pool owned by the sale, which has no remove function.",
      "Transfers stay off until graduation, so nobody can seed the pool early.",
    ],
    tests: t(
      "fork",
      "Buy and sell on the curve",
      "Transfers locked until graduation",
      "Failed sale refunds without fee",
      "Graduation locks liquidity in v4",
      "Pre-initialized pool is realigned",
    ),
    deployed: false,
  },
  {
    name: "CorbelMandates",
    layer: "agents",
    role: "Factory for bonded agent mandates with six rules.",
    guarantees: [
      "Only pools the owner approved, and only near the owner's price mark (rule 06).",
      "A broken rule does not trade; part of the bond goes to the owner.",
      "The third strike freezes the agent and seizes the rest.",
      "The bond leaves only after an unbond delay; the owner can never take it.",
      "Hooks only if approved; dynamic and trap fees are violations.",
    ],
    tests: t(
      "fork",
      "Oversized buy is stopped and pays the owner",
      "Weekend window is a rule",
      "Three strikes freeze and seize",
      "V2 trade within the mandate",
      "Loose min-out is slashed",
      "Pool fee above the cap is a violation",
      "v4 trade on a live pool",
      "Bond is not the owner's; unbond waits",
      "Trap pool fee is a violation",
      "Strangers cannot trade",
      "Report replay: an agent's own pool is a violation",
      "Pushing an approved pool then trading reverts",
      "Unapproved v4 pool is a violation",
      "Owner revokes a bonded agent; its bond goes back",
    ),
    deployed: { address: "0xdea049d3e6df029afe5542d95428ea057f2d4d36", note: "Verified on Blockscout. One demo mandate, run by the team." },
  },
  {
    name: "CorbelAgentVault",
    layer: "agents",
    role: "A bot trades the vault but can never withdraw.",
    guarantees: [
      "Listed tokens only, with per-trade and per-day caps.",
      "Slippage is bounded by the pool's own quote in the same block.",
      "Output stays in the vault, with a memo per trade.",
      "The owner withdraws, edits limits or freezes the agent.",
    ],
    tests: t(
      "fork",
      "Trade within limits stays in the vault",
      "Per-trade and daily caps",
      "Slippage bound is enforced",
      "Unlisted token and strangers",
      "Owner freezes and withdraws",
    ),
    deployed: false,
  },
  {
    name: "MandateLab",
    layer: "site",
    role: "Runs inside one eth_call on Break it. Never deployed.",
    guarantees: [
      "Buys on the real pool, deploys a real mandate, posts a bond, runs the attack, returns the result.",
    ],
    tests: [],
    deployed: false,
  },
];

export const ORDER_TYPES = [
  { type: "Limit", slices: "One", clock: "None", fills: "When the pool pays your floor or better." },
  { type: "DCA", slices: "Many", clock: "Daily", fills: "One slice per interval, each with its own floor." },
  { type: "TWAP", slices: "Many", clock: "Minutes", fills: "The same, on a short clock for size." },
] as const;

/** The filler interface of CorbelOrders, as written in the contract. */
export const FILLER_CALLS = [
  { call: "due(id, path)", kind: "view", does: "Ready flag and the quote a fill would get now." },
  { call: "fill(id, path, deadline)", kind: "write", does: "Executes one due slice through the V2 router." },
  { call: "cancel(id)", kind: "owner", does: "Stops the order and returns the unfilled input." },
] as const;

export const FILLER_FLOW = [
  "Watch new orders and their clocks.",
  "Call due() until a slice is ready and pays the floor.",
  "Call fill() with the same path the order names.",
  "Output lands with the owner; the tip lands with you.",
] as const;

/** Shield rules and what backs each check. */
export const SHIELD_RULES = [
  { rule: "No approval without a limit.", backedBy: "Transaction decoder", source: "planned" },
  {
    rule: "No transfer to a known drainer or a fresh lookalike address.",
    backedBy: "Address list and lookalike match",
    source: "planned",
  },
  { rule: "No buy of a token that fails the honeypot check.", backedBy: "Trust · Honeypot", source: "live" },
  {
    rule: "No swap through a pool with a trap fee or an unknown hook.",
    backedBy: "Trust · Liquidity and route check",
    source: "live",
  },
  {
    rule: "Your own daily limit on what can leave the wallet.",
    backedBy: "Wallet setting",
    source: "planned",
  },
] as const;

export const PROP_TERMS = [
  { term: "Entry", value: "A fee, paid once." },
  { term: "Capital", value: "Funded by the desk. It can't be withdrawn." },
  { term: "Rules", value: "A mandate with a bond, as on Break it." },
  { term: "Targets", value: "Profit target and drawdown floor, set per tier." },
  { term: "Payout", value: "Profit split between trader and desk." },
] as const;

export const STRATEGY_COLUMNS = ["Agent", "Mandate", "Bond", "Strikes", "Volume", "State"] as const;
