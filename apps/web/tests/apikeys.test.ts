import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let K: typeof import("../lib/apikeys");
let G: typeof import("../lib/guard");
beforeAll(async () => {
  process.env.CORBEL_DB = join(mkdtempSync(join(tmpdir(), "ck-")), "index.db");
  process.env.CLIENT_IP_HEADER = "x-test-ip";
  K = await import("../lib/apikeys");
  G = await import("../lib/guard");
});

const req = (key?: string, ip = "visitor-z") => new Request("https://x/api/token?q=1", { headers: { "x-test-ip": ip, ...(key ? { "x-api-key": key } : {}) } });
const hits = (make: () => Request, n: number) => {
  let ok = 0;
  for (let i = 0; i < n; i++) {
    const g = G.guard(make(), "portfolio");
    if ("release" in g) {
      ok++;
      g.release();
    }
  }
  return ok;
};

describe("api keys", () => {
  it("stores only a hash, recognises the key and counts its use", () => {
    const r = K.createKey("0xAbC0000000000000000000000000000000000001", "bot") as { key: string };
    expect(r.key).toMatch(/^ck_[0-9a-f]{48}$/);
    const list = K.listKeys("0xabc0000000000000000000000000000000000001");
    expect(JSON.stringify(list)).not.toContain(r.key.slice(3, 20));
    expect(K.keyOf(req(r.key))).toMatch(/^[0-9a-f]{64}$/);
    expect(K.listKeys("0xabc0000000000000000000000000000000000001")[0]!.usesToday).toBe(1);
  });

  it("ignores missing, malformed and unknown keys", () => {
    expect(K.keyOf(req())).toBeNull();
    expect(K.keyOf(req("hello"))).toBeNull();
    expect(K.keyOf(req(`ck_${"0".repeat(48)}`))).toBeNull();
  });

  it("caps keys per wallet and revokes only the owner's", () => {
    const w = "0x0000000000000000000000000000000000000002";
    const keys = Array.from({ length: K.API_KEYS.maxKeys }, () => (K.createKey(w, "k") as { key: string }).key);
    expect("error" in K.createKey(w, "one more")).toBe(true);
    const id = K.listKeys(w)[0]!.id;
    expect(K.revokeKey("0x0000000000000000000000000000000000000003", id)).toBe(false);
    expect(K.revokeKey(w, id)).toBe(true);
    expect(K.keyOf(req(keys[0]))).toBeNull();
  });

  it("a key lifts the limit, but many keys from one address never pass the same ceiling", () => {
    // without a key the portfolio route lets a burst of 3 through
    expect(hits(() => req(undefined, "visitor-a"), 20)).toBe(3);
    // one key: the boosted burst (3 x boost)
    const a = (K.createKey("0x00000000000000000000000000000000000000a1", "a") as { key: string }).key;
    expect(hits(() => req(a, "visitor-b"), 40)).toBe(3 * K.API_KEYS.boost);
    // a second key from the same address adds nothing: the address bucket is already empty
    const b = (K.createKey("0x00000000000000000000000000000000000000b1", "b") as { key: string }).key;
    expect(hits(() => req(b, "visitor-b"), 40)).toBe(0);
  });
});
