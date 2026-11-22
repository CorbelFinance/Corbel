"use client";

import { useEffect, useRef, useState } from "react";
import { STORY } from "@corbel/config";
import { Button, Label } from "@corbel/ui";

/**
 * Pinned scroll story: a node graph that builds as the page scrolls.
 * A tall track with a sticky stage. Scroll progress grows a graph of labelled nodes joined by green curves;
 * in the last stage every curve bends into one glowing point: the single balance.
 * Canvas redraws only on scroll/resize plus a slow ambient drift while on screen; static under reduced motion.
 */

type N = { id: string; x: number; y: number; at: number; label: string };
type E = { a: string; b: string; at: number };

const NODES: N[] = [
  { id: "usdg", x: 0.14, y: 0.58, at: 0.0, label: "USDG" },
  { id: "vault", x: 0.36, y: 0.36, at: 0.16, label: "MORPHO VAULT" },
  { id: "trust", x: 0.33, y: 0.78, at: 0.34, label: "TRUST CHECK" },
  { id: "token", x: 0.56, y: 0.6, at: 0.4, label: "TOKEN" },
  { id: "agent", x: 0.6, y: 0.2, at: 0.54, label: "AGENT" },
  { id: "launch", x: 0.52, y: 0.9, at: 0.58, label: "LAUNCH" },
  { id: "gap", x: 0.76, y: 0.44, at: 0.62, label: "GAP FUND" },
];
const EDGES: E[] = [
  { a: "usdg", b: "vault", at: 0.06 },
  { a: "vault", b: "trust", at: 0.26 },
  { a: "trust", b: "token", at: 0.36 },
  { a: "vault", b: "token", at: 0.42 },
  { a: "vault", b: "agent", at: 0.5 },
  { a: "token", b: "launch", at: 0.55 },
  { a: "token", b: "gap", at: 0.6 },
  { a: "agent", b: "gap", at: 0.64 },
];
const CONVERGE = 0.74; // from here everything bends into one point
const ONE = { x: 0.66, y: 0.5 };
// the graph is drawn a little narrower than the screen so no node runs under the text column
const SX = (x: number) => 0.02 + x * 0.82;

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function StoryGraph() {
  const track = useRef<HTMLElement | null>(null);
  const cv = useRef<HTMLCanvasElement | null>(null);
  const [stage, setStage] = useState(0);
  const [prog, setProg] = useState(0);

  useEffect(() => {
    const el = track.current;
    const canvas = cv.current;
    const ctx = canvas?.getContext("2d");
    if (!el || !canvas || !ctx) return;
    const css = getComputedStyle(document.documentElement);
    const leaf = css.getPropertyValue("--leaf").trim() || "#6fe7a8";
    const muted = css.getPropertyValue("--text").trim() || "#e8eee6";
    const text = css.getPropertyValue("--text").trim() || "#e8eee6";
    const A = (hex: string, a: number) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // phones: 1x pixels and 30 frames a second, so the graph never fights the scroll
    const phone = matchMedia("(hover: none)").matches || innerWidth < 768;
    let lastDraw = 0;

    let w = 0,
      h = 0,
      p = 0,
      raf = 0,
      visible = false;
    const t0 = performance.now();

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = phone ? 1 : Math.min(devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const read = () => {
      const r = el.getBoundingClientRect();
      const total = r.height - innerHeight;
      p = clamp(-r.top / Math.max(1, total));
      setProg(p);
      setStage(Math.min(STORY.stages.length - 1, Math.floor(p * STORY.stages.length * 0.999)));
    };

    const curve = (x1: number, y1: number, x2: number, y2: number, f: number, color: string, width: number) => {
      // cubic with horizontal tangents, drawn up to fraction f
      const cx = (x1 + x2) / 2;
      const steps = 48;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i <= steps * f; i++) {
        const t = i / steps;
        const mt = 1 - t;
        const x = mt * mt * mt * x1 + 3 * mt * mt * t * cx + 3 * mt * t * t * cx + t * t * t * x2;
        const y = mt * mt * mt * y1 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const draw = (now: number) => {
      const t = reduce ? 0 : (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      const conv = ease((p - CONVERGE) / (1 - CONVERGE));
      const ox = SX(ONE.x) * w,
        oy = ONE.y * h;
      // where the threads dock: the USDG node (it drifts like every node)
      const usdgN = NODES[0]!;
      const ux = SX(usdgN.x) * w + Math.sin(t * 0.5 + usdgN.x * 9) * 4;
      const uy = usdgN.y * h + Math.cos(t * 0.45 + usdgN.y * 7) * 4;

      // ambient threads from the left edge (always there, they converge at the end)
      for (let k = 0; k < 9; k++) {
        const y0 = h * (0.12 + k * 0.1) + Math.sin(t * 0.3 + k) * 8;
        // threads feed the USDG node, then follow everything into the one point
        const xEnd = ux + (ox - ux) * conv;
        const yEnd = uy + (oy - uy) * conv;
        curve(0, y0, xEnd, yEnd, 1, A(leaf, 0.06 + 0.1 * conv), 1);
      }

      const pos = (n: N) => {
        const x = SX(n.x) * w + Math.sin(t * 0.5 + n.x * 9) * 4;
        const y = n.y * h + Math.cos(t * 0.45 + n.y * 7) * 4;
        return { x: x + (ox - x) * conv, y: y + (oy - y) * conv };
      };
      const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

      // edges
      for (const e of EDGES) {
        const f = ease((p - e.at) / 0.08);
        if (f <= 0) continue;
        const a = pos(byId[e.a]!),
          b = pos(byId[e.b]!);
        curve(a.x, a.y, b.x, b.y, f, A(leaf, 0.12), 6);
        curve(a.x, a.y, b.x, b.y, f, A(leaf, 0.85 - 0.5 * conv), 1.4);
      }

      // nodes
      ctx.font = "500 11px ui-monospace, monospace";
      for (const n of NODES) {
        const f = ease((p - n.at) / 0.05);
        if (f <= 0) continue;
        const { x, y } = pos(n);
        ctx.fillStyle = A(leaf, 0.18 * f);
        ctx.beginPath();
        ctx.arc(x, y, 12 * f, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = leaf;
        ctx.beginPath();
        ctx.arc(x, y, 4 * f, 0, Math.PI * 2);
        ctx.fill();
        // labels leave while the nodes are still apart: fading over the whole merge left them half visible and piled
        // on one another as the nodes met
        const la = f * Math.max(0, 1 - conv * 3);
        if (la > 0.01) {
          ctx.fillStyle = A(muted, la);
          ctx.fillText(n.label, x + 14, y - 12);
        }
      }

      // the single point: it shows up as the graph arrives, never ahead of it
      // only once the nodes have nearly met (the last 15% of the merge): shown earlier it sat as a glowing blob in the
      // middle of a graph that was still spread out
      const show = ease((conv - 0.85) / 0.15);
      if (show > 0) {
        ctx.fillStyle = A(leaf, 0.12 * show);
        ctx.beginPath();
        ctx.arc(ox, oy, 46 * show, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = A(text, show);
        ctx.beginPath();
        ctx.arc(ox, oy, 6 * show, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = A(leaf, 0.6 * show);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ox, oy, (14 + 6 * Math.sin(t * 2)) * show, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    const loop = (now: number) => {
      if (!phone || now - lastDraw >= 1000 / 30) {
        lastDraw = now;
        draw(now);
      }
      if (visible && !reduce) raf = requestAnimationFrame(loop);
    };

    resize();
    read();
    draw(performance.now());
    const onScroll = () => {
      read();
      if (reduce || !visible) draw(performance.now());
    };
    addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !reduce) raf = requestAnimationFrame(loop);
    });
    io.observe(el);
    return () => {
      removeEventListener("scroll", onScroll);
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const s = STORY.stages[stage]!;
  const last = stage === STORY.stages.length - 1;
  return (
    <section ref={track} id="story" data-chain-mask="" aria-label="How it connects" className="relative h-[460vh]">
      <div className="sticky top-0 h-[calc(100svh/var(--vz))] overflow-hidden">
        <canvas
          ref={cv}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="Diagram: USDG flows into a vault, then to Trust, tokens, agents, launches and the Gap Fund, and all of it converges into one balance."
        />
        <div className="relative mx-auto flex h-full max-w-page flex-col justify-between px-4 pb-10 pt-24 sm:px-6 lg:px-10 xl:px-14">
          <div className="flex items-center justify-between">
            <Label tone="leaf">{STORY.label}</Label>
            <Label>
              Step <span className="text-text">{String(stage + 1).padStart(2, "0")}</span> / {String(STORY.stages.length).padStart(2, "0")}
            </Label>
          </div>
          <div className="ml-auto max-w-md text-right" aria-live="polite">
            <p key={s.k} className="story-in font-mono text-[12px] uppercase tracking-[0.12em] text-leaf">
              {s.k}
            </p>
            <h2 key={`${s.k}-t`} className="story-in mt-3 font-display text-[clamp(2rem,1rem+2.6vw,3.75rem)] leading-[1] tracking-tight">
              {s.title}
            </h2>
            <p key={`${s.k}-l`} className="story-in mt-4 text-muted">
              {s.line}
            </p>
            <div className={`mt-7 transition-opacity duration-500 ${last ? "opacity-100" : "pointer-events-none opacity-0"}`}>
              <Button href={STORY.cta.href}>{STORY.cta.label}</Button>
            </div>
          </div>
          <div className="h-px w-full bg-line">
            <div className="h-px bg-leaf" style={{ width: `${Math.round(prog * 100)}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
