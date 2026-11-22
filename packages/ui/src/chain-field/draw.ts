/** Chain Field drawing. All geometry in document coordinates; `oy` is window.scrollY. */
import { CHAIN } from "./config";
import type { ChainSim, Pt } from "./sim";

export interface Palette {
  leaf: string;
  flesh: string;
  muted: string;
}

const hexA = (hex: string, a: number) => {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.replace(/./g, (m) => m + m) : c.slice(0, 6);
  return `#${full}${Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0")}`;
};
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const px = (v: number) => Math.round(v) + 0.5;

export function drawField(
  ctx: CanvasRenderingContext2D,
  sim: ChainSim,
  P: Palette,
  oy: number,
  view: { w: number; h: number; clipTop: number },
  cursor: Pt | null,
  opts: { glow: boolean; dynamic: boolean },
) {
  const L = sim.L;
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, view.clipTop, view.w, view.h - view.clipTop);
  ctx.clip();

  const top = oy - 20,
    bottom = oy + view.h + 20;
  const vis = (y1: number, y2: number) => Math.max(y1, y2) >= top && Math.min(y1, y2) <= bottom;

  // 1. static lattice, brighter near the pointer (4 alpha buckets → 4 strokes)
  const buckets: number[][] = [[], [], [], []];
  for (let k = 0; k < L.edges.length; k++) {
    const e = L.edges[k]!;
    const a = L.vertices[e.a]!,
      b = L.vertices[e.b]!;
    if (!vis(a.y, b.y)) continue;
    let lvl = 0;
    if (cursor && opts.dynamic) {
      const mx = Math.max(Math.min(cursor.x, Math.max(a.x, b.x)), Math.min(a.x, b.x));
      const my = Math.max(Math.min(cursor.y, Math.max(a.y, b.y)), Math.min(a.y, b.y));
      const t = smooth(1 - Math.hypot(mx - cursor.x, my - cursor.y) / CHAIN.cursorRadius);
      lvl = t > 0.66 ? 3 : t > 0.33 ? 2 : t > 0.02 ? 1 : 0;
    }
    buckets[lvl]!.push(k);
  }
  ctx.lineWidth = 1;
  buckets.forEach((ks, lvl) => {
    if (!ks.length) return;
    const alpha = CHAIN.staticAlpha + ((CHAIN.nearAlpha - CHAIN.staticAlpha) * lvl) / 3;
    ctx.strokeStyle = hexA(P.leaf, alpha);
    ctx.beginPath();
    for (const k of ks) {
      const e = L.edges[k]!;
      const a = L.vertices[e.a]!,
        b = L.vertices[e.b]!;
      ctx.moveTo(px(a.x), px(a.y - oy));
      ctx.lineTo(px(b.x), px(b.y - oy));
    }
    ctx.stroke();
  });

  if (!opts.dynamic) {
    ctx.restore();
    return;
  }
  const now = sim.now;

  // 2. lit frames: hop target and frames a runner passed along
  const litDur = CHAIN.edgeLitMs / 1000;
  const frame = (i: number, t0: number, strength: number) => {
    const n = L.nodes[i];
    if (!n) return;
    const f = 1 - (now - t0) / litDur;
    if (f <= 0 || !vis(n.y, n.y + n.h)) return;
    ctx.strokeStyle = hexA(P.leaf, 0.75 * f * strength);
    ctx.lineWidth = 1;
    ctx.strokeRect(px(n.x), px(n.y - oy), Math.round(n.w), Math.round(n.h));
  };
  sim.lit.forEach((t0, i) => frame(i, t0, 1));
  sim.litFrames.forEach((t0, i) => frame(i, t0, 0.55));

  // 3. runner tails: alpha gradient head → tail, then a soft glow pass
  const strokeTail = (pts: Pt[], a: number, width: number, alphaScale: number) => {
    let acc = 0;
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) total += Math.abs(pts[i + 1]!.x - pts[i]!.x) + Math.abs(pts[i + 1]!.y - pts[i]!.y);
    if (total <= 0) return;
    ctx.lineWidth = width;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]!,
        q = pts[i + 1]!;
      const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      const steps = Math.max(1, Math.ceil(d / 40));
      for (let s = 0; s < steps; s++) {
        const f0 = s / steps,
          f1 = (s + 1) / steps;
        const x0 = p.x + (q.x - p.x) * f0,
          y0 = p.y + (q.y - p.y) * f0;
        const x1 = p.x + (q.x - p.x) * f1,
          y1 = p.y + (q.y - p.y) * f1;
        const k = 1 - (acc + (d * (f0 + f1)) / 2) / total;
        ctx.strokeStyle = hexA(P.leaf, a * alphaScale * k * k);
        ctx.beginPath();
        ctx.moveTo(px(x0), px(y0 - oy));
        ctx.lineTo(px(x1), px(y1 - oy));
        ctx.stroke();
      }
      acc += d;
    }
  };
  const tails = sim.runners.map((r) => [sim.tail(r), sim.alpha(r)] as const);
  for (const [pts, a] of tails) strokeTail(pts, a, 1, 1);
  if (opts.glow) {
    ctx.globalCompositeOperation = "lighter";
    for (const [pts, a] of tails) strokeTail(pts, a, CHAIN.glowWidth, CHAIN.glowAlpha / 0.5);
    ctx.globalCompositeOperation = "source-over";
  }
  for (const [pts, a] of tails) {
    const h = pts[0]!;
    if (!h || a <= 0) continue;
    ctx.fillStyle = hexA(P.leaf, a);
    ctx.fillRect(Math.round(h.x) - 1, Math.round(h.y - oy) - 1, 3, 3);
  }

  // 4. corner pulses (8×8 squares, scale 1 → 1.6 → 1, fading)
  const pd = CHAIN.cornerPulseMs / 1000;
  for (const p of sim.pulses) {
    const t = (now - p.at) / pd;
    if (t < 0 || t > 1.4) continue;
    const s = 8 * (1 + 0.6 * Math.sin(Math.min(1, t) * Math.PI));
    ctx.fillStyle = hexA(p.red ? P.flesh : P.leaf, 0.9 * Math.max(0, 1 - t / 1.4));
    ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - oy - s / 2), Math.round(s), Math.round(s));
  }

  // 5. packets
  for (const p of sim.packets) {
    const e = L.edges[p.edge];
    if (!e) continue;
    const a = L.vertices[p.from]!,
      b = L.vertices[e.a === p.from ? e.b : e.a]!;
    const f = Math.min(1, p.along / e.len);
    const x = a.x + (b.x - a.x) * f,
      y = a.y + (b.y - a.y) * f;
    if (!vis(y, y)) continue;
    ctx.fillStyle = p.red ? P.flesh : hexA(P.leaf, 0.85);
    ctx.fillRect(Math.round(x) - 1, Math.round(y - oy) - 1, 3, 3);
  }

  // 6. hex labels
  if (sim.labels.length) {
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = hexA(P.muted, 0.4);
    for (const l of sim.labels) ctx.fillText(l.text, Math.round(l.x + 6), Math.round(l.y - oy - 6));
  }
  ctx.restore();
}
