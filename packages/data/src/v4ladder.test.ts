import { describe, expect, it } from "vitest";
import { v2Ladder, v4Ladder } from "./market.ts";

// a full-range v4 pool with liquidity L at √P holds L/√P of currency0 and L·√P of currency1: the same curve as V2
const close = (a: number, b: number) => expect(Math.abs(a - b) / Math.max(1e-12, Math.abs(b))).toBeLessThan(1e-9);

describe("v4Ladder", () => {
  it("matches the V2 ladder of the equivalent reserves when the token is currency0", () => {
    const L = 3.2e21, s = 0.0042 * 2 ** 96, td = 18, bd = 18;
    const sp = s / 2 ** 96;
    const v2 = v2Ladder(L / sp / 10 ** td, (L * sp) / 10 ** bd);
    const v4 = v4Ladder(L, s, true, td, bd);
    for (const k of ["up", "down"] as const) v4[k].forEach((x, i) => (close(x.base, v2[k][i]!.base), close(x.token, v2[k][i]!.token)));
  });
  it("matches when the token is currency1, with different decimals", () => {
    const L = 7.7e15, s = 913.5 * 2 ** 96, td = 18, bd = 6;
    const sp = s / 2 ** 96;
    // token is currency1: token reserve L·√P, base (currency0) reserve L/√P
    const v2 = v2Ladder((L * sp) / 10 ** td, L / sp / 10 ** bd);
    const v4 = v4Ladder(L, s, false, td, bd);
    for (const k of ["up", "down"] as const) v4[k].forEach((x, i) => (close(x.base, v2[k][i]!.base), close(x.token, v2[k][i]!.token)));
  });
});
