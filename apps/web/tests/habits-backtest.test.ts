import { describe, expect, it } from "vitest";
import { readHabits } from "../lib/habits";
import { backtest } from "../lib/backtest";
import type { Trade } from "../lib/practice";

const H = 3600_000;
const tr = (o: Partial<Trade> & Pick<Trade, "side" | "at">): Trade => ({ id: String(Math.random()), token: "0xa", symbol: "A", usd: 100, amount: 1, price: 1, impact: 0.01, block: "1", venues: [], tag: "other", ...o });

describe("habits from the practice record", () => {
  // newest first, as the book keeps them
  const trades = [
    tr({ side: "buy", at: 10 * H + 10 * 60_000, usd: 100 }), // 10 min after the loss below: revenge
    tr({ side: "sell", at: 10 * H, pnl: -20 }), // 1 h after its buy: panic
    tr({ side: "buy", at: 9 * H, usd: 500 }), // five times the usual: oversizing
    tr({ side: "buy", at: 5 * H, usd: 100, fails: ["honeypot"], token: "0xb", symbol: "B" }),
    tr({ side: "buy", at: 1 * H, usd: 100 }),
  ];
  const h = Object.fromEntries(readHabits(trades).map((x) => [x.id, x]));
  it("finds a losing sell soon after the buy", () => expect(h.panic!.count).toBe(1));
  it("finds a buy right after a loss", () => expect(h.revenge!.count).toBe(1));
  it("finds a buy far above the usual size", () => expect(h.oversize!.count).toBe(1));
  it("finds a buy the check had flagged", () => expect(h.flags!.count).toBe(1));
  it("says who enforces each rule", () => {
    expect(h.revenge!.enforcedBy).toBe("contract");
    expect(h.panic!.enforcedBy).toBe("agent");
  });
});

describe("backtest of an exit rule on a pool's swaps", () => {
  const swaps = (prices: number[]) => prices.map((price, k) => ({ t: 1000 + k * 600, price })).reverse(); // every 10 min, newest first
  it("takes profit at the first swap past the target", () => {
    const r = backtest(swaps([100, 105, 111, 90]), { tpPct: 10, slPct: 50, holdH: 24, everyH: 24, costPct: 0 });
    expect(r.trades[0]!.why).toBe("take profit");
    expect(r.trades[0]!.ret).toBeCloseTo(0.11);
  });
  it("stops out at the first swap past the stop", () => {
    const r = backtest(swaps([100, 95, 79, 150]), { tpPct: 100, slPct: 20, holdH: 24, everyH: 24, costPct: 0 });
    expect(r.trades[0]!.why).toBe("stop");
    expect(r.trades[0]!.ret).toBeCloseTo(-0.21);
  });
  it("leaves on time and pays the round-trip cost", () => {
    const r = backtest(swaps([100, 101, 102, 103, 104, 105, 106, 107]), { tpPct: 50, slPct: 50, holdH: 0.5, everyH: 24, costPct: 1 });
    expect(r.trades[0]!.why).toBe("time");
    expect(r.trades[0]!.ret).toBeCloseTo(103 / 100 - 1 - 0.01);
  });
  it("measures the drawdown of the compounded record", () => {
    const r = backtest(swaps([100, 110, 100, 80, 100, 100]), { tpPct: 5, slPct: 15, holdH: 24, everyH: 0.25, costPct: 0 });
    expect(r.maxDrawdown).toBeGreaterThan(0);
    expect(r.trades.length).toBeGreaterThan(1);
  });
  it("needs at least two swaps", () => expect(backtest([{ t: 1, price: 1 }], { tpPct: 1, slPct: 1, holdH: 1, everyH: 1 }).trades).toHaveLength(0));
});
