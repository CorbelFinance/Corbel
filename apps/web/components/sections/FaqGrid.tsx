"use client";

import { useState } from "react";
import { FAQ, FLAGS, LAYERS, STATUS_LABEL } from "@corbel/config";
import { Label, Rich, cx } from "@corbel/ui";

/** FAQ as a framed grid (same frame language as the layers), with topic filters. Answers are always visible. */
export function FaqGrid() {
  const [f, setF] = useState<(typeof FAQ.filters)[number]>("All");
  const items = FAQ.items.map((it, i) => ({ ...it, n: i + 1 })).filter((it) => f === "All" || it.tag === f);
  const flags = (
    <span>
      {LAYERS.map((l, i) => (
        <span key={l.id}>
          {l.name} {STATUS_LABEL[FLAGS[l.id]].toLowerCase()}
          {i < LAYERS.length - 1 ? ", " : ""}
        </span>
      ))}
    </span>
  );
  return (
    <div>
      <div className="grid items-end gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Label>{FAQ.label}</Label>
          <h2 className="mt-6 font-display text-[clamp(2.6rem,1rem+4.4vw,6rem)] leading-[0.95] tracking-tight">{FAQ.title}</h2>
        </div>
        <div className="lg:col-span-5 lg:justify-self-end">
          <p className="text-sm text-muted lg:text-right">{FAQ.sub}</p>
          <div className="mt-5 flex flex-wrap gap-2 lg:justify-end" role="group" aria-label="Filter questions by topic">
            {FAQ.filters.map((x) => {
              const count = x === "All" ? FAQ.items.length : FAQ.items.filter((it) => it.tag === x).length;
              return (
                <button
                  key={x}
                  type="button"
                  aria-pressed={f === x}
                  onClick={() => setF(x)}
                  className={cx(
                    "flex items-center gap-2 border px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.08em] transition-colors",
                    f === x ? "border-leaf bg-leaf text-bg" : "border-line text-muted hover:border-leaf/60 hover:text-text",
                  )}
                >
                  {x}
                  <span className={f === x ? "text-bg" : "text-muted"}>{String(count).padStart(2, "0")}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <ul className="frames mt-12 grid sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
        {items.map((it) => (
          <li key={it.q} data-chain-node="" className="frame story-in">
            <span aria-hidden className="fr-sq tl" />
            <span aria-hidden className="fr-sq tr" />
            <span aria-hidden className="fr-sq bl" />
            <span aria-hidden className="fr-sq br" />
            <span aria-hidden className="fr-draw t" />
            <span aria-hidden className="fr-draw r" />
            <span aria-hidden className="fr-draw b" />
            <span aria-hidden className="fr-draw l" />
            <article className="flex h-full min-h-64 flex-col p-6 sm:p-7">
              <div className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.08em]">
                <span className="text-muted">Q.{String(it.n).padStart(3, "0")}</span>
                <span className={cx("border px-1.5 py-0.5", it.tag === "Risk" ? "border-flesh/50 text-flesh" : "border-leaf/50 text-leaf")}>
                  {it.tag === "Risk" && <span aria-hidden>▲ </span>}
                  {it.tag}
                </span>
              </div>
              <h3 className="mt-6 font-display text-[1.65rem] leading-[1.08] tracking-tight">{it.q}</h3>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                <Rich text={it.a} extra={{ flags }} />
              </p>
              {it.link && (
                <a href={it.link.href} className="mt-auto pt-6 font-mono text-[12px] uppercase tracking-[0.08em] text-leaf hover:text-text">
                  {it.link.label} →
                </a>
              )}
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
