import { describe, expect, it } from "vitest";
import { drawWinners, SEASON } from "../lib/season";

describe("reward season", () => {
  it("draws the same winners from the same block hash, none twice", () => {
    const pool = Array.from({ length: 40 }, (_, i) => `w${i}`);
    const seed = "0x8f1c2d3e4a5b6c7d8e9f00112233445566778899aabbccddeeff001122334455" as const;
    const a = drawWinners(pool, 10, seed), b = drawWinners(pool, 10, seed);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(10);
    expect(drawWinners(pool, 10, "0x01")).not.toEqual(a);
    expect(drawWinners(["only"], 10, seed)).toEqual(["only"]);
  });
  it("splits the whole pool and nothing more", () => {
    const parts = SEASON.podium.reduce((x, y) => x + y, 0) + SEASON.pointsShare + SEASON.drawShare;
    expect(parts).toBeCloseTo(1, 10);
  });
});

import { roundOf, weekEnd } from "../lib/payout";
describe("payout week", () => {
  it("ends week 48 of 2026 on Monday 30 November 00:00 UTC, round 202648", () => {
    expect(new Date(weekEnd("2026-W48") * 1000).toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(new Date(weekEnd("2027-W01") * 1000).toISOString()).toBe("2027-01-11T00:00:00.000Z");
    expect(roundOf("2026-W48")).toBe(202648);
  });
});
