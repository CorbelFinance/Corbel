import { describe, expect, it } from "vitest";
import { toFunctionSelector } from "viem";
import { scanSelectors } from "./contract.ts";
import { decodeInitialize } from "./pools.ts";

describe("scanSelectors", () => {
  it("finds admin functions present in a dispatcher", () => {
    const mint = toFunctionSelector("mint(address,uint256)").slice(2);
    const pause = toFunctionSelector("pause()").slice(2);
    const code = `0x6080${"63" + mint}1461001${"63" + pause}14`;
    expect(scanSelectors(code).sort()).toEqual(["mint", "pause"]);
  });
  it("ignores selector bytes that are not PUSH4 operands", () => {
    const mint = toFunctionSelector("mint(address,uint256)").slice(2);
    expect(scanSelectors(`0x60${mint}`)).toEqual([]);
  });
});

describe("decodeInitialize", () => {
  it("decodes a real v4 Initialize log from chain 4663", () => {
    const p = decodeInitialize({
      topics: [
        "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438",
        "0x623cd8197330202b093e61690247bdf2f326c972a619812d1f2c1c91a06df7ee",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000002110c40785b06295c52e8686d4855c5f944ea852",
      ],
      data: ("0x" +
        "00000000000000000000000000000000000000000000000000000000000009c4" +
        "00000000000000000000000000000000000000000000000000000000000000c8" +
        "000000000000000000000000b6a38a109f8e47d0e8ee1cc09aa039d8745320cc" +
        "0000000000000000000000000000000000000000000000000000000000000001" +
        "0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`,
      blockNumber: 1n,
      transactionHash: "0xb2d95e42e2dc6f9b549552cba14d50049a3731361306a72189335a174e41ee9a",
    });
    expect(p.key.fee).toBe(2500);
    expect(p.key.tickSpacing).toBe(200);
    expect(p.key.hooks.toLowerCase()).toBe("0xb6a38a109f8e47d0e8ee1cc09aa039d8745320cc");
    expect(p.key.currency1.toLowerCase()).toBe("0x2110c40785b06295c52e8686d4855c5f944ea852");
  });
});
