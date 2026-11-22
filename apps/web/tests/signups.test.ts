import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let M: typeof import("../lib/signups");
let Y: typeof import("../lib/sybil");
beforeAll(async () => {
  process.env.CORBEL_DB = join(mkdtempSync(join(tmpdir(), "su-")), "index.db");
  Y = await import("../lib/sybil");
  M = await import("../lib/signups");
});
const req = new Request("https://x/api/auth/verify");

describe("sign-ins list", () => {
  it("lists wallets and Google hashes newest first, with counts", () => {
    Y.noteVisit(req, "0xAbC0000000000000000000000000000000000001");
    Y.noteVisit(req, "google:0123456789abcdef01234567");
    Y.noteVisit(req, "0xAbC0000000000000000000000000000000000001");
    const l = M.listSignups();
    expect(l.total).toBe(2);
    expect(l.today).toBe(2);
    expect(l.rows.map((r) => r.kind).sort()).toEqual(["google", "wallet"]);
    const g = l.rows.find((r) => r.kind === "google")!;
    expect(g.who).toBe("0123456789");
    expect(g.coins).toBeNull();
    expect(JSON.stringify(l)).not.toMatch(/@/);
  });
});
