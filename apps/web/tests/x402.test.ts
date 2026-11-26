import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

let X: typeof import("../lib/x402");
const payer = privateKeyToAccount(generatePrivateKey());
const PAYEE = "0x00000000000000000000000000000000000000c0";
beforeAll(async () => {
  process.env.CORBEL_DB = join(mkdtempSync(join(tmpdir(), "x402-")), "index.db");
  X = await import("../lib/x402");
});

async function header(over: Partial<{ to: string; value: string; validBefore: string; nonce: string }> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const a = { from: payer.address, to: (over.to ?? PAYEE) as `0x${string}`, value: over.value ?? "10000", validAfter: String(now - 10), validBefore: over.validBefore ?? String(now + 60), nonce: (over.nonce ?? `0x${"ab".repeat(32)}`) as `0x${string}` };
  const signature = await payer.signTypedData({ domain: X.DOMAIN, types: X.TYPES, primaryType: "ReceiveWithAuthorization", message: { ...a, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore) } });
  return { x402Version: 1, scheme: "exact", network: X.NETWORK, payload: { signature, authorization: a } };
}

describe("x402 payment check", () => {
  it("accepts the payer's own signature for the price to us", async () => {
    expect(await X.verify(await header(), "token", PAYEE)).toBeNull();
  });
  it("refuses underpaying, the wrong payee, a long window and a forged payer", async () => {
    expect(await X.verify(await header({ value: "9999" }), "token", PAYEE)).toMatch(/less than the price/);
    expect(await X.verify(await header({ to: "0x00000000000000000000000000000000000000c1" }), "token", PAYEE)).toMatch(/wrong address/);
    expect(await X.verify(await header({ validBefore: String(Math.floor(Date.now() / 1000) + 3600) }), "token", PAYEE)).toMatch(/longer than/);
    const h = await header();
    h.payload.authorization.from = "0x00000000000000000000000000000000000000dd";
    expect(await X.verify(h, "token", PAYEE)).toMatch(/not the payer/);
  });
  it("round-trips the header encoding", async () => {
    const h = await header();
    expect(X.decodeHeader(Buffer.from(JSON.stringify(h)).toString("base64"))).toEqual(h);
  });
});
