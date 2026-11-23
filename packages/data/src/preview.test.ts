import { describe, expect, it } from "vitest";
import { readMoves } from "./preview.ts";

const T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const AP = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const ALL = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31";
const pad = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const w = (v: bigint) => `0x${v.toString(16).padStart(64, "0")}`;
const ME = "0x00000000000000000000000000000000000000a1";
const THIEF = "0x00000000000000000000000000000000000000ee";
const POOL = "0x0000000000000000000000000000000000000b00";
const ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const USDG = "0x00000000000000000000000000000000000000c0";
const NFT = "0x00000000000000000000000000000000000000d0";

describe("transaction preview moves", () => {
  it("nets a swap: ETH out to the pool, a token back", () => {
    const m = readMoves([
      { address: ETH, topics: [T, pad(ME), pad(POOL)], data: w(10n) },
      { address: USDG, topics: [T, pad(POOL), pad(ME)], data: w(25n) },
    ], ME);
    expect(m.net.get(ETH)?.v).toBe(-10n);
    expect(m.net.get(USDG)?.v).toBe(25n);
    expect([...m.recv.entries()]).toEqual([[`${POOL}|${ETH}`, 10n]]);
  });
  it("catches a drainer: an unlimited approval and an NFT approval for all", () => {
    const m = readMoves([
      { address: USDG, topics: [AP, pad(ME), pad(THIEF)], data: w(2n ** 256n - 1n) },
      { address: NFT, topics: [ALL, pad(ME), pad(THIEF)], data: w(1n) },
    ], ME);
    expect(m.grants).toEqual([
      { token: USDG, spender: THIEF, amount: 2n ** 256n - 1n, all: false, on: true },
      { token: NFT, spender: THIEF, amount: null, all: true, on: true },
    ]);
  });
  it("counts an NFT leaving as one item and ignores other people's transfers", () => {
    const m = readMoves([
      { address: NFT, topics: [T, pad(ME), pad(THIEF), pad("0x07")], data: "0x" },
      { address: USDG, topics: [T, pad(POOL), pad(THIEF)], data: w(5n) },
    ], ME);
    expect(m.net.get(NFT)).toEqual({ v: -1n, nft: true });
    expect(m.net.has(USDG)).toBe(false);
  });
});
