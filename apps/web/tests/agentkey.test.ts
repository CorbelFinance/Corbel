import { describe, expect, it } from "vitest";
import { bondPath } from "../components/app/AgentKey";

describe("bond path, as CorbelMandate._violate pays it", () => {
  it("takes the slash share of what is left at each violation", () => {
    const p = bondPath(1, 20, 2, 3); // 1 -> 0.8 -> 0.64
    expect(p.steps.map((s) => s.cut)).toEqual([expect.closeTo(0.2), expect.closeTo(0.16)]);
    expect(p.left).toBeCloseTo(0.64);
    expect(p.paid).toBeCloseTo(0.36);
    expect(p.seized).toBe(0);
  });
  it("hands the rest to the owner at the freezing strike", () => {
    const p = bondPath(1, 20, 3, 3); // 0.512 left after three cuts, then seized
    expect(p.seized).toBeCloseTo(0.512);
    expect(p.left).toBe(0);
    expect(p.paid).toBeCloseTo(1);
  });
  it("keeps the bond with no violation", () => {
    expect(bondPath(5, 20, 0, 3)).toMatchObject({ left: 5, paid: 0, seized: 0 });
  });
});
