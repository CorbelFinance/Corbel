"use client";

/**
 * Lifts a block in the right-hand column up to the headline above it: when the headline's last line is short and
 * ends on the left, the space over the right column is empty, so the block rises until it sits just under the lowest
 * line that actually reaches over it. Measured after layout (ResizeObserver), wide screens only.
 */
import { useEffect, useRef, type ReactNode } from "react";

export function PullUp({ above, children, gap = 28 }: { above: string; children: ReactNode; gap?: number }) {
  const me = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = me.current;
    const head = document.querySelector<HTMLElement>(above);
    if (!el || !head) return;
    const set = () => {
      el.style.marginTop = "0px";
      el.style.height = "";
      if (!matchMedia("(min-width: 1024px)").matches) return;
      const box = el.getBoundingClientRect();
      // the words of the headline; the lowest one that reaches over this column decides the lift
      const words = [...head.querySelectorAll<HTMLElement>("span")].filter((s) => !s.children.length && s.textContent?.trim());
      let floor = head.getBoundingClientRect().top;
      for (const w of words) {
        const r = w.getBoundingClientRect();
        if (r.right > box.left && r.bottom > floor) floor = r.bottom;
      }
      const lift = box.top - (floor + gap);
      // lifted by the same amount it grows, so its foot stays level with the foot of the left column
      if (lift > 0) {
        el.style.marginTop = `${-Math.round(lift)}px`;
        el.style.height = `calc(100% + ${Math.round(lift)}px)`;
      }
    };
    const ro = new ResizeObserver(() => requestAnimationFrame(set));
    ro.observe(head);
    ro.observe(document.documentElement);
    const t = setTimeout(set, 1200); // the words settle after their reveal
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [above, gap]);
  return (
    <div ref={me} className="relative z-[1] h-full">
      {children}
    </div>
  );
}
