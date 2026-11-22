import { describe, expect, it } from "vitest";
import { redact } from "./redact.ts";

describe("redact", () => {
  it("removes URLs, including keys in path and query", () => {
    const s = redact("HTTP request failed. URL: https://rpc.example.io/v2/abcDEF1234567890abcDEF1234567890xyz?key=secret Status: 429");
    expect(s).not.toMatch(/https?:|example\.io|secret|abcDEF/);
  });
  it("removes IPv4, IPv6 and host:port", () => {
    expect(redact("connect ECONNREFUSED 192.0.2.1:8545")).toBe("connect ECONNREFUSED [ip]");
    expect(redact("from 2a01:4f8:c0c:1234::1 ok")).not.toMatch(/2a01/);
    expect(redact("node rpc.local:3128 down")).toBe("node [host] down");
  });
  it("keeps chain addresses and hashes readable", () => {
    const a = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
    expect(redact(`token ${a}`)).toBe(`token ${a}`);
  });
});

import { cleanText } from "./text.ts";
describe("cleanText", () => {
  it("strips bidi overrides, zero-width and control characters", () => {
    expect(cleanText("US‮DG​\u0007")).toBe("USDG");
    expect(cleanText("  a   b  ")).toBe("a b");
    expect(cleanText("​")).toBe(null);
    expect(cleanText(42)).toBe(null);
    expect(cleanText("x".repeat(100), 10)).toBe("xxxxxxxxxx");
  });
});
