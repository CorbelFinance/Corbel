"use client";

/**
 * A soft leaf-green light that trails the pointer across the page, easing after it rather than sticking to it.
 * One fixed layer, a CSS gradient moved by two custom properties; updated in requestAnimationFrame only while it
 * is still catching up. Off on touch screens and when the visitor asks for less motion.
 */
import { useEffect, useRef } from "react";
import { pageZoom } from "@/lib/zoom";

export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia("(hover: none), (prefers-reduced-motion: reduce)").matches) return;
    let x = innerWidth / 2, y = innerHeight / 3, tx = x, ty = y, raf = 0;
    const step = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      el.style.setProperty("--gx", `${x.toFixed(1)}px`);
      el.style.setProperty("--gy", `${y.toFixed(1)}px`);
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(step) : 0;
    };
    const move = (e: PointerEvent) => {
      // the app is a working surface: no light trailing the pointer there (checked each time: links navigate in place)
      if (location.pathname.startsWith("/app")) return void delete el.dataset.on;
      // pointer speaks screen pixels; the glow is placed in the page's own (zoomed) pixels
      const z = pageZoom();
      tx = e.clientX / z;
      ty = e.clientY / z;
      el.dataset.on = "1";
      if (!raf) raf = requestAnimationFrame(step);
    };
    const leave = () => delete el.dataset.on;
    addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={ref} aria-hidden className="cursor-glow" />;
}
