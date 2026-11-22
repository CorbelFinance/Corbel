"use client";

/**
 * The house illustration on the page (see netCore.ts for what each story draws). This component only hosts the
 * scene: it sizes it, tells it when it is on screen and where the pointer is.
 * The loader (story "token") draws in a worker on an OffscreenCanvas: on the main thread it froze whenever the page
 * under it was starting up (hydration, effects, the other scenes' first frames), worst on phones. Browsers without
 * OffscreenCanvas draw it here as before.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { runNet, type NetCtl, type Story } from "./netCore";

export type { Story } from "./netCore";

type Face = { family: string; src: string; desc: FontFaceDescriptors };
type Host = Omit<NetCtl, "stop"> & { stop: () => void; hidden?: (on: boolean) => void };

const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");

/** The @font-face rules of one family, with absolute URLs, so a worker can load the same file. */
function facesOf(fam: string): Face[] {
  const want = unquote(fam);
  const out: Face[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    const base = sheet.href ?? location.href;
    for (const r of Array.from(rules)) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      if (unquote(r.style.getPropertyValue("font-family")) !== want) continue;
      const src = r.style.getPropertyValue("src").replace(/url\((["']?)([^"')]+)\1\)/g, (_, _q: string, u: string) => `url("${new URL(u, base).href}")`);
      if (!/url\(/.test(src)) continue;
      const desc: FontFaceDescriptors = {};
      const w = r.style.getPropertyValue("font-weight"), st = r.style.getPropertyValue("font-style"), ur = r.style.getPropertyValue("unicode-range");
      if (w) desc.weight = w;
      if (st) desc.style = st;
      if (ur) desc.unicodeRange = ur;
      out.push({ family: want, src, desc });
    }
  }
  return out;
}

// React's strict mode mounts twice in development; a canvas can hand its control to a worker only once, so the second
// mount takes over the worker the first one left (it is stopped only if nobody does within a moment)
const workers = new WeakMap<HTMLCanvasElement, { w: Worker; bye: ReturnType<typeof setTimeout> | null }>();

function startWorker(cv: HTMLCanvasElement, init: { story: Story; still: boolean; phone: boolean; dpr: number; fam: string; w: number; h: number }): Worker | null {
  const had = workers.get(cv);
  if (had) {
    if (had.bye) clearTimeout(had.bye);
    had.bye = null;
    return had.w;
  }
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || !("transferControlToOffscreen" in cv)) return null;
  let w: Worker;
  try {
    w = new Worker(new URL("./netWorker.ts", import.meta.url), { type: "module" });
    const off = cv.transferControlToOffscreen();
    w.postMessage({ type: "init", canvas: off, faces: init.fam ? facesOf(init.fam) : [], ...init }, [off]);
  } catch {
    return null;
  }
  workers.set(cv, { w, bye: null });
  return w;
}

export function NetScene({ story = "overview", className = "" }: { story?: Story; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // phones: one device pixel per CSS pixel and a frame cap; a full-screen canvas at 2-3x froze scrolling there
    const phone = matchMedia("(hover: none)").matches || innerWidth < 768;
    // next/font gives a list: the real face, then a fallback made from a system font. Only the first family, the real
    // one, is checked and drawn with (checking the whole list said "ready" at once and the labels jumped later).
    const fam = (getComputedStyle(document.body).getPropertyValue("--font-jbmono").split(",")[0] ?? "").trim();
    const box = cv.getBoundingClientRect();

    let host: Host | null = null;
    const w = story === "token" ? startWorker(cv, { story, still, phone, dpr: devicePixelRatio || 1, fam, w: box.width, h: box.height }) : null;
    if (w) {
      const post = (m: object) => w.postMessage(m);
      host = {
        resize: (W, H) => post({ type: "resize", w: W, h: H }),
        seen: (on) => post({ type: "seen", on }),
        hidden: (on) => post({ type: "hidden", on }),
        move: () => undefined,
        leave: () => undefined,
        click: () => undefined,
        stop: () => {
          const e = workers.get(cv);
          if (!e) return;
          e.bye = setTimeout(() => {
            post({ type: "stop" });
            e.w.terminate();
            workers.delete(cv);
          }, 200);
        },
      };
    } else {
      // scenes under the intro wait for its stage to finish fading (not a fixed time: on a page that painted late a
      // fixed mark fell while the loader was still up and their first heavy frames froze it); capped at 7 s
      let open = story === "token";
      const covered = () => {
        if (open) return false;
        const st = document.documentElement.classList.contains("intro-seen") ? null : document.querySelector(".ld-stage");
        const on = !!st && performance.now() < 7000 && st.getAnimations().some((a) => a.playState !== "finished");
        if (!on) open = true;
        return on;
      };
      const ctl = runNet({
        cv,
        story,
        still,
        phone,
        dpr: devicePixelRatio || 1,
        fam,
        mk: () => document.createElement("canvas"),
        fontCheck: (f) => document.fonts.check(`16px ${f}`),
        fontLoad: (f) => document.fonts.load(`16px ${f}`),
        covered,
        hidden: () => document.hidden,
        raf: (f) => requestAnimationFrame(f),
        caf: (id) => cancelAnimationFrame(id),
        go: (href) => router.push(href),
        cursor: (c) => {
          cv.style.cursor = c;
        },
      });
      host = ctl;
    }
    const h = host;

    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      h.move((e.clientX - r.left) / (r.width || 1), (e.clientY - r.top) / (r.height || 1), (e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    };
    const onLeave = () => h.leave();
    const onClick = () => h.click();
    const onVis = () => h.hidden?.(document.hidden);
    addEventListener("pointermove", onMove, { passive: true });
    cv.addEventListener("pointerleave", onLeave);
    cv.addEventListener("click", onClick);
    document.addEventListener("visibilitychange", onVis);
    const ro = new ResizeObserver(([e]) => {
      if (e) h.resize(e.contentRect.width, e.contentRect.height);
    });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => h.seen(!!e?.isIntersecting), { rootMargin: "200px" });
    io.observe(cv);
    return () => {
      h.stop();
      ro.disconnect();
      io.disconnect();
      removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerleave", onLeave);
      cv.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [story, router]);
  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${className}`} />;
}
