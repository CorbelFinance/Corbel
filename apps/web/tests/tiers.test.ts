import { describe, expect, it } from "vitest";
import { AI_ACCESS, CREDITS_MARKUP, FULL_TIER, aiTier, hasFull, markupFor } from "@corbel/config";

describe("holder ladder", () => {
  const t = AI_ACCESS.tiers;
  it("has four tiers with rising thresholds and perks that never shrink", () => {
    expect(t.map((x) => x.id)).toEqual(["light", "plus", "full", "core"]);
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!.minCoins).toBeGreaterThan(t[i - 1]!.minCoins);
      expect(t[i]!.markup).toBeLessThanOrEqual(t[i - 1]!.markup);
      expect(t[i]!.gpuMinutes).toBeGreaterThanOrEqual(t[i - 1]!.gpuMinutes);
      expect(t[i]!.apiBoost).toBeGreaterThanOrEqual(t[i - 1]!.apiBoost);
      expect(t[i]!.text).toBeGreaterThanOrEqual(t[i - 1]!.text);
    }
  });
  it("opens every model from Full up and keeps the base markup without a tier", () => {
    expect(hasFull(aiTier(FULL_TIER.minCoins))).toBe(true);
    expect(hasFull(aiTier(10_000_000))).toBe(true);
    expect(hasFull(aiTier(FULL_TIER.minCoins - 1))).toBe(false);
    expect(aiTier(999)).toBeNull();
    expect(markupFor(null)).toBe(CREDITS_MARKUP);
    expect(markupFor(aiTier(FULL_TIER.minCoins))).toBe(0);
  });
});
