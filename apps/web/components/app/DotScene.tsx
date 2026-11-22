"use client";

/**
 * Point-cloud scenes drawn on a canvas, one per block of Corbel, each saying what its block does:
 *  scan    (Check)    a token as a sphere of points with a reading band passing over it
 *  sonar   (Radar)    a sweep that lights new points as it passes, like new pools appearing
 *  helix   (Trade)    two strands of an order flow turning, a fill running along them
 *  cube    (Stocks)   a cube of points, the market map, with a price wave crossing it
 *  rings   (Earn)     rings of a pool tied together, fees pulsing outward
 *  array   (Predict)  a disc that sends out a wave, the outcome travelling to the edge
 *  lattice (Agents)   a grid that a rule check ripples through from the centre
 *  stack   (Compute)  layers of a model turning, a pass moving up through them
 *  net     (Wallet)   a wallet at the centre and the links others can trace to it
 * Coloured in the block's tone, sharp on any screen, paused off screen and in hidden tabs, one still frame when
 * the visitor asks for less motion.
 */
import { useEffect, useRef } from "react";

export type SceneId = "scan" | "sonar" | "helix" | "cube" | "rings" | "array" | "lattice" | "stack" | "net";
type P3 = { x: number; y: number; z: number };
type Draw = (c: CanvasRenderingContext2D, t: number, w: number, h: number, dot: (x: number, y: number, r: number, a: number) => void, line: (x1: number, y1: number, x2: number, y2: number, a: number) => void) => void;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const rot = (p: P3, ax: number, ay: number): P3 => {
  const x1 = p.x * Math.cos(ay) - p.z * Math.sin(ay), z1 = p.x * Math.sin(ay) + p.z * Math.cos(ay);
  const y2 = p.y * Math.cos(ax) - z1 * Math.sin(ax), z2 = p.y * Math.sin(ax) + z1 * Math.cos(ax);
  return { x: x1, y: y2, z: z2 };
};
const band = (d: number, wdt: number) => (d < wdt ? Math.cos((d / wdt) * (Math.PI / 2)) : 0);

const SPH = 320;
const sphere: P3[] = Array.from({ length: SPH }, (_, i) => {
  const th = Math.acos(1 - (2 * (i + 0.5)) / SPH), ph = Math.PI * (1 + Math.sqrt(5)) * i;
  return { x: Math.sin(th) * Math.cos(ph), y: Math.sin(th) * Math.sin(ph), z: Math.cos(th) };
});
const cube = Array.from({ length: 216 }, (_, i) => ({ x: (i % 6) / 2.5 - 1, y: (Math.floor(i / 6) % 6) / 2.5 - 1, z: Math.floor(i / 36) / 2.5 - 1 }));
const sonarDots = (() => {
  const out: { r: number; a: number; seed: number }[] = [];
  for (let r = 0.25; r <= 1.0001; r += 0.15) for (let i = 0; i < Math.round(r * 34); i++) out.push({ r, a: (i / Math.round(r * 34)) * Math.PI * 2, seed: (i * 9301 + r * 4973) % 1 });
  return out;
})();

