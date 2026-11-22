import { describe, expect, it } from "vitest";
import { CHAIN } from "../config";
import { buildLattice, segmentHits, type Rect } from "../lattice";
import { ChainSim } from "../sim";

const cards: Rect[] = [
  { x: 100, y: 400, w: 360, h: 300 },
  { x: 500, y: 400, w: 360, h: 300 },
  { x: 900, y: 400, w: 360, h: 300 },
  { x: 100, y: 760, w: 360, h: 300 },
  { x: 500, y: 760, w: 360, h: 300 },
];
const text: Rect = { x: 100, y: 250, w: 600, h: 60 };
const L = () => buildLattice(cards, [text], { top: 0, bottom: 1600, left: 0, right: 1400 });

const run = (seed: number) => {
  const s = new ChainSim(L(), seed);
  for (let i = 0; i < 40; i++) s.spawnAt(480, 380 + (i % 5) * 10);
  for (let i = 0; i < 6; i++) s.addPacket();
  for (let i = 0; i < 60; i++) s.step(1 / 60, { x: 480, y: 380 });
  return JSON.stringify(s.segments());
};

describe("ChainSim", () => {
  it("is reproducible for a seed", () => {
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
  });

  it("respects limits", () => {
    const s = new ChainSim(L(), 3);
    for (let i = 0; i < 200; i++) s.spawnAt(480, 380);
    for (let i = 0; i < 50; i++) s.addPacket();
    for (let i = 0; i < 30; i++) s.step(1 / 60, { x: 480, y: 380 });
    expect(s.runners.filter((r) => !r.dead).length).toBeLessThanOrEqual(CHAIN.maxRunners);
    expect(s.packets.length).toBeLessThanOrEqual(CHAIN.maxPackets);
    expect(s.labels.length).toBeLessThanOrEqual(CHAIN.maxLabels);
  });

  it("hop(A→B) runs only on lattice edges and lights B on arrival", () => {
    const s = new ChainSim(L(), 1);
    const r = s.hop(0, 1);
    expect(r).not.toBeNull();
    const ok = (a: number, b: number) => s.L.adj[a]!.some((k) => (s.L.edges[k]!.a === a ? s.L.edges[k]!.b : s.L.edges[k]!.a) === b);
    for (let i = 0; i < r!.path!.length - 1; i++) expect(ok(r!.path![i]!, r!.path![i + 1]!)).toBe(true);
    for (let i = 0; i < 120; i++) s.step(1 / 60, null);
    expect(s.lit.has(1)).toBe(true);
  });

  it("tails never cross text or card interiors", () => {
    const s = new ChainSim(L(), 5);
    for (let i = 0; i < 20; i++) s.spawnAt(480, 380);
    for (let i = 0; i < 40; i++) s.step(1 / 60, { x: 480, y: 380 });
    const blocks = [text, ...cards.map((n) => ({ x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 }))];
    for (const [a, b] of s.segments()) for (const r of blocks) expect(segmentHits(r, a.x, a.y, b.x, b.y)).toBe(false);
  });

  it("a red packet dies at the next crossing with a red pulse", () => {
    const s = new ChainSim(L(), 2);
    for (let i = 0; i < CHAIN.redEvery; i++) {
      if (i < CHAIN.redEvery - 1) s.packets = [];
      s.addPacket();
    }
    const red = s.packets.find((p) => p.red);
    expect(red).toBeTruthy();
    const len = s.L.edges[red!.edge]!.len;
    for (let t = 0; t < len / CHAIN.packetSpeed + 0.1; t += 1 / 60) s.step(1 / 60, null);
    expect(s.packets.includes(red!)).toBe(false);
    expect(s.pulses.some((p) => p.red)).toBe(true);
  });
});
