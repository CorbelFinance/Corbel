"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "../primitives";

/**
 * Motion primitives. Base is native scroll and visible content.
 * Hidden-until-revealed states apply only under `html.js` and never under prefers-reduced-motion (see motion.css).
 */

function useInView<T extends Element>(once = true, rootMargin = "0px 0px -12% 0px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        // Also reveal anything already above the viewport (anchor jumps, fast flings).
        const passed = e.boundingClientRect.top < 0;
        if (e.isIntersecting || passed) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) setInView(false);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin]);
  return [ref, inView] as const;
}

/** Quiet fade + rise. `delay` in ms for simple staggers. */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
  chain = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li" | "section" | "p";
  /** marks the block as a Chain Field node */
  chain?: boolean;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <Tag
      ref={ref as never}
      data-reveal=""
      data-chain-node={chain ? "" : undefined}
      data-in={inView ? "" : undefined}
      style={{ "--d": `${delay}ms` } as CSSProperties}
      className={className}
    >
      {children}
    </Tag>
  );
}

/**
 * Words brighten one by one as the paragraph crosses the viewport.
 * Uses a CSS view timeline where supported; otherwise a staggered transition on enter.
 */
export function WordReveal({ text, className }: { text: string; className?: string }) {
  const [ref, inView] = useInView<HTMLParagraphElement>();
  const words = text.split(" ");
  return (
    <p ref={ref} data-words="" data-in={inView ? "" : undefined} className={className}>
      <span className="sr-only">{text}</span>
      {words.map((w, i) => (
        <span key={i} aria-hidden className="word" style={{ "--i": i, "--n": words.length } as CSSProperties}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}

/**
 * A tall track with a sticky stage. Each step is a scroll segment; the active index is passed to the stage.
 * Without JS or with reduced motion the stage shows step 0 and the step texts stay readable in order.
 */
export function PinnedScene({
  steps,
  stage,
  className,
}: {
  steps: ReactNode[];
  stage: (active: number) => ReactNode;
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const markers = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    markers.current.forEach((m) => m && io.observe(m));
    return () => io.disconnect();
  }, []);
  return (
    <div className={cx("pinned relative grid gap-10 lg:grid-cols-12", className)}>
      <div className="lg:col-span-5">
        {steps.map((s, i) => (
          <div
            key={i}
            ref={(el) => {
              markers.current[i] = el;
            }}
            data-step={i}
            data-active={active === i ? "" : undefined}
            className="pinned-step flex min-h-[38vh] items-center lg:min-h-[60vh]"
          >
            {s}
          </div>
        ))}
      </div>
      {/* Mobile: the cell itself sticks inside the grid. Desktop: the inner block sticks inside the tall row. */}
      <div className="sticky top-16 z-10 order-first self-start bg-bg pb-2 lg:static lg:order-none lg:col-span-7 lg:self-stretch lg:bg-transparent lg:pb-0">
        <div className="lg:sticky lg:top-24">{stage(active)}</div>
      </div>
    </div>
  );
}

/** Infinite horizontal strip. Pure CSS; the duplicate copy is hidden from assistive tech. */
export function Marquee({
  children,
  className,
  speed = 40,
  reverse = false,
}: {
  children: ReactNode;
  className?: string;
  speed?: number;
  reverse?: boolean;
}) {
  return (
    <div className={cx("marquee overflow-hidden", className)} style={{ "--speed": `${speed}s` } as CSSProperties}>
      <div className={cx("marquee-track flex w-max", reverse && "marquee-reverse")}>
        <div className="flex shrink-0">{children}</div>
        {/* the copy that makes the loop seamless: hidden from screen readers and inert, so its links take no focus */}
        <div className="flex shrink-0" aria-hidden inert>
          {children}
        </div>
      </div>
    </div>
  );
}