const SCENES: Record<SceneId, Draw> = {
  scan: (_c, t, w, h, dot) => {
    const R = Math.min(w, h) * 0.44, cx = w / 2, cy = h / 2;
    const scan = (ease((Math.sin(t * 1.2) + 1) / 2) * 2 - 1) * R;
    for (const s of sphere) {
      const p = rot({ x: s.x * R, y: s.y * R, z: s.z * R }, Math.sin(t * 0.25) * 0.4, t * 0.35);
      const depth = (p.z + R) / (2 * R), hit = band(Math.abs(p.y - scan), R * 0.16);
      dot(cx + p.x, cy + p.y, 0.6 + depth * 1.4 + hit * 2.2, 0.15 + depth * 0.45 + hit * 0.5);
    }
  },
  sonar: (_c, t, w, h, dot, line) => {
    const R = Math.min(w, h) * 0.44, cx = w / 2, cy = h / 2, ang = (t * 1.1) % (Math.PI * 2);
    line(cx, cy, cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, 0.55);
    for (const d of sonarDots) {
      let gap = ang - d.a;
      while (gap < 0) gap += Math.PI * 2;
      const fade = Math.max(0, 1 - gap / 2.2);
      const blip = d.seed > 0.82 ? fade : fade * 0.45;
      dot(cx + Math.cos(d.a) * d.r * R, cy + Math.sin(d.a) * d.r * R, 0.6 + blip * (d.seed > 0.82 ? 3 : 1.2), 0.08 + blip * 0.9);
    }
  },
  helix: (_c, t, w, h, dot, line) => {
    const cy = h / 2, R = h * 0.28, n = 46, fill = ((t * 0.18) % 1.2) - 0.1;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), x = w * 0.08 + u * w * 0.84, a = u * Math.PI * 4 + t * 1.4;
      const y1 = cy + Math.sin(a) * R, z1 = Math.cos(a), y2 = cy + Math.sin(a + Math.PI) * R, z2 = -z1;
      const hit = band(Math.abs(u - fill), 0.12);
      if (i % 3 === 0) line(x, y1, x, y2, 0.06 + hit * 0.3);
      dot(x, y1, 0.8 + (z1 + 1) * 0.7 + hit * 1.8, 0.2 + (z1 + 1) * 0.3 + hit * 0.4);
      dot(x, y2, 0.8 + (z2 + 1) * 0.7 + hit * 1.8, 0.2 + (z2 + 1) * 0.3 + hit * 0.4);
    }
  },
  cube: (_c, t, w, h, dot) => {
    const S = Math.min(w, h) * 0.34, cx = w / 2, cy = h / 2, wave = (ease((Math.sin(t) + 1) / 2) * 2 - 1) * S * 1.3;
    const pts = cube.map((q) => rot({ x: q.x * S, y: q.y * S, z: q.z * S }, t * 0.3, t * 0.45)).sort((a, b) => a.z - b.z);
    for (const p of pts) {
      const hit = band(Math.abs(p.y - wave), S * 0.45), k = 1 + hit * 0.25, depth = (p.z + S * 1.7) / (S * 3.4);
      dot(cx + p.x * k, cy + p.y * k, 0.6 + depth * 1.6 + hit * 1.8, 0.12 + depth * 0.5 + hit * 0.4);
    }
  },
  rings: (_c, t, w, h, dot, line) => {
    const cx = w / 2, cy = h / 2, base = Math.min(w, h) * 0.15;
    const rings = [1, 2, 3].map((k, i) => ({ r: base * k + Math.sin(t * 2 - i * 0.5) * 3, n: 10 * k }));
    for (let i = 0; i < 2; i++) {
      const a = rings[i]!, b = rings[i + 1]!;
      for (let j = 0; j < a.n; j++) {
        const t1 = (j / a.n) * Math.PI * 2 + t * 0.15 * (i + 1);
        for (let k = 0; k < b.n / a.n; k++) {
          const t2 = ((j * (b.n / a.n) + k) / b.n) * Math.PI * 2 + t * 0.15 * (i + 2);
          line(cx + Math.cos(t1) * a.r, cy + Math.sin(t1) * a.r, cx + Math.cos(t2) * b.r, cy + Math.sin(t2) * b.r, 0.05 + ((Math.sin(t * 2.4 - i + j * 0.4) + 1) / 2) * 0.25);
        }
      }
    }
    rings.forEach((g, i) => {
      for (let j = 0; j < g.n; j++) {
        const a = (j / g.n) * Math.PI * 2 + t * 0.15 * (i + 1);
        dot(cx + Math.cos(a) * g.r, cy + Math.sin(a) * g.r, 1.4, 0.3 + ((Math.sin(t * 2 - i * 0.6 + j * 0.3) + 1) / 2) * 0.6);
      }
    });
  },
  array: (_c, t, w, h, dot) => {
    const cx = w / 2, cy = h / 2, M = Math.min(w, h) * 0.46, wave = ((t * 0.55) % 1.6) * M;
    const pts: { x: number; y: number; z: number; k: number }[] = [];
    [0.25, 0.5, 0.75, 1].forEach((r, i) => {
      const n = 12 + i * 7;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2, x = Math.cos(a) * r * M, y = Math.sin(a) * r * M;
        const k = band(Math.abs(r * M - wave), M * 0.22);
        const p = rot({ x, y, z: -ease(k) * M * 0.25 }, 1.05, t * 0.25);
        pts.push({ ...p, k });
      }
    });
    pts.sort((a, b) => a.z - b.z).forEach((p) => {
      const s = 260 / (260 + p.z + 60);
      dot(cx + p.x * s, cy + p.y * s, (1.2 + p.k * 2.4) * s, 0.25 + p.k * 0.7);
    });
  },
  lattice: (_c, t, w, h, dot) => {
    const cols = 22, rows = 9, sx = w / (cols + 1), sy = h / (rows + 1), cx = w / 2, cy = h / 2, wave = ((t * 70) % (w * 0.75));
    for (let i = 1; i <= cols; i++)
      for (let j = 1; j <= rows; j++) {
        const x = i * sx, y = j * sy, d = Math.hypot(x - cx, (y - cy) * 1.6), k = band(Math.abs(d - wave), 34);
        const a = Math.atan2(y - cy, x - cx), push = ease(k) * 7;
        dot(x + Math.cos(a) * push, y + Math.sin(a) * push, 0.9 + k * 1.8, 0.14 + k * 0.8);
      }
  },
  stack: (_c, t, w, h, dot) => {
    const cx = w / 2, cy = h / 2, R = Math.min(w * 0.3, h * 0.55), H = h * 0.7, layers = 11, per = 26;
    const pass = cy + (ease((Math.sin(t * 1.4) + 1) / 2) * 2 - 1) * (H / 2);
    for (let i = 0; i < layers; i++) {
      const y = cy + (i / (layers - 1) - 0.5) * H, spin = t * (0.3 + (i % 2) * 0.15) * (i % 2 ? -1 : 1);
      for (let j = 0; j < per; j++) {
        const a = (j / per) * Math.PI * 2 + spin, z = Math.sin(a), depth = (z + 1) / 2, k = band(Math.abs(y - pass), H * 0.12);
        dot(cx + Math.cos(a) * R, y + z * R * 0.12, 0.5 + depth * 1.3 + k * 1.6, 0.08 + depth * 0.45 + k * 0.45);
      }
    }
  },
  net: (_c, t, w, h, dot, line) => {
    const cx = w / 2, cy = h / 2, M = Math.min(w, h) * 0.42;
    const nodes = Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 + Math.sin(t * 0.3 + i) * 0.08, r = M * (0.55 + ((i * 37) % 10) / 22);
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.8, i };
    });
    nodes.forEach((n, i) => {
      const lit = (Math.sin(t * 1.6 - i * 0.7) + 1) / 2;
      line(cx, cy, n.x, n.y, 0.05 + lit * 0.35);
      const m = nodes[(i + 3) % nodes.length]!;
      line(n.x, n.y, m.x, m.y, 0.04 + lit * 0.1);
      // a packet travelling out along the link
      const f = (t * 0.5 + i * 0.13) % 1;
      dot(cx + (n.x - cx) * f, cy + (n.y - cy) * f, 1.1, 0.25 + lit * 0.5);
      dot(n.x, n.y, 1.4 + lit * 1.6, 0.3 + lit * 0.6);
    });
    dot(cx, cy, 4 + Math.sin(t * 2) * 0.8, 0.95);
  },
};

