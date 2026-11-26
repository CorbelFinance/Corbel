import { describe, expect, it } from "vitest";
import { heldOf, unpackHeld } from "./held.ts";

const A = "0x00000000000000000000000000000000000000a1", B = "0x00000000000000000000000000000000000000b2";
const item = (i: number, v: bigint) => i.toString(16).padStart(4, "0") + v.toString(16).padStart(64, "0");

describe("balances of many tokens", () => {
  it("reads index and balance pairs, and ignores an index it never asked for or a cut tail", () => {
    expect(unpackHeld(`0x${item(1, 5n)}${item(0, 7n)}${item(9, 1n)}00ff`, [A, B])).toEqual([[B, 5n], [A, 7n]]);
    expect(unpackHeld("0x", [A])).toEqual([]);
  });
  it("halves a part the node refuses, and an error is never taken for an empty wallet", async () => {
    const sizes: number[] = [];
    const client = (fail: (n: number) => boolean) => ({ call: async ({ data, to }: { data: string; to?: string }) => {
      const n = to ? -1 : Math.round((data.length - 2 - 884 - 64 * 3) / 40);
      sizes.push(n);
      if (fail(n)) throw new Error("refused");
      return { data: `0x${item(0, 1n)}` };
    } });
    const many = Array.from({ length: 1800 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);
    const m = await heldOf(client((n) => n > 1000) as never, A as `0x${string}`, many);
    expect(m.size).toBe(2);
    await expect(heldOf(client(() => true) as never, A as `0x${string}`, many)).rejects.toThrow();
  });
});
