import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let H: typeof import("../lib/holderGate");
const HOLDER = "0x00000000000000000000000000000000000000a7";
const LOCKER_USER = "0x00000000000000000000000000000000000000b7";
const NOBODY = "0x00000000000000000000000000000000000000c7";
const LOCKER = "0xd0f7d8c6e9f6d80c297bebe4f7fd1b9c8125c32f";

beforeAll(async () => {
  process.env.CORBEL_DB = join(mkdtempSync(join(tmpdir(), "hg-")), "index.db");
  process.env.CORBEL_TOKEN = "0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1";
  const S = await import("../lib/sybil");
  const put = S.sybilDb()!.prepare("INSERT INTO xfer (tx, li, block, src, dst, val, at) VALUES (?, 0, 1, ?, ?, ?, ?)");
  const long = Date.now() - 30 * 86_400_000;
  put.run("h1", "0x0000000000000000000000000000000000000001", HOLDER, 5_000, long); // held all week
  put.run("l1", "0x0000000000000000000000000000000000000001", LOCKER_USER, 2_000, long);
  put.run("l2", LOCKER_USER, LOCKER, 2_000, long); // locked counts in full
  H = await import("../lib/holderGate");
});

describe("tools open to every signed-in wallet (since 2026-11-26)", () => {
  it("passes any wallet: no tier is named for Before you sign or the drain alarm", () => {
    expect(H.holderOk(HOLDER, "preview")).toBe(true);
    expect(H.holderOk(LOCKER_USER, "drain")).toBe(true);
    expect(H.holderOk(NOBODY, "preview")).toBe(true);
  });

  it("asks a visitor who is not signed in to sign in", async () => {
    const r = H.holderGate(new Request("https://x/api/preview", { method: "POST" }), "preview");
    expect(r?.status).toBe(401);
    const j = (await r!.json()) as { error: string; need: string | null; signedIn: boolean };
    expect(j).toMatchObject({ need: null, signedIn: false });
    expect(j.error).toMatch(/every wallet that signs in/);
  });
});
