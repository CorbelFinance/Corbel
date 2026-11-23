import { describe, expect, it } from "vitest";
import { entryHash, verifyChain } from "../lib/labLog";

const base = { minute: 1_700_000_000, scenario: "drain", block: "120000000", rule: "per-trade", traded: false, slashed: "0", strikes: 1, frozen: false };

function chain(n: number) {
  const rows = [];
  let prev = "";
  for (let i = 0; i < n; i++) {
    const e = { ...base, strikes: i, id: i + 1, prev, hash: "" };
    e.hash = entryHash(prev, e);
    prev = e.hash;
    rows.push(e);
  }
  return rows;
}

describe("decision log hash chain", () => {
  it("verifies an untouched chain and names its head", () => {
    const rows = chain(5);
    expect(verifyChain(rows)).toEqual({ ok: true, checked: 5, brokenAt: null, head: rows[4]!.hash });
  });
  it("breaks where an entry was edited", () => {
    const rows = chain(5);
    rows[2]!.rule = "total";
    expect(verifyChain(rows)).toMatchObject({ ok: false, brokenAt: 3 });
  });
  it("breaks where an entry was removed", () => {
    const rows = chain(5);
    rows.splice(2, 1);
    expect(verifyChain(rows)).toMatchObject({ ok: false, brokenAt: 4 });
  });
  it("starts from the oldest kept entry after pruning", () => {
    expect(verifyChain(chain(6).slice(3))).toMatchObject({ ok: true, checked: 3 });
  });
});
