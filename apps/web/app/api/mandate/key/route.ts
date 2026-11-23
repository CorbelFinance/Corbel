import { RH, getClient } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { MANDATES_POOL } from "@/lib/predict";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/mandate/key → the live mandate read from its contract at the latest block, shaped as the key an agent holds:
 * which tokens it may spend and how much per trade and per day, the price, hours and cooldown rules, its bond, the cut
 * per violation, the strikes before it is frozen, and the delay before a bond can be taken back. Cached 60 s.
 */
const ABI = [
  { type: "function", name: "agent", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "frozen", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "strikes", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "bond", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "bondToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "UNBOND_DELAY", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function", name: "rules", stateMutability: "view", inputs: [],
    outputs: [{ type: "uint16" }, { type: "uint8" }, { type: "uint8" }, { type: "bool" }, { type: "uint32" }, { type: "uint128" }, { type: "uint16" }, { type: "uint8" }],
  },
  { type: "function", name: "limits", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }, { type: "uint128" }, { type: "uint128" }] },
] as const;
const ERC20 = [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }] as const;
const TOKENS = [
  { symbol: "USDG", address: RH.USDG, decimals: 6 },
  { symbol: "WETH", address: RH.WETH, decimals: 18 },
] as const;

let hit: { at: number; body: unknown } | null = null;

export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    if (hit && Date.now() - hit.at < 60_000) return Response.json(hit.body);
    const c = getClient(process.env.RPC_URL);
    if (!c) return Response.json({ error: "Chain reads are paused. Try again later." }, { status: 503 });
    const at = (address: `0x${string}`) => ({ address, abi: ABI });
    const m = at(MANDATES_POOL.mandate as `0x${string}`);
    const [block, agent, owner, frozen, strikes, bond, bondToken, delay, rules, ...lims] = await Promise.all([
      c.getBlockNumber(),
      c.readContract({ ...m, functionName: "agent" }),
      c.readContract({ ...m, functionName: "owner" }),
      c.readContract({ ...m, functionName: "frozen" }),
      c.readContract({ ...m, functionName: "strikes" }),
      c.readContract({ ...m, functionName: "bond" }),
      c.readContract({ ...m, functionName: "bondToken" }),
      c.readContract({ ...m, functionName: "UNBOND_DELAY" }),
      c.readContract({ ...m, functionName: "rules" }),
      ...TOKENS.map((t) => c.readContract({ ...m, functionName: "limits", args: [t.address as `0x${string}`] })),
    ]);
    const bondDec = Number(await c.readContract({ address: bondToken, abi: ERC20, functionName: "decimals" }));
    // the lifetime budget and the end date came with a later version of the contract: an older mandate has neither
    const EXTRA = [
      { type: "function", name: "endsAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
      { type: "function", name: "maxTotal", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
      { type: "function", name: "spentTotal", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
    ] as const;
    const mx = { address: m.address, abi: EXTRA };
    const endsAt = await c.readContract({ ...mx, functionName: "endsAt" }).catch(() => null);
    const totals = endsAt === null ? null : await Promise.all(TOKENS.map(async (t) => [await c.readContract({ ...mx, functionName: "maxTotal", args: [t.address as `0x${string}`] }), await c.readContract({ ...mx, functionName: "spentTotal", args: [t.address as `0x${string}`] })] as const));
    const [slip, hourFrom, hourTo, weekdaysOnly, cooldown, minBond, slashBps, strikesToFreeze] = rules;
    const body = {
      block: Number(block),
      mandate: MANDATES_POOL.mandate,
      agent,
      owner,
      frozen,
      strikes: Number(strikes),
      bond: Number(bond) / 10 ** bondDec,
      bondSymbol: bondToken.toLowerCase() === RH.USDG.toLowerCase() ? "USDG" : bondToken,
      unbondDelayH: Number(delay) / 3600,
      rules: { maxSlippagePct: Number(slip) / 100, hourFrom: Number(hourFrom), hourTo: Number(hourTo), weekdaysOnly, cooldownS: Number(cooldown), minBond: Number(minBond) / 10 ** bondDec, slashPct: Number(slashBps) / 100, strikesToFreeze: Number(strikesToFreeze) },
      limits: TOKENS.map((t, i) => {
        const [allowed, perTrade, perDay] = lims[i] as readonly [boolean, bigint, bigint];
        const tot = totals?.[i];
        return { symbol: t.symbol, allowed, perTrade: Number(perTrade) / 10 ** t.decimals, perDay: Number(perDay) / 10 ** t.decimals, total: tot && tot[0] > 0n ? Number(tot[0]) / 10 ** t.decimals : null, spent: tot ? Number(tot[1]) / 10 ** t.decimals : null };
      }),
      // null: the mandate's contract predates the end date and the lifetime budget
      term: endsAt === null ? null : { endsAt: endsAt > 0n ? Number(endsAt) : null, maxDays: 90 },
      proofs: { traded: MANDATES_POOL.traded, refused: MANDATES_POOL.refused, revoked: MANDATES_POOL.revoked },
    };
    hit = { at: Date.now(), body };
    return Response.json(body);
  } catch {
    return Response.json({ error: "The mandate could not be read just now." }, { status: 502 });
  } finally {
    g.release();
  }
}
