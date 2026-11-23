import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CAP_COINS, DOMAIN, TYPES, weekOf, weightOf } from "../lib/vote";
import { recoverTypedDataAddress } from "viem";

describe("holder vote", () => {
  it("weighs by the square root of coins, capped", () => {
    expect(weightOf(1_000_000)).toBe(1000);
    expect(weightOf(CAP_COINS * 10)).toBe(Math.sqrt(CAP_COINS));
    expect(weightOf(-5)).toBe(0);
  });
  it("names ISO weeks starting on Monday", () => {
    expect(weekOf(Date.UTC(2026, 10, 23))).toBe("2026-W48"); // a Monday
    expect(weekOf(Date.UTC(2026, 10, 22))).toBe("2026-W47"); // the Sunday before
    expect(weekOf(Date.UTC(2027, 0, 1))).toBe("2026-W53");
  });
  it("recovers the voter from the signed ballot", async () => {
    const a = privateKeyToAccount(generatePrivateKey());
    const message = { week: weekOf(), item: "Credits" };
    const signature = await a.signTypedData({ domain: DOMAIN, types: TYPES, primaryType: "Vote", message });
    expect((await recoverTypedDataAddress({ domain: DOMAIN, types: TYPES, primaryType: "Vote", message, signature })).toLowerCase()).toBe(a.address.toLowerCase());
  });
});
