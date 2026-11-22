"use client";

/**
 * Drag to resize, like the side rail: a size kept in this browser and a thin handle that changes it. A vertical
 * handle moves left and right, a horizontal one up and down. Arrow keys move it in steps, a double click resets it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import { pageZoom } from "../../lib/zoom";

export function useSize(key: string, def: number, min: number, max: number) {
  const [v, setV] = useState(def);
  useEffect(() => {
    try {
      const s = Number(localStorage.getItem(`corbel.size.${key}`));
      if (s >= min && s <= max) void Promise.resolve().then(() => setV(s));
    } catch {
      // storage off: the default size
    }
  }, [key, min, max]);
  const set = useCallback(
    (n: number) => {
      const c = Math.round(Math.max(min, Math.min(max, n)));
      setV(c);
      try {
        localStorage.setItem(`corbel.size.${key}`, String(c));
      } catch {
        // convenience only
      }
    },
    [key, min, max],
  );
  return [v, set, def] as const;
}

/**
 * A handle between two areas. `dir` "x" drags sideways (column width), "y" up and down (height).
 * `sign` is -1 when dragging toward the start makes the size bigger (a column on the right).
 */
export function Gutter({ dir, value, set, def, label, sign = 1, className }: { dir: "x" | "y"; value: number; set: (n: number) => void; def: number; label: string; sign?: 1 | -1; className?: string }) {
  const start = useRef<{ p: number; v: number } | null>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation={dir === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { p: dir === "x" ? e.clientX : e.clientY, v: value };
        setDrag(true);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const d = ((dir === "x" ? e.clientX : e.clientY) - start.current.p) / pageZoom();
        set(start.current.v + sign * d);
      }}
      onPointerUp={() => ((start.current = null), setDrag(false))}
      onPointerCancel={() => ((start.current = null), setDrag(false))}
      onDoubleClick={() => set(def)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 12;
        const more = dir === "x" ? (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0) : e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
        if (!more) return;
        e.preventDefault();
        set(value + sign * more * step);
      }}
      className={cx(
        "group relative z-10 flex shrink-0 select-none items-center justify-center outline-none",
        dir === "x" ? "w-3 cursor-col-resize" : "h-3 cursor-row-resize",
        className,
      )}
      title={`${label}: drag, or double-click to reset`}
    >
      <span className={cx("rounded-full transition-colors", dir === "x" ? "h-12 w-[3px]" : "h-[3px] w-12", drag ? "bg-leaf" : "bg-[#2b2b2b] group-hover:bg-leaf/70 group-focus-visible:bg-leaf")} />
    </div>
  );
}
