"use client";

import { useEffect, useRef } from "react";

/**
 * Hero artifact, full bleed. Example data, drawn procedurally in 2D canvas with a small 3D projection:
 * a wireframe ribbon (two rails + rungs) carries the price across a week. On the weekend it splits in two:
 * the CHAIN ribbon keeps moving, the REFERENCE ribbon freezes at the close, and red rungs fill the gap.
 * The pointer tilts the camera. Pauses off-screen; one static frame under prefers-reduced-motion.
 */
export function RibbonField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const css = getComputedStyle(document.documentElement);
    const tok = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
    const C = { leaf: tok("--leaf", "#6fe7a8"), flesh: tok("--flesh", "#ff4560"), muted: tok("--text", "#e8eee6"), line: tok("--line", "#232323") };
    const a = (hex: string, al: number) => hex + Math.round(al * 255).toString(16).padStart(2, "0");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0,
      h = 0,
      raf = 0,
      running = false;
    let tx = 0,
      ty = 0,
      px = 0,
      py = 0;
    const t0 = performance.now();

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const N = 90;
    const SPLIT = 0.7; // weekend starts here (fraction of the week)
    const noise = (x: number) => Math.sin(x * 1.9) * 0.5 + Math.sin(x * 4.3 + 1.1) * 0.22 + Math.sin(x * 9.1) * 0.06;

    type P = { x: number; y: number; s: number };
    const project = (X: number, Y: number, Z: number, yaw: number, pitch: number): P => {
      const cy = Math.cos(yaw),
        sy = Math.sin(yaw),
        cp = Math.cos(pitch),
        sp = Math.sin(pitch);
      const x1 = X * cy - Z * sy;
      const z1 = X * sy + Z * cy;
      const y1 = Y * cp - z1 * sp;
      const z2 = Y * sp + z1 * cp + 4.2;
      const f = Math.min(w, h * 1.7) * 0.95;
      return { x: w / 2 + (x1 * f) / z2, y: h * 0.56 - (y1 * f) / z2, s: 4.2 / z2 };
    };

    const frame = (now: number) => {
      const t = reduce ? 2 : (now - t0) / 1000;
      px += (tx - px) * 0.05;
      py += (ty - py) * 0.05;
      const yaw = -0.42 + Math.sin(t * 0.12) * 0.08 + px * 0.25;
      const pitch = 0.32 + py * 0.12;
      ctx.clearRect(0, 0, w, h);

      // Build both ribbons in world space
      const chain: [P, P][] = [];
      const ref: [P, P][] = [];
      let close = 0;
      for (let i = 0; i <= N; i++) {
        const f = i / N;
        const X = (f - 0.5) * 4.4;
        const Z = Math.sin(f * Math.PI * 1.4 + t * 0.15) * 0.55;
        const half = 0.26 + 0.07 * Math.sin(f * 7 + t * 0.6);
        let y: number;
        if (f < SPLIT) {
          y = noise(f * 6 + t * 0.08) * 0.28 - 0.25 + f * 0.25;
          close = y;
        } else y = close;
        const we = f < SPLIT ? 0 : (f - SPLIT) / (1 - SPLIT);
        const yc = y + Math.pow(we, 1.3) * (0.95 + 0.12 * Math.sin(t * 0.5)) + noise(f * 13 + t * 0.4) * 0.04 * we;
        // twist the chain ribbon as it leaves the reference
        const tw = we * 1.2 + Math.sin(f * 5 + t * 0.3) * 0.25;
        const dzc = Math.cos(tw) * half,
          dyc = Math.sin(tw) * half;
        chain.push([project(X, yc - dyc, Z - dzc, yaw, pitch), project(X, yc + dyc, Z + dzc, yaw, pitch)]);
        ref.push([project(X, y, Z - half, yaw, pitch), project(X, y, Z + half, yaw, pitch)]);
      }
      const iS = Math.ceil(N * SPLIT);

      // floor grid in perspective
      ctx.lineWidth = 1;
      for (let k = -6; k <= 6; k++) {
        const p1 = project(k * 0.4, -1.1, -2.2, yaw, pitch);
        const p2 = project(k * 0.4, -1.1, 2.2, yaw, pitch);
        ctx.strokeStyle = a(C.leaf, 0.06);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        const q1 = project(-2.6, -1.1, k * 0.36, yaw, pitch);
        const q2 = project(2.6, -1.1, k * 0.36, yaw, pitch);
        ctx.beginPath();
        ctx.moveTo(q1.x, q1.y);
        ctx.lineTo(q2.x, q2.y);
        ctx.stroke();
      }

      // gap rungs: red, between chain and reference on the weekend
      for (let i = iS; i <= N; i += 2) {
        const c = chain[i]!,
          r = ref[i]!;
        const mx = (c[0].x + c[1].x) / 2,
          my = (c[0].y + c[1].y) / 2;
        const rx = (r[0].x + r[1].x) / 2,
          ry = (r[0].y + r[1].y) / 2;
        ctx.strokeStyle = a(C.flesh, 0.45);
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(rx, ry);
        ctx.stroke();
      }

      const ribbon = (pts: [P, P][], color: string, from: number, to: number, dashed: boolean, glow: boolean) => {
        // rungs
        for (let i = from; i <= to; i++) {
          const [p, q] = pts[i]!;
          const depth = Math.min(1, Math.max(0.25, (p.s - 0.75) * 2.4));
          ctx.strokeStyle = a(color, (dashed ? 0.28 : 0.55) * depth);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
        // rails
        for (const side of [0, 1] as const) {
          if (glow) {
            ctx.strokeStyle = a(color, 0.16);
            ctx.lineWidth = 6;
            ctx.beginPath();
            for (let i = from; i <= to; i++) {
              const p = pts[i]![side];
              if (i === from) ctx.moveTo(p.x, p.y);
              else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
          }
          ctx.strokeStyle = a(color, dashed ? 0.6 : 1);
          ctx.lineWidth = 1.4;
          ctx.setLineDash(dashed ? [4, 5] : []);
          ctx.beginPath();
          for (let i = from; i <= to; i++) {
            const p = pts[i]![side];
            if (i === from) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      };

      ribbon(ref, C.muted, iS, N, true, false);
      ribbon(chain, C.leaf, 0, N, false, true);

      // labels at the far end
      ctx.font = "500 11px ui-monospace, monospace";
      const ce = chain[N]![1],
        re = ref[N]![0];
      ctx.fillStyle = C.leaf;
      ctx.fillText("CHAIN", ce.x + 10, ce.y);
      ctx.fillStyle = C.muted;
      ctx.fillText("REFERENCE · FROZEN AT CLOSE", re.x + 10, re.y + 4);
      const sp = chain[iS]![0];
      ctx.fillStyle = C.muted;
      ctx.fillText("FRI CLOSE", sp.x - 30, sp.y + 26);
      const g = chain[Math.round((iS + N) / 2)]!,
        gr = ref[Math.round((iS + N) / 2)]!;
      ctx.fillStyle = C.flesh;
      ctx.fillText("GAP ▲", (g[0].x + gr[0].x) / 2 + 12, (g[0].y + gr[0].y) / 2);

      if (running) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    resize();
    frame(performance.now());
    const ro = new ResizeObserver(() => {
      resize();
      if (!running) frame(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (e?.isIntersecting ? start() : stop()));
    io.observe(canvas);
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={className}
      role="img"
      aria-label="Example: a price ribbon follows its reference all week, then splits from it over the weekend, leaving a red gap."
    />
  );
}
