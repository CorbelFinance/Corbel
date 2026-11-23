import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let T: typeof import("../lib/telegram");
beforeAll(async () => {
  process.env.CORBEL_DB = join(mkdtempSync(join(tmpdir(), "tg-")), "index.db");
  process.env.TELEGRAM_BOT_NAME = "corbel_test_bot";
  T = await import("../lib/telegram");
});

describe("telegram link", () => {
  const OWNER = "0x00000000000000000000000000000000000000a1";
  it("links a chat with a one-time code, once", async () => {
    const { code, url } = T.linkCode(OWNER);
    expect(url).toBe(`https://t.me/corbel_test_bot?start=${code}`);
    expect(await T.onMessage(42, `/start ${code}`)).toMatch(/^Linked to 0x0000…00a1/);
    expect(T.linkedChat(OWNER)).toBe(42);
    expect(await T.onMessage(43, `/start ${code}`)).toMatch(/expired/);
  });
  it("unlinks on /stop and explains a bare /start", async () => {
    expect(await T.onMessage(42, "/stop")).toMatch(/Unlinked/);
    expect(T.linkedChat(OWNER)).toBeNull();
    expect(await T.onMessage(7, "/start")).toMatch(/link this chat/);
    expect(await T.onMessage(7, "hello")).toBeNull();
  });
});
