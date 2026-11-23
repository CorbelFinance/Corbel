import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodePacked, hashTypedData, keccak256, toHex } from "viem";

// the mandate contract builds this digest by hand (CorbelMandate.submitScore); viem's signature must match it
describe("signed score digest", () => {
  it("is the same in viem and in the contract's own formula", () => {
    const token = "0x00000000000000000000000000000000000000aa" as const;
    const domain = { name: "Corbel score", version: "1", chainId: 4663 } as const;
    const types = { Score: [{ name: "token", type: "address" }, { name: "score", type: "uint8" }, { name: "issuedAt", type: "uint64" }] } as const;
    const viemDigest = hashTypedData({ domain, types, primaryType: "Score", message: { token, score: 80, issuedAt: 1_700_000_000n } });
    const dom = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }], [keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId)")), keccak256(toHex("Corbel score")), keccak256(toHex("1")), 4663n]));
    const struct = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }, { type: "uint8" }, { type: "uint64" }], [keccak256(toHex("Score(address token,uint8 score,uint64 issuedAt)")), token, 80, 1_700_000_000n]));
    expect(viemDigest).toBe(keccak256(encodePacked(["bytes2", "bytes32", "bytes32"], ["0x1901", dom, struct])));
  });
});
