import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let P: typeof import("../lib/points");
let A: typeof import("../lib/auth");
beforeAll(async () => {
  process.env.CORBEL_DB = join(mkdtempSync(join(tmpdir(), "pts-")), "index.db");
  process.env.SESSION_SECRET = "test-secret-for-points-only-0123456789";
  process.env.TEAM_WALLETS = "0x00000000000000000000000000000000000000ee";
  P = await import("../lib/points");
  A = await import("../lib/auth");
});
const req = (w: string) => new Request("http://x/", { headers: { cookie: A.sessionCookie(w, false).split(";")[0]! } });

describe("reward points", () => {
  const W = "0x00000000000000000000000000000000000000a1";
  it("count each action up to its daily cap and no further", () => {
    let total = 0;
    for (let i = 0; i < 25; i++) total += P.award(req(W), "check");
    expect(total).toBe(P.ACTIONS.check.pts * P.ACTIONS.check.cap);
    expect(P.mine(W)!.today.check).toBe(P.ACTIONS.check.cap);
  });
  it("count a transaction once, give nothing without a session or to the team", () => {
    expect(P.award(req(W), "swap", "0xabc")).toBe(P.ACTIONS.swap.pts);
    expect(P.award(req(W), "swap", "0xabc")).toBe(0);
    expect(P.award(new Request("http://x/"), "check")).toBe(0);
    expect(P.award(req("0x00000000000000000000000000000000000000ee"), "check")).toBe(0);
  });
  it("keeps nicknames unique, clean and away from team-like names", () => {
    expect(P.setNick(W, "ab")).toMatch(/3 to 20/);
    expect(P.setNick(W, "corbel_team")).toMatch(/mistaken/);
    expect(P.setNick(W, "good.name")).toBeNull();
    expect(P.setNick("0x00000000000000000000000000000000000000b2", "GOOD.NAME")).toMatch(/taken/);
  });
});

describe("points follow effort", () => {
  it("no action without a transaction earns more in a day than one swap, and transactions earn the most each", async () => {
    const { ACTIONS } = await import("../lib/points");
    const all = Object.entries(ACTIONS) as [string, { pts: number; cap: number; onchain?: boolean }][];
    const swap = ACTIONS.swap.pts;
    for (const [id, a] of all) if (!a.onchain) expect(a.pts * a.cap, id).toBeLessThanOrEqual(swap);
    const minChain = Math.min(...all.filter(([, a]) => a.onchain).map(([, a]) => a.pts));
    const maxOff = Math.max(...all.filter(([, a]) => !a.onchain).map(([, a]) => a.pts));
    expect(minChain).toBeGreaterThan(maxOff);
  });
});

describe("the newest tools earn points", () => {
  it("copycat finder, public record, decision log and holder card each count up to their cap", () => {
    const W3 = "0x00000000000000000000000000000000000000d4";
    for (const id of ["copycats", "record", "log", "card"] as const) {
      const a = P.ACTIONS[id];
      expect(a.pts, id).toBeLessThanOrEqual(3);
      let got = 0;
      for (let i = 0; i < a.cap + 3; i++) got += P.award(req(W3), id);
      expect(got, id).toBe(a.pts * a.cap);
    }
  });
});

describe("nothing gets lost", () => {
  it("logs every attempt with its outcome, and the audit finds no missing points", () => {
    const W2 = "0x00000000000000000000000000000000000000c3";
    for (let i = 0; i < P.ACTIONS.radar.cap + 2; i++) P.award(req(W2), "radar");
    P.award(req("0x00000000000000000000000000000000000000ee"), "radar");
    const a = P.audit()!;
    expect(a.problems).toEqual([]);
    expect(a.refused.cap).toBeGreaterThanOrEqual(2);
    expect(a.refused.team).toBeGreaterThanOrEqual(1);
    expect(P.board().some((b) => b.wallet === W2)).toBe(true);
  });
  it("ranks equal points by who got there first", () => {
    const x = "0x00000000000000000000000000000000000000d4", y = "0x00000000000000000000000000000000000000d5";
    P.award(req(x), "vote");
    P.award(req(y), "vote");
    const b = P.board();
    expect(b.findIndex((r) => r.wallet === x)).toBeLessThan(b.findIndex((r) => r.wallet === y));
  });
});

describe("report points", () => {
  it("grants flat points, keeps the weekly cap, refuses team wallets and logs every grant", () => {
    const W3 = "0x00000000000000000000000000000000000000e5";
    for (let i = 0; i < 3; i++) expect(P.grant("0xadmin", W3, "broken", `dead link ${i}`)).toBeNull();
    expect(P.grant("0xadmin", W3, "broken", "dead link 4")).toMatch(/already has 3/);
    expect(P.grant("0xadmin", W3, "critical", "drain path in swap")).toBeNull();
    expect(P.grant("0xadmin", "0x00000000000000000000000000000000000000ee", "bug", "team wallet")).toMatch(/Team/);
    expect(P.grant("0xadmin", W3, "idea", "")).toMatch(/Say what/);
    const row = P.board().find((b) => b.wallet === W3)!;
    expect(row.pts).toBe(3 * P.REPORTS.broken.pts + P.REPORTS.critical.pts);
    expect(P.grants().filter((g) => g.wallet === W3)).toHaveLength(4);
  });
});

describe("the public points log", () => {
  it("seals every row into a chain anyone can recompute, and a changed row breaks it", async () => {
    const { createHash } = await import("node:crypto");
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    P.award(req("0x00000000000000000000000000000000000000f6"), "check");
    const log = P.weekLog()!;
    expect(log.count).toBeGreaterThan(0);
    let prev = log.start!;
    for (const e of log.events) {
      expect(sha([prev, e.n, e.id, e.action, e.pts, e.at, e.tx ?? ""].join("|"))).toBe(e.hash);
      prev = e.hash;
    }
    expect(prev).toBe(log.head);
    // tamper with one row's points: its seal no longer matches
    const e0 = log.events[0]!;
    expect(sha([log.start, e0.n, e0.id, e0.action, e0.pts + 100, e0.at, e0.tx ?? ""].join("|"))).not.toBe(e0.hash);
    // the board's numbers add up from the log
    const sum = new Map<string, number>();
    for (const e of log.events) sum.set(e.id, (sum.get(e.id) ?? 0) + e.pts);
    for (const b of P.board()) expect(Math.abs((sum.get(b.id) ?? 0) - b.pts)).toBeLessThan(0.05);
  });
});
