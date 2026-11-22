"use client";

/**
 * Bay: a tool block that is not the stock Instrument card. Each bay carries its own dark tone (violet, ice,
 * amber, ink, moss), a lit top edge in that tone, a header with the title on the left and sub-tabs as a sliding
 * pill on the right, so blocks on one page read as different instruments. Also a few small animated parts that
 * the bays share: an arc gauge and a count-up number.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@corbel/ui";

export type Tone = "violet" | "ice" | "amber" | "ink" | "moss" | "ember";

export function SubTabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly { id: T; label: string; n?: number | string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const i = Math.max(0, tabs.findIndex((t) => t.id === value));
  return (
    <div role="tablist" aria-label={label} className="subtabs" style={{ ["--n" as string]: tabs.length, ["--i" as string]: i }}>
      <span aria-hidden className="subtabs-pill" />
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}>
          {t.label}
          {t.n !== undefined && <span className="subtabs-n">{t.n}</span>}
        </button>
      ))}
    </div>
  );
}

export function Bay({ tone, title, kicker, right, busy, foot, className, children }: { tone: Tone; title: string; kicker?: ReactNode; right?: ReactNode; busy?: boolean; foot?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-label={title} aria-busy={busy || undefined} data-tone={tone} data-busy={busy ? "true" : "false"} className={cx("bay min-w-0", className)}>
      <header className="bay-head">
        <div className="min-w-0">
          {kicker && <p className="bay-kicker">{kicker}</p>}
          <h2 className="bay-title">{title}</h2>
        </div>
        {right && <div className="ml-auto flex min-w-0 items-center gap-2">{right}</div>}
      </header>
      {children}
      {foot && <footer className="bay-foot">{foot}</footer>}
    </section>
  );
}

/** Arc gauge 0..1, animated on change. */
export function Gauge({ value, label, sub, size = 132 }: { value: number; label: string; sub?: string; size?: number }) {
  const v = Math.max(0, Math.min(1, value));
  const r = 52;
  const len = Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size * 0.62 }} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <svg viewBox="0 0 132 76" className="absolute inset-0 h-full w-full" aria-hidden>
        <path d="M14 70 A52 52 0 0 1 118 70" fill="none" stroke="var(--bay-edge)" strokeWidth="9" strokeLinecap="round" />
        <path d="M14 70 A52 52 0 0 1 118 70" fill="none" stroke="var(--bay-acc)" strokeWidth="9" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - v)} className="gauge-arc" />
        {Array.from({ length: 11 }, (_, k) => {
          const a = Math.PI - (k / 10) * Math.PI;
          return <line key={k} x1={66 + Math.cos(a) * 40} y1={70 - Math.sin(a) * 40} x2={66 + Math.cos(a) * 36} y2={70 - Math.sin(a) * 36} stroke="var(--bay-dim)" strokeWidth="1" />;
        })}
      </svg>
      <div className="relative mt-5 text-center">
        <p className="text-[26px] leading-none text-text tabular-nums">
          <CountUp value={Math.round(v * 100)} />
        </p>
        {sub && <p className="mt-1 text-[12px] text-muted">{sub}</p>}
      </div>
    </div>
  );
}

/** A number that runs from its previous value to the new one. */
export function CountUp({ value, fmt = (x: number) => String(Math.round(x)), ms = 500 }: { value: number; fmt?: (x: number) => string; ms?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - (1 - k) ** 3;
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, ms]);
  return <>{fmt(shown)}</>;
}
