import { Rich } from "@corbel/ui";

type Step = { name: string; line: string; tag?: string };

/**
 * Process diagram: framed nodes on one rail with a moving pulse.
 * `loopBack` draws a return path from the last node to node `loopBack` (0-based) with a caption.
 * Desktop: horizontal. Mobile: vertical rail on the left.
 */
export function StepFlow({ steps, loopBack, loopLabel }: { steps: Step[]; loopBack?: number; loopLabel?: string }) {
  const n = steps.length;
  const x = (i: number) => ((i + 0.5) / n) * 1000;
  return (
    <div className="relative">
      {/* rail: desktop */}
      <svg aria-hidden viewBox="0 0 1000 10" preserveAspectRatio="none" className="absolute inset-x-0 top-[3.25rem] hidden h-2.5 w-full md:block">
        <path d="M0 5 H1000" className="flow-line" vectorEffect="non-scaling-stroke" />
        <path d="M0 5 H1000" className="flow-pulse" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* rail: mobile */}
      <span aria-hidden className="absolute bottom-6 left-[11px] top-6 w-px bg-line md:hidden" />

      <ol data-stagger className="relative grid gap-4 md:grid-cols-[repeat(var(--n),minmax(0,1fr))] md:gap-5" style={{ ["--n" as string]: n }}>
          {steps.map((s, i) => (
            <li key={s.name} className="relative pl-9 md:pl-0">
              <span aria-hidden className="absolute left-0 top-5 grid h-[23px] w-[23px] place-items-center border border-leaf bg-bg md:static md:mx-auto md:mb-4 md:mt-10">
                <span className="h-1.5 w-1.5 bg-leaf" />
              </span>
              <div data-chain-node="" className="card relative border border-line bg-surface/70 p-4 transition-colors hover:border-leaf/40">
                <span aria-hidden className="corner-ticks" />
                <div className="flex justify-between font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                  <span>{String(i + 1).padStart(3, "0")}</span>
                  <span>{s.tag ?? ""}</span>
                </div>
                <p className="mt-5 font-display text-2xl tracking-tight text-text">{s.name}</p>
                <p className="mt-2 text-sm leading-snug text-muted">
                  <Rich text={s.line} />
                </p>
              </div>
            </li>
          ))}
      </ol>

      {loopBack !== undefined && (
        <div className="relative mt-3 hidden md:block">
          <svg aria-hidden viewBox="0 0 1000 70" preserveAspectRatio="none" className="h-16 w-full">
            <path
              d={`M${x(n - 1)} 0 V40 Q${x(n - 1)} 60 ${x(n - 1) - 20} 60 H${x(loopBack) + 20} Q${x(loopBack)} 60 ${x(loopBack)} 40 V0`}
              className="flow-line"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={`M${x(n - 1)} 0 V40 Q${x(n - 1)} 60 ${x(n - 1) - 20} 60 H${x(loopBack) + 20} Q${x(loopBack)} 60 ${x(loopBack)} 40 V0`}
              className="flow-pulse"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {loopLabel && (
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 bg-bg px-3 font-mono text-[12px] uppercase tracking-[0.08em] text-leaf">
              ↺ {loopLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
