import { describe, expect, it } from "vitest";
import { buyersFrom } from "./retention.ts";

const T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const log = (tx: string, from: string, to: string, v: bigint) => ({ topics: [T, pad(from), pad(to)], data: `0x${v.toString(16)}`, transactionHash: tx });

describe("buyers from transfer logs", () => {
  const pool = A(0x100), router = A(0x200), alice = A(0xa), bob = A(0xb), carol = A(0xc);
  const src = new Set([pool]);
  it("counts the wallet at the end of a routed buy, not the router", () => {
    const m = buyersFrom([log("0x1", pool, router, 100n), log("0x1", router, alice, 100n)], src);
    expect([...m.entries()]).toEqual([[alice, 100n]]);
  });
  it("ignores plain transfers between wallets and sells into the pool", () => {
    const m = buyersFrom([log("0x2", alice, bob, 50n), log("0x3", carol, pool, 70n)], src);
    expect(m.size).toBe(0);
  });
  it("adds up several buys of one wallet", () => {
    const m = buyersFrom([log("0x4", pool, bob, 10n), log("0x5", pool, bob, 15n)], src);
    expect(m.get(bob)).toBe(25n);
  });
});

import { isDelegatedWallet } from "../holders.ts";
describe("EIP-7702 wallets", () => {
  it("count as people, not contracts", () => {
    expect(isDelegatedWallet("0xef0100e6cae83bde06e4c305530e199d7217f42808555b")).toBe(true);
    expect(isDelegatedWallet("0x6080604052")).toBe(false);
  });
});
