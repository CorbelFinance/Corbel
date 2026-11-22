"use client";

/**
 * Compute · the chat's presence: a sphere drawn in characters, in the house ASCII style. Each cell of a character
 * grid shows the nearest point of the sphere, its glyph picked by how much light the point catches (" .:-=+*#%@"),
 * its colour by depth. At rest it turns slowly and breathes; while a model writes it spins up, ripples run over it,
 * and every piece of the answer sends a pulse out from the front. Canvas 2D; paused off screen; still for reduced motion.
 */
import { useEffect, useRef } from "react";

const RAMP = " .,:-=+*#%@";
const TONES = ["#3a1c10", "#6b3418", "#a8552a", "#e0793f", "#ff9a5c", "#ffcfae"];

export type OrbHandle = { busy: (on: boolean) => void; pulse: () => void };

export function AsciiOrb({ className, handle }: { className?: string; handle?: (h: OrbHandle) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, cols = 0, rows = 0, cw = 9, ch = 15, raf = 0, seen = true, last = 0;
    let t = 0, spin = 0, energy = 0, want = 0;
    const pulses: number[] = [];
    handle?.({
      busy: (on) => {
        want = on ? 1 : 0;
      },
      pulse: () => {
        if (pulses.length < 8) pulses.push(0);
      },
    });
    // points on the sphere, evenly spread
    const N = 2600;
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
      return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
    });
    let zbuf = new Float32Array(0), lbuf = new Float32Array(0);

    const frame = () => {
      ctx.clearRect(0, 0, W, H);
      zbuf.fill(-9);
      lbuf.fill(0);
      const R = Math.min(W, H) * 0.42;
      const cxp = W / 2, cyp = H / 2;
      const rx = 0.35 + Math.sin(t * 0.3) * 0.15;
      const cs = Math.cos(spin), sn = Math.sin(spin), cr = Math.cos(rx), sr = Math.sin(rx);
      const breathe = 1 + Math.sin(t * 1.3) * 0.015;
      for (const p of pts) {
        // ripples while writing, pulses from each piece of the answer
        let k = breathe + energy * 0.05 * Math.sin(p.y * 9 + t * 7) * Math.cos(p.x * 7 - t * 5);
        for (const q of pulses) k += 0.09 * Math.exp(-(((p.z + 1) * 1.6 - q * 3.2) ** 2) * 6) * (1 - q);
        const x0 = p.x * k, y0 = p.y * k, z0 = p.z * k;
        const x1 = x0 * cs + z0 * sn, z1 = -x0 * sn + z0 * cs;
        const y2 = y0 * cr - z1 * sr, z2 = y0 * sr + z1 * cr;
        const c = Math.floor((cxp + x1 * R) / cw), r = Math.floor((cyp + y2 * R) / ch);
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const idx = r * cols + c;
        if (z2 <= zbuf[idx]!) continue;
        zbuf[idx] = z2;
        // light from the upper left, plus the depth
        const light = Math.max(0, (x1 * -0.45 + y2 * -0.55 + z2 * 0.7) / Math.hypot(x1, y2, z2));
        lbuf[idx] = Math.min(1, 0.15 + light * 0.75 + (z2 + 1) * 0.12 + energy * 0.08);
      }
      ctx.font = `${Math.round(ch * 0.9)}px var(--font-mono), ui-monospace, monospace`;
      ctx.textBaseline = "top";
      // one colour at a time keeps the draw calls few
      for (let tone = 0; tone < TONES.length; tone++) {
        ctx.fillStyle = TONES[tone]!;
        for (let i = 0; i < lbuf.length; i++) {
          const l = lbuf[i]!;
          if (!l || Math.min(TONES.length - 1, Math.floor(l * TONES.length)) !== tone) continue;
          const g = RAMP[Math.min(RAMP.length - 1, Math.floor(l * RAMP.length))]!;
          if (g !== " ") ctx.fillText(g, (i % cols) * cw, Math.floor(i / cols) * ch);
        }
      }
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!seen || document.hidden) return (last = now);
      if (now - last < 1000 / 240) return;
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      t += dt;
      energy += (want - energy) * 0.06;
      spin += dt * (0.25 + energy * 1.4);
      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i]! += dt * 1.1;
        if (pulses[i]! >= 1) pulses.splice(i, 1);
      }
      frame();
    };
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      W = e.contentRect.width;
      H = e.contentRect.height;
      cw = W < 360 ? 7 : 9;
      ch = Math.round(cw * 1.65);
      cols = Math.ceil(W / cw);
      rows = Math.ceil(H / ch);
      zbuf = new Float32Array(cols * rows);
      lbuf = new Float32Array(cols * rows);
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  }, [handle]);
  return <canvas ref={ref} aria-hidden className={className} />;
}
