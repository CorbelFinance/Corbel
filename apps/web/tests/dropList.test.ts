import { describe, expect, it } from "vitest";
import { encodePacked, keccak256, type Hex } from "viem";
import { buildList, dropLeaf } from "../lib/dropList";

// the contract's own check: fold the proof onto the leaf with sorted pairs and compare with the root
const verify = (leaf: Hex, proof: Hex[], root: Hex) => proof.reduce((h, p) => (h < p ? keccak256(encodePacked(["bytes32", "bytes32"], [h, p])) : keccak256(encodePacked(["bytes32", "bytes32"], [p, h]))), leaf) === root;

describe("reward drop list", () => {
  it("gives every wallet a proof the contract accepts, and none for a changed amount", () => {
    const rows = [
      { wallet: "0x00000000000000000000000000000000000000a1", total: 1_578_973.9 },
      { wallet: "0x00000000000000000000000000000000000000b2", total: 1_023_138 },
      { wallet: "0x00000000000000000000000000000000000000c3", total: 622_233 },
      { wallet: "0x00000000000000000000000000000000000000d4", total: 0 },
    ];
    const l = buildList(rows);
    expect(l.list).toHaveLength(3);
    expect(BigInt(l.total)).toBe((1_578_973n + 1_023_138n + 622_233n) * 10n ** 18n);
    for (const i of l.list) expect(verify(dropLeaf(i.wallet, BigInt(i.amount)), i.proof as Hex[], l.root)).toBe(true);
    const first = l.list[0]!;
    expect(verify(dropLeaf(first.wallet, BigInt(first.amount) + 1n), first.proof as Hex[], l.root)).toBe(false);
  });
});
