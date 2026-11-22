import { describe, expect, it, vi } from "vitest";
import { readShare, signShare } from "../lib/share";

const A = "0x00000000000000000000000000000000000000aB";

describe("share links", () => {
  it("round-trips the address and expiry", () => {
    const { t, exp } = signShare(A, 24);
    const r = readShare(t);
    expect(r?.address).toBe(A.toLowerCase());
    expect(r?.exp).toBe(exp);
    expect(t).not.toContain(A.slice(2).toLowerCase());
  });
  it("refuses a changed body or signature", () => {
    const { t } = signShare(A, 24);
    const [body, sig] = t.split(".");
    const flipped = `${body!.slice(0, -1)}${body!.endsWith("A") ? "B" : "A"}.${sig}`;
    expect(readShare(flipped)).toBeNull();
    expect(readShare(`${body}.${sig!.slice(0, -1)}x`)).toBeNull();
    expect(readShare("nonsense")).toBeNull();
  });
  it("refuses an expired link", () => {
    const { t } = signShare(A, 1);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 3600_000);
    expect(readShare(t)).toBeNull();
    vi.useRealTimers();
  });
});
