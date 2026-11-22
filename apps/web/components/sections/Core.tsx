import { COMPARISON, ONE_BALANCE, type CellState } from "@corbel/config";
import { Label, Section } from "@corbel/ui";
import { Reveal } from "@corbel/ui/motion";
import { OneBalanceScene } from "./OneBalanceScene";

/* 5. One balance: the single pinned scene of the page */
export function OneBalance() {
  return (
    <Section id="core" nav="One balance" className="border-t border-line py-24 sm:py-32">
      <div className="grid gap-6 lg:grid-cols-12">
        <Label tone="leaf" className="lg:col-span-3">
          {ONE_BALANCE.label}
        </Label>
        <h2 className="font-display text-4xl lg:col-span-9">{ONE_BALANCE.title}</h2>
      </div>
      <OneBalanceScene />
    </Section>
  );
}

const CELL: Record<CellState, { sign: string; text: string; cls: string }> = {
  no: { sign: "−", text: "No", cls: "text-muted" },
  sometimes: { sign: "◐", text: "Sometimes", cls: "text-muted" },
  planned: { sign: "○", text: "Planned", cls: "text-text" },
  preview: { sign: "◐", text: "Preview", cls: "text-text" },
  live: { sign: "●", text: "Live", cls: "text-leaf" },
};

function Cell({ s }: { s: CellState }) {
  const c = CELL[s];
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.08em] ${c.cls}`}>
      <span aria-hidden>{c.sign}</span>
      {c.text}
    </span>
  );
}

/* 6. Comparison: a score, then one row per difference; every row opens the tool it is about. Never a check mark for
   something not built. */
export function Comparison() {
  const rows = COMPARISON.rows;
  const live = rows.filter((r) => r.corbel === "live").length;
  const theirs = (k: "launchpad" | "terminal") => rows.filter((r) => r[k] !== "no").length;
  return (
    <Section id="compare" nav="Difference" className="py-24 sm:py-32">
      <div className="grid gap-6 border-b border-line pb-10 lg:grid-cols-12">
        <Label className="lg:col-span-3">{COMPARISON.label}</Label>
        <h2 className="font-display text-4xl lg:col-span-9">{COMPARISON.title}</h2>
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-12">
        {/* the score stays in view while the rows scroll past */}
        <div className="lg:col-span-3 lg:sticky lg:top-28 lg:self-start">
          <p className="font-display text-[5.5rem] leading-none tabular-nums text-leaf">
            {live}
            <span className="text-[2.2rem] text-muted">{`/${rows.length}`}</span>
          </p>
          <p className="mt-3 text-sm text-muted">of these work on mainnet today.</p>
          <dl className="mt-8 space-y-3 border-t border-line pt-6 font-mono text-[12px]">
            {(
              [
                [COMPARISON.columns[0], theirs("launchpad")],
                [COMPARISON.columns[1], theirs("terminal")],
                [COMPARISON.columns[2], live],
              ] as const
            ).map(([k, n], i) => (
              <div key={k}>
                <dt className="flex justify-between uppercase tracking-[0.08em] text-muted">
                  {k}
                  <span className={i === 2 ? "text-leaf" : "text-text"}>{n}</span>
                </dt>
                <dd className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#1b1b1b]">
                  <span className={i === 2 ? "block h-full rounded-full bg-leaf" : "block h-full rounded-full bg-[#4a5a51]"} style={{ width: `${(n / rows.length) * 100}%` }} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {/* the rows */}
        <Reveal chain className="lg:col-span-9">
          <div className="hidden grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_9rem] gap-4 border-b border-line px-4 pb-3 font-mono text-[12px] uppercase tracking-[0.08em] text-muted md:grid">
            <span>What</span>
            <span>{COMPARISON.columns[0]}</span>
            <span>{COMPARISON.columns[1]}</span>
            <span className="text-leaf">{COMPARISON.columns[2]}</span>
          </div>
          <ul>
            {rows.map((r, i) => (
              <li key={r.name}>
                <a href={r.href} className="group grid items-center gap-x-4 gap-y-2 border-b border-line px-4 py-4 transition-colors hover:bg-leaf/[0.04] md:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_9rem]">
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-3">
                      <span className="font-mono text-[12px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-[17px] text-text">{r.name}</span>
                    </span>
                    <span className="mt-0.5 block pl-8 text-[13px] text-muted">{r.how}</span>
                  </span>
                  <span className="pl-8 md:pl-0">
                    <Cell s={r.launchpad} />
                  </span>
                  <span className="pl-8 md:pl-0">
                    <Cell s={r.terminal} />
                  </span>
                  <span className="flex items-center justify-between gap-2 pl-8 md:pl-0">
                    <Cell s={r.corbel} />
                    <span aria-hidden className="font-mono text-[12px] text-leaf opacity-0 transition-opacity group-hover:opacity-100">
                      →
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
      <p className="mt-6 max-w-2xl text-xs text-muted">{COMPARISON.caption}</p>
    </Section>
  );
}
