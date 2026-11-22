"use client";

import { useEffect, useRef } from "react";
import { CHAIN } from "./config";
import { buildLattice, type Rect } from "./lattice";
import { ChainSim, type Pt } from "./sim";
import { drawField } from "./draw";

// Next inlines NEXT_PUBLIC_* at build time; declared here so the package needs no @types/node.
declare const process: { env: Record<string, string | undefined> };


const docRect = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height };
};

/**
 * Chain Field: a fixed canvas behind the landing. Blocks ([data-chain-node]) are links of a chain;
 * the lattice runs along their frames and through the gaps, never through text or [data-chain-mask].
 * Pointer: traces run, branch, and hop block → block. Idle: a few packets walk on their own.
 * ?chain=off or NEXT_PUBLIC_CHAIN_FIELD=0 disables it. ?chain=debug&seed=N exposes window.__chainDebug.
 */
export function ChainField() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("chain") === "off" || process.env.NEXT_PUBLIC_CHAIN_FIELD === "0") return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const debug = q.get("chain") === "debug";
    const seed = Number(q.get("seed") ?? 1) || 1;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = matchMedia("(hover: none)").matches || innerWidth < 768;
    const css = getComputedStyle(document.documentElement);
    const pick = (names: string[], f: string) => names.map((n) => css.getPropertyValue(n).trim()).find(Boolean) || f;
    const P = { leaf: pick(["--leaf", "--green", "--accent"], "#2fbf72"), flesh: pick(["--flesh", "--red"], "#FF4560"), muted: pick(["--muted"], "#8D9C91") };

    let w = 0,
      h = 0,
      dpr = 1,
      clipTop = 0;
    let sim: ChainSim | null = null;
    let cursor: Pt | null = null; // client coords
    let lastMove = 0,
      travel = 0,
      lastSpawn = 0,
      lastNode = -1,
      lastScrollY = scrollY,
      lastTouchRunner = 0;
    let raf = 0,
      running = false,
      level = 0, // 0 full, 1 reduced, 2 static only
      slowSince = 0,
      fastSince = 0;
    const stats = { frames: 0, draws: [] as number[], dropTo: 0, rebuilds: [] as number[], obstacles: 0 };
    let lastT = performance.now();

    const resize = () => {
      // phones draw the field at one device pixel per CSS pixel: it is faint lines, and 3x froze scrolling
      dpr = touch ? 1 : Math.min(devicePixelRatio || 1, 2);
      w = innerWidth;
      h = innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      // the page may be drawn smaller with CSS zoom; the field measures in screen pixels (element boxes, pointer,
      // window size), so it undoes the zoom on its own canvas and draws in screen pixels too
      const pz = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      canvas.style.zoom = String(1 / pz);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const header = document.querySelector("header");
      clipTop = header && getComputedStyle(header).position === "fixed" ? header.getBoundingClientRect().bottom : 0;
    };

    let started = false;
    const rebuild = () => {
      if (!started) return; // fonts/resize events before start are ignored
      const tStart = performance.now();
      const top = scrollY - 1.5 * h,
        bottom = scrollY + 2.5 * h;
      const near = (r: Rect) => r.y + r.h > top && r.y < bottom;
      const nodeEls = Array.from(document.querySelectorAll("[data-chain-node]"));
      const maskEls = Array.from(document.querySelectorAll("[data-chain-mask]"));
      const nodes = nodeEls.map(docRect).filter((r) => r.w > 8 && r.h > 8);
      const masks = maskEls.map(docRect);
      const pad = CHAIN.obstaclePad;
      // every visible text run is an obstacle: wide berth outside blocks, a hairline inside them
      const texts: Rect[] = [];
      const range = document.createRange();
      for (const root of Array.from(document.querySelectorAll("main, footer"))) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          if (!t.textContent?.trim()) continue;
          const el = t.parentElement;
          if (!el || el.closest("[data-chain-mask],[aria-hidden='true'],.sr-only,svg")) continue;
          range.selectNodeContents(t);
          const p = el.closest("[data-chain-node]") ? 3 : pad;
          for (const r of Array.from(range.getClientRects())) {
            if (r.width <= 0 || r.height <= 0) continue;
            const R = { x: r.left - p, y: r.top + scrollY - p, w: r.width + 2 * p, h: r.height + 2 * p };
            if (near(R)) texts.push(R);
          }
        }
      }
      for (const el of Array.from(document.querySelectorAll("input,button,[data-chain-obstacle]"))) {
        if (el.closest("[data-chain-mask],[aria-hidden='true']")) continue;
        const r = docRect(el);
        if (r.w > 0 && near(r)) texts.push({ x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 });
      }
      const L = buildLattice(nodes.filter(near), [...masks.filter(near), ...texts], { top, bottom, left: 0, right: w });
      if (sim) sim.setLattice(L);
      else sim = new ChainSim(L, seed);
      stats.rebuilds.push(Math.round(performance.now() - tStart));
      stats.obstacles = texts.length + masks.length;
      if (debug) expose();
      paint();
    };

    let rebuildTimer = 0;
    const scheduleRebuild = (ms = 120) => {
      clearTimeout(rebuildTimer);
      rebuildTimer = window.setTimeout(rebuild, ms);
    };

    const docCursor = (): Pt | null => (cursor ? { x: cursor.x, y: cursor.y + scrollY } : null);

    const paint = () => {
      if (!sim) return;
      const t0 = performance.now();
      drawField(ctx, sim, P, scrollY, { w, h, clipTop }, reduce ? null : docCursor(), { glow: level === 0, dynamic: !reduce && level < 2 });
      const dt = performance.now() - t0;
      stats.draws.push(dt);
      if (stats.draws.length > 600) stats.draws.shift();
    };

    const nodeAt = (p: Pt) => (sim ? sim.L.nodes.findIndex((n) => p.x > n.x && p.x < n.x + n.w && p.y > n.y && p.y < n.y + n.h) : -1);

    const frame = (now: number) => {
      if (!running || !sim) return;
      if (touch && now - lastT < 30) {
        raf = requestAnimationFrame(frame); // 30 fps is plenty without a pointer
        return;
      }
      const dt = Math.min(0.05, (now - lastT) / 1000);
      const frameMs = now - lastT;
      lastT = now;
      stats.frames++;

      // adaptive degradation
      if (frameMs > 22) {
        slowSince ||= now;
        fastSince = 0;
        if (now - slowSince > 1000) {
          level = Math.min(2, frameMs > 33 ? 2 : Math.max(level, 1));
          stats.dropTo = level;
        }
      } else {
        slowSince = 0;
        if (frameMs < 14) {
          fastSince ||= now;
          if (level > 0 && now - fastSince > 5000) level = 0;
        } else fastSince = 0;
      }

      const idle = now - lastMove > CHAIN.idleAfterMs;
      const want = touch ? CHAIN.touchPackets : CHAIN.ambientPackets;
      if ((idle || touch) && sim.packets.length < want && Math.random() < 0.05) sim.addPacket();
      if (touch && now - lastTouchRunner > CHAIN.touchRunnerEveryMs) {
        lastTouchRunner = now;
        const vis = sim.L.nodes.filter((n) => n.y + n.h > scrollY && n.y < scrollY + h);
        const n = vis[Math.floor(Math.random() * vis.length)];
        if (n) sim.spawnAt(n.x, n.y, 60);
      }
      // fast scroll: two runners near the pointer (or the centre)
      const dy = scrollY - lastScrollY;
      lastScrollY = scrollY;
      if (!touch && Math.abs(dy) > CHAIN.fastScrollPx && level < 2) {
        const c = docCursor() ?? { x: w / 2, y: scrollY + h / 2 };
        sim.spawnAt(c.x, c.y);
        sim.spawnAt(c.x, c.y);
      }

      if (level < 2) sim.step(dt, touch ? null : docCursor());
      if (level === 1) sim.runners = sim.runners.slice(-Math.floor(CHAIN.maxRunners / 2));
      paint();
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || reduce || document.hidden) return;
      running = true;
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const prev = cursor;
      cursor = { x: e.clientX, y: e.clientY };
      lastMove = performance.now();
      if (!sim || reduce || level === 2) return;
      if (prev) travel += Math.abs(cursor.x - prev.x) + Math.abs(cursor.y - prev.y);
      const now = performance.now();
      const p = docCursor()!;
      if (travel >= CHAIN.spawnDistance && now - lastSpawn > 1000 / CHAIN.maxSpawnPerSec) {
        travel = 0;
        lastSpawn = now;
        sim.spawnAt(p.x, p.y);
      }
      const n = nodeAt(p);
      if (n !== lastNode) {
        lastNode = n;
        if (n >= 0) for (const b of sim.neighbours(n, 1 + Math.floor(Math.random() * 3))) sim.hop(n, b);
      }
    };
    const onLeave = () => {
      cursor = null;
    };
    const onTouch = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !sim || reduce) return;
      sim.spawnAt(e.clientX, e.clientY + scrollY, 120);
    };
    const onScroll = () => {
      if (!running) paint(); // static mode follows the page
      scheduleRebuild();
    };
    const onVis = () => (document.hidden ? stop() : start());

    function expose() {
      (window as unknown as Record<string, unknown>).__chainDebug = {
        segments: () =>
          (sim?.segments() ?? []).map(([a, b]) => [
            { x: a.x, y: a.y - scrollY },
            { x: b.x, y: b.y - scrollY },
          ]),
        edges: () =>
          sim
            ? sim.L.edges.map((e) => [
                { x: sim!.L.vertices[e.a]!.x, y: sim!.L.vertices[e.a]!.y - scrollY },
                { x: sim!.L.vertices[e.b]!.x, y: sim!.L.vertices[e.b]!.y - scrollY },
              ])
            : [],
        counts: () => ({ runners: sim?.runners.filter((r) => !r.dead).length ?? 0, packets: sim?.packets.length ?? 0, labels: sim?.labels.length ?? 0, vertices: sim?.L.vertices.length ?? 0, edges: sim?.L.edges.length ?? 0, hops: sim?.hops, nodes: sim?.L.nodes.length ?? 0, portsMissing: sim ? sim.L.ports.flat().filter((p) => p < 0).length : 0 }),
      };
    }
    (window as unknown as Record<string, unknown>).__chainStats = stats;

    const init = () => {
      canvas.style.display = "block";
      document.documentElement.classList.add("chain-on"); // the lattice replaces the CSS column rules
      started = true;
      resize();
      rebuild();
      start();
    };
    // Start after the intro presentation has played and the main thread is idle: never compete with load.
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const wait = Math.max(0, CHAIN.startAfterMs - performance.now());
    const initId = window.setTimeout(() => (idle ? idle(init, { timeout: 1500 }) : init()), wait);
    document.fonts?.ready.then(() => scheduleRebuild(0));
    const ro = new ResizeObserver(() => scheduleRebuild());
    const main = document.querySelector("main");
    if (main) ro.observe(main);
    // phones fire resize whenever the address bar shows or hides: only a change of width re-measures the page
    let lastW = innerWidth;
    const onResize = () => {
      const widthChanged = innerWidth !== lastW;
      lastW = innerWidth;
      resize();
      if (touch && !widthChanged) paint();
      else scheduleRebuild(60);
    };
    // blocks rise in with a transform; re-measure once their entrance animation ends
    const onAnimEnd = (e: Event) => {
      // any finished entrance (blocks or text) moves geometry; infinite loops never fire this
      if ((e.target as Element | null)?.closest?.("[data-rg],[data-chain-node]")) scheduleRebuild(150);
    };
    document.addEventListener("animationend", onAnimEnd, true);
    document.addEventListener("transitionend", onAnimEnd, true);
    addEventListener("resize", onResize);
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onTouch, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.documentElement.classList.remove("chain-on");
      stop();
      clearTimeout(rebuildTimer);
      clearTimeout(initId);
      ro.disconnect();
      document.removeEventListener("animationend", onAnimEnd, true);
      document.removeEventListener("transitionend", onAnimEnd, true);
      removeEventListener("resize", onResize);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onTouch);
      document.removeEventListener("pointerleave", onLeave);
      removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} aria-hidden tabIndex={-1} className="pointer-events-none fixed inset-0 -z-[1] hidden" data-chain-canvas="" />;
}
