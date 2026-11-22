/**
 * Docs kit. A doc page is a column of instruments: coded section heads, step rows, tables in the same
 * shell as the app, callouts, code in a panel. Everything here renders on the server except the copy button.
 */
import type { ReactNode } from "react";
import { cx } from "@corbel/ui";
import { Instrument } from "../app/kit";
import { CopyButton } from "./CopyButton";

/** A section: `§ 02` mono number, title, hairline. `id` feeds the right-hand index. */
export function Sec({ id, n, title, children }: { id: string; n: string; title: string; children: ReactNode }) {
  return (
    <section className="mt-16 first:mt-10">
      <h2 id={id} data-doc-h2="" className="group flex scroll-mt-36 items-baseline gap-4 font-display text-[2rem] leading-tight tracking-tight sm:text-[2.4rem]">
        <span aria-hidden className="font-mono text-[12px] uppercase tracking-[0.12em] text-leaf">
          §{n}
        </span>
        <span>{title}</span>
        <a href={`#${id}`} aria-label={`Link to ${title}`} className="font-mono text-sm text-muted opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100">
          #
        </a>
      </h2>
      <div className="mt-2 h-px bg-gradient-to-r from-leaf/50 via-line to-transparent" />
      <div className="docs-prose mt-6">{children}</div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-[46rem] text-[1.0625rem] leading-[1.75] text-muted first:mt-0 [&_b]:font-medium [&_b]:text-text [&_code]:rounded-none [&_code]:border [&_code]:border-line [&_code]:bg-surface [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:text-text">{children}</p>;
}

/** Numbered steps as ruled rows with a big mono index. */
export function Steps({ items }: { items: readonly (readonly [string, ReactNode])[] }) {
  return (
    <ol className="mt-6 border-y border-line">
      {items.map(([k, v], i) => (
        <li key={k} className="grid grid-cols-[3.25rem_1fr] items-baseline gap-x-4 border-b border-line py-5 last:border-b-0 sm:grid-cols-[4rem_12rem_1fr]">
          <span className="font-mono text-xs text-leaf">{String(i + 1).padStart(2, "0")}</span>
          <span className="font-display text-xl tracking-tight text-text sm:text-2xl">{k}</span>
          <span className="col-start-2 mt-1 text-muted sm:col-start-3 sm:mt-0.5">{v}</span>
        </li>
      ))}
    </ol>
  );
}

/** A table in the instrument shell. `cols` are the header labels; cells may be nodes. */
export function DTable({ code, title, cols, rows, foot, mono = [] }: { code: string; title: string; cols: readonly string[]; rows: readonly (readonly ReactNode[])[]; foot?: ReactNode; mono?: readonly number[] }) {
  return (
    <Instrument code={code} title={title} foot={foot} className="mt-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-[0.9375rem]">
          <thead>
            <tr className="border-b border-line">
              {cols.map((c) => (
                <th key={c} scope="col" className="whitespace-nowrap px-5 py-3 font-mono text-[12px] font-normal uppercase tracking-[0.1em] text-muted">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line/70 align-top last:border-b-0">
                {r.map((c, j) => (
                  <td key={j} className={cx("px-5 py-3.5 text-muted", j === 0 && "text-text", mono.includes(j) && "font-mono text-[0.8125rem]")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Instrument>
  );
}

const TONE = {
  note: { code: "NOTE", cls: "border-leaf/40 bg-leaf/[0.04]", mark: "text-leaf", sign: "■" },
  risk: { code: "RISK", cls: "border-flesh/40 bg-flesh-deep/40", mark: "text-flesh", sign: "▲" },
  not: { code: "NOT BUILT", cls: "border-line bg-surface/60", mark: "text-muted", sign: "○" },
} as const;

export function Callout({ tone = "note", title, children }: { tone?: keyof typeof TONE; title?: string; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <aside className={cx("relative mt-6 border p-5 sm:p-6", t.cls)}>
      <p className={cx("flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em]", t.mark)}>
        <span aria-hidden>{t.sign}</span>
        {title ?? t.code}
      </p>
      <div className="mt-2 max-w-[44rem] text-[0.9375rem] leading-[1.7] text-text [&_code]:font-mono [&_code]:text-[0.8125rem]">{children}</div>
    </aside>
  );
}

/** Code in a panel with a coded header and a copy button. */
export function Code({ code, title, text, lang }: { code: string; title: string; text: string; lang?: string }) {
  return (
    <Instrument code={code} title={title} status={<CopyButton text={text} />} foot={lang ? <span>{lang}</span> : undefined} className="mt-6">
      <pre tabIndex={0} aria-label="Code" className="overflow-x-auto p-5 font-mono text-[0.8125rem] leading-[1.7] text-text">
        <code>{text}</code>
      </pre>
    </Instrument>
  );
}

/** Key / value rows for short facts. */
export function Facts({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="mt-6 divide-y divide-line border-y border-line">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 py-3.5 sm:grid-cols-[13rem_1fr] sm:gap-6">
          <dt className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">{k}</dt>
          <dd className="text-text">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Row of next-step links. */
export function Next({ items }: { items: readonly { href: string; code: string; title: string; text: string }[] }) {
  return (
    <ul className="mt-6 grid gap-px border border-line bg-line sm:grid-cols-2">
      {items.map((x) => (
        <li key={x.href} className="bg-bg">
          <a href={x.href} className="group block h-full p-5 transition-colors hover:bg-surface">
            <span className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.1em] text-muted">
              [{x.code}]
              <span aria-hidden className="text-leaf transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </span>
            <span className="mt-3 block font-display text-2xl tracking-tight text-text">{x.title}</span>
            <span className="mt-1.5 block text-sm text-muted">{x.text}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
