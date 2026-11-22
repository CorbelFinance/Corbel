import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let Q: typeof import("./query.ts");
const ME = "0x00000000000000000000000000000000000000aa";
const T = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";

beforeAll(async () => {
  const path = join(mkdtempSync(join(tmpdir(), "idx-")), "corbel.db");
  process.env.CORBEL_DB = path;
  const { openDb } = await import("./db.ts");
  const { initLaunches } = await import("./launches.ts");
  const db = openDb(path);
  initLaunches(db);
  // a token still on its curve, one that graduated and trades, one whose pool was drained, one pool of someone else
  db.prepare("INSERT INTO launches (token, pad, block, tx, creator, symbol, name) VALUES (?, ?, ?, ?, ?, ?, ?)").run(T(1), "0xpad", 300, "0x1", ME, "CURVE", "Still on curve");
  db.prepare("INSERT INTO launches (token, pad, block, tx, creator, symbol, name) VALUES (?, ?, ?, ?, ?, ?, ?)").run(T(2), "0xpad", 200, "0x2", ME, "GRAD", "Graduated");
  const pool = db.prepare("INSERT INTO pools (id, kind, token0, token1, block, tx, launcher, dead) VALUES (?, 'v2', ?, ?, ?, '0x', ?, ?)");
  pool.run("p2", T(2), WETH, 210, "0xmigrator", 0);
  pool.run("p3", T(3), WETH, 100, ME, 1);
  pool.run("p4", T(4), WETH, 150, "0xother", 0);
  db.prepare("INSERT INTO tokens (address, symbol, name) VALUES (?, ?, ?)").run(T(3), "RUG", "Drained one");
  db.close();
  Q = await import("./query.ts");
});

describe("creatorDossier", () => {
  it("merges launches and pools by token and says what became of each", () => {
    const d = Q.creatorDossier(ME)!;
    const by = Object.fromEntries(d.tokens.map((t) => [t.symbol, t]));
    expect(Object.keys(by).sort()).toEqual(["CURVE", "GRAD", "RUG"]);
    expect(by.CURVE!.state).toBe("curve");
    expect(by.GRAD!.state).toBe("trading");
    expect(by.RUG!.state).toBe("drained");
    expect(d.tokens.map((t) => t.symbol)).toEqual(["CURVE", "GRAD", "RUG"]);
    expect(d.launches).toBe(2);
    expect(d.pools).toBe(1);
    expect(d.bulk).toBe(false);
  });
  it("knows nothing about a wallet that made nothing", () => {
    expect(Q.creatorDossier(T(999))!.tokens).toEqual([]);
  });
});
