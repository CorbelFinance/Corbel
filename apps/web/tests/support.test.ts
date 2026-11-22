import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let S: typeof import("../lib/support");
beforeAll(async () => {
  process.env.CORBEL_DB = join(mkdtempSync(join(tmpdir(), "sp-")), "index.db");
  S = await import("../lib/support");
});
const req = new Request("https://x/api/support");

describe("support", () => {
  it("keeps a message with its page and lists it open first", () => {
    expect(S.addMessage(req, { text: "The swap button does nothing on mobile", contact: "@someone", page: "/app/trade/terminal?token=0xabc" })).toBeNull();
    const l = S.listMessages();
    expect(l.open).toBe(1);
    expect(l.rows[0]).toMatchObject({ page: "/app/trade/terminal?token=0xabc", contact: "@someone", done: false });
  });
  it("refuses empty, long and odd-page messages sensibly", () => {
    expect(S.addMessage(req, { text: "hi" })).toMatch(/few words/);
    expect(S.addMessage(req, { text: "x".repeat(S.SUPPORT.maxChars + 1) })).toMatch(/At most/);
    expect(S.addMessage(req, { text: "a real question here", page: "https://evil.example/" })).toBeNull();
    expect(S.listMessages().rows.find((m) => m.text === "a real question here")!.page).toBe("/");
  });
  it("limits one visitor per hour and closes a message", () => {
    let last: string | null = null;
    for (let i = 0; i < S.SUPPORT.perHour + 1; i++) last = S.addMessage(req, { text: `message number ${i} here` });
    expect(last).toMatch(/enough messages/);
    const id = S.listMessages().rows[0]!.id;
    S.setDone(id, true);
    expect(S.listMessages().rows.find((m) => m.id === id)!.done).toBe(true);
  });
});
