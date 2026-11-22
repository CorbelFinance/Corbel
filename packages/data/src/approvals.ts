/**
 * Token approvals of one wallet: which contracts may move its tokens, how much, and how risky each is.
 *
 * Where they come from: every Approval event the wallet signed in the scanned window (up to `maxWindows` log windows
 * back), plus, for every token it received in that window, the spenders that get approvals most often on this chain
 * (the V2 router, Permit2). Each pair is then read live with allowance(owner, spender): a revoked or used-up approval
 * is dropped. The window is stated in the answer; approvals older than it are only found through the common spenders.
 *
 * Risk: an approval to an address with no code (a person, not a contract) is "danger"; an unlimited approval to a
 * contract we do not know is "caution"; a known contract is "ok", unlimited or not. Read-only: nothing is signed here.
 */
import { pad, type Address, type Hex, type PublicClient } from "viem";
import { LOG_WINDOW, RH } from "./trust/addresses.ts";

const APPROVAL = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const UNLIMITED = 2n ** 255n;

const ERC20 = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

/** Contracts we can name, checked on chain (RH map) or the canonical Permit2. Extra names can be passed in. */
const KNOWN: Record<string, string> = {
  [RH.V2_ROUTER]: "Uniswap V2 router",
  [RH.V4_POOL_MANAGER]: "Uniswap v4 pool manager",
  [PERMIT2]: "Permit2",
};

export type Approval = {
  token: Address;
  symbol: string;
  decimals: number;
  spender: Address;
  spenderName: string | null;
  spenderIsContract: boolean;
  allowance: string; // raw units, as a decimal string
  unlimited: boolean;
  balance: string; // raw units the wallet holds now
  risk: "danger" | "caution" | "ok";
  why: string;
};
export type Approvals = { owner: Address; block: string; windows: number; fromBlock: string; approvals: Approval[]; ms: number };

async function each<T, R>(items: T[], lanes: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]!);
    }
  }));
  return out;
}

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/[^\p{L}\p{N} $._-]/gu, "").slice(0, 24) : "") || "?";

export async function readApprovals(client: PublicClient, owner: Address, opts: { maxWindows?: number; names?: Record<string, string> } = {}): Promise<Approvals> {
  const t0 = Date.now();
  const maxWindows = opts.maxWindows ?? 40;
  const names = { ...KNOWN, ...Object.fromEntries(Object.entries(opts.names ?? {}).map(([k, v]) => [k.toLowerCase(), v])) };
  const head = await client.getBlockNumber();
  const me = pad(owner.toLowerCase() as Hex, { size: 32 });
  const windows: [bigint, bigint][] = [];
  for (let hi = head; hi > 0n && windows.length < maxWindows; hi -= BigInt(LOG_WINDOW)) windows.push([hi - BigInt(LOG_WINDOW) + 1n > 0n ? hi - BigInt(LOG_WINDOW) + 1n : 0n, hi]);
  const pairs = new Map<string, { token: Address; spender: Address }>();
  const held = new Set<string>();
  await each(windows, 4, async ([lo, hi]) => {
    const range = { fromBlock: `0x${lo.toString(16)}`, toBlock: `0x${hi.toString(16)}` };
    const [apps, ins] = await Promise.all([
      client.request({ method: "eth_getLogs", params: [{ ...range, topics: [APPROVAL, me] }] } as never) as Promise<{ address: string; topics: string[] }[]>,
      client.request({ method: "eth_getLogs", params: [{ ...range, topics: [TRANSFER, null, me] }] } as never) as Promise<{ address: string; topics: string[] }[]>,
    ]);
    // ERC-721 Approval/Transfer carry a 4th topic: tokens only
    for (const l of apps) if (l.topics.length === 3) pairs.set(`${l.address.toLowerCase()}:${l.topics[2]!.slice(26)}`, { token: l.address.toLowerCase() as Address, spender: `0x${l.topics[2]!.slice(26)}` as Address });
    for (const l of ins) if (l.topics.length === 3) held.add(l.address.toLowerCase());
  });
  for (const t of [...held, RH.USDG, RH.WETH]) for (const s of [RH.V2_ROUTER, PERMIT2]) pairs.set(`${t}:${s.slice(2)}`, { token: t as Address, spender: s as Address });

  const meta = new Map<string, { symbol: string; decimals: number; balance: bigint }>();
  const code = new Map<string, boolean>();
  const rows = await each([...pairs.values()], 6, async ({ token, spender }) => {
    const allowance = (await client.readContract({ address: token, abi: ERC20, functionName: "allowance", args: [owner, spender] }).catch(() => 0n)) as bigint;
    if (allowance === 0n) return null;
    if (!meta.has(token)) {
      const [symbol, decimals, balance] = await Promise.all([
        client.readContract({ address: token, abi: ERC20, functionName: "symbol" }).catch(() => "?"),
        client.readContract({ address: token, abi: ERC20, functionName: "decimals" }).catch(() => 18),
        client.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [owner] }).catch(() => 0n),
      ]);
      meta.set(token, { symbol: clean(symbol), decimals: Number(decimals), balance: balance as bigint });
    }
    const s = spender.toLowerCase();
    if (!code.has(s)) code.set(s, ((await client.getCode({ address: spender }).catch(() => "0x")) ?? "0x").length > 2);
    const m = meta.get(token)!;
    const isContract = code.get(s)!;
    const name = names[s] ?? null;
    const unlimited = allowance >= UNLIMITED;
    const risk: Approval["risk"] = !isContract ? "danger" : name ? "ok" : unlimited ? "caution" : "ok";
    const why = !isContract
      ? "The spender is a plain address, not a contract: whoever holds its key can take these tokens."
      : name
        ? `${name}: a contract many wallets approve.`
        : unlimited
          ? "An unknown contract may take all of this token, now and later."
          : "An unknown contract, limited to the amount shown.";
    return { token, symbol: m.symbol, decimals: m.decimals, spender, spenderName: name, spenderIsContract: isContract, allowance: allowance.toString(), unlimited, balance: m.balance.toString(), risk, why } satisfies Approval;
  });
  const order = { danger: 0, caution: 1, ok: 2 };
  const approvals = rows.filter((r): r is Approval => !!r).sort((a, b) => order[a.risk] - order[b.risk] || Number(b.unlimited) - Number(a.unlimited));
  return { owner, block: head.toString(), windows: windows.length, fromBlock: (windows.at(-1)?.[0] ?? 0n).toString(), approvals, ms: Date.now() - t0 };
}
