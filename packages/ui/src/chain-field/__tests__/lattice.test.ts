import { describe, expect, it } from "vitest";
import { buildLattice, segmentHits, shortestPath, type Rect } from "../lattice";

const view = { top: 0, bottom: 2000, left: 0, right: 1400 };
// a row of three cards with 40 px gaps, a heading above, and a mask
const cards: Rect[] = [
  { x: 100, y: 400, w: 360, h: 300 },
  { x: 500, y: 400, w: 360, h: 300 },
  { x: 900, y: 400, w: 360, h: 300 },
];
const heading: Rect = { x: 100, y: 250, w: 600, h: 60 };
const mask: Rect = { x: 100, y: 900, w: 1160, h: 300 };
const below: Rect[] = [{ x: 100, y: 1250, w: 560, h: 200 }];

const build = () => buildLattice([...cards, ...below], [heading, mask], view);

describe("buildLattice", () => {
  it("no edge passes through an obstacle or a node interior", () => {
    const L = build();
    const blocks = [heading, mask, ...[...cards, ...below].map((n) => ({ x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 }))];
    for (const e of L.edges) {
      const a = L.vertices[e.a]!,
        b = L.vertices[e.b]!;
      for (const r of blocks) expect(segmentHits(r, a.x, a.y, b.x, b.y)).toBe(false);
    }
    expect(L.edges.length).toBeGreaterThan(10);
  });

  it("has no edge shorter than 24 px", () => {
    for (const e of build().edges) expect(e.len).toBeGreaterThanOrEqual(24);
  });

  it("puts ports on node corners", () => {
    const L = build();
    L.nodes.forEach((n, i) => {
      const [tl, tr, br, bl] = L.ports[i]!;
      const at = (v: number) => L.vertices[v]!;
      expect(at(tl!)).toEqual({ x: n.x, y: n.y });
      expect(at(tr!)).toEqual({ x: n.x + n.w, y: n.y });
      expect(at(br!)).toEqual({ x: n.x + n.w, y: n.y + n.h });
      expect(at(bl!)).toEqual({ x: n.x, y: n.y + n.h });
    });
  });

  it("is pure: same input, same output", () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("draws no vertex inside a mask", () => {
    for (const v of build().vertices) expect(v.x > mask.x && v.x < mask.x + mask.w && v.y > mask.y && v.y < mask.y + mask.h).toBe(false);
  });

  it("finds a path between neighbouring cards along the lattice", () => {
    const L = build();
    const p = shortestPath(L, L.ports[0]![1]!, L.ports[1]![0]!);
    expect(p).not.toBeNull();
    expect(p![0]).toBe(L.ports[0]![1]);
    expect(p![p!.length - 1]).toBe(L.ports[1]![0]);
  });
});
