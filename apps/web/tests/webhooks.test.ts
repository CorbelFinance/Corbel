import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { sign } from "../lib/webhooks";

describe("webhook signature", () => {
  it("is the hex HMAC-SHA256 of the raw body with the wallet's secret", () => {
    const body = JSON.stringify({ id: 1, kind: "liquidity" });
    expect(sign("s3cret", body)).toBe(createHmac("sha256", "s3cret").update(body).digest("hex"));
    expect(sign("s3cret", body)).not.toBe(sign("other", body));
  });
});
