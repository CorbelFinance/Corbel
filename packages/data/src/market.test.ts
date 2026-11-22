import { describe, expect, it } from "vitest";
import { v2Ladder } from "./market.ts";

describe("v2Ladder: the pool's own curve", () => {
  const rt = 1_000_000; // tokens
  const rb = 50_000; // base, so the price is 0.05

  it("buying `base` lifts the price by exactly `move` on x·y=k", () => {
    for (const s of v2Ladder(rt, rb).up) {
      const t2 = rt - s.token, b2 = rb + s.base;
      expect(t2 * b2).toBeCloseTo(rt * rb, -2);
      expect(b2 / t2 / (rb / rt) - 1).toBeCloseTo(s.move, 9);
    }
  });

  it("selling drops the price by exactly `move` and pays out less than the pool holds", () => {
    for (const s of v2Ladder(rt, rb).down) {
      const t2 = rt + s.token, b2 = rb - s.base;
      expect(1 - b2 / t2 / (rb / rt)).toBeCloseTo(s.move, 9);
      expect(s.base).toBeLessThan(rb);
    }
  });

  it("bigger moves cost more, on both sides", () => {
    const { up, down } = v2Ladder(rt, rb);
    for (let i = 1; i < up.length; i++) {
      expect(up[i]!.base).toBeGreaterThan(up[i - 1]!.base);
      expect(down[i]!.base).toBeGreaterThan(down[i - 1]!.base);
    }
  });
});
