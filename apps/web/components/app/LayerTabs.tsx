"use client";

/**
 * A layer's tabs as a workflow. Tabs with a `step` are the main path, numbered and joined by arrows
 * (e.g. Trade: find, check, swap); the rest sit after a divider. Moving along the path carries the token you
 * are looking at, so the next step opens on it instead of starting over.
 *
 * One way to each place: from xl up the left rail already lists every tool, so the bar keeps only the numbered
 * path, and only while the page is one of its steps. Below xl (no rail) the bar is the menu and shows every tab.
 */
import { cx } from "@corbel/ui";

export type BarTab = { id: string; label: string; step?: string; soon?: boolean };

const ADDR = /^0x[0-9a-fA-F]{40}$/;

/** The token on the current page, whichever tool it came from. */
function currentToken(): string | null {
  const p = new URLSearchParams(window.location.search);
  for (const k of ["token", "q", "to"]) {
    const v = p.get(k);
    if (v && ADDR.test(v)) return v;
  }
  return null;
}

/** Where a step opens with that token. */
function carry(href: string, id: string, token: string | null) {
  if (!token) return href;
  if (id === "terminal") return `${href}?token=${token}`;
  if (id === "check") return `${href}?q=${token}`;
  if (id === "quote") return `${href}?from=ETH&to=${token}`;
  return href;
}

export function LayerTabs({ layer, tabs, current }: { layer: string; tabs: BarTab[]; current: string }) {
  const flow = tabs.filter((t) => t.step);
  const more = tabs.filter((t) => !t.step);
  const go = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const href = `/app/${layer}/${id}`;
    const to = carry(href, id, currentToken());
    if (to !== href) {
      e.preventDefault();
      window.location.assign(to);
    }
  };
  const at = flow.findIndex((t) => t.id === current);
  return (
    <nav aria-label="Layer tabs" className="-mx-1 ml-auto max-w-full overflow-x-auto px-1 [scrollbar-width:none]">
      <div className="flex w-max items-center gap-2">
        {flow.length > 0 && (
          <ol className={cx("flex items-center gap-0.5 rounded-2xl border border-[#242424] bg-[#131313] p-[3px]", at < 0 && "xl:hidden")}>
            {flow.map((t, i) => {
              const on = t.id === current;
              const done = at > i;
              return (
                <li key={t.id} className="flex items-center">
                  {i > 0 && (
                    <span aria-hidden className={cx("px-1 font-mono text-[12px]", at >= i ? "text-leaf" : "text-[#404040]")}>
                      →
                    </span>
                  )}
                  <a
                    href={`/app/${layer}/${t.id}`}
                    onClick={(e) => go(e, t.id)}
                    aria-current={on ? "page" : undefined}
                    className={cx("group flex items-center gap-2 rounded-xl py-1 pl-1.5 pr-3 transition-colors", on ? "bg-[#202020]" : "hover:bg-[#181818]")}
                  >
                    <span
                      className={cx(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[12px]",
                        on ? "bg-ui text-[#0b0b0b]" : done ? "border border-leaf/60 text-leaf" : "border border-[#343434] text-muted group-hover:text-text",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="leading-tight">
                      <span className={cx("block text-[14px] font-medium", on ? "text-text" : "text-muted group-hover:text-text")}>{t.label}</span>
                      <span className="block text-[13px] text-muted">{t.step}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        )}
        {more.length > 0 && (
          <ul className="flex items-center gap-0.5 rounded-full bg-[#181818] p-[3px] xl:hidden">
            {more.map((t) => (
              <li key={t.id}>
                <a
                  href={`/app/${layer}/${t.id}`}
                  aria-current={t.id === current ? "page" : undefined}
                  className={cx("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors", t.id === current ? "bg-[#282828] text-text" : "text-muted hover:text-text")}
                >
                  {t.label}
                  {t.soon && <span className="rounded-full border border-[#343434] px-1.5 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">soon</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}
