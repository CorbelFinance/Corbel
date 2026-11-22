/**
 * App instrument kit. Every tool in the app sits in the same shell so the product reads as one console:
 * corner marks, a coded header strip, a scan line while reading the chain, cell meters, flooding rows.
 */
import type { ReactNode } from "react";
import { cx } from "@corbel/ui";

/** Dark tones a block can carry; neighbours get different ones (by the number in their code). */
const TONES = ["moss", "ink", "violet", "ember", "ice", "amber"] as const;
export type InstTone = (typeof TONES)[number];
const toneOf = (code: string): InstTone => {
  const n = Number(code.replace(/\D/g, "")) || 0;
  return TONES[(n + code.charCodeAt(0)) % TONES.length]!;
};

export function Instrument({
  code,
  tone,
  title,
  status,
  busy,
  foot,
  className,
  children,
  id,
}: {
  code: string;
  tone?: InstTone;
  title: string;
  status?: ReactNode;
  busy?: boolean;
  foot?: ReactNode;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} aria-label={title} aria-busy={busy || undefined} data-busy={busy ? "true" : "false"} data-tone={tone ?? toneOf(code)} className={cx("inst min-w-0", className)}>
      <span aria-hidden className="inst-sq tl" />
      <span aria-hidden className="inst-sq tr" />
      <span aria-hidden className="inst-sq bl" />
      <span aria-hidden className="inst-sq br" />
      <header className="inst-head">
        <span className="inst-code">[{code}]</span>
        <span className="inst-title">{title}</span>
        {status && <span className="ml-auto flex flex-wrap items-center gap-3">{status}</span>}
      </header>
      {children}
      {foot && <footer className="inst-foot">{foot}</footer>}
    </section>
  );
}

export function Led({ tone = "on", live = false, label }: { tone?: "on" | "off" | "bad"; live?: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
      <span aria-hidden className="led" data-tone={tone} data-live={live ? "true" : "false"} />
      {label}
    </span>
  );
}

/** Big number with a mono label. `dim` greys it out (zero, unknown). */
export function Readout({ label, value, sub, dim, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; dim?: boolean; tone?: "good" | "bad"; className?: string }) {
  return (
    <div className={cx("min-w-0 bg-bg p-4 sm:p-5", className)}>
      <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{label}</p>
      {/* a reading still on its way shows a moving bar, never a bare dash */}
      {value === "—" ? (
        <p className="mt-3.5 h-6 w-24 overflow-hidden rounded-md bg-[#181818] sm:h-7">
          <span className="sr-only">Reading</span>
          <span aria-hidden className="skel-run block h-full w-1/2" />
        </p>
      ) : (
        <p className={cx("mt-2.5 truncate font-display text-xl tabular-nums sm:text-[1.75rem]", dim ? "text-muted" : tone === "good" ? "text-leaf" : tone === "bad" ? "text-flesh" : "text-text")}>{value}</p>
      )}
      {sub && <p className="mt-1.5 truncate font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{sub}</p>}
    </div>
  );
}

/** Cell meter: `cells` squares, the first round(value × cells) lit. */
export function Meter({ value, cells = 20, tone, label }: { value: number; cells?: number; tone?: "good" | "mid" | "bad"; label: string }) {
  const on = Math.round(Math.max(0, Math.min(1, value)) * cells);
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} className="meter" data-tone={tone === "bad" ? "bad" : tone === "mid" ? "mid" : undefined}>
      {Array.from({ length: cells }, (_, i) => (
        <i key={i} data-on={i < on ? "" : undefined} />
      ))}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="seg">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Empty / waiting state inside an instrument. */
export function Idle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("dots flex min-h-48 items-center justify-center p-8 text-center", className)}>
      <p className="max-w-md font-medium text-xs uppercase leading-relaxed tracking-[0.08em] text-muted">{children}</p>
    </div>
  );
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function fmtNum(v: number, max = 4) {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a < 1e-6) return "< 0.000001";
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  return new Intl.NumberFormat("en", { maximumFractionDigits: a < 1 ? 6 : max, maximumSignificantDigits: a < 1 ? 4 : undefined }).format(v);
}

const VERDICT_TONE = {
  // the tone colours the dot and the number only; edges and backgrounds stay neutral
  good: { text: "text-leaf" },
  bad: { text: "text-flesh" },
  caution: { text: "text-amber" },
  info: { text: "text-text" },
  ai: { text: "text-[#ff9a5c]" },
} as const;

/**
 * The first block of a page: the answer to the page's question in one sentence, one number that carries it, and the
 * other figures as a single mono line. Colour is meaning: good green, danger red, caution amber, information grey.
 */
export function Verdict({ kicker, tone = "info", value, valueLabel, facts, visual, children }: { kicker: string; tone?: keyof typeof VERDICT_TONE; value: ReactNode; valueLabel?: string; facts?: [string, ReactNode][]; visual?: ReactNode; children: ReactNode }) {
  const c = VERDICT_TONE[tone];
  // a fact with no value is left out, never shown as a dash
  facts = facts?.filter(([, v]) => v != null && v !== "" && v !== "—");
  return (
    <section className="verdict-in relative overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.1em] text-muted">
            <span aria-hidden className={cx("h-2 w-2 rounded-full bg-current", c.text)} />
            {kicker}
          </p>
          <h2 className="mt-3 max-w-3xl font-display text-[clamp(1.45rem,1rem+1.3vw,2.3rem)] leading-[1.15] tracking-tight text-text">{children}</h2>
        </div>
        <div className="lg:text-right">
          <p className={cx("font-display text-[clamp(3rem,2rem+3vw,5.2rem)] leading-none tabular-nums tracking-tight", c.text)}>{value}</p>
          {valueLabel && <p className="mt-2 text-[14px] text-muted">{valueLabel}</p>}
        </div>
      </div>
      {visual && <div className="px-6 pb-2 sm:px-8">{visual}</div>}
      {facts && facts.length > 0 && (
        <p className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line px-6 py-3 text-[14px] tabular-nums sm:px-8">
          {facts.map(([k, v]) => (
            <span key={k}>
              <span className="text-muted">{k}</span> <span className="text-text">{v}</span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
