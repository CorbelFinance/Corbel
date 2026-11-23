import { describe, expect, it } from "vitest";
import { keccak256, toHex, type Hex } from "viem";
import { leafOf, proofOf, rootOf, verifyProof } from "../lib/ledger";

describe("verdict ledger", () => {
  const leaves: Hex[] = Array.from({ length: 7 }, (_, i) => keccak256(toHex(`v${i}`)));
  it("proves every leaf against the root, odd counts included", () => {
    const root = rootOf(leaves);
    leaves.forEach((l, i) => expect(verifyProof(l, proofOf(leaves, i), root)).toBe(true));
  });
  it("rejects a changed verdict", () => {
    const v = { token: "0x00000000000000000000000000000000000000aa", block: "100", results: JSON.stringify({ honeypot: "fail" }) };
    const all = [leafOf(v), ...leaves];
    const root = rootOf(all);
    const forged = leafOf({ ...v, results: JSON.stringify({ honeypot: "pass" }) });
    expect(verifyProof(forged, proofOf(all, 0), root)).toBe(false);
    expect(verifyProof(all[0]!, proofOf(all, 0), root)).toBe(true);
  });
});
