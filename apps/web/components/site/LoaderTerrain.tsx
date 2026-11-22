"use client";

import { useEffect, useRef } from "react";

const RAMP = " .·:-=+*#%@";
const GLYPHS = RAMP + "/|";
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);

/**
 * Intro ground: the footer's ASCII mountain, full screen, growing out of the floor column by column in a
 * wave from left to right (a ridge of glyph bars), then breathing. The weekend edge lifts away in red.
 * Atlas-blitted like the footer: one pre-rendered glyph sheet, a frame is a batch of drawImage calls.
 * Runs only while the intro is on screen (≈3.6 s), then stops for good.
 */
export function LoaderTerrain() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const css = getComputedStyle(document.documentElement);
    const tok = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
    const TONES = [tok("--leaf", "#6fe7a8"), tok("--rind", "#0f5b34"), tok("--flesh", "#ff4560"), tok("--text", "#e8eee6"), tok("--text", "#e8eee6")];
    const LEAF = 0,
      RIND = 1,
      FLESH = 2,
      TEXT = 3,
      MUTED = 4;
    const ALPHAS = [0.22, 0.42, 0.68, 1];
    const narrow = innerWidth < 640;
    const CW = narrow ? 7 : 10,
      CH = narrow ? 12 : 16,
      GAP = 0.8;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = innerWidth,
      h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const cols = Math.ceil(w / CW),
      rows = Math.ceil(h / CH);

    const atlas = document.createElement("canvas");
    atlas.width = GLYPHS.length * CW * dpr;
    atlas.height = TONES.length * ALPHAS.length * CH * dpr;
    const a = atlas.getContext("2d")!;
    a.scale(dpr, dpr);
    a.font = `${CH - 3}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    a.textBaseline = "top";
    TONES.forEach((tone, ti) =>
      ALPHAS.forEach((al, ai) => {
        a.globalAlpha = al;
        a.fillStyle = tone;
        for (let i = 0; i < GLYPHS.length; i++) a.fillText(GLYPHS[i]!, i * CW, (ti * ALPHAS.length + ai) * CH + 1);
      }),
    );
    const blit = (ch: string, tone: number, alpha: number, c: number, r: number) => {
      const gi = GLYPHS.indexOf(ch);
      if (gi < 0) return;
      const ai = alpha < 0.32 ? 0 : alpha < 0.55 ? 1 : alpha < 0.84 ? 2 : 3;
      ctx.drawImage(atlas, gi * CW * dpr, (tone * ALPHAS.length + ai) * CH * dpr, CW * dpr, CH * dpr, c * CW, r * CH, CW, CH);
    };

    const gauss = (x: number, m: number, s: number) => Math.exp(-(((x - m) / s) ** 2));
    const shape = (x: number, t: number): number => {
      if (x > GAP) {
        const close = shape(GAP - 1e-4, t);
        const k = (x - GAP) / (1 - GAP);
        return close + k * k * 0.26;
      }
      // the main hill sits left of the wordmark and stays below it; a second ridge to the right
      return 0.08 + 0.4 * gauss(x, 0.17, 0.12) + 0.24 * gauss(x, 0.63, 0.09) + 0.035 * Math.sin(x * 21 + t * 0.6) + 0.02 * Math.sin(x * 53 - t * 0.9);
    };
    const far = (x: number, t: number) => 0.36 + 0.1 * Math.sin(x * 4.4 + 1.1 + t * 0.2) + 0.05 * Math.sin(x * 11.7 - t * 0.3);
    // wave: each column rises after its own delay, overshoots a little, settles
    const grow = (x: number, t: number) => {
      const p = Math.max(0, Math.min(1, (t - 0.1 - x * 0.9) / 1.0));
      const e = 1 - Math.pow(1 - p, 3);
      return e + Math.sin(p * Math.PI) * 0.06;
    };

    let raf = 0;
    const t0 = performance.now();
    let last = 0;
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      if (t > 3.8) return; // the intro is gone: stop for good
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return; // ~30 fps is plenty for glyphs
      last = now;
      ctx.clearRect(0, 0, w, h);
      const gapCol = Math.floor(GAP * cols);
      for (let c = 0; c < cols; c++) {
        const x = c / cols;
        const gr = grow(x, t);
        const height = shape(x, t) * gr;
        const fTop = (1 - height) * rows;
        const aTop = (1 - far(x, t) * Math.min(1, gr * 1.4)) * rows;
        const slope = (shape(x + 0.006, t) - shape(x - 0.006, t)) * 36;
        const light = Math.max(0, Math.min(1, 0.5 + slope));
        const weekend = c > gapCol;
        const rising = gr < 0.98;
        for (let r = Math.max(0, Math.floor(Math.min(fTop, aTop)) - 1); r < rows; r++) {
          const b = BAYER[(r & 3) * 4 + (c & 3)]!;
          if (r < fTop) {
            if (r >= aTop) {
              const d = (r - aTop) / (rows - aTop + 1);
              if (0.3 * (1 - d) + (r - aTop < 1 ? 0.2 : 0) > b * 0.9) blit(r - aTop < 1 ? ":" : ".", RIND, 0.6, c, r);
            }
            continue;
          }
          const depth = r - fTop;
          const d = depth / (rows - fTop + 1);
          let v = (light * 0.8 + 0.2) * Math.pow(1 - d, 0.85);
          if (depth < 1) v = 1;
          const lvl = Math.max(0, Math.min(RAMP.length - 1, Math.floor(v * (RAMP.length - 1) + b - 0.25)));
          let ch = RAMP[lvl]!;
          let tone = v > 0.56 ? LEAF : RIND;
          let alpha = 0.28 + v * 0.72;
          if (depth < 1) {
            // the crest: a bright bar head while the column is still rising, leaf once it settles
            ch = rising ? "|" : "@";
            tone = rising ? TEXT : LEAF;
            alpha = 1;
          }
          if (weekend && depth < 2) {
            tone = FLESH;
            alpha = 0.92;
          }
          if (ch === " ") continue;
          blit(ch, tone, alpha, c, r);
        }
        // weekend hatch between the Friday close and the lifted crest
        if (weekend) {
          const closeTop = (1 - shape(GAP - 1e-4, t) * grow(GAP, t)) * rows;
          for (let r = Math.floor(fTop) - 1; r < closeTop; r++) if ((c + r) % 3 === 0 && r >= 0) blit("/", FLESH, 0.4, c, r);
          if (c % 2 === 0) blit("-", MUTED, 0.7, c, Math.round(closeTop));
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden className="ld-terrain" />;
}
