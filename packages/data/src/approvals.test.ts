import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { readApprovals } from "./approvals.ts";
import { RH } from "./trust/addresses.ts";

const OWNER = "0x00000000000000000000000000000000000000aa";
const TOKEN = "0x00000000000000000000000000000000000000t1".replace("t1", "71");
const EOA = "0x00000000000000000000000000000000000000e0";
const UNKNOWN = "0x00000000000000000000000000000000000000c0";
const REVOKED = "0x00000000000000000000000000000000000000d0";
const topic = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const APPROVAL = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

// a fake chain: the wallet signed approvals to a person, an unknown contract and one it later set to zero
const allowances: Record<string, bigint> = { [EOA]: 500n, [UNKNOWN]: 2n ** 256n - 1n, [REVOKED]: 0n, [RH.V2_ROUTER]: 10n ** 18n };
const client = {
  getBlockNumber: async () => 100_000n,
  request: async ({ params }: { params: [{ topics: string[]; fromBlock: string }] }) => {
    const [q] = params;
    if (q.fromBlock !== `0x${(100_000 - 25_000 + 1).toString(16)}`) return [];
    if (q.topics[0] === APPROVAL) return [EOA, UNKNOWN, REVOKED].map((s) => ({ address: TOKEN, topics: [APPROVAL, topic(OWNER), topic(s)] }));
    return [{ address: TOKEN, topics: ["0xddf", topic("0x01"), topic(OWNER)] }];
  },
  readContract: async ({ address, functionName, args }: { address: string; functionName: string; args?: string[] }) => {
    if (functionName === "allowance") return address === TOKEN ? (allowances[args![1]!.toLowerCase()] ?? 0n) : 0n;
    if (functionName === "symbol") return "TOK";
    if (functionName === "decimals") return 18;
    return 1000n;
  },
  getCode: async ({ address }: { address: string }) => (address.toLowerCase() === EOA ? "0x" : "0x6080"),
} as unknown as PublicClient;

describe("readApprovals", () => {
  it("finds live approvals, drops revoked ones and ranks the risk", async () => {
    const r = await readApprovals(client, OWNER as `0x${string}`, { maxWindows: 3 });
    const by = Object.fromEntries(r.approvals.map((a) => [a.spender.toLowerCase(), a]));
    expect(Object.keys(by).sort()).toEqual([EOA, UNKNOWN, RH.V2_ROUTER].sort());
    expect(by[REVOKED]).toBeUndefined();
    expect(by[EOA]!.risk).toBe("danger");
    expect(by[UNKNOWN]!.risk).toBe("caution");
    expect(by[UNKNOWN]!.unlimited).toBe(true);
    expect(by[RH.V2_ROUTER]!.risk).toBe("ok");
    expect(by[RH.V2_ROUTER]!.spenderName).toMatch(/router/i);
    expect(r.approvals[0]!.risk).toBe("danger");
    expect(r.windows).toBe(3);
  });
});
