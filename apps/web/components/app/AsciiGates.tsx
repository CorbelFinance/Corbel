"use client";

/**
 * Guard · the gates as a ridge, in the house ASCII style: one peak per gate, drawn in characters that thicken toward
 * the crest (" .:-=+*#%@"). While the gate runs, a packet climbs the ridge left to right; each peak lights leaf when
 * its rule passed and turns red where the trade was stopped, and the ridge past that point stays dark (not reached).
 * Canvas 2D, about 24 frames a second while something moves, still otherwise; paused off screen.
 */
import { useEffect, useRef } from "react";

export type GateState = "idle" | "wait" | "ok" | "bad" | "skip";
const RAMP = " .:-=+*#%@";
const COL = { idle: [74, 112, 90], wait: [111, 231, 168], ok: [111, 231, 168], bad: [255, 106, 120], skip: [42, 58, 50] } as const;

export function AsciiGates({ states, busy }: { states: GateState[]; busy: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef({ states, busy, t: 0, since: 0 });
  useEffect(() => {
    st.current.states = states;
    st.current.busy = busy;
    st.current.since = performance.now();
  }, [states, busy]);

  useEffect(() => {
    const cv = ref.current, ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = matchMedia("(hover: none)").matches || innerWidth < 768;
    let W = 0, H = 0, raf = 0, seen = true, last = 0;
    const cw = 8, ch = 12;
    const frame = (now: number) => {
      const { states: s, busy: b } = st.current;
      const n = Math.max(1, s.length);
      const cols = Math.ceil(W / cw), rows = Math.ceil(H / ch);
      ctx.clearRect(0, 0, W, H);
      ctx.font = `600 ${ch - 1}px var(--font-mono), ui-monospace, monospace`;
      ctx.textBaseline = "top";
      const t = now / 1000;
      // the packet: where the run has got to, in gate units
      const age = (now - st.current.since) / 1000;
      const firstBad = s.findIndex((x) => x === "bad");
      const reach = b ? (t * 1.6) % (n + 0.5) : firstBad >= 0 ? Math.min(firstBad + 0.5, age * 4) : Math.min(n, age * 4);
      for (let c = 0; c < cols; c++) {
        const u = (c + 0.5) / cols; // 0..1 across
        const g = Math.min(n - 1, Math.floor(u * n));
        const local = u * n - g; // 0..1 inside the gate's span
        // a peak per gate, with a little rough texture so it reads as terrain, not a sine
        const peak = Math.exp(-((local - 0.5) ** 2) / 0.045);
        const rough = 0.06 * Math.sin(c * 1.7 + g * 3.1) + 0.04 * Math.sin(c * 0.53 + t * (b ? 2 : 0.4));
        const height = Math.max(0.12, Math.min(0.96, 0.22 + 0.68 * peak + rough));
        const top = rows - height * rows;
        const state: GateState = s[g] ?? "idle";
        const lit = u * n <= reach;
        let col: readonly number[] = COL[state === "wait" ? "idle" : state];
        if (b) col = lit ? COL.wait : COL.idle;
        else if (!lit && state !== "skip") col = COL.idle;
        for (let r = Math.max(0, Math.floor(top)); r < rows; r++) {
          const depth = (r - top) / Math.max(1, rows - top); // 0 at the crest, 1 at the floor
          // light at the crest, denser toward the floor, the way the house mountain is drawn
          const k = r === Math.floor(top) ? 1 : Math.max(2, Math.min(RAMP.length - 2, Math.round(1 + depth * (RAMP.length - 3))));
          const glyph = RAMP[k]!;
          if (glyph === " ") continue;
          const a = 0.9 - depth * 0.55;
          ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
          ctx.fillText(glyph, c * cw, r * ch);
        }
      }
      // the packet itself while it climbs
      if (b || age < (n + 1) / 4) {
        const u = Math.min(0.999, reach / n);
        const c = Math.floor(u * cols);
        const g = Math.min(n - 1, Math.floor(u * n));
        const local = u * n - g;
        const height = 0.22 + 0.68 * Math.exp(-((local - 0.5) ** 2) / 0.045);
        const y = Math.max(0, (rows - height * rows - 1.2) * ch);
        ctx.fillStyle = "#e6ffef";
        ctx.fillText("@", c * cw, y);
      }
      return b || age < (n + 2) / 4;
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!seen || document.hidden || now - last < 1000 / (phone ? 30 : 240)) return;
      last = now;
      frame(now);
    };
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      W = e.contentRect.width;
      H = e.contentRect.height;
      const dpr = phone ? 1 : Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      frame(performance.now() + 1e6);
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
  }, []);
  return <canvas ref={ref} aria-hidden className="h-full w-full" />;
}
