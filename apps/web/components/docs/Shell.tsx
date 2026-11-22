import { cx } from "@corbel/ui";
import { DOCS, GROUPS, type Doc } from "./pages";
import { Toc } from "./Chrome";

/** Where each page's subject runs live in the app. Pages without one show no card. */
const TRY: Record<string, { href: string; label: string; text: string }> = {
  overview: { href: "/app", label: "Open the app", text: "Every tool in one place." },
  quickstart: { href: "/app/trust/check", label: "Check a token", text: "Paste an address and watch seven checks run." },
  trust: { href: "/app/trust/check", label: "Run a check", text: "Try the report on any token." },
  radar: { href: "/app/trust/radar", label: "Open the radar", text: "New pools, newest first." },
  trade: { href: "/app/trade/quote", label: "Get a quote", text: "Every route, simulated now." },
  mandate: { href: "/app/agents/break", label: "Break the mandate", text: "Pick an attack and see which rule stops it." },
  api: { href: "/app/trust/api", label: "Open the API tab", text: "The same reads, in the app." },
};


const hex = (s: string) =>
  [...new TextEncoder().encode(s)]
    .slice(0, 26)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");

function Sidebar({ slug }: { slug: string }) {
  return (
    <nav aria-label="Docs" className="text-sm">
      {GROUPS.map((g) => (
        <div key={g} className="mb-7">
          <p className="mb-2 px-3 font-mono text-[12px] uppercase tracking-[0.14em] text-muted">{g}</p>
          <ul>
            {DOCS.filter((d) => d.group === g).map((d) => {
              const on = d.slug === slug;
              return (
                <li key={d.slug}>
                  <a
                    href={`/docs/${d.slug}`}
                    aria-current={on ? "page" : undefined}
                    className={cx(
                      "relative flex items-center gap-3 px-3 py-2 transition-colors",
                      on ? "bg-gradient-to-r from-rind/30 to-transparent text-text" : "text-muted hover:text-text",
                    )}
                  >
                    {on && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-leaf shadow-[0_0_8px_var(--leaf)]" />}
                    <span className={cx("w-9 shrink-0 font-mono text-[12px]", on ? "text-leaf" : "text-muted")}>{d.code.slice(2)}</span>
                    <span className="truncate">{d.title}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DocsShell({ doc }: { doc: Doc }) {
  const i = DOCS.findIndex((d) => d.slug === doc.slug);
  const prev = DOCS[i - 1];
  const next = DOCS[i + 1];
  const t = TRY[doc.slug];
  return (
    <div className="mx-auto max-w-page px-4 pt-16 sm:px-6 lg:px-10 xl:px-14">
      {/* docs bar: where you are, the app */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-line bg-bg/95 px-4 md:bg-bg/85 md:backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 xl:-mx-14 xl:px-14">
        <div className="flex h-12 items-center gap-4">
          <p className="hidden min-w-0 items-center gap-2 truncate font-mono text-[12px] uppercase tracking-[0.1em] text-muted md:flex">
            <a href="/docs" className="text-text transition-colors hover:text-leaf">
              Docs
            </a>
            <span aria-hidden>/</span>
            <span>{doc.group}</span>
            <span aria-hidden>/</span>
            <span className="truncate text-leaf">{doc.title}</span>
          </p>
          <div className="flex-1" />
          <a href="/app" className="hidden font-mono text-[12px] uppercase tracking-[0.1em] text-leaf transition-colors hover:text-text sm:block">
            Open app →
          </a>
        </div>
      </div>

      <div className="grid gap-x-12 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_13rem]">
        <aside className="hidden lg:block">
          <div className="sticky top-32 max-h-[calc(100vh/var(--vz)-9rem)] overflow-y-auto py-10 pr-2">
            <Sidebar slug={doc.slug} />
          </div>
        </aside>

        <article className="min-w-0 pb-24 pt-10 lg:pt-14">
          <details className="mb-8 border border-line lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-mono text-[12px] uppercase tracking-[0.1em] text-muted [&::-webkit-details-marker]:hidden">
              <span>
                <span className="text-leaf">{doc.code}</span> · {doc.title}
              </span>
              <span aria-hidden>▾</span>
            </summary>
            <div className="border-t border-line py-4">
              <Sidebar slug={doc.slug} />
            </div>
          </details>

          <header>
            <p className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.14em] text-muted">
              <span aria-hidden className="inline-block h-[5px] w-[5px] bg-leaf shadow-[0_0_6px_var(--leaf)]" />
              <span className="text-leaf">[{doc.code}]</span>
              <span>{doc.group}</span>
            </p>
            <h1 className="mt-5 font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">{doc.title}</h1>
            <p className="mt-6 max-w-[40rem] text-xl leading-relaxed text-muted">{doc.lede}</p>
            <p aria-hidden className="mt-8 overflow-hidden whitespace-nowrap font-mono text-[12px] tracking-[0.2em] text-muted [mask-image:linear-gradient(90deg,#000,transparent_70%)]">
              {hex(doc.lede)}
            </p>
          </header>

          {doc.body()}

          <nav aria-label="Pages" className="mt-24 grid gap-px border border-line bg-line sm:grid-cols-2">
            {prev ? (
              <a href={`/docs/${prev.slug}`} className="group bg-bg p-5 transition-colors hover:bg-surface">
                <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">← Previous · {prev.code}</span>
                <span className="mt-2 block font-display text-2xl tracking-tight">{prev.title}</span>
              </a>
            ) : (
              <span className="hidden bg-bg sm:block" />
            )}
            {next ? (
              <a href={`/docs/${next.slug}`} className="group bg-bg p-5 text-left transition-colors hover:bg-surface sm:text-right">
                <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Next · {next.code} →</span>
                <span className="mt-2 block font-display text-2xl tracking-tight">{next.title}</span>
              </a>
            ) : (
              <span className="bg-bg" />
            )}
          </nav>
        </article>

        <aside className="hidden xl:block">
          <div className="sticky top-32 space-y-10 py-14">
            <Toc slug={doc.slug} />
            {t && (
              <a href={t.href} className="inst group block p-4 transition-colors hover:border-leaf/50">
                <span aria-hidden className="inst-sq tl" />
                <span aria-hidden className="inst-sq tr" />
                <span aria-hidden className="inst-sq bl" />
                <span aria-hidden className="inst-sq br" />
                <span className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em] text-leaf">
                  <span aria-hidden className="led" data-live="true" />
                  Try it live
                </span>
                <span className="mt-3 block font-display text-xl tracking-tight">{t.label}</span>
                <span className="mt-1 block text-[0.8125rem] leading-snug text-muted">{t.text}</span>
              </a>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
