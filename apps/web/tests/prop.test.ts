import { describe, expect, it } from "vitest";
import { evaluate, PROP_TIERS } from "../lib/prop";
import type { Book, Trade } from "../lib/practice";

const T = PROP_TIERS[0]!; // starter: +8% target, 6% floor, 3% day, 5 days
const DAY = 86_400_000;
const t0 = Date.UTC(2026, 10, 1, 12);
let n = 0;
const sell = (day: number, pnl: number): Trade => ({ id: `s${n++}`, at: t0 + day * DAY, side: "sell", token: "0x1", symbol: "X", usd: 1000, amount: 1, price: 1, impact: null, block: "1", venues: [], tag: "momentum" as Trade["tag"], pnl });
const buy = (day: number, usd = 1000): Trade => ({ id: `b${n++}`, at: t0 + day * DAY - 1000, side: "buy", token: "0x1", symbol: "X", usd, amount: 1, price: 1, impact: null, block: "1", venues: [], tag: "momentum" as Trade["tag"] });
const book = (trades: Trade[]): Book => ({ v: 1, start: 10_000, cash: 10_000, positions: {}, trades, created: t0 });

describe("prop desk evaluation", () => {
  it("an empty account has not started", () => {
    expect(evaluate(book([]), T).status).toBe("empty");
  });

  it("passes with the target over enough days and no breach", () => {
    const tr = [0, 1, 2, 3, 4].flatMap((d) => [buy(d), sell(d, 170)]);
    const r = evaluate(book(tr), T);
    expect(r.profit).toBeCloseTo(0.085);
    expect(r.days).toBe(5);
    expect(r.status).toBe("passed");
  });

  it("is still running with the target but too few days", () => {
    const tr = [0, 1].flatMap((d) => [buy(d), sell(d, 450)]);
    expect(evaluate(book(tr), T).status).toBe("running");
  });

  it("fails on a day's loss past the limit, even if it recovers later", () => {
    const tr = [buy(0), sell(0, -350), ...[1, 2, 3, 4, 5].flatMap((d) => [buy(d), sell(d, 300)])];
    const r = evaluate(book(tr), T);
    expect(r.status).toBe("failed");
    expect(r.why).toMatch(/day limit/);
  });

  it("fails on a drawdown past the floor spread over days", () => {
    const tr = [buy(0), sell(0, 200), buy(1), sell(1, -250), buy(2), sell(2, -250), buy(3), sell(3, -200)];
    const r = evaluate(book(tr), T);
    expect(r.status).toBe("failed");
    expect(r.why).toMatch(/floor/);
  });

  it("counts buys larger than the position limit", () => {
    expect(evaluate(book([buy(0, 3000)]), T).oversized).toBe(1);
  });
});
