import Link from "next/link";
import { BRAND, FLAGS, LAYERS, LAYER_TONE, NAV, inAppOrder } from "@corbel/config";
import { StatusChip } from "@corbel/ui";
import { NetStatus } from "./NetStatus";
import { MenuCloser } from "./MenuCloser";
import { ComputeLoop, LayerLoop, OverviewLoop } from "../sections/LayerLoops";
import { Socials } from "./Socials";

/** Launch tools are not open yet: shown as soon in the menus, whatever its flag says. */
const statusOf = (id: string) => (id === "launch" ? "soon" : FLAGS[id as keyof typeof FLAGS]);

/** While every layer is closed, Open App leads to the status page, not to an empty app. */
const APP_HREF = LAYERS.some((l) => FLAGS[l.id] === "live" || FLAGS[l.id] === "preview") ? "/app" : "/status";

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label={`${BRAND.name}, home`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static mark, no optimisation needed */}
      <img src="/brand/corbel-logo-128.png" alt="" width={32} height={32} className="h-8 w-8 transition-transform duration-500 group-hover:rotate-[60deg]" />
      <span className="font-mono text-sm uppercase tracking-[0.2em] text-text">{BRAND.name}</span>
      <span title="Corbel is in beta: features change and can break. Start small." className="rounded-md border border-amber/40 bg-amber/10 px-1.5 py-px text-[11px] font-semibold uppercase tracking-[0.08em] text-amber">Beta</span>
    </Link>
  );
}

export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/70 bg-bg/95 md:bg-bg/70 md:backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-page items-center gap-4 px-4 sm:px-6 lg:gap-10 lg:px-10 xl:px-14">
        <Logo />
        <nav aria-label="Main" className="mr-auto hidden items-center gap-1 lg:flex">
          <details className="group" data-menu>
            <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 px-3 font-mono text-xs uppercase tracking-[0.08em] text-muted transition-colors hover:text-text group-open:text-text [&::-webkit-details-marker]:hidden">
              Layers
              <span aria-hidden className="transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="fixed inset-x-0 top-16 border-b border-line bg-bg md:bg-bg/95 md:backdrop-blur-xl">
              <div className="mx-auto max-w-page px-10 py-8 xl:px-14">
                <div className="mb-5 flex items-center justify-between">
                  <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Layers · one account</span>
                  <a href="/status" className="font-mono text-[12px] uppercase tracking-[0.08em] text-leaf hover:text-text">
                    See status →
                  </a>
                </div>
                <ul className="grid grid-cols-4 gap-3">
                  <li>
                    <a href="/app/overview" style={{ ["--leaf" as string]: "#42ee8f" }} className="card group/c relative flex h-full flex-col border border-[#42ee8f]/35 bg-surface p-4 transition-colors hover:border-[#42ee8f]">
                      <span aria-hidden className="corner-ticks" />
                      <span className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                        [000]
                        <span aria-hidden className="text-leaf transition-transform group-hover/c:-translate-y-0.5 group-hover/c:translate-x-0.5">
                          ↗
                        </span>
                      </span>
                      <span className="mt-3 font-display text-3xl tracking-tight text-text">Overview</span>
                      <span className="dots mt-4 flex h-24 items-center justify-center border border-line/60 bg-bg">
                        <OverviewLoop />
                      </span>
                      <span className="mt-3 text-xs leading-snug text-muted">Everything that matters on one screen, read live from the chain.</span>
                      <span className="mt-3">
                        <StatusChip status="live" />
                      </span>
                    </a>
                  </li>
                  {inAppOrder(LAYERS).map((l, n) => (
                    <li key={l.id} style={LAYER_TONE[l.id] ? ({ "--leaf": LAYER_TONE[l.id], "--ui": LAYER_TONE[l.id] } as React.CSSProperties) : undefined}>
                      <a
                        href={`/app/${l.id}`}
                        className="card group/c relative flex h-full flex-col border border-[color-mix(in_srgb,var(--leaf)_35%,#242424)] bg-surface p-4 transition-colors hover:border-[var(--leaf)]"
                      >
                        <span aria-hidden className="corner-ticks" />
                        <span className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                          [{String(n + 1).padStart(3, "0")}]
                          <span aria-hidden className="text-leaf transition-transform group-hover/c:-translate-y-0.5 group-hover/c:translate-x-0.5">
                            ↗
                          </span>
                        </span>
                        <span className="mt-3 font-display text-3xl tracking-tight" style={{ color: LAYER_TONE[l.id] }}>{l.name}</span>
                        <span className="dots mt-4 flex h-24 items-center justify-center border border-line/60 bg-bg">
                          <LayerLoop id={l.id} />
                        </span>
                        <span className="mt-3 text-xs leading-snug text-muted">{l.line}</span>
                        <span className="mt-3">
                          <StatusChip status={statusOf(l.id)} />
                        </span>
                      </a>
                    </li>
                  ))}
                  <li>
                    <a href="/app/ai/studio" style={{ ["--leaf" as string]: "#ff9a5c", ["--ui" as string]: "#ff9a5c" }} className="card group/c relative flex h-full flex-col border border-[#ff9a5c]/40 bg-surface p-4 transition-colors hover:border-[#ff9a5c]">
                      <span aria-hidden className="corner-ticks" />
                      <span className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                        [006]
                        <span aria-hidden className="text-[#ff9a5c] transition-transform group-hover/c:-translate-y-0.5 group-hover/c:translate-x-0.5">
                          ↗
                        </span>
                      </span>
                      <span className="mt-3 font-display text-3xl tracking-tight text-[#ff9a5c]">AI &amp; GPUs</span>
                      <span className="dots mt-4 flex h-24 items-center justify-center border border-line/60 bg-bg">
                        <ComputeLoop />
                      </span>
                      <span className="mt-3 text-xs leading-snug text-muted">AI models and GPUs at live prices, paid from one balance.</span>
                      <span className="mt-3">
                        <StatusChip status="live" />
                      </span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </details>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex h-9 items-center px-3 font-mono text-xs uppercase tracking-[0.08em] text-muted transition-colors hover:text-text"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <NetStatus className="hidden xl:flex" block={false} />
          <Socials className="hidden lg:flex" />
          <a
            href={APP_HREF}
            className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap border border-leaf/60 px-3.5 font-mono text-xs uppercase tracking-[0.08em] text-leaf transition-colors hover:bg-leaf hover:text-bg"
          >
            Open App
          </a>
          <MobileMenu />
        </div>
      </div>
      <MenuCloser />
    </header>
  );
}

