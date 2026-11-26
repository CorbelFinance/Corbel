import { pad, toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import { RH } from "./trust/addresses.ts";
import { ethCrossed, paidEth, tokenTotals, type ReportRow } from "./walletReport.ts";

const T = "0x00000000000000000000000000000000000000aa";
const row = (block: number, kind: ReportRow["kind"], amount: number, usd: number | null): ReportRow => ({ at: block, block, tx: `0x${block}`, kind, token: T, symbol: "AAA", amount, counter: null, usd, gasEth: null, gasUsd: null });

describe("average-cost result", () => {
  it("values what was sold at the average price paid, whatever order the rows come in", () => {
    // 100 for $10, 100 for $30: average $0.20. Selling 50 for $15 makes $5
    const [t] = tokenTotals([row(3, "sell", -50, 15), row(1, "buy", 100, 10), row(2, "buy", 100, 30)], new Map([[T, 150]]));
    expect(t!.realizedUsd).toBeCloseTo(5, 9);
    expect(t).toMatchObject({ buys: 2, sells: 1, spentUsd: 40, receivedUsd: 15, held: 150 });
  });
  it("is unknown when a buy has no value, when coins came for free, or when more was sold than seen", () => {
    expect(tokenTotals([row(1, "buy", 100, null), row(2, "sell", -50, 5)], new Map())[0]!.realizedUsd).toBeNull();
    expect(tokenTotals([row(1, "in", 100, null), row(2, "sell", -50, 5)], new Map())[0]!.realizedUsd).toBeNull();
    expect(tokenTotals([row(1, "buy", 10, 1), row(2, "sell", -50, 5)], new Map())[0]!.realizedUsd).toBeNull();
  });
  it("is zero while nothing was sold", () => {
    expect(tokenTotals([row(1, "buy", 100, 10)], new Map())[0]!.realizedUsd).toBe(0);
  });
});

describe("ETH crossed in a transaction", () => {
  const w = (v: bigint) => v.toString(16).padStart(64, "0");
  const neg = (v: bigint) => (2n ** 256n - v).toString(16);
  const id = pad("0x01", { size: 32 });
  const wrap = { address: RH.WETH, topics: [toEventSelector("Deposit(address,uint256)"), pad(T, { size: 32 })], data: `0x${w(7n)}`, blockNumber: "0x1", transactionHash: "0x1" };
  const swap = (a0: string) => ({ address: RH.V4_POOL_MANAGER, topics: [toEventSelector("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"), id, pad(T, { size: 32 })], data: `0x${a0}${w(99n)}${w(0n)}${w(0n)}${w(0n)}${w(0n)}`, blockNumber: "0x1", transactionHash: "0x1" });
  it("reads wrapped ETH and the native side of a v4 swap, and never adds the same ETH twice", () => {
    const native = new Map([[id, { token0: RH.NATIVE as string, token1: T }]]);
    expect(ethCrossed({ logs: [wrap] }, new Map())).toBe(7n);
    expect(ethCrossed({ logs: [swap(neg(5n))] }, native)).toBe(5n);
    expect(ethCrossed({ logs: [wrap, swap(neg(7n))] }, native)).toBe(7n);
  });
  it("ignores a v4 pool without native ETH and one it does not know", () => {
    expect(ethCrossed({ logs: [swap(neg(5n))] }, new Map([[id, { token0: T, token1: RH.USDG as string }]]))).toBe(0n);
    expect(ethCrossed({ logs: [swap(neg(5n))] }, new Map())).toBe(0n);
  });
});

describe("what a buy cost", () => {
  it("counts the interface fee, but not ETH that came back or was never attached", () => {
    expect(paidEth(0.002, 0.00199)).toBe(0.002);
    expect(paidEth(0.05, 0.00199)).toBe(0.00199);
    expect(paidEth(0, 0.00199)).toBe(0.00199);
  });
});
