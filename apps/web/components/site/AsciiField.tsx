"use client";

import { useEffect, useRef } from "react";

const RAMP = " .·:-=+*#%@";
const HEX = "0123456789ABCDEF";
const GLYPHS = RAMP + HEX + "/-_";
// 4×4 ordered dither (Bayer), values in [0,1)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);

/**
 * Footer ground: an engraved ASCII mountain in the brand palette.
 * Front range: a main hill, a second ridge, lit from the left; ordered-dither shading, bright crest.
 * Far range: sparse dots for depth. On the weekend the front crest lifts away in red,
 * a dashed line holds the Friday close and the gap fills with "/" hatching.
 * The pointer turns its column into a scrolling hex scan.
 *
 * Performance: every glyph × tone × alpha is pre-rendered once into an atlas; a frame is
 * a batch of drawImage blits. 12 fps, stops off-screen and on hidden tabs, static under reduced motion.
 */
export function AsciiField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const css = getComputedStyle(document.documentElement);
    const tok = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
    const TONES = [tok("--leaf", "#6fe7a8"), tok("--rind", "#0f5b34"), tok("--flesh", "#ff4560"), tok("--text", "#e8eee6"), tok("--text", "#e8eee6")];
    const LEAF = 0,
      RIND = 1,
      FLESH = 2,
      MUTED = 3,
      TEXT = 4;
    const ALPHAS = [0.25, 0.45, 0.7, 1];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const CW = 7,
      CH = 12,
      GAP = 0.76;

    let w = 0,
      h = 0,
      cols = 0,
      rows = 0,
      dpr = 1,
      timer = 0,
      mx = -1;
    let atlas: HTMLCanvasElement | null = null;
    const t0 = performance.now();

    const buildAtlas = () => {
      const a = document.createElement("canvas");
      a.width = GLYPHS.length * CW * dpr;
      a.height = TONES.length * ALPHAS.length * CH * dpr;
      const g = a.getContext("2d")!;
      g.scale(dpr, dpr);
      g.font = `${CH - 2}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      g.textBaseline = "top";
      TONES.forEach((tone, ti) =>
        ALPHAS.forEach((al, ai) => {
          g.globalAlpha = al;
          g.fillStyle = tone;
          for (let i = 0; i < GLYPHS.length; i++) g.fillText(GLYPHS[i]!, i * CW, (ti * ALPHAS.length + ai) * CH + 1);
        }),
      );
      atlas = a;
    };
    const blit = (ch: string, tone: number, alpha: number, c: number, r: number) => {
      const gi = GLYPHS.indexOf(ch);
      if (gi < 0 || !atlas) return;
      const ai = alpha < 0.35 ? 0 : alpha < 0.58 ? 1 : alpha < 0.85 ? 2 : 3;
      const sy = (tone * ALPHAS.length + ai) * CH;
      ctx.drawImage(atlas, gi * CW * dpr, sy * dpr, CW * dpr, CH * dpr, c * CW, r * CH, CW, CH);
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      cols = Math.ceil(w / CW);
      rows = Math.ceil(h / CH);
      buildAtlas();
    };

    const g = (x: number, m: number, s: number) => Math.exp(-(((x - m) / s) ** 2));
    // heights as a fraction of the canvas from the bottom
    const front = (x: number, t: number): number => {
      if (x > GAP) {
        const close = front(GAP - 1e-4, t);
        const k = (x - GAP) / (1 - GAP);
        return close + k * k * 0.42;
      }
      return (
        0.14 +
        0.6 * g(x, 0.24, 0.13) + // the hill
        0.3 * g(x, 0.5, 0.09) + // second ridge
        0.05 * Math.sin(x * 23 + t * 0.15) * g(x, 0.3, 0.3) +
        0.03 * Math.sin(x * 57 - t * 0.25)
      );
    };
    const far = (x: number, t: number) => 0.46 + 0.14 * Math.sin(x * 4.6 + 1.2 + t * 0.03) + 0.07 * Math.sin(x * 12.3 - t * 0.05);

    const draw = (now: number) => {
      const t = reduce ? 4 : (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      const gapCol = Math.floor(GAP * cols);
      const closeTop = (1 - front(GAP - 1e-4, t)) * rows;
      const scanCol = mx >= 0 ? Math.floor(mx / CW) : -99;
      const tick = Math.floor(t * 12);

      for (let c = 0; c < cols; c++) {
        const x = c / cols;
        const fTop = (1 - front(x, t)) * rows;
        const aTop = (1 - far(x, t)) * rows;
        const slope = (front(x + 0.006, t) - front(x - 0.006, t)) * 40; // >0 rising → faces the light
        const light = Math.max(0, Math.min(1, 0.5 + slope));
        const weekend = c > gapCol;
        const scan = Math.abs(c - scanCol) <= 1;

        for (let r = 0; r < rows; r++) {
          const b = BAYER[(r & 3) * 4 + (c & 3)]!;
          if (r < fTop) {
            // gap hatch and Friday close reference
            if (weekend && r < closeTop && r >= fTop - 1) {
              if ((c + r) % 3 === 0) blit("/", FLESH, 0.45, c, r);
              continue;
            }
            if (weekend && Math.abs(r - closeTop) < 0.5 && c % 2 === 0) {
              blit("-", MUTED, 0.8, c, r);
              continue;
            }
            // far range: sparse engraved dots
            if (r >= aTop) {
              const d = (r - aTop) / (rows - aTop + 1);
              const v = 0.35 * (1 - d) + (r - aTop < 1 ? 0.2 : 0);
              if (v > b * 0.9) blit(r - aTop < 1 ? ":" : ".", RIND, 0.7, c, r);
            }
            continue;
          }
          // front range
          const depth = r - fTop;
          const d = depth / (rows - fTop + 1);
          let v = (light * 0.85 + 0.15) * Math.pow(1 - d, 0.9);
          const crest = depth < 1;
          if (crest) v = 0.98;
          // ordered dither into the ramp
          const lvl = Math.max(0, Math.min(RAMP.length - 1, Math.floor(v * (RAMP.length - 1) + b - 0.25)));
          let ch = RAMP[lvl]!;
          let tone = v > 0.58 ? LEAF : RIND;
          let alpha = 0.3 + v * 0.7;
          if (weekend && depth < 2) {
            tone = FLESH;
            alpha = 0.9;
          }
          if (scan) {
            ch = HEX[(Math.abs(Math.floor(Math.sin((c + 1) * 91.7 + (r + tick) * 13.3) * 1e4)) % 16)]!;
            tone = c === scanCol ? TEXT : LEAF;
            alpha = 0.95;
          } else if (ch === " ") continue;
          blit(ch, tone, alpha, c, r);
        }
      }

      // labels (two fillText calls per frame)
      ctx.font = "500 10px ui-monospace, monospace";
      ctx.fillStyle = TONES[MUTED]!;
      ctx.fillText("FRI CLOSE", gapCol * CW - 66, closeTop * CH + 4);
      const eTop = (1 - front(0.97, t)) * rows;
      ctx.fillStyle = TONES[FLESH]!;
      ctx.fillText("▲ WEEKEND GAP", Math.min(w - 100, cols * 0.86 * CW), Math.max(12, eTop * CH - 14));
      if (scanCol >= 0 && scanCol < cols) {
        const ft = (1 - front(scanCol / cols, t)) * rows;
        const wk = scanCol > gapCol;
        const tag = `${wk ? "WEEKEND · TOKEN ONLY" : "WEEKDAY · TRACKING"} · H ${(1 - ft / rows).toFixed(2)}`;
        const tw = ctx.measureText(tag).width + 14;
        const tx = Math.min(scanCol * CW + 14, w - tw - 6);
        const ty = Math.max(4, ft * CH - 32);
        ctx.fillStyle = wk ? "rgba(74,14,25,.92)" : "rgba(12,17,14,.92)";
        ctx.fillRect(tx, ty, tw, 20);
        ctx.fillStyle = wk ? TONES[FLESH]! : TONES[LEAF]!;
        ctx.fillText(tag, tx + 7, ty + 14);
      }
    };

    resize();
    draw(performance.now());
    let visible = false;
    const start = () => {
      if (reduce || timer || !visible || document.hidden) return;
      timer = window.setInterval(() => draw(performance.now()), 83);
    };
    const stop = () => {
      clearInterval(timer);
      timer = 0;
    };
    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    const onMove = (e: PointerEvent) => {
      if (!visible) return;
      const r = canvas.getBoundingClientRect();
      mx = e.clientY > r.top - 40 && e.clientY < r.bottom ? e.clientX - r.left : -1;
      if (reduce) draw(performance.now());
    };
    addEventListener("pointermove", onMove, { passive: true });
    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      removeEventListener("pointermove", onMove);
    };
  }, []);
  return <canvas ref={ref} aria-hidden className={className} />;
}
