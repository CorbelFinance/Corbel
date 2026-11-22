import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { autoPick } from "../lib/autopick";
import type { Model } from "../lib/compute";

let C: typeof import("../lib/credits");
beforeAll(async () => {
  process.env.CORBEL_DB = join(mkdtempSync(join(tmpdir(), "credits-")), "index.db");
  C = await import("../lib/credits");
  // the module makes its tables on first use
  C.balance("0x0000000000000000000000000000000000000000");
});

const W = "0x00000000000000000000000000000000000000c1";
const deposit = async (usd: number) => {
  const { store } = await import("../lib/store");
  store("credits", "")!.prepare("INSERT INTO deposits (tx, wallet, usd, block, at) VALUES (?, ?, ?, ?, ?)").run(`t${Math.random()}`, W, usd, 1, Date.now());
};
const req = (key: string) => new Request("http://x/api/v1/chat/completions", { headers: { authorization: `Bearer ${key}` } });

describe("credits", () => {
  it("never spends past the balance", async () => {
    await deposit(2);
    expect(C.balance(W).balance).toBe(2);
    expect(C.charge(W, "model", 0.5)).toBe(0.5);
    expect(C.charge(W, "model", 5)).toBeCloseTo(1.5);
    expect(C.balance(W).balance).toBe(0);
    expect(C.charge(W, "model", 1)).toBe(0);
  });

  it("a key stops at its daily cap and at an empty balance", async () => {
    await deposit(10);
    const made = C.createModelKey(W, "test", 1);
    expect("key" in made).toBe(true);
    const key = (made as { key: string }).key;
    let k = C.modelKeyOf(req(key));
    expect("left" in k && k.left).toBeCloseTo(1);
    if ("hash" in k) C.charge(W, "model", 1, { key: k.hash });
    k = C.modelKeyOf(req(key));
    expect("status" in k && k.status).toBe(429);
    expect(C.modelKeyOf(req("cm_" + "0".repeat(48)))).toMatchObject({ status: 401 });
    expect(C.modelKeyOf(req("nope"))).toMatchObject({ status: 401 });
  });

  it("a revoked key is refused", () => {
    const made = C.createModelKey(W, "gone", 5) as { key: string };
    const id = C.listModelKeys(W).find((x) => x.label === "gone")!.id;
    expect(C.revokeModelKey(W, id)).toBe(true);
    expect(C.modelKeyOf(req(made.key))).toMatchObject({ status: 401 });
  });
});

describe("auto pick", () => {
  const m = (id: string, pin: number, pout: number, ctx = 128_000): Model => ({ id, name: id, maker: id.split("/")[0]!, ctx, pin, pout, pimg: null, in: ["text"], out: ["text"], created: 0, about: "", kind: "text" });
  const all = [m("a/big", 3, 15), m("b/mini-fast", 0.1, 0.4), m("c/cheap", 0.05, 0.2), m("d/huge", 15, 75), m("e/tiny", 0.01, 0.02, 8000)];
  it("price: the cheapest with 32K context", () => expect(autoPick(all, "price")?.id).toBe("c/cheap"));
  it("speed: the cheapest fast line", () => expect(autoPick(all, "speed")?.id).toBe("b/mini-fast"));
  it("quality: the dearest up to $30 out", () => expect(autoPick(all, "quality")?.id).toBe("a/big"));
});