const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

export function DotScene({ scene, tone, className, label }: { scene: SceneId; tone: string; className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const col = rgb(tone);
    const draw = SCENES[scene];
    let w = 0, h = 0, raf = 0, seen = true, last = 0, t = 0;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = matchMedia("(hover: none)").matches || innerWidth < 768;
    const dot = (x: number, y: number, r: number, a: number) => {
      if (r <= 0 || a <= 0) return;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col}, ${Math.min(1, a)})`;
      ctx.fill();
    };
    const line = (x1: number, y1: number, x2: number, y2: number, a: number) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(${col}, ${Math.min(1, a)})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    };
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      draw(ctx, t, w, h, dot, line);
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!seen || document.hidden) return (last = now);
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      if (now - last < 1000 / (phone ? 24 : 40)) return; // about 40 frames a second is plenty, 24 on phones
      last = now;
      t += dt;
      frame();
    };
    // size from the observer, after layout; the canvas buffer follows the screen's pixel ratio
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      w = e.contentRect.width;
      h = e.contentRect.height;
      const dpr = phone ? 1 : Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      frame();
    });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => (seen = !!e?.isIntersecting));
    io.observe(cv);
    t = still ? 2.2 : 0;
    if (!still) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [scene, tone]);
  return <canvas ref={ref} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={className} />;
}
