import { describe, expect, it } from "vitest";
import { diffSnaps } from "../lib/watchEngine";

const snap = (checks: Record<string, string>, liquidity: number | null, twins: number | null) => ({
  symbol: "ABC",
  checks: Object.fromEntries(Object.entries(checks).map(([id, result]) => [id, { result, name: id === "honeypot" ? "Can you sell" : "Owner rights" }])),
  liquidity,
  twins,
});

describe("watch alerts", () => {
  it("raises a check that got worse, never one that got better", () => {
    const e = diffSnaps(snap({ honeypot: "pass", owner: "fail" }, 1000, 0), snap({ honeypot: "fail", owner: "pass" }, 1000, 0));
    expect(e).toEqual([{ kind: "check", text: "Can you sell went from pass to fail." }]);
  });
  it("raises liquidity only when it halves, and a new lookalike ticker", () => {
    expect(diffSnaps(snap({}, 1000, 0), snap({}, 600, 0))).toEqual([]);
    const e = diffSnaps(snap({}, 1000, 0), snap({}, 400, 2));
    expect(e.map((x) => x.kind)).toEqual(["liquidity", "ticker"]);
    expect(e[0]!.text).toBe("Pool depth fell from $1,000 to $400.");
  });
});

describe("drain alarm", () => {
  it("fires when half or more of a base balance leaves, not on small moves or arrivals", async () => {
    const { diffWallet } = await import("../lib/watchEngine");
    expect(diffWallet({ ETH: 2, USDG: 100, WETH: 0 }, { ETH: 1.5, USDG: 30, WETH: 5 })).toEqual(["Funds left: USDG 100 → 30."]);
  });
});
