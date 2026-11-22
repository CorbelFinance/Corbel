import { describe, expect, it } from "vitest";
import { dailyCredits, holderWeight } from "@corbel/config";

describe("holder prompts formula", () => {
  it("gives nothing under the minimum", () => {
    expect(holderWeight(99, 100, 30)).toBe(0);
    expect(holderWeight(0, 100, 0)).toBe(0);
  });
  it("grows with the square root of the balance", () => {
    expect(holderWeight(100, 100, 0)).toBeCloseTo(1);
    expect(holderWeight(400, 100, 0)).toBeCloseTo(2);
    expect(holderWeight(10_000, 100, 0)).toBeCloseTo(10);
  });
  it("adds up to half again for time held, reached at sixty days", () => {
    expect(holderWeight(100, 100, 30)).toBeCloseTo(1.25);
    expect(holderWeight(100, 100, 60)).toBeCloseTo(1.5);
    expect(holderWeight(100, 100, 600)).toBeCloseTo(1.5);
  });
  it("never hands out more than the pool, and caps each wallet", () => {
    const c = dailyCredits([10, 1, 1, 0], 100, 40);
    expect(c.reduce((a, v) => a + v, 0)).toBeLessThanOrEqual(100 + 1e-9);
    expect(Math.max(...c)).toBeLessThanOrEqual(40 + 1e-9);
    expect(c[3]).toBe(0);
    // what the capped whale could not take is shared by the others
    expect(c[1]).toBeCloseTo(30);
    expect(c[2]).toBeCloseTo(30);
  });
  it("shares by weight when no cap binds", () => {
    const c = dailyCredits([3, 1], 100, 1000);
    expect(c[0]).toBeCloseTo(75);
    expect(c[1]).toBeCloseTo(25);
  });
});
