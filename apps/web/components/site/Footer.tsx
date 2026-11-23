import Link from "next/link";
import { BRAND, FOOTER } from "@corbel/config";
import { NetScene } from "./NetScene";
import { NetStatus } from "./NetStatus";
import { CopyMail } from "./CopyMail";

/**
 * Footer: a compact link panel on the left, a large mark disc on the right with a leaf arc,
 * and an ASCII price terrain across the bottom (the weekend notch on the right).
 */
export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-line">
      <div className="relative mx-auto max-w-page px-4 pt-16 sm:px-6 lg:px-10 xl:px-14">
        <div className="relative z-10 grid items-start gap-12 lg:grid-cols-12">
          {/* Panel */}
          <div data-chain-node="" className="card relative border border-line bg-[linear-gradient(135deg,var(--surface-2),var(--bg)_70%)] p-6 sm:p-8 lg:col-span-7">
            <span aria-hidden className="corner-ticks" />
            <div className="grid gap-10 sm:grid-cols-[1.3fr_1fr_1fr]">
              <div>
                <p className="font-display text-3xl leading-[1.05] tracking-tight">
                  <span className="text-[#6fe7a8]">Check.</span>
                  <br />
                  <span className="text-[#2fbf72]">Swap.</span>
                  <br />
                  <span className="text-[#f4c152]">Earn.</span>
                  <br />
                  <span className="text-[#9b86e4]">Agents.</span>
                  <br />
                  <span className="text-(--ai)">AI &amp; GPUs.</span>
                </p>
                <p className="mt-4 max-w-[16rem] font-mono text-[12px] uppercase leading-relaxed tracking-[0.1em] text-muted">
                  Token checks, swaps, pool yields, agents, AI models and GPUs on Robinhood Chain.
                </p>
                <div className="mt-8">
                  <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Contact</p>
                  <CopyMail email={BRAND.email} />
                </div>
              </div>
              {FOOTER.columns
                .filter((c) => c.title === "Product" || c.title === "Learn")
                .map((c) => (
                  <nav key={c.title} aria-label={c.title}>
                    <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">{c.title}</p>
                    <ul className="mt-4 space-y-2">
                      {c.links.map((l) => (
                        <li key={l.label}>
                          <a href={l.href} className="group inline-flex items-center gap-1.5 text-sm text-text transition-colors hover:text-leaf">
                            {l.label}
                            <span aria-hidden className="text-[12px] text-muted transition-colors group-hover:text-leaf">
                              ↗
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ))}
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-5 font-mono text-[12px] uppercase tracking-[0.1em]">
              {FOOTER.columns
                .filter((c) => c.title === "Legal" || c.title === "Community")
                .flatMap((c) => c.links)
                .map((l) => (
                  <a key={l.label} href={l.href} {...(l.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})} className="text-muted transition-colors hover:text-leaf">
                    {l.label} ↗
                  </a>
                ))}
            </div>
          </div>

          {/* Mark disc */}
          <div aria-hidden data-chain-mask="" className="relative hidden aspect-square w-full max-w-[30rem] justify-self-end lg:col-span-5 lg:block">
            <span className="absolute inset-0 -translate-x-6 rounded-full border-l-2 border-t border-leaf/80 [mask-image:linear-gradient(115deg,#000_30%,transparent_60%)]" />
            <div className="dots absolute inset-[6%] grid place-items-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_30%,color-mix(in_srgb,var(--rind)_70%,var(--bg)),var(--bg)_75%)]">
              <div className="flex flex-col items-center gap-5">
                {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
                <img src="/brand/corbel-logo-512.png" alt="" width={120} height={120} className="corbel-spin h-[120px] w-[120px]" />
                <span className="font-display text-[5.5rem] leading-none tracking-[-0.04em] text-text">
                  {BRAND.name}
                </span>
                <span className="font-mono text-xs tracking-[0.2em] text-leaf">{BRAND.domains.site}</span>
                <span className="font-mono text-[12px] uppercase tracking-[0.3em] text-muted">Robinhood Chain · 4663</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* the busiest tokens on the range, a lens moving from one to the next */}
      <div data-chain-mask="" className="relative -mt-20 h-[20rem] sm:h-[28rem]">
        <NetScene story="lens" className="absolute inset-0 h-full w-full" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-bg to-transparent" />
      </div>

      {/* Base line */}
      <div className="relative border-t border-line bg-bg">
        <div className="mx-auto grid max-w-page gap-4 px-4 py-6 text-xs leading-relaxed text-muted sm:px-6 lg:grid-cols-12 lg:px-10 xl:px-14">
          <p className="lg:col-span-5">
            <span className="text-amber">Beta.</span> <span className="text-text/85">Corbel is in beta: features change and can break. Start small.</span>{" "}
            <span className="text-flesh">
              <span aria-hidden>▲ </span>Risk.
            </span>{" "}
            <span className="text-text/85">{FOOTER.risk}</span>
          </p>
          <p className="lg:col-span-4">{FOOTER.disclaimer}</p>
          <div className="flex flex-col items-start gap-2 font-mono text-[12px] uppercase tracking-[0.1em] lg:col-span-3 lg:items-end">
            <NetStatus className="flex" menu={false} />
            <span>
              {BRAND.company} · {BRAND.domains.site}
            </span>
            <Link href="#top" className="hover:text-leaf">
              Back to top ↑
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
