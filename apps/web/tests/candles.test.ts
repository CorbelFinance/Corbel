import { describe, expect, it } from "vitest";
import { toBars } from "../components/app/Candles";

describe("toBars", () => {
  const t0 = 1_800_000_000 - (1_800_000_000 % 60);

  it("builds OHLC and volume per interval", () => {
    const bars = toBars(
      [
        { t: t0 + 1, price: 10, vol: 1, side: "buy" },
        { t: t0 + 20, price: 12, vol: 2, side: "sell" },
        { t: t0 + 40, price: 9, vol: 3, side: "buy" },
      ],
      60,
    );
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ o: 10, h: 12, l: 9, c: 9, v: 6, vb: 4 });
  });

  it("fills empty intervals with flat candles at the last close, up to `end`", () => {
    const bars = toBars([{ t: t0 + 5, price: 10, vol: 1, side: "buy" }, { t: t0 + 185, price: 11, vol: 1, side: "buy" }], 60, t0 + 300);
    expect(bars.map((b) => b.t)).toEqual([t0, t0 + 60, t0 + 120, t0 + 180, t0 + 240, t0 + 300]);
    expect(bars[1]).toMatchObject({ o: 10, c: 10, v: 0 });
    expect(bars[3]).toMatchObject({ o: 10, c: 11 });
    expect(bars[5]).toMatchObject({ o: 11, c: 11, v: 0 });
  });

  it("returns nothing for no swaps", () => {
    expect(toBars([], 60, t0)).toEqual([]);
  });
});
