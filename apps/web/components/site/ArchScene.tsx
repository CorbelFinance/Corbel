"use client";

/**
 * The Corbel stack: the product's architecture as a small solid model.
 * A corbel steps out from what it rests on, so the layers do: Robinhood Chain at the bottom (its blocks), then Check,
 * Swap, Earn, Agents and AI & GPUs, each standing on the one before. Transactions leave the chain's blocks and climb
 * the layers. At Check a few turn red and fall out; the rest land on the layer they were for and ripple across it.
 *
 * One renderer, three different shots:
 *  - intro: a tower of plates, each wider than the one below, drops together while the site opens, turning;
 *  - hero: the layers as a stair rising left to right; blocks roll in on the chain and transactions hop up the steps;
 *    every new block read from the chain sends a burst;
 *  - footer: long terraces across the page with the chain's blocks rolling along the front, traffic climbing back.
 *
 * Canvas 2D, near-isometric camera: solid faces shaded by one light, thin lit edges, a dot grid on each top.
 * Runs only on screen, 30 fps (20 on phones), one still frame under reduced motion.
 */
import { useEffect, useRef } from "react";

type Mode = "intro" | "hero" | "footer";
type V3 = [number, number, number];

// tones: 0 leaf, 1 deep green, 2 red, 3 mint, 4 muted, 5 AI orange, 6 lavender
const LEAF = 0, DEEP = 1, RED = 2, MINT = 3, MUTED = 4, ORANGE = 5, LAV = 6;
const LAYERS = [
  { name: "Robinhood Chain", tone: DEEP },
  { name: "Check", tone: LEAF },
  { name: "Swap", tone: LEAF },
  { name: "Earn", tone: LEAF },
  { name: "Agents", tone: LAV },
  { name: "AI & GPUs", tone: ORANGE },
];
// where transactions go: Swap most, then Earn, AI, Agents
const DEST = [2, 2, 2, 2, 3, 3, 5, 5, 4];
const LIGHT: V3 = (() => {
  const v: V3 = [-0.45, 0.82, 0.55];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();
const BG = [7, 10, 9] as const;
const D = 30; // camera distance: far, so the model reads almost isometric

type Box = { a: V3; b: V3; tone: number; lit: number; grid: number };
type Packet = { p0: V3; p1: V3; s: number; dur: number; k: number; dest: number; bad: boolean; state: 0 | 1 | 2; hold: number; fade: number; pos: V3; trail: V3[]; vel: V3 };
type Ripple = { k: number; x: number; z: number; t: number };
type Label = { x: number; y: number; ax: number; ay: number; text: string; tone: number; a: number; align: CanvasTextAlign };

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const hex = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(h.trim());
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [111, 231, 168];
};

export function ArchScene({ mode, className }: { mode: Mode; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still && mode === "intro") return;
    const css = getComputedStyle(document.documentElement);
    const tok = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
    const RGB = [tok("--leaf", "#6fe7a8"), "#2a9a60", tok("--flesh", "#ff4560"), "#c4ffde", tok("--text", "#e8eee6"), "#ff9a5c", tok("--lav", "#b9a3ff")].map(hex);
    const col = (t: number, a: number) => `rgba(${RGB[t]![0]},${RGB[t]![1]},${RGB[t]![2]},${a})`;
    // an opaque face colour: the tone mixed into the page's black
    const face = (t: number, k: number) => {
      const c = RGB[t]!;
      return `rgb(${Math.round(BG[0] + (c[0] - BG[0]) * k)},${Math.round(BG[1] + (c[1] - BG[1]) * k)},${Math.round(BG[2] + (c[2] - BG[2]) * k)})`;
    };

    let W = 0, H = 0, dpr = 1, fitted = false;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      dpr = W < 700 ? 1 : Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      fitted = false;
    };
    resize();

    // ── camera: orbit angle th, elevation ph, around a target; F/CX/CY fitted to a rectangle on screen ──
    let E: V3 = [0, 0, D], f: V3 = [0, 0, -1], rt: V3 = [1, 0, 0], up: V3 = [0, 1, 0], F = 400, CX = 0, CY = 0;
    const orbit = (th: number, ph: number, t: V3) => {
      E = [t[0] + Math.sin(th) * Math.cos(ph) * D, t[1] + Math.sin(ph) * D, t[2] + Math.cos(th) * Math.cos(ph) * D];
      const d: V3 = [t[0] - E[0], t[1] - E[1], t[2] - E[2]];
      const n = Math.hypot(...d);
      f = [d[0] / n, d[1] / n, d[2] / n];
      const rl = Math.hypot(f[2], f[0]);
      rt = [-f[2] / rl, 0, f[0] / rl];
      up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2], rt[0] * f[1] - rt[1] * f[0]];
    };
    const raw = (x: number, y: number, z: number) => {
      const dx = x - E[0], dy = y - E[1], dz = z - E[2];
      const zz = dx * f[0] + dy * f[1] + dz * f[2];
      return [(dx * rt[0] + dy * rt[1] + dz * rt[2]) / zz, -(dx * up[0] + dy * up[1] + dz * up[2]) / zz, zz] as const;
    };
    const P = (x: number, y: number, z: number): V3 => {
      const r = raw(x, y, z);
      return [CX + r[0] * F, CY + r[1] * F, r[2]];
    };
    // fit the given points into a screen rectangle (eased, so a turning model does not jump)
    const fit = (pts: V3[], rx: number, ry: number, rw: number, rh: number) => {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) {
        const r = raw(p[0], p[1], p[2]);
        x0 = Math.min(x0, r[0]);
        x1 = Math.max(x1, r[0]);
        y0 = Math.min(y0, r[1]);
        y1 = Math.max(y1, r[1]);
      }
      const nf = Math.min(rw / (x1 - x0), rh / (y1 - y0));
      const ncx = rx + rw / 2 - ((x0 + x1) / 2) * nf, ncy = ry + rh / 2 - ((y0 + y1) / 2) * nf;
      const k = fitted ? 0.08 : 1;
      F += (nf - F) * k;
      CX += (ncx - CX) * k;
      CY += (ncy - CY) * k;
      fitted = true;
    };
    const cube = (a: V3, b: V3): V3[] => [0, 1, 2, 3, 4, 5, 6, 7].map((m) => [m & 1 ? b[0] : a[0], m & 2 ? b[1] : a[1], m & 4 ? b[2] : a[2]]);

    // ── drawing a box: visible faces filled solid, edges lit, a dot grid on the top ──
    const FACES: { ax: number; s: number; c: number[] }[] = [
      { ax: 0, s: -1, c: [0, 4, 6, 2] },
      { ax: 0, s: 1, c: [1, 3, 7, 5] },
      { ax: 1, s: -1, c: [0, 1, 5, 4] },
      { ax: 1, s: 1, c: [2, 6, 7, 3] },
      { ax: 2, s: -1, c: [0, 2, 3, 1] },
      { ax: 2, s: 1, c: [4, 5, 7, 6] },
    ];
    const drawBox = (bx: Box) => {
      if (bx.lit <= 0.01) return;
      const C = cube(bx.a, bx.b);
      const S = C.map((p) => P(p[0], p[1], p[2]));
      const lit = Math.min(1.6, bx.lit);
      for (const fc of FACES) {
        // visible when the camera is on the face's outer side
        const ax = fc.ax;
        const v = fc.s > 0 ? E[ax]! - bx.b[ax]! : bx.a[ax]! - E[ax]!;
        if (v <= 0) continue;
        const lam = Math.max(0, fc.s * LIGHT[ax]!);
        const top = ax === 1 && fc.s > 0;
        ctx.beginPath();
        fc.c.forEach((ci, i) => (i ? ctx.lineTo(S[ci]![0], S[ci]![1]) : ctx.moveTo(S[ci]![0], S[ci]![1])));
        ctx.closePath();
        ctx.fillStyle = face(bx.tone, Math.min(0.5, (0.05 + 0.13 * lam + (top ? 0.03 : 0)) * lit));
        ctx.fill();
        ctx.strokeStyle = col(bx.tone, Math.min(1, (top ? 0.85 : 0.42) * lit));
        ctx.lineWidth = top ? 1.15 : 0.9;
        ctx.stroke();
        if (top && bx.grid) {
          ctx.fillStyle = col(bx.tone, Math.min(0.9, 0.38 * lit));
          const y = bx.b[1], g = 1 / bx.grid;
          const x0 = Math.ceil(bx.a[0] / g + 0.01) * g, z0 = Math.ceil(bx.a[2] / g + 0.01) * g;
          for (let x = x0; x < bx.b[0] - 0.01; x += g)
            for (let z = z0; z < bx.b[2] - 0.01; z += g) {
              const p = P(x, y, z);
              ctx.fillRect(p[0] - 0.65, p[1] - 0.65, 1.3, 1.3);
            }
        }
      }
    };
    const destTone = (k: number) => (LAYERS[k]!.tone === DEEP ? LEAF : LAYERS[k]!.tone);

    // ── each shot: where the layers' tops are and how a transaction climbs ──
    let L = 8; // footer: half the width of the terraces
    const hero = {
      x: (k: number) => (k === 0 ? 0 : 1.25 + (k - 1) * 1.4),
      top: (k: number) => (k === 0 ? 0.4 : 0.2 + k * 0.3),
    };
    const foot = { zb: (k: number) => 0.2 - k * 0.6, top: (k: number) => (k === 0 ? 0.42 : 0.18 + k * 0.24) };
    const topOf = (k: number) => (mode === "hero" ? hero.top(k) : foot.top(k));
    const inside = (k: number, x: number, z: number) =>
      mode === "hero" ? (k === 0 ? x > 0 && x < 1 : x > hero.x(k) && x < hero.x(k) + 1.3) && Math.abs(z) < 1.1 : Math.abs(x) < L && z < foot.zb(k - 1) && z > foot.zb(k);
    const landOn = (k: number, from: V3): V3 =>
      mode === "hero"
        ? [hero.x(k) + rnd(0.2, 1.1), hero.top(k), clamp(from[2] + rnd(-0.3, 0.3), -0.9, 0.9)]
        : [clamp(from[0] + rnd(-0.4, 0.4), -L + 0.5, L - 0.5), foot.top(k), foot.zb(k - 1) - rnd(0.15, 0.45)];

    const packets: Packet[] = [];
    const ripples: Ripple[] = [];
    let cubesNow: V3[] = [];
    const spawn = (n = 1) => {
      for (let i = 0; i < n && packets.length < 60; i++) {
        if (!cubesNow.length) return;
        const c = cubesNow[Math.floor(Math.random() * cubesNow.length)]!;
        const p0: V3 = [c[0] + rnd(-0.08, 0.08), c[1], c[2] + rnd(-0.08, 0.08)];
        packets.push({ p0, p1: landOn(1, p0), s: 0, dur: rnd(0.4, 0.55), k: 1, dest: DEST[Math.floor(Math.random() * DEST.length)]!, bad: Math.random() < 0.13, state: 0, hold: 0, fade: 1, pos: p0, trail: [], vel: [0, 0, 0] });
      }
    };

    // live blocks (hero): each new block sends a burst; the chain's label carries its number
    let block = 0;
    let poll: ReturnType<typeof setInterval> | undefined;
    if (mode === "hero") {
      const read = () =>
        fetch("/api/net")
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { block?: string | number } | null) => {
            const b = j?.block ? Number(j.block) : 0;
            if (b && block && b > block) spawn(Math.min(6, 2 + (b - block)));
            if (b) block = b;
          })
          .catch(() => undefined);
      void read();
      poll = setInterval(read, 5000);
    }

    let lean = 0, leanT = 0, roll = 0;
    const labels: Label[] = [];
    const label = (at: V3, dx: number, dy: number, k: number, a: number, align: CanvasTextAlign, text?: string) =>
      labels.push({ x: at[0] + dx, y: at[1] + dy, ax: at[0], ay: at[1], text: (text ?? LAYERS[k]!.name).toUpperCase(), tone: LAYERS[k]!.tone === DEEP ? MUTED : LAYERS[k]!.tone, a, align });

    const SZ = (k: number) => 0.62 + k * 0.14, TH = 0.14, GAP = 0.36;
    const buildIntro = (t: number) => {
      const th = 0.62 + 1.2 * (1 - Math.exp(-t * 0.8)) + t * 0.05;
      orbit(th, 0.5, [0, 0.9, 0]);
      const R = SZ(5) * Math.SQRT2, top = 5 * GAP + TH;
      const ring: V3[] = [];
      for (let i = 0; i < 16; i++) for (const y of [0, top]) ring.push([Math.cos((i / 16) * Math.PI * 2) * R, y, Math.sin((i / 16) * Math.PI * 2) * R]);
      // under the mark and the name, like a pedestal
      if (W < 700) fit(ring, W * 0.12, H * 0.56, W * 0.76, H * 0.32);
      else fit(ring, W * 0.32, H * 0.55, W * 0.36, H * 0.36);
      const boxes: Box[] = [];
      let height = 0;
      for (let k = 0; k < 6; k++) {
        const start = 0.12 + k * 0.26;
        const ap = ease((t - start) / 0.42);
        if (ap <= 0) continue;
        const land = start + 0.42;
        const flash = t > land ? Math.exp(-(t - land) * 4) : 0;
        const ph = ((t - 2.3) * 2.6) % 9;
        const pulse = t > 2.3 ? Math.exp(-((ph - k) ** 2) * 2.2) * 0.6 : 0;
        const lit = ap * (1 + 0.9 * flash + pulse);
        const y = k * GAP + (1 - ap) * 1.6;
        const s = SZ(k);
        if (k === 0) {
          // the chain: a floor of blocks
          const n = 4, cell = (2 * s) / n;
          for (let i = 0; i < n; i++)
            for (let j = 0; j < n; j++) {
              const x = -s + i * cell, z = -s + j * cell;
              const hi = (i * 5 + j * 3 + Math.floor(t * 4)) % 11 === 0;
              boxes.push({ a: [x + 0.05, y, z + 0.05], b: [x + cell - 0.05, y + 0.22, z + cell - 0.05], tone: hi ? MINT : DEEP, lit: lit * (hi ? 1.2 : 1), grid: 0 });
            }
        } else boxes.push({ a: [-s, y, -s], b: [s, y + TH, s], tone: LAYERS[k]!.tone, lit, grid: 4 });
        if (ap >= 1) height = k * GAP;
        // the label beside the front corner on the right
        let best: V3 | null = null;
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          const p = P(a * s, y + (k ? TH * 0.5 : 0.11), b * s);
          if (!best || p[0] + p[1] > best[0] + best[1]) best = p;
        }
        if (best) label(best, 26, 0, k, ease((t - start - 0.2) / 0.4) * 0.9, "left");
      }
      // the wall the plates step out from, in pieces between the plates
      for (let k = 0; k < 5; k++) if (height >= (k + 1) * GAP) boxes.push({ a: [-0.16, k * GAP + (k ? TH : 0.22), -0.16], b: [0.16, (k + 1) * GAP, 0.16], tone: DEEP, lit: 0.9, grid: 0 });
      return boxes;
    };

    const heroEnd = hero.x(5) + 1.3;
    const buildHero = (t: number, dt: number) => {
      orbit(-0.55 + 0.08 * Math.sin(t * 0.1) + lean, 0.5, [heroEnd / 2, 0.8, 0]);
      const pts = cube([0, 0, -1.1], [heroEnd, hero.top(5), 1.1]);
      // corner to corner behind the headline: the chain low on the left, AI & GPUs high on the right
      if (W < 700) fit(pts, 8, H * 0.6, W - 16, H * 0.34);
      else fit(pts, W * 0.04, H * 0.16, W * 0.92, H * 0.8);
      const boxes: Box[] = [];
      // the chain: a bed with blocks rolling toward you
      boxes.push({ a: [0, 0, -1.1], b: [1, 0.1, 1.1], tone: DEEP, lit: 0.9, grid: 0 });
      roll = (roll + dt * 0.3) % 0.55;
      cubesNow = [];
      for (let i = 0; i < 5; i++) {
        const z = -1.0 + i * 0.55 + roll;
        const lit = Math.min(clamp((z + 1.0) / 0.3, 0, 1), clamp((1.05 - z) / 0.25, 0, 1));
        if (lit <= 0) continue;
        const zz = Math.min(z, 0.85);
        boxes.push({ a: [0.3, 0.1, zz - 0.18], b: [0.7, 0.4, zz + 0.18], tone: LEAF, lit: lit * (i === 4 ? 1.4 : 0.95), grid: 0 });
        if (lit > 0.5) cubesNow.push([0.5, 0.4, zz]);
      }
      for (let k = 1; k < 6; k++) boxes.push({ a: [hero.x(k), 0, -1.1], b: [hero.x(k) + 1.3, hero.top(k), 1.1], tone: LAYERS[k]!.tone, lit: 1, grid: 3 });
      for (let k = 0; k < 6; k++) {
        const cx = k === 0 ? 0.5 : hero.x(k) + 0.65;
        label(P(cx, topOf(k), -1.1), 0, -16, k, 0.85, "center", k === 0 && block ? `${LAYERS[0]!.name} #${block.toLocaleString("en")}` : undefined);
      }
      return boxes;
    };

    const buildFooter = (t: number, dt: number) => {
      orbit(0.05 * Math.sin(t * 0.07), 0.42, [0, 0.6, foot.zb(3)]);
      fit([[0, 0, 1.2], [0, foot.top(5), foot.zb(5)], [0, 0, foot.zb(5)], [0, foot.top(5), foot.zb(4)]], 0, H * 0.12, W, H * 0.8);
      L = (W / 2 / F) * D * 1.15 + 2;
      const boxes: Box[] = [];
      for (let k = 5; k >= 1; k--) boxes.push({ a: [-L, 0, foot.zb(k)], b: [L, foot.top(k), foot.zb(k - 1)], tone: LAYERS[k]!.tone, lit: 0.95, grid: 3 });
      // the chain's blocks roll along the front, right to left
      roll = (roll + dt * 0.2) % 0.8;
      cubesNow = [];
      const n = Math.ceil((2 * L) / 0.8) + 2;
      for (let i = 0; i < n; i++) {
        const x = -L + i * 0.8 - roll;
        boxes.push({ a: [x, 0, 0.45], b: [x + 0.5, 0.42, 0.95], tone: i % 7 === 3 ? LEAF : DEEP, lit: i % 7 === 3 ? 1.3 : 0.95, grid: 0 });
        if (Math.abs(x) < L * 0.75) cubesNow.push([x + 0.25, 0.42, 0.7]);
      }
      const lx = (-(W / 2 - 24) / F) * D;
      label(P(lx, 0.42, 0.95), 0, 12, 0, 0.85, "left");
      for (let k = 1; k < 6; k++) label(P(lx, foot.top(k), foot.zb(k - 1)), 0, -9, k, 0.85, "left");
      return boxes;
    };

    const t0 = performance.now();
    let last = t0, acc = 0;
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      labels.length = 0;
      lean += (leanT - lean) * 0.04;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const boxes = mode === "intro" ? buildIntro(t) : mode === "hero" ? buildHero(t, dt) : buildFooter(t, dt);
      // far to near
      const depth = (b: Box) => raw((b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2, (b.a[2] + b.b[2]) / 2)[2];
      boxes.sort((p, q) => depth(q) - depth(p));
      ctx.lineJoin = "round";
      for (const b of boxes) drawBox(b);

      if (mode !== "intro") {
        if (!still) {
          acc += dt * (mode === "hero" ? 3.6 : 3);
          while (acc > 1) {
            spawn(1);
            acc -= 1;
          }
        }
        // landings ripple across their layer
        for (let i = ripples.length - 1; i >= 0; i--) {
          const r = ripples[i]!;
          r.t += dt;
          if (r.t > 1.1) {
            ripples.splice(i, 1);
            continue;
          }
          const rad = 0.05 + ease(r.t / 1.1) * 0.5;
          ctx.beginPath();
          let pen = false;
          for (let s = 0; s <= 40; s++) {
            const x = r.x + Math.cos((s / 40) * Math.PI * 2) * rad, z = r.z + Math.sin((s / 40) * Math.PI * 2) * rad;
            if (!inside(r.k, x, z)) {
              pen = false;
              continue;
            }
            const p = P(x, topOf(r.k), z);
            if (pen) ctx.lineTo(p[0], p[1]);
            else ctx.moveTo(p[0], p[1]);
            pen = true;
          }
          ctx.strokeStyle = col(destTone(r.k), (1 - r.t / 1.1) * 0.9);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        // transactions hop from layer to layer
        for (let i = packets.length - 1; i >= 0; i--) {
          const q = packets[i]!;
          if (q.state === 0) {
            q.s += dt / q.dur;
            const s = Math.min(1, q.s);
            const lift = 0.3 + Math.max(0, q.p1[1] - q.p0[1]);
            q.pos = [q.p0[0] + (q.p1[0] - q.p0[0]) * s, q.p0[1] + (q.p1[1] - q.p0[1]) * s + Math.sin(Math.PI * s) * lift, q.p0[2] + (q.p1[2] - q.p0[2]) * s];
            if (q.s >= 1) {
              if (q.bad && q.k === 1) q.state = 1;
              else if (q.k >= q.dest) {
                ripples.push({ k: q.k, x: q.p1[0], z: q.p1[2], t: 0 });
                packets.splice(i, 1);
                continue;
              } else {
                q.k += 1;
                q.p0 = q.p1;
                q.p1 = landOn(q.k, q.p0);
                q.s = 0;
                q.dur = rnd(0.34, 0.46);
              }
            }
          } else if (q.state === 1) {
            q.hold += dt;
            if (q.hold > 0.55) {
              q.state = 2;
              q.vel = mode === "hero" ? [-0.4, 0.8, 0.9] : [rnd(-0.3, 0.3), 0.8, 1.2];
            }
          } else {
            q.vel[1] -= dt * 5;
            q.pos = [q.pos[0] + q.vel[0] * dt, q.pos[1] + q.vel[1] * dt, q.pos[2] + q.vel[2] * dt];
            q.fade -= dt * 1.1;
            if (q.fade <= 0) {
              packets.splice(i, 1);
              continue;
            }
          }
          const red = q.state > 0;
          q.trail.unshift(q.pos);
          if (q.trail.length > 7) q.trail.pop();
          const tt = red ? RED : destTone(q.dest);
          for (let k = 1; k < q.trail.length; k++) {
            const a = P(...q.trail[k - 1]!), b = P(...q.trail[k]!);
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.strokeStyle = col(tt, q.fade * (0.7 - k * 0.09));
            ctx.lineWidth = 1.6;
            ctx.stroke();
          }
          const h = P(...q.pos);
          if (red) {
            ctx.strokeStyle = col(RED, q.fade);
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(h[0] - 4, h[1] - 4);
            ctx.lineTo(h[0] + 4, h[1] + 4);
            ctx.moveTo(h[0] + 4, h[1] - 4);
            ctx.lineTo(h[0] - 4, h[1] + 4);
            ctx.stroke();
          } else {
            ctx.fillStyle = col(tt, 0.22 * q.fade);
            ctx.beginPath();
            ctx.arc(h[0], h[1], 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = col(MINT, q.fade);
            ctx.beginPath();
            ctx.arc(h[0], h[1], 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // labels, each with a short leader to what it names
      ctx.font = `${mode === "footer" ? 10 : 10.5}px JB, ui-monospace, monospace`;
      ctx.textBaseline = "middle";
      for (const l of labels) {
        if (l.a <= 0 || l.y < 8 || l.y > H - 6) continue;
        ctx.textAlign = l.align;
        const w = ctx.measureText(l.text).width;
        const x = l.align === "left" ? clamp(l.x, 16, W - w - 8) : clamp(l.x, w / 2 + 8, W - w / 2 - 8);
        ctx.globalAlpha = l.a;
        if (mode !== "footer") {
          ctx.strokeStyle = col(l.tone, 0.45);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(l.ax, l.ay);
          ctx.lineTo(l.align === "left" ? x - 6 : x, l.align === "left" ? l.y : l.y + 7);
          ctx.stroke();
        }
        ctx.fillStyle = col(l.tone, 1);
        ctx.fillText(l.text, x, l.y);
      }
      ctx.globalAlpha = 1;

      // the hero's text stays readable: the scene fades under the headline
      if (mode === "hero") {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        if (W < 700) {
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(0, 0, W, H);
        } else {
          ctx.translate(W / 2, H * 0.5);
          ctx.scale(W * 0.3, H * 0.36);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
          g.addColorStop(0, "rgba(0,0,0,0.82)");
          g.addColorStop(0.6, "rgba(0,0,0,0.7)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, 1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    // ── run while on screen ──
    let raf = 0, on = false, prev = 0;
    const step = mode === "intro" || W >= 700 ? 1000 / 30 : 1000 / 20;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - prev < step) return;
      prev = now;
      frame(now);
    };
    const start = () => {
      if (on || still) return;
      on = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      on = false;
      cancelAnimationFrame(raf);
    };
    if (still) {
      // one still frame: the finished scene with a little traffic on it
      frame(t0 + 16);
      for (let i = 0; i < 14; i++) spawn(1);
      packets.forEach((q, i) => (q.s = (i % 5) / 5));
      frame(t0 + 40);
    }
    const io = new IntersectionObserver(([e]) => (e?.isIntersecting && !document.hidden ? start() : stop()), { rootMargin: "80px" });
    io.observe(canvas);
    const vis = () => (document.hidden ? stop() : canvas.getBoundingClientRect().bottom > 0 && start());
    document.addEventListener("visibilitychange", vis);
    const ro = new ResizeObserver(() => {
      resize();
      if (still) frame(performance.now());
    });
    ro.observe(canvas);
    const move = (e: PointerEvent) => {
      if (mode === "hero") leanT = ((e.clientX / innerWidth) * 2 - 1) * 0.12;
    };
    addEventListener("pointermove", move, { passive: true });
    // the intro is on screen for a few seconds only
    const end = mode === "intro" ? setTimeout(stop, 4600) : undefined;
    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", vis);
      removeEventListener("pointermove", move);
      if (poll) clearInterval(poll);
      if (end) clearTimeout(end);
    };
  }, [mode]);

  return <canvas ref={ref} aria-hidden className={className} />;
}
