import { describe, expect, it } from "vitest";
import { taxCsv } from "../lib/taxCsv";

const base = { at: Date.UTC(2026, 10, 24, 8, 0, 0), block: 1, tx: "0xabc", kind: "buy" as const, token: "0xaa", symbol: "AAA", amount: 100, counter: { symbol: "ETH", amount: 0.00000001 }, usd: 12.5, gasEth: 0.0000001, gasUsd: 0.0002 };

describe("tax file", () => {
  it("puts the oldest movement first, splits in and out, and writes plain decimals", () => {
    const [head, a, b] = taxCsv([{ ...base, block: 2, kind: "sell", amount: -40 }, base]).trim().split("\r\n");
    expect(head!.split(",")).toHaveLength(14);
    expect(a).toBe("2026-11-24T08:00:00Z,buy,AAA,0xaa,100,,ETH,0.00000001,12.5,0.0000001,0.0002,1,0xabc,");
    expect(b!.split(",").slice(4, 6)).toEqual(["", "40"]);
  });
  it("never lets a token's ticker run as a spreadsheet formula or break a row", () => {
    const line = (symbol: string) => taxCsv([{ ...base, symbol }]).trim().split("\r\n")[1]!;
    for (const s of ["=1+1", "+x", "-x", "@x"]) expect(line(s)).toContain(`,'${s},`);
    expect(line('=HYPERLINK("a","b")')).toContain(`,"'=HYPERLINK(""a"",""b"")",`);
    expect(line("A,B")).toContain(',"A,B",');
  });
  it("marks a token that wears a base token's ticker", () => {
    expect(taxCsv([{ ...base, symbol: "USDG" }])).toContain("not the real USDG");
    expect(taxCsv([{ ...base, symbol: "USDG", token: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" }])).not.toContain("not the real");
  });
  it("leaves unread values empty, never zero", () => {
    expect(taxCsv([{ ...base, usd: null, gasEth: null, gasUsd: null, counter: null }]).trim().split("\r\n")[1]!.split(",").slice(6, 11)).toEqual(["", "", "", "", ""]);
  });
});
