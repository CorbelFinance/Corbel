"use client";

/**
 * Terminal · the token's pulse: three small live scenes that read the open token, not decoration.
 *  Scan  - a sphere of points the check band sweeps over; its colour is the verdict (leaf, lavender, red), and it
 *          keeps sweeping while the check is still running.
 *  Flow  - two strands turning round each other, buys (leaf) and sells (red); each strand is as thick as its share
 *          of the volume, and it turns faster the more swaps an hour the token has.
 *  Depth - rings of the pool; the more liquidity, the more rings light and the calmer they breathe. A thin pool
 *          flickers.
 * One canvas each, sharp at any pixel ratio, paused off screen and in hidden tabs, one still frame for reduced motion.
 */
import { useEffect, useRef } from "react";

type P = { score: number | null; buyShare: number; perHour: number; liq: number | null };
const LEAF = [111, 231, 168], LAV = [185, 163, 255], RED = [255, 90, 114], ICE = [143, 227, 242];
const col = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const SPH = Array.from({ length: 220 }, (_, i) => {
  const th = Math.acos(1 - (2 * (i + 0.5)) / 220), ph = Math.PI * (1 + Math.sqrt(5)) * i;
  return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)] as const;
});

type Draw = (c: CanvasRenderingContext2D, t: number, w: number, h: number, p: P) => void;
const dot = (c: CanvasRenderingContext2D, x: number, y: number, r: number, s: string) => {
  c.fillStyle = s;
  c.beginPath();
  c.arc(x, y, Math.max(0.2, r), 0, Math.PI * 2);
  c.fill();
};

const scan: Draw = (c, t, w, h, p) => {
  const R = Math.min(w, h) * 0.4, cx = w / 2, cy = h / 2;
  const tone = p.score == null ? ICE : p.score >= 60 ? LEAF : p.score >= 40 ? LAV : RED;
  const band = (ease((Math.sin(t * (p.score == null ? 2.2 : 1.1)) + 1) / 2) * 2 - 1) * R;
  const ay = t * 0.4, ax = 0.35;
  for (const [x0, y0, z0] of SPH) {
    const x1 = x0 * Math.cos(ay) - z0 * Math.sin(ay), z1 = x0 * Math.sin(ay) + z0 * Math.cos(ay);
    const y2 = y0 * Math.cos(ax) - z1 * Math.sin(ax), z2 = y0 * Math.sin(ax) + z1 * Math.cos(ax);
    const d = (z2 + 1) / 2, k = Math.max(0, 1 - Math.abs(y2 * R - band) / (R * 0.18));
    dot(c, cx + x1 * R, cy + y2 * R, 0.5 + d * 1.1 + k * 1.6, col(tone, 0.12 + d * 0.45 + k * 0.5));
  }
  // the band itself, as a thin ellipse across the sphere
  c.strokeStyle = col(tone, 0.35);
  c.lineWidth = 1;
  c.beginPath();
  const rr = Math.sqrt(Math.max(0, R * R - band * band));
  c.ellipse(cx, cy + band, rr, rr * 0.22, 0, 0, Math.PI * 2);
  c.stroke();
};

function Scene({ draw, p, label }: { draw: Draw; p: P; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pr = useRef(p);
  useEffect(() => {
    pr.current = p;
  }, [p]);
  useEffect(() => {
    const cv = ref.current, ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, t = still ? 1.5 : 0, last = 0, raf = 0, seen = true;
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      draw(ctx, t, w, h, pr.current);
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!seen || document.hidden) return (last = now);
      if (now - last < 1000 / 240) return;
      t += Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      frame();
    };
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      w = e.contentRect.width;
      h = e.contentRect.height;
      const d = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(w * d);
      cv.height = Math.round(h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      frame();
    });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => (seen = !!e?.isIntersecting));
    io.observe(cv);
    if (!still) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [draw]);
  return <canvas ref={ref} role="img" aria-label={label} className="h-full w-full" />;
}

/** The check's scan sphere: a band sweeps it while a token is being checked. */
export function ScanOrb() {
  return <Scene draw={scan} p={{ score: null, buyShare: 0.5, perHour: 0, liq: null }} label="Checking the token" />;
}
