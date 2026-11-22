import { Fragment, type ReactNode } from "react";
import { FACTS, STATUS_LABEL, isShown, type FactKey, type LayerStatus } from "@corbel/config";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Mono uppercase label: ST/00, [001], 01. TRUST */
export function Label({
  children,
  className,
  tone = "muted",
}: {
  children: ReactNode;
  className?: string;
  tone?: "muted" | "leaf" | "text";
}) {
  return (
    <span
      className={cx(
        "font-mono text-xs uppercase tracking-[0.08em]",
        tone === "leaf" ? "text-leaf" : tone === "text" ? "text-text" : "text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

const SIGN: Record<LayerStatus, string> = { live: "●", preview: "◐", closed: "○", soon: "◇" };

/** Status is always a word plus a sign, never colour alone. */
export function StatusChip({ status, className }: { status: LayerStatus; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[12px] uppercase tracking-[0.08em]",
        status === "live" && "border-leaf/50 text-leaf",
        status === "preview" && "border-muted/60 text-text",
        status === "closed" && "border-line text-muted",
        status === "soon" && "soon-chip border-leaf/55 text-leaf",
        className,
      )}
    >
      <span aria-hidden>{SIGN[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Red status bar before the product. Text is --text on --flesh-deep (13:1). */
export function StatusBanner({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex items-start gap-3 border border-flesh/40 bg-flesh-deep px-4 py-3 text-sm text-text">
      <span aria-hidden className="mt-px font-mono text-xs text-flesh">
        ▲
      </span>
      <p>
        <span className="sr-only">Warning: </span>
        {children}
      </p>
    </div>
  );
}

/** Plain anchor so it works without JS. Label = verb + object. */
export function Button({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cx(
        "group inline-flex h-11 items-center gap-3 px-5 font-mono text-xs uppercase tracking-[0.08em] transition-colors duration-300",
        variant === "primary"
          ? "bg-leaf text-bg hover:bg-text"
          : "border border-muted/50 text-text hover:border-leaf hover:text-leaf",
        className,
      )}
    >
      {children}
      <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
        →
      </span>
    </a>
  );
}

/** The only way a number reaches the page. Unverified and missing facts render as "—". */
export function Fact({ k }: { k: FactKey }) {
  const f = FACTS[k];
  if (!isShown(f)) {
    return (
      <span className="text-muted" data-fact={f.status} title={`${f.label}: not verified yet`}>
        —<span className="sr-only"> (not verified yet)</span>
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap" data-fact={f.status}>
      {f.value}
      {f.status === "target" && (
        <span className="ml-1.5 align-middle font-mono text-[12px] uppercase tracking-[0.08em] text-muted">target</span>
      )}
    </span>
  );
}

/** Renders copy with {{factKey}} placeholders. Extra keys can be passed as nodes. */
export function Rich({ text, extra }: { text: string; extra?: Record<string, ReactNode> }) {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\{\{(\w+)\}\}$/.exec(p);
        if (!m) return <Fragment key={i}>{p}</Fragment>;
        const key = m[1]!;
        if (extra && key in extra) return <Fragment key={i}>{extra[key]}</Fragment>;
        if (key in FACTS) return <Fact key={i} k={key as FactKey} />;
        return <Fragment key={i}>—</Fragment>;
      })}
    </>
  );
}

/** Page section on the 12-column container, with an optional visible hairline grid. */
export function Section({
  id,
  children,
  className,
  grid = false,
  nav,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  grid?: boolean;
  nav?: string;
}) {
  return (
    <section id={id} data-nav={nav} data-rg="" className={cx("relative scroll-mt-20", className)}>
      {grid && <div aria-hidden className="grid-rules pointer-events-none absolute inset-0" />}
      <div className="relative mx-auto w-full max-w-page px-4 sm:px-6 lg:px-10 xl:px-14 xl:px-14">{children}</div>
    </section>
  );
}

/** Card with mono labels in its four corners and hairline corner ticks. */
export function CornerCard({
  tl,
  tr,
  bl,
  br,
  children,
  className,
  href,
}: {
  tl?: ReactNode;
  tr?: ReactNode;
  bl?: ReactNode;
  br?: ReactNode;
  children: ReactNode;
  className?: string;
  href?: string;
}) {
  const inner = (
    <>
      <span aria-hidden className="corner-ticks" />
      <div className="flex items-start justify-between gap-3 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
        <span>{tl}</span>
        <span>{tr}</span>
      </div>
      <div className="flex-1">{children}</div>
      {(bl || br) && (
        <div className="flex items-end justify-between gap-3 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
          <span>{bl}</span>
          <span>{br}</span>
        </div>
      )}
    </>
  );
  const cls = cx(
    "card group relative flex flex-col gap-6 border border-line bg-surface/60 p-5 transition-colors duration-500",
    href && "hover:border-leaf/40 hover:bg-surface",
    className,
  );
  return href ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Every tab and layer page ends with this block. Risk is written last and plainly. */
export function WhatCanGoWrong({ items, id = "wcgw" }: { items: string[]; id?: string }) {
  return (
    <aside aria-labelledby={id} className="mt-12 overflow-hidden rounded-2xl border border-[#e3b341]/30 bg-[linear-gradient(135deg,rgba(227,179,65,0.07),transparent_55%)]">
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="flex items-start gap-4">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e3b341]/40 bg-[#e3b341]/10 text-[20px] text-[#e3b341]">
            !
          </span>
          <div>
            <h2 id={id} className="font-display text-[22px] leading-tight text-text">
              What can go wrong
            </h2>
            <p className="mt-1 text-[13px] text-muted">Read this before you sign anything.</p>
          </div>
        </div>
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {items.map((r, i) => (
            <li key={r} className="flex gap-3 border-t border-[#e3b341]/15 pt-3 text-[15px] leading-snug text-text">
              <span aria-hidden className="mt-0.5 font-mono text-[13px] text-[#e3b341]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>
                <Rich text={r} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
