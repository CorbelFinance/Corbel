"use client";

/** One line at the bottom of the app: where you are, what this tool does, how it works. */
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "./AppNav";
import { LiveBlock } from "../site/LiveBlock";

const DOCS: Record<string, string> = { trade: "/docs/trade", check: "/docs/trust", predict: "/docs/predict", earn: "/docs/earn", launch: "/docs/radar", agents: "/docs/mandate", shield: "/docs/risks" };

export function AppFoot() {
  const path = usePathname() ?? "";
  let text = "Live on Robinhood Chain. Anything you sign happens in your own wallet.";
  let docs = "/docs/overview";
  for (const g of NAV_GROUPS) {
    const it = g.items.find((i) => path.startsWith(i.href));
    if (it || g.match.some((m) => path.startsWith(m))) {
      text = it ? `${it.title}: ${it.text}.` : text;
      docs = DOCS[g.id] ?? docs;
      if (it) break;
    }
  }
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 xl:left-[var(--side)] hidden h-9 items-center gap-5 border-t border-line bg-bg/95 px-4 text-[12px] text-muted backdrop-blur-md md:flex lg:px-6">
      <span className="flex items-center gap-2">
        <span aria-hidden className="led" data-live="true" />
        Block <LiveBlock />
      </span>
      <span className="h-3 w-px bg-line" aria-hidden />
      <span className="truncate text-text">{text}</span>
      <a href={docs} className="shrink-0 rounded-lg bg-[var(--ice-bg)] px-2.5 py-0.5 font-medium text-[var(--ice)] hover:brightness-125">
        How it works
      </a>
      <span className="ml-auto flex shrink-0 gap-4">
        <a href="/docs/api" className="hover:text-text">API</a>
        <a href="/docs/risks" className="hover:text-text">Risks</a>
        <a href="/legal/terms" className="hover:text-text">Terms</a>
      </span>
    </footer>
  );
}
