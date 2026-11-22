import { describe, expect, it, vi } from "vitest";
import { readShare, signShare } from "../lib/share";

const A = "0x00000000000000000000000000000000000000aB";
const B = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

describe("share links", () => {
  it("round-trips the address and expiry", () => {
    const { t, exp } = signShare(A, 24);
    const r = readShare(t);
    expect(r?.address).toBe(A.toLowerCase());
    expect(r?.exp).toBe(exp);
  });
  it("never carries the address in a readable form", () => {
    const { t } = signShare(B, 24);
    const raw = Buffer.from(t, "base64url");
    // neither the text, nor the decoded bytes, nor a byte-shifted read holds the address
    expect(t.toLowerCase()).not.toContain(B.slice(2));
    expect(raw.toString("hex")).not.toContain(B.slice(2));
    expect(raw.includes(Buffer.from(B.slice(2), "hex"))).toBe(false);
    // two links for the same address differ: a link cannot be matched to another link
    expect(signShare(B, 24).t).not.toBe(t);
  });
  it("refuses a changed byte, a cut token or nonsense", () => {
    const { t } = signShare(A, 24);
    const raw = Buffer.from(t, "base64url");
    for (const i of [0, 13, 30, raw.length - 1]) {
      const x = Buffer.from(raw);
      x[i] = x[i]! ^ 1;
      expect(readShare(x.toString("base64url"))).toBeNull();
    }
    expect(readShare(t.slice(0, -2))).toBeNull();
    expect(readShare("nonsense")).toBeNull();
    expect(readShare(`${t}.x`)).toBeNull();
  });
  it("refuses an expired link", () => {
    const { t } = signShare(A, 1);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 3600_000);
    expect(readShare(t)).toBeNull();
    vi.useRealTimers();
  });
});
