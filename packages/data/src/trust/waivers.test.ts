import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { CURVE_BUY, CURVE_EXEMPT, CURVE_INIT, readWaivers } from "./waivers.ts";

const CURVE = "0x00000000000000000000000000000000000000c0";
const TOKEN = "0x00000000000000000000000000000000000000aa";
const ME = "0x00000000000000000000000000000000000000c1";
const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b2";
const X = "0x00000000000000000000000000000000000000ee";
const TX = `0x${"11".repeat(32)}` as const;
const pad = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const ev = (sig: string) => `${sig}${"0".repeat(56)}`;
const words = (...v: bigint[]) => `0x${v.map((x) => x.toString(16).padStart(64, "0")).join("")}`;
const E18 = 10n ** 18n;
const SUPPLY = 1_000_000_000n * E18;

function client(exempt: string[], buys: { block: number; to: string; eth: bigint; out: bigint; tx?: string }[], bal: Record<string, bigint>) {
  return {
    getTransactionReceipt: async () => ({
      from: ME,
      blockNumber: 100n,
      logs: [
        { address: CURVE, topics: [ev(CURVE_INIT)], data: "0x" },
        ...[ME, ...exempt, ME].map((a) => ({ address: CURVE, topics: [ev(CURVE_EXEMPT), pad(a)], data: "0x" })),
        // an exempt-looking event from another contract never counts
        { address: TOKEN, topics: [ev(CURVE_EXEMPT), pad(X)], data: "0x" },
      ],
    }),
    getBlockNumber: async () => 10_000n,
    request: async () =>
      buys.map((b) => ({ topics: [ev(CURVE_BUY), pad(b.to), pad(b.to)], data: words(b.eth, b.out, 0n, 0n), blockNumber: `0x${(100 + b.block).toString(16)}`, transactionHash: b.tx ?? `0x${"22".repeat(32)}` })),
    readContract: async ({ args }: { args: [string] }) => bal[args[0]!.toLowerCase()] ?? 0n,
  } as unknown as PublicClient;
}

describe("launch-fee waivers", () => {
  it("reads the list from the launch tx, leaves the creator out, sums what the listed wallets bought", async () => {
    const c = client([A, B], [
      { block: 1, to: A, eth: E18 / 10n, out: 100_000_000n * E18 },
      { block: 1, to: B, eth: E18 / 10n, out: 50_000_000n * E18 },
      { block: 60, to: A, eth: E18 / 10n, out: 50_000_000n * E18 },
      { block: 2, to: X, eth: E18, out: 300_000_000n * E18 }, // not listed
      { block: 0, to: ME, eth: E18, out: 10_000_000n * E18, tx: TX }, // the creator's buy inside the launch tx
    ], { [B]: 10_000_000n * E18 });
    const w = (await readWaivers(c, TX, TOKEN, SUPPLY))!;
    expect(w.wallets).toBe(2);
    expect(w.buyers).toBe(2);
    expect(w.bought).toBeCloseTo(0.2, 6);
    expect(w.fast).toBeCloseTo(0.15, 6);
    expect(w.holdNow).toBeCloseTo(0.01, 6);
    expect(w.eth).toBeCloseTo(0.3, 6);
    expect(w.top[0]).toEqual({ address: A, bought: 0.15 });
  });

  it("says no wallet was waived when only the creator is listed", async () => {
    const w = (await readWaivers(client([], [], {}), TX, TOKEN, SUPPLY))!;
    expect(w).toMatchObject({ wallets: 0, bought: 0, holdNow: 0, top: [] });
  });
});
