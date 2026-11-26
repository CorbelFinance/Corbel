import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const CREATOR = "0x00000000000000000000000000000000000000c1";
const TOKEN = "0x00000000000000000000000000000000000000f1";
const CORBEL = "0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1";
const T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const coins = (n: number) => `0x${(BigInt(n) * 10n ** 18n).toString(16)}`;
const receipts: Record<string, unknown> = {
  ["0x" + "a".repeat(64)]: { status: "success", blockNumber: 10n, logs: [{ address: CORBEL, topics: [T, pad(CREATOR), pad("0x0")], data: coins(1_200_000) }] },
  ["0x" + "b".repeat(64)]: { status: "success", blockNumber: 10n, logs: [{ address: CORBEL, topics: [T, pad(CREATOR), pad("0x000000000000000000000000000000000000dead")], data: coins(5_000_000) }] },
  ["0x" + "c".repeat(64)]: { status: "success", blockNumber: 10n, logs: [{ address: CORBEL, topics: [T, pad(CREATOR), pad("0x0")], data: coins(100) }] },
};

vi.mock("@corbel/indexer", () => ({ launchCreator: (t: string) => (t === TOKEN ? CREATOR : null) }));
vi.mock("@corbel/data/chain", () => ({ getClient: () => ({ getTransactionReceipt: async ({ hash }: { hash: string }) => receipts[hash] ?? null }) }));
vi.mock("../lib/corbelPrice", () => ({ corbelCreditPrice: async () => ({ spot: 0.00002, average: 0.00002, used: 0.00002, samples: 1 }) }));

let C: typeof import("../lib/claims");
beforeAll(async () => {
  process.env.CORBEL_DB = join(mkdtempSync(join(tmpdir(), "cc-")), "index.db");
  process.env.CLAIMS_OPEN = "1";
  process.env.CLAIM_BURN_USD = "20";
  C = await import("../lib/claims");
});

describe("team claims", () => {
  it("accepts only clean fields", () => {
    expect(C.cleanFields({ website: "http://x.com" })).toEqual({ error: "The website must be an https:// link." });
    expect(C.cleanFields({ x: "bad handle!" })).toHaveProperty("error");
    expect(C.cleanFields({ team: ["0x1"] })).toHaveProperty("error");
    expect(C.cleanFields({ website: "https://corbel.finance", x: "@corbelfinance", telegram: "https://t.me/corbelfinance", note: "<b>hi</b>" })).toEqual({ website: "https://corbel.finance", x: "corbelfinance", telegram: "corbelfinance", team: [], note: "bhi/b" });
  });

  it("prices a claim in coins", async () => {
    expect(await C.claimPrice()).toEqual({ usd: 20, coins: 1_000_000, price: 0.00002 });
  });

  it("lets only the creator claim, with a burn() big enough, once per burn", async () => {
    const tx = (ch: string) => "0x" + ch.repeat(64);
    expect(await C.makeClaim("0x00000000000000000000000000000000000000e9", TOKEN, tx("a"), {})).toMatchObject({ status: 403 });
    expect(await C.makeClaim(CREATOR, "0x00000000000000000000000000000000000000f2", tx("a"), {})).toMatchObject({ status: 400 });
    expect(await C.makeClaim(CREATOR, TOKEN, tx("b"), {})).toMatchObject({ status: 400 }); // sent to dead, not burned: a Credits top-up, not a claim
    expect(await C.makeClaim(CREATOR, TOKEN, tx("c"), {})).toMatchObject({ status: 400 }); // too small
    const ok = await C.makeClaim(CREATOR, TOKEN, tx("a"), { website: "https://example.org", team: [CREATOR] });
    expect(ok).toMatchObject({ ok: true, claim: { coins: 1_200_000, usd: 24, website: "https://example.org", team: [CREATOR] } });
    // editing needs no new burn; another token cannot reuse the same burn
    expect(await C.makeClaim(CREATOR, TOKEN, null, { note: "Building on Robinhood Chain" })).toMatchObject({ ok: true, claim: { note: "Building on Robinhood Chain", website: null } });
    expect(C.claimTotals()).toEqual({ claims: 1, coins: 1_200_000 });
  });

  it("stays shut when claims are closed", async () => {
    process.env.CLAIMS_OPEN = "";
    expect(await C.makeClaim(CREATOR, TOKEN, null, {})).toMatchObject({ status: 403 });
    process.env.CLAIMS_OPEN = "1";
  });
});
