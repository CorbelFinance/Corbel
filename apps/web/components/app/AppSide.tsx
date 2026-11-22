"use client";

/**
 * Desktop app shell: a left rail with every tool visible (no menus to open), grouped by task, and a token
 * search for the top bar (Ctrl K or /). Phones keep the top menu (AppNav).
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import { NAV_GROUPS } from "./AppNav";
import { NavIcon } from "./NavIcon";
import { pageZoom } from "../../lib/zoom";


const FOLD_KEY = "corbel.side.folded";
const WIDTH_KEY = "corbel.side.width";
/** Rail width in px: drag its right edge. Under COMPACT only the icons show. */
const MIN_W = 68, MAX_W = 380, DEF_W = 240, COMPACT = 150;
const applyWidth = (w: number) => document.documentElement.style.setProperty("--side", `${w}px`);

/** Each section speaks in its own colour: Check mint, Swap green, Agents violet, AI orange. */
const SECTION_TONE: Record<string, string> = { check: "text-leaf", trade: "text-[var(--swp)]", agents: "text-[var(--agt)]", compute: "text-[var(--ai)]" };

export function AppSide() {
  const path = usePathname() ?? "";
  // folded groups are remembered on this device; any group folds, the one you are in too
  const [folded, setFolded] = useState<string[]>([]);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(FOLD_KEY) ?? "[]") as string[];
      void Promise.resolve().then(() => setFolded(v));
    } catch {
      // storage off: everything open
    }
  }, []);
  const [w, setW] = useState(DEF_W);
  const drag = useRef<{ x: number; w: number } | null>(null);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(WIDTH_KEY));
      if (v >= MIN_W && v <= MAX_W) void Promise.resolve().then(() => (setW(v), applyWidth(v)));
    } catch {
      // default width
    }
  }, []);
  const setWidth = (v: number) => {
    const n = Math.round(Math.max(MIN_W, Math.min(MAX_W, v)));
    setW(n);
    applyWidth(n);
    try {
      localStorage.setItem(WIDTH_KEY, String(n));
    } catch {
      // convenience only
    }
  };
  const compact = w < COMPACT;
  const toggle = (id: string) =>
    setFolded((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify(next));
      } catch {
        // convenience only
      }
      return next;
    });
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--side)] flex-col border-r border-line bg-[#0c0c0c] xl:flex">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the menu: drag, or double-click to switch icons only"
        aria-valuenow={w}
        aria-valuemin={MIN_W}
        aria-valuemax={MAX_W}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, w };
        }}
        onPointerMove={(e) => drag.current && setWidth(drag.current.w + (e.clientX - drag.current.x) / pageZoom())}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => setWidth(compact ? DEF_W : MIN_W)}
        onKeyDown={(e) => (e.key === "ArrowLeft" ? setWidth(w - 20) : e.key === "ArrowRight" ? setWidth(w + 20) : undefined)}
        className="absolute inset-y-0 -right-1 z-50 w-2 cursor-col-resize touch-none transition-colors hover:bg-leaf/30 focus-visible:bg-leaf/40"
      />
      <a href="/" className={cx("flex h-16 shrink-0 items-center gap-2.5", compact ? "justify-center" : "px-5")} aria-label="Corbel, home">
        {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
        <img src="/brand/corbel-logo-128.png" alt="" width={26} height={26} />
        {!compact && <span className="font-medium text-sm uppercase tracking-[0.22em] text-text">Corbel</span>}
        {!compact && <span title="Corbel is in beta: features change and can break. Start small." className="rounded-md border border-amber/40 bg-amber/10 px-1.5 py-px text-[11px] font-semibold uppercase tracking-[0.08em] text-amber">Beta</span>}
      </a>
      <nav aria-label="App" className={cx("min-h-0 flex-1 overflow-y-auto pb-4", compact ? "px-2" : "px-3")}>
        <a href="/app/overview" title="Overview" aria-current={path.startsWith("/app/overview") ? "page" : undefined} className={cx("mt-1 flex items-center gap-3 rounded-lg py-2", compact ? "justify-center px-0" : "px-2", path.startsWith("/app/overview") ? "bg-[#181818] text-text" : "text-muted hover:bg-[#131313] hover:text-text")}>
          <NavIcon id="overview" className={cx("h-[22px] w-[22px] shrink-0", path.startsWith("/app/overview") && "text-leaf")} />
          {!compact && <span className="text-[15px] font-semibold">Overview</span>}
        </a>
        {NAV_GROUPS.map((g) => {
          const here = g.match.some((m) => path.startsWith(m)) || g.items.some((i) => path.startsWith(i.href));
          const open = !folded.includes(g.id);
          if (compact) {
            const first = g.items.find((i) => i.href.startsWith("/app"));
            return (
              <a key={g.id} href={g.soon || !first ? undefined : first.href} title={g.soon ? `${g.label} · soon` : g.label} aria-label={g.label} className={cx("mt-1 grid h-11 place-items-center rounded-lg", g.soon ? "text-muted/50" : SECTION_TONE[g.id] ?? (here ? "text-leaf" : "text-muted hover:text-text"), here ? "bg-[#181818]" : "hover:bg-[#131313]")}>
                <NavIcon id={g.id} className="h-[22px] w-[22px]" />
              </a>
            );
          }
          if (g.soon)
            return (
              <div key={g.id} className="mt-2 flex cursor-default items-center gap-3 rounded-lg px-2 py-2 first:mt-1" title={`${g.label} opens soon`}>
                <NavIcon id={g.id} className="h-[22px] w-[22px] shrink-0 text-muted/60" />
                <span className="flex-1 text-[15px] font-semibold text-muted">{g.label}</span>
                <span className="rounded-full border border-line px-1.5 text-[12px] text-muted">soon</span>
              </div>
            );
          const ai = g.id === "compute";
          // Check wears the mint everywhere, as AI wears orange
          const chk = g.id === "check";
          const agt = g.id === "agents";
          const swp = g.id === "trade";
          return (
          <div key={g.id} className={cx("mt-2 first:mt-1", ai && "[--leaf:var(--ai)]", agt && "[--leaf:var(--agt)]", swp && "[--leaf:var(--swp)]")}>
            <button type="button" aria-expanded={open} onClick={() => toggle(g.id)} className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#131313]">
              <NavIcon id={g.id} className={cx("h-[22px] w-[22px] shrink-0", ai ? "text-[var(--ai)]" : agt ? "text-[var(--agt)]" : swp ? "text-[var(--swp)]" : chk || here ? "text-leaf" : "text-muted group-hover:text-text")} />
              <span className={cx("flex-1 text-[15px] font-semibold", ai ? "text-[var(--ai)]" : agt ? "text-[var(--agt)]" : swp ? "text-[var(--swp)]" : chk ? "text-leaf" : here ? "text-text" : "text-muted group-hover:text-text")}>{g.label}</span>
              <span aria-hidden className={cx("text-[12px] text-muted transition-transform", open ? "rotate-0" : "-rotate-90")}>
                ▾
              </span>
            </button>
            {open && (
            <ul className="ml-[1.2rem] border-l border-[#242424] pl-2">
              {g.items
                .filter((i) => i.href.startsWith("/app"))
                .map((i) => {
                  const on = path.startsWith(i.href);
                  return (
                    <li key={i.href}>
                      <a href={i.href} aria-current={on ? "page" : undefined} className={cx("relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[14px] transition-colors", on ? "bg-[#181818] text-text" : "text-muted hover:bg-[#131313] hover:text-text")}>
                        {on && <span aria-hidden className="absolute -left-[0.6rem] bottom-1.5 top-1.5 w-0.5 rounded-full bg-leaf" />}
                        <span className="truncate">{i.title}</span>
                        {i.tag && <span className="ml-auto rounded-full border border-line px-1.5 text-[12px] text-muted">{i.tag}</span>}
                      </a>
                    </li>
                  );
                })}
            </ul>
            )}
          </div>
          );
        })}
        <div className="mt-4">
          <a href="/app/portfolio" title="Portfolio" className={cx("flex items-center gap-2 rounded-lg py-1.5 text-[14px]", compact ? "justify-center px-0" : "px-2.5", path.startsWith("/app/portfolio") ? "bg-[#181818] text-text" : "text-muted hover:text-text")}>
            <NavIcon id="portfolio" className="h-[22px] w-[22px] text-muted" />
            {!compact && "Portfolio"}
          </a>
        </div>
      </nav>
      <div className={cx("border-t border-line px-5 py-3 text-[12px] text-muted", compact && "hidden")}>
        <a href="/docs/overview" className="hover:text-text">
          Docs
        </a>
        {" · "}
        <a href="/docs/api" className="hover:text-text">
          API
        </a>
        {" · "}
        <a href="/docs/risks" className="hover:text-text">
          Risks
        </a>
      </div>
    </aside>
  );
}

/** Ctrl K or "/" focuses it. An address opens the chart; a ticker goes to the check, which lists contracts. */
export function TokenSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        if (!v) return;
        router.push(/^0x[0-9a-fA-F]{40}$/.test(v) ? `/app/trade/terminal?token=${v}` : `/app/trust/check?q=${encodeURIComponent(v)}`);
        setQ("");
        ref.current?.blur();
      }}
      className="flex h-10 w-full items-center gap-2 rounded-xl border border-[#242424] bg-[#131313] px-3 focus-within:border-ui/60"
    >
      <span aria-hidden className="text-muted">
        ⌕
      </span>
      <label htmlFor="app-q" className="sr-only">
        Search a token
      </label>
      <input ref={ref} id="app-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a token: ticker or 0x…" autoComplete="off" spellCheck={false} className="min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-muted" />
      <kbd className="rounded-md border border-line px-1.5 text-[12px] text-muted">Ctrl K</kbd>
    </form>
  );
}
