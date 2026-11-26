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

describe("telegram group", () => {
  it("answers commands addressed to it in a group, and ignores another bot's", async () => {
    expect(await T.onMessage(-100, "/ca@corbel_test_bot")).toMatch(/0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1/);
    expect(await T.onMessage(-100, "/ca@other_bot")).toBeNull();
    expect(await T.onMessage(-100, "/help")).toMatch(/\/burn/);
  });
  it("says /ca has one token and names copies as not ours", () => {
    const t = T.caText();
    expect(t).toMatch(/one token/);
    expect(t.split("\n").length).toBeGreaterThan(3);
  });
});

describe("telegram feed texts", () => {
  let F: typeof import("../lib/tgFeed");
  beforeAll(async () => {
    F = await import("../lib/tgFeed");
  });
  const TX = `0x${"ab".repeat(32)}`;
  it("posts a buy with coins, ETH, dollars, a short wallet and the tx", () => {
    const t = F.buyText({ coins: 1_234_567, eth: 0.05, usd: 82.6, buyer: "0x1234567890abcdef1234567890abcdef12345678", tx: TX }, 500);
    expect(t).toMatch(/^🟢 Buy: 1\.23M \$CORBEL for 0\.05 ETH \(\$82\.60\)/);
    expect(t).toMatch(/Wallet 0x1234…5678/);
    expect(t).toContain(`/tx/${TX}`);
  });
  it("calls out a big buy", () => {
    expect(F.buyText({ coins: 10, eth: 1, usd: 1650, buyer: "0x1234567890abcdef1234567890abcdef12345678", tx: TX }, 500)).toMatch(/^🟢🟢🟢 Big buy/);
  });
  it("posts a burn with its source and the running total", () => {
    const t = F.burnText({ coins: 1_177_712.4, by: "contract", eth: 0.027266, tx: TX, totalDestroyed: 4_364_968 });
    expect(t).toMatch(/^🔥 1,177,712 \$CORBEL burned/);
    expect(t).toMatch(/Fee Burn contract, bought with 0\.0273 ETH of fees/);
    expect(t).toMatch(/Burned so far: 4,364,968/);
    expect(F.burnText({ coins: 5, by: "team", eth: null, tx: TX, totalDestroyed: null })).toMatch(/Team wallet/);
  });
  it("posts a lock", () => {
    expect(F.lockText({ coins: 5_000_000, from: "0x1234567890abcdef1234567890abcdef12345678", tx: TX })).toMatch(/^🔒 5,000,000 \$CORBEL locked on HoodLock/);
  });
});
