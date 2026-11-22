"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@corbel/ui";

export type SearchDoc = { slug: string; code: string; group: string; title: string; lede: string; sections: { id: string; title: string }[] };

type Hit = { href: string; code: string; title: string; where: string; score: number };

/** Plain word matching over page titles, section titles and ledes. Small enough to run on every key. */
function find(docs: SearchDoc[], q: string): Hit[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return docs.map((d) => ({ href: `/docs/${d.slug}`, code: d.code, title: d.title, where: d.group, score: 0 }));
  const out: Hit[] = [];
  for (const d of docs) {
    const page = `${d.title} ${d.group}`.toLowerCase();
    const lede = d.lede.toLowerCase();
    const pageScore = words.reduce((s, w) => s + (page.includes(w) ? 3 : lede.includes(w) ? 1 : 0), 0);
    if (pageScore >= words.length) out.push({ href: `/docs/${d.slug}`, code: d.code, title: d.title, where: d.group, score: pageScore + 2 });
    for (const s of d.sections) {
      const t = s.title.toLowerCase();
      if (words.every((w) => t.includes(w) || page.includes(w))) out.push({ href: `/docs/${d.slug}#${s.id}`, code: d.code, title: s.title, where: d.title, score: words.reduce((n, w) => n + (t.includes(w) ? 3 : 1), 0) });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 9);
}

/** The docs bar's search: opens with the button, "/" or Ctrl/Cmd+K. Arrows move, Enter opens, Esc closes. */
export function DocsSearch({ docs }: { docs: SearchDoc[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => find(docs, q), [docs, q]);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setI(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const go = (h: Hit | undefined) => {
    if (!h) return;
    close();
    router.push(h.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-3 border border-line bg-surface/60 px-3 font-mono text-[12px] uppercase tracking-[0.08em] text-muted transition-colors hover:border-leaf/50 hover:text-text"
        aria-label="Search the docs"
      >
        <span aria-hidden>⌕</span>
        <span className="flex-1 text-left">Search docs</span>
        <kbd className="border border-line px-1.5 py-0.5 text-[12px] tracking-normal">⌘K</kbd>
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Search the docs" className="fixed inset-0 z-[80] flex items-start justify-center bg-bg/80 px-4 pt-[14vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="inst w-full max-w-xl">
            <span aria-hidden className="inst-sq tl" />
            <span aria-hidden className="inst-sq tr" />
            <span aria-hidden className="inst-sq bl" />
            <span aria-hidden className="inst-sq br" />
            <header className="inst-head">
              <span className="inst-code">[D-00]</span>
              <span className="inst-title">Search</span>
              <span className="ml-auto font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Esc to close</span>
            </header>
            <input
              ref={input}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setI(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
                else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setI((v) => Math.min(hits.length - 1, v + 1));
                }
                else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setI((v) => Math.max(0, v - 1));
                }
                else if (e.key === "Enter") go(hits[i]);
              }}
              placeholder="trust, quote, mandate, 429…"
              aria-label="Search query"
              className="h-14 w-full border-b border-line bg-transparent px-5 font-mono text-sm text-text outline-none placeholder:text-muted"
            />
            <ul className="max-h-[22rem] overflow-y-auto" role="listbox">
              {hits.length === 0 && <li className="px-5 py-8 text-center font-mono text-[12px] uppercase tracking-[0.1em] text-muted">Nothing matches</li>}
              {hits.map((h, n) => (
                <li key={h.href} role="option" aria-selected={n === i}>
                  <a
                    href={h.href}
                    onClick={(e) => {
                      e.preventDefault();
                      go(h);
                    }}
                    onMouseEnter={() => setI(n)}
                    className={cx("flex items-center gap-4 border-b border-line/60 px-5 py-3 last:border-b-0", n === i ? "bg-leaf/[0.07]" : "")}
                  >
                    <span className="w-11 shrink-0 font-mono text-[12px] text-leaf">{h.code}</span>
                    <span className="min-w-0 flex-1 truncate text-text">{h.title}</span>
                    <span className="shrink-0 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{h.where}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

/** "On this page": reads the page's section heads, follows the scroll, fills a rule as you read. */
export function Toc({ slug }: { slug: string }) {
  const [items, setItems] = useState<{ id: string; title: string }[]>([]);
  const [active, setActive] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const hs = [...document.querySelectorAll<HTMLElement>("[data-doc-h2]")];
    // read the page's headings after layout, then update (not synchronously inside the effect body)
    void Promise.resolve().then(() => {
      setItems(hs.map((h) => ({ id: h.id, title: h.querySelector("span:nth-child(2)")?.textContent ?? h.id })));
      setActive(hs[0]?.id ?? "");
    });
    const onScroll = () => {
      const y = window.scrollY + 160;
      let cur = hs[0]?.id ?? "";
      for (const h of hs) if (h.getBoundingClientRect().top + window.scrollY <= y) cur = h.id;
      setActive(cur);
      const art = document.querySelector("article");
      if (art) {
        const r = art.getBoundingClientRect();
        setProgress(Math.max(0, Math.min(1, (160 - r.top) / Math.max(1, r.height - window.innerHeight + 160))));
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [slug]);

  return (
    <nav aria-label="On this page" className="relative pl-5">
      <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">On this page</p>
      <div aria-hidden className="absolute bottom-0 left-0 top-7 w-px bg-line">
        <div className="w-px bg-leaf shadow-[0_0_8px_var(--leaf)]" style={{ height: `${progress * 100}%` }} />
      </div>
      <ul className="mt-4 space-y-1">
        {items.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} aria-current={active === s.id ? "location" : undefined} className={cx("block py-1 text-[0.8125rem] leading-snug transition-colors", active === s.id ? "text-leaf" : "text-muted hover:text-text")}>
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
