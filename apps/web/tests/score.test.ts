import { describe, expect, it } from "vitest";
import { score, type Check } from "../components/app/score";

const mk = (r: Record<string, Check["result"]>): Check[] => Object.entries(r).map(([id, result]) => ({ id, name: id, result, reason: `${id} ${result}` }));
const allPass = { honeypot: "pass", exit: "pass", tax: "pass", owner: "pass", liquidity: "pass", ticker: "pass", creator: "pass" } as const;

describe("Corbel Score", () => {
  it("every check passing scores the 90 ceiling, CLEAN: no token gets 100", () => {
    expect(score(mk(allPass))).toMatchObject({ total: 90, tag: "CLEAN" });
  });

  it("a token you cannot sell is capped at 10 whatever else passes", () => {
    const s = score(mk({ ...allPass, honeypot: "fail" }));
    expect(s.total).toBeLessThanOrEqual(10);
    expect(s.why).toMatch(/cannot be sold/);
  });

  it("a lookalike is capped at 25", () => {
    expect(score(mk({ ...allPass, ticker: "fail" })).total).toBeLessThanOrEqual(25);
  });

  it("an issuer stock token with market-made liquidity (caution) still scores well", () => {
    const s = score(mk({ ...allPass, owner: "warn", liquidity: "warn", creator: "unknown" }));
    expect(s.total).toBeGreaterThanOrEqual(67);
  });

  it("unknowns pull the score towards the middle, not to zero", () => {
    const s = score(mk({ honeypot: "unknown", exit: "unknown", tax: "unknown", owner: "unknown", liquidity: "unknown", ticker: "unknown", creator: "unknown" }));
    expect(s.total).toBe(45);
  });
});

describe("Corbel Score, measured", () => {
  const withV = (id: string, value: Record<string, number>) => mk(allPass).map((c) => (c.id === id ? { ...c, value } : c));

  it("two tokens with the same pass/warn read differently when what was measured differs", () => {
    const a = score(withV("honeypot", { loss: 0.01 })).total;
    const b = score(withV("honeypot", { loss: 0.08 })).total;
    expect(a).toBeGreaterThan(b);
  });

  it("a deeper pool with burned LP scores higher than one at the thin line", () => {
    const deep = score(withV("liquidity", { depth: 20, burned: 1 })).parts.find((p) => p.id === "liquidity")!.score;
    const thin = score(withV("liquidity", { depth: 1, burned: 0 })).parts.find((p) => p.id === "liquidity")!.score;
    expect(deep).toBe(100);
    expect(thin).toBe(30);
  });

  it("spread-out holders keep the score; concentrated ones pull it down", () => {
    const fair = score(mk(allPass), { top10: 0.15, insiders: 0, creator: 0, holders: 3000, largest: 0.03 });
    const tight = score(mk(allPass), { top10: 0.6, insiders: 0.2, creator: 0.1, holders: 150, largest: 0.2 });
    expect(fair.total).toBe(90);
    expect(tight.total).toBeLessThan(fair.total - 10);
    expect(tight.parts.find((p) => p.id === "holders")!.score).toBeLessThan(30);
  });

  it("one wallet over half the supply caps the score at 25", () => {
    const s = score(mk(allPass), { top10: 0.7, insiders: 0, creator: 0, holders: 900, largest: 0.62 });
    expect(s.total).toBeLessThanOrEqual(25);
    expect(s.why).toMatch(/one wallet holds 62%/);
  });

  it("without a holders read the part is left out and the rest are re-weighted, not counted as a pass", () => {
    const s = score(mk(allPass));
    expect(s.parts.some((p) => p.id === "holders")).toBe(false);
    expect(s.total).toBe(90);
  });
});

describe("Corbel Score, measured caps", () => {
  it("a sale that returns under half of the cost caps the score at 35 even when the result is only a caution", () => {
    const c = mk(allPass).map((x) => (x.id === "exit" ? { ...x, result: "warn" as const, value: { share: 0.06 } } : x));
    const s = score(c);
    expect(s.total).toBeLessThanOrEqual(35);
    expect(s.why).toMatch(/returns 6% of the cost/);
  });
});
