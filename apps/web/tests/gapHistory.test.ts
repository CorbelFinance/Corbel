import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let G: typeof import("../lib/gapHistory");
beforeAll(async () => {
  process.env.CORBEL_DB = join(mkdtempSync(join(tmpdir(), "gh-")), "index.db");
  G = await import("../lib/gapHistory");
});

const at = (s: string) => Date.parse(s);
const FRI_CLOSE = at("2026-11-27T21:00:00Z") / 1000; // Friday's close, as the chart data stamps it

describe("gap history", () => {
  it("knows which moments belong to a weekend, in winter and in summer", () => {
    expect(G.nyDaylight(at("2026-11-27T12:00:00Z"))).toBe(false);
    expect(G.nyDaylight(at("2026-07-10T12:00:00Z"))).toBe(true);
    expect(G.weekendOf(at("2026-11-27T20:59:00Z"))).toBeNull(); // winter Friday, market still open
    expect(G.weekendOf(at("2026-11-27T21:00:00Z"))).toBe("2026-11-27");
    expect(G.weekendOf(at("2026-11-29T12:00:00Z"))).toBe("2026-11-27");
    expect(G.weekendOf(at("2026-11-30T14:29:00Z"))).toBe("2026-11-27");
    expect(G.weekendOf(at("2026-11-30T14:30:00Z"))).toBeNull(); // the winter bell
    expect(G.weekendOf(at("2026-07-10T20:00:00Z"))).toBe("2026-07-10"); // summer close
    expect(G.weekendOf(at("2026-07-13T13:30:00Z"))).toBeNull(); // summer bell
    expect(G.weekendOf(at("2026-11-25T12:00:00Z"))).toBeNull();
  });

  it("keeps the last chain price before the bell and settles with Monday's open", () => {
    const row = (chain: number, closeAt = FRI_CLOSE) => [{ symbol: "NVDA", token: "0xAB", chain, close: 200, closeAt }];
    expect(G.recordWeekend(at("2026-11-28T10:00:00Z"), row(206))).toBe(1);
    expect(G.recordWeekend(at("2026-11-30T14:20:00Z"), row(210))).toBe(1); // the last one before the bell wins
    expect(G.recordWeekend(at("2026-11-29T10:00:00Z"), [{ symbol: "TSLA", token: "0xCD", chain: 300, close: 310, closeAt: FRI_CLOSE - 86_400 }])).toBe(0); // Thursday's close: no false gap
    expect(G.recordWeekend(at("2026-11-26T10:00:00Z"), row(999))).toBe(0); // a weekday records nothing
    expect(G.waitingForOpen(at("2026-11-30T14:40:00Z"))).toEqual([]); // too early to read the open
    expect(G.waitingForOpen(at("2026-11-30T15:05:00Z"))).toEqual([{ week: "2026-11-27", symbol: "NVDA" }]);
    G.settle("2026-11-27", "NVDA", 207); // the chain said +5%, the open +3.5%: same way, more than half
    const h = G.gapHistory();
    expect(h.weeks[0]!.rows[0]).toMatchObject({ symbol: "NVDA", chain: 210, open: 207, closed: 1 });
    expect(h.weeks[0]!.rows[0]!.gap).toBeCloseTo(0.05);
    expect(h.bySymbol).toEqual([{ symbol: "NVDA", weekends: 1, closed: 1 }]);
    expect(G.recordWeekend(at("2026-11-30T14:25:00Z"), row(250))).toBe(1);
    expect(G.gapHistory().weeks[0]!.rows[0]!.chain).toBe(210); // a settled row never changes
  });

  it("counts an open that went the other way, or not far enough, as not closed", () => {
    const fri = at("2026-12-04T21:00:00Z") / 1000;
    G.recordWeekend(at("2026-12-06T10:00:00Z"), [
      { symbol: "AAPL", token: "0x1", chain: 110, close: 100, closeAt: fri },
      { symbol: "MSFT", token: "0x2", chain: 110, close: 100, closeAt: fri },
    ]);
    G.settle("2026-12-04", "AAPL", 97); // chain up, open down
    G.settle("2026-12-04", "MSFT", 103); // up, but a third of the gap
    const rows = G.gapHistory().weeks[0]!.rows;
    expect(rows.find((r) => r.symbol === "AAPL")!.closed).toBe(0);
    expect(rows.find((r) => r.symbol === "MSFT")!.closed).toBe(0);
  });
});

describe("gap history, rebuilt weekends", () => {
  let R: typeof import("../lib/gapBackfill");
  beforeAll(async () => {
    R = await import("../lib/gapBackfill");
  });
  const bar = (day: string, open: number | null, close: number | null) => ({ day, open, close });

  it("pairs each Friday's close with the next trading day's open, a Monday holiday included", () => {
    const w = R.weekendsFromBars([bar("2026-08-28", 10, 11), bar("2026-08-31", 12, 12), bar("2026-09-04", 13, 14), bar("2026-09-08", 15, 15)], Date.parse("2026-12-01"));
    expect(w).toEqual([
      { week: "2026-08-28", close: 11, openDay: "2026-08-31", open: 12 },
      { week: "2026-09-04", close: 14, openDay: "2026-09-08", open: 15 }, // Labor Day: Tuesday's open
    ]);
  });

  it("skips a Friday holiday, a hole in the data and the weekend not over yet", () => {
    expect(R.weekendsFromBars([bar("2026-04-02", 1, 1), bar("2026-04-06", 1, 1)], Date.parse("2026-12-01"))).toEqual([]); // Good Friday: no Friday bar
    expect(R.weekendsFromBars([bar("2026-10-02", 1, 2), bar("2026-10-12", 3, 3)], Date.parse("2026-12-01"))).toEqual([]);
    expect(R.weekendsFromBars([bar("2026-11-20", 1, 2), bar("2026-11-23", 3, 3)], Date.parse("2026-11-23"))).toEqual([]);
  });

  it("judges like the live sweep: same way and at least half the gap", () => {
    expect(R.judge(100, 110, 106)).toMatchObject({ closed: 1 });
    expect(R.judge(100, 110, 104)).toMatchObject({ closed: 0 });
    expect(R.judge(100, 90, 103)).toMatchObject({ closed: 0 });
    expect(R.judge(100, 110, 106).gap).toBeCloseTo(0.1);
  });

  it("stores rebuilt weekends but never over a live row, and marks them", () => {
    G.recordWeekend(at("2026-11-28T12:00:00Z"), [{ symbol: "LIVE", token: "0xa", chain: 105, close: 100, closeAt: FRI_CLOSE }]);
    const n = G.storeRebuilt([
      { week: "2026-11-27", symbol: "LIVE", token: "0xa", close: 100, chain: 1, chainAt: 0, open: 1, gap: 0, move: 0, closed: 0 },
      { week: "2026-11-20", symbol: "LIVE", token: "0xa", close: 100, chain: 102, chainAt: 0, open: 101, gap: 0.02, move: 0.01, closed: 1 },
    ]);
    expect(n).toBe(1);
    const rows = G.gapHistory().weeks.flatMap((w) => w.rows).filter((r) => r.symbol === "LIVE");
    expect(rows.find((r) => r.week === "2026-11-27")).toMatchObject({ chain: 105, src: "live" });
    expect(rows.find((r) => r.week === "2026-11-20")).toMatchObject({ src: "rebuilt", closed: 1 });
    expect([...G.weeksOf("LIVE")].sort()).toEqual(["2026-11-20", "2026-11-27"]);
  });
});
