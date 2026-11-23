/**
 * "Try to break the mandate": runs packages/contracts/src/lab/MandateLab.sol inside one eth_call (creation
 * code, constructor returns the results). A real CorbelMandate is deployed in the call, a real bond is
 * posted, the attempt really executes against live pools, and everything is thrown away with the call.
 * The block time is overridden so the WINDOW rule is shown on the day the scenario names.
 */
import { decodeAbiParameters, encodeDeployData, parseEther, toHex, type Hex, type PublicClient } from "viem";
import { MANDATE_LAB_ABI, MANDATE_LAB_CREATION } from "./mandateLabBytecode.ts";
import { RH, SIM_FROM } from "./trust/addresses.ts";
import { redact } from "./redact.ts";

const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";
const PEPE = "0x0ad3b612c5988e4257a0aab6f2713a3a5371d111";
const ZERO = "0x0000000000000000000000000000000000000000";

export const RULE_NAMES = ["Traded", "Assets", "Size", "Budget", "Price", "Window", "Bond", "Pool", "Score"] as const;

type Key = { currency0: Hex; currency1: Hex; fee: number; tickSpacing: number; hooks: Hex };
export interface Scenario {
  id: string;
  venue: 0 | 1;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  acceptBps: number;
  key?: Key;
  repeat: number;
  day: "weekday" | "saturday";
}

const NVDA_TRAP: Key = { currency0: RH.USDG as Hex, currency1: NVDA as Hex, fee: 992_500, tickSpacing: 9_925, hooks: ZERO as Hex };

export const SCENARIOS: Scenario[] = [
  { id: "nvda-9000", venue: 1, tokenIn: RH.USDG, tokenOut: NVDA, amountIn: 9_000_000_000n, acceptBps: 0, key: NVDA_TRAP, repeat: 1, day: "weekday" },
  { id: "trap-pool", venue: 1, tokenIn: RH.USDG, tokenOut: NVDA, amountIn: 100_000_000n, acceptBps: 0, key: NVDA_TRAP, repeat: 1, day: "weekday" },
  { id: "loose-price", venue: 0, tokenIn: RH.WETH, tokenOut: RH.USDG, amountIn: parseEther("0.1"), acceptBps: 500, repeat: 1, day: "weekday" },
  { id: "unlisted", venue: 0, tokenIn: RH.WETH, tokenOut: PEPE, amountIn: parseEther("0.1"), acceptBps: 50, repeat: 1, day: "weekday" },
  { id: "weekend", venue: 0, tokenIn: RH.WETH, tokenOut: RH.USDG, amountIn: parseEther("0.1"), acceptBps: 50, repeat: 1, day: "saturday" },
  { id: "budget", venue: 0, tokenIn: RH.USDG, tokenOut: RH.WETH, amountIn: 900_000_000n, acceptBps: 50, repeat: 3, day: "weekday" },
  { id: "three-strikes", venue: 1, tokenIn: RH.USDG, tokenOut: NVDA, amountIn: 9_000_000_000n, acceptBps: 0, key: NVDA_TRAP, repeat: 3, day: "weekday" },
  { id: "honest", venue: 0, tokenIn: RH.WETH, tokenOut: RH.USDG, amountIn: parseEther("0.2"), acceptBps: 50, repeat: 1, day: "weekday" },
];

/** What a scenario asks the agent to do, in plain units, for pages that describe it. */
export function describeScenario(s: Scenario) {
  const sym = (a: string) => ({ [RH.USDG.toLowerCase()]: "USDG", [RH.WETH.toLowerCase()]: "WETH", [NVDA]: "NVDA", [PEPE]: "PEPE" })[a.toLowerCase()] ?? "token";
  const dec = sym(s.tokenIn) === "USDG" ? 6 : 18;
  return { id: s.id, repeat: s.repeat, day: s.day, in: sym(s.tokenIn), out: sym(s.tokenOut), amount: Number(s.amountIn) / 10 ** dec, acceptBps: s.acceptBps };
}

export interface LabAttempt {
  rule: (typeof RULE_NAMES)[number];
  traded: boolean;
  out: string;
  slashed: string; // USDG raw (6 decimals)
  bondAfter: string;
  strikes: number;
  frozen: boolean;
}
export interface LabResult {
  scenario: string;
  block: string;
  at: number; // unix seconds the call ran at
  attempts: LabAttempt[];
  ms: number;
}

/** Noon UTC on the next weekday or Saturday after `now`. */
function noon(now: number, day: Scenario["day"]): number {
  let t = now - (now % 86_400) + 12 * 3_600 + 86_400;
  const dow = (x: number) => (Math.floor(x / 86_400) + 4) % 7;
  for (let i = 0; i < 8; i++) {
    const d = dow(t);
    if (day === "saturday" ? d === 6 : d >= 1 && d <= 5) break;
    t += 86_400;
  }
  return t;
}

const ATTEMPTS = [
  {
    type: "tuple[]",
    components: [
      { name: "rule", type: "uint8" },
      { name: "traded", type: "bool" },
      { name: "out", type: "uint256" },
      { name: "slashed", type: "uint256" },
      { name: "bondAfter", type: "uint256" },
      { name: "strikes", type: "uint8" },
      { name: "frozen", type: "bool" },
    ],
  },
] as const;

export async function runMandateLab(client: PublicClient, id: string): Promise<LabResult> {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error("unknown scenario");
  const t0 = Date.now();
  const head = await client.getBlock();
  const at = noon(Number(head.timestamp), s.day);
  const key = s.key ?? { currency0: ZERO as Hex, currency1: ZERO as Hex, fee: 0, tickSpacing: 0, hooks: ZERO as Hex };
  const data = encodeDeployData({
    abi: MANDATE_LAB_ABI,
    bytecode: MANDATE_LAB_CREATION,
    args: [{ venue: s.venue, tokenIn: s.tokenIn as Hex, tokenOut: s.tokenOut as Hex, amountIn: s.amountIn, acceptBps: s.acceptBps, key, repeat: s.repeat }],
  } as never);
  try {
    const raw = (await client.request({
      method: "eth_call",
      params: [
        { from: SIM_FROM, data, value: toHex(parseEther("4")), gas: toHex(60_000_000n) },
        "latest",
        { [SIM_FROM]: { balance: toHex(parseEther("10")) } },
        { time: toHex(at) },
      ],
    } as never)) as Hex;
    const [list] = decodeAbiParameters(ATTEMPTS, raw);
    return {
      scenario: s.id,
      block: head.number!.toString(),
      at,
      attempts: list.map((a) => ({
        rule: RULE_NAMES[a.rule] ?? "Traded",
        traded: a.traded,
        out: a.out.toString(),
        slashed: a.slashed.toString(),
        bondAfter: a.bondAfter.toString(),
        strikes: a.strikes,
        frozen: a.frozen,
      })),
      ms: Date.now() - t0,
    };
  } catch (e) {
    throw new Error(redact((e as { shortMessage?: string }).shortMessage ?? "lab call failed"));
  }
}

