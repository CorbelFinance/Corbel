import { describe, expect, it } from "vitest";
import { poolVsHold } from "../components/app/EarnDeposit";

describe("pool against holding (50/50 V2 position)", () => {
  it("is even when the price does not move", () => {
    const r = poolVsHold(100, 0);
    expect(r.hold).toBeCloseTo(100);
    expect(r.pool).toBeCloseTo(100);
    expect(r.diff).toBeCloseTo(0);
  });
  it("falls behind holding when the price rises 4x", () => {
    const r = poolVsHold(100, 3); // price x4: hold 50*4 + 50 = 250, pool 100*sqrt(4) = 200
    expect(r.hold).toBeCloseTo(250);
    expect(r.pool).toBeCloseTo(200);
  });
  it("falls behind holding when the price drops 75%", () => {
    const r = poolVsHold(100, -0.75); // price x0.25: hold 12.5 + 50 = 62.5, pool 100*0.5 = 50
    expect(r.hold).toBeCloseTo(62.5);
    expect(r.pool).toBeCloseTo(50);
  });
  it("never goes negative at an extreme drop", () => {
    expect(poolVsHold(100, -1).pool).toBeGreaterThanOrEqual(0);
  });
});