function MobileMenu() {
  return (
    <details className="group lg:hidden" data-menu>
      <summary
        aria-label="Menu"
        className="flex h-9 w-9 cursor-pointer list-none flex-col items-center justify-center gap-1.5 border border-line [&::-webkit-details-marker]:hidden"
      >
        <span className="h-px w-4 bg-text transition-transform group-open:translate-y-[3.5px] group-open:rotate-45" />
        <span className="h-px w-4 bg-text transition-transform group-open:-translate-y-[3.5px] group-open:-rotate-45" />
      </summary>
      <div className="fixed inset-x-0 top-16 h-[calc(100dvh/var(--vz)-4rem)] overflow-y-auto border-t border-line bg-bg px-4 py-6">
        <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Layers</p>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {inAppOrder(LAYERS).map((l, n) => (
            <li key={l.id}>
              <a href={`/app/${l.id}`} className="flex items-center justify-between py-3.5">
                <span className="flex items-baseline gap-3">
                  <span className="font-mono text-[12px] text-muted">[{String(n + 1).padStart(3, "0")}]</span>
                  <span className="text-lg" style={{ color: LAYER_TONE[l.id] }}>{l.name}</span>
                </span>
                <StatusChip status={FLAGS[l.id]} />
              </a>
            </li>
          ))}
        </ul>
        <ul className="mt-6 grid grid-cols-2 gap-2">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="block border border-line px-3 py-3 font-mono text-xs uppercase tracking-[0.08em]">
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
        <NetStatus className="mt-6 flex" block={false} />
        <Socials className="mt-4" />
      </div>
    </details>
  );
}
