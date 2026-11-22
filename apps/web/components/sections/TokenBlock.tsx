"use client";

import { useState } from "react";
import { TOKEN } from "@corbel/config";
import { Label, Rich, cx } from "@corbel/ui";
import { HolderPrompts } from "./HolderPrompts";

/**
 * Token, information only. Big statement on top, then a numbered list across the page;
 * the row under the pointer (or in focus, or tapped) drives the detail card on the right.
 */
export function TokenBlock() {
  const [active, setActive] = useState(0);
  const it = TOKEN.items[active]!;
  return (
    <div>
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Label>{TOKEN.label}</Label>
          <h2 className="mt-6 font-display text-[clamp(2.4rem,1rem+3.8vw,5.25rem)] leading-[1] tracking-tight">
            {TOKEN.title.map((t, i) => (
              <span key={t} className={cx("block", i > 0 && "text-muted")}>
                {t}
              </span>
            ))}
          </h2>
        </div>
        <div className="flex flex-col justify-end gap-4 lg:col-span-3 lg:col-start-10">
          <p className="text-sm text-muted">{TOKEN.aside}</p>
          <a href={TOKEN.explorer} target="_blank" rel="noreferrer" className="break-all font-mono text-[12px] text-muted underline decoration-line underline-offset-4 hover:text-text">
            {TOKEN.contract}
          </a>
          <a href={TOKEN.buy} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-2 border border-leaf px-4 py-2 font-mono text-[12px] uppercase tracking-[0.08em] text-leaf hover:bg-leaf hover:text-bg">
            Buy on Pons <span aria-hidden>↗</span>
          </a>
        </div>
      </div>

      <div className="mt-16 grid gap-6 lg:grid-cols-12">
        <ol data-stagger className="border-t border-dashed border-line lg:col-span-8 xl:col-span-9" aria-label="What $CORBEL does">
          {TOKEN.items.map((x, i) => (
            <li key={x.name} data-chain-node="" className="border-b border-dashed border-line">
              <button
                type="button"
                aria-pressed={i === active}
                aria-controls="token-card"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className={cx(
                  "work-row work-row-r group relative flex w-full items-center gap-6 px-3 py-6 text-left outline-none sm:px-6",
                  i === active && "text-text",
                )}
              >
                <span aria-hidden className="work-fill">
                  {Array.from({ length: 28 }, (_, k) => (
                    <span key={k} style={{ ["--k" as string]: k }} />
                  ))}
                </span>
                <span className="relative w-8 font-mono text-[12px] tracking-[0.08em]">{String(i + 1).padStart(2, "0")}</span>
                <span className="relative font-display text-[clamp(1.4rem,1rem+1.2vw,2.1rem)] tracking-tight">{x.name}</span>
                <span className="relative ml-auto hidden font-mono text-[12px] uppercase tracking-[0.08em] md:inline">{x.kicker}</span>
                <span
                  aria-hidden
                  className={cx("relative font-mono text-sm transition-all", i === active ? "translate-x-0 text-leaf opacity-100" : "-translate-x-2 opacity-0")}
                >
                  ↗
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div className="lg:col-span-4 xl:col-span-3">
          <div id="token-card" data-chain-node="" aria-live="polite" className="card relative border border-line bg-surface p-5 lg:sticky lg:top-24">
            <span aria-hidden className="corner-ticks" />
            <div key={it.name} className="story-in">
              <Label tone="leaf">{it.kicker}</Label>
              <p className="mt-3 font-display text-2xl tracking-tight">{it.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                <Rich text={it.line} />
              </p>
              <dl className="mt-5 divide-y divide-line border-y border-line font-mono text-[12px] uppercase tracking-[0.08em]">
                {it.rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right text-text">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 border border-line px-2 py-1 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                  <span aria-hidden className="text-leaf">●</span> $CORBEL
                </span>
                <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                  {String(active + 1).padStart(2, "0")} / {String(TOKEN.items.length).padStart(2, "0")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <HolderPrompts />
    </div>
  );
}
