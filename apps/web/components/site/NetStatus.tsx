"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ROBINHOOD_CHAIN } from "@corbel/config";
import { cx } from "@corbel/ui";
import { LiveBlock } from "./LiveBlock";
import { pageZoom } from "../../lib/zoom";

/** Networks Corbel reads. Only Robinhood Chain is live; the others are named, marked soon, and cannot be picked. */
const NETS = [
  { id: "robinhood", name: ROBINHOOD_CHAIN.name, logo: "/partners/robinhood.png", facts: ["Mainnet", `Chain ${ROBINHOOD_CHAIN.id}`, "ETH gas"], tools: "Every tool", live: true },
  { id: "elysium", name: "Elysium", logo: "/partners/elysium.png", facts: ["Layer 2", "Hyperliquid", "HYPE gas"], tools: "Check, Radar, swaps first", live: false },
] as const;

/**
 * Network line and switcher. The block number comes from the public RPC (chain id checked on every read). A click
 * opens a panel that unfolds from the button: each network with its mark, what it is, and what Corbel runs there.
 */
export function NetStatus({ className, block = true, menu = true }: { className?: string; block?: boolean; menu?: boolean }) {
  if (!menu)
    return (
      <p className={cx("items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] text-muted", className)}>
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-leaf" />
        <span>
          {ROBINHOOD_CHAIN.name} · {ROBINHOOD_CHAIN.network}
          {block && (
            <>
              {" "}
              · block <LiveBlock />
            </>
          )}
        </span>
      </p>
    );
  return <NetMenu className={className} block={block} />;
}

function NetMenu({ className, block }: { className?: string; block: boolean }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState({ top: 64, left: 16 });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className={cx("items-center", className)}>
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Network"
        onClick={() => {
          const r = btn.current!.getBoundingClientRect();
          const z = pageZoom();
          setAt({ top: (r.bottom + 8) / z, left: Math.max(8, r.left / z) });
          setOpen((o) => !o);
        }}
        className={cx("group flex items-center gap-2 rounded-xl border px-2 py-1 font-mono text-[12px] uppercase tracking-[0.08em] transition-colors", open ? "border-leaf/50 bg-leaf/[0.06] text-text" : "border-transparent text-muted hover:border-line hover:text-text")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- small static mark */}
        <img src="/partners/robinhood.png" alt="" width={16} height={16} className="h-4 w-4 rounded-full" />
        <span className="net-dot relative inline-block h-1.5 w-1.5 rounded-full bg-leaf" aria-hidden />
        <span>
          {ROBINHOOD_CHAIN.name} · {ROBINHOOD_CHAIN.network}
          {block && (
            <>
              {" "}
              · block <LiveBlock />
            </>
          )}
        </span>
        <span aria-hidden className={cx("text-[12px] transition-transform duration-300", open && "rotate-180")}>
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div ref={pop} role="listbox" aria-label="Network" className="net-pop fixed z-[95] w-[22rem] overflow-hidden rounded-2xl border border-line bg-[#0e0e0e] shadow-[0_28px_70px_-14px_rgba(0,0,0,0.92)]" style={{ top: at.top, left: at.left }}>
            <p className="flex items-center justify-between border-b border-line px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
              Network
              <span className="text-leaf">1 live · 1 soon</span>
            </p>
            <ul className="p-1.5">
              {NETS.map((n, i) => (
                <li key={n.id} role="option" aria-selected={n.live} aria-disabled={!n.live} className="net-row" style={{ animationDelay: `${0.06 + i * 0.07}s` }}>
                  <div className={cx("relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-3", n.live ? "bg-leaf/[0.07]" : "cursor-not-allowed")}>
                    {n.live && <span aria-hidden className="net-sheen pointer-events-none absolute inset-0" />}
                    <span className="relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element -- small static mark */}
                      <img src={n.logo} alt="" width={36} height={36} className={cx("h-9 w-9 rounded-full", !n.live && "opacity-70 grayscale-[35%]")} />
                      <span aria-hidden className={cx("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0e0e0e]", n.live ? "net-dot bg-leaf" : "bg-[#424242]")} />
                    </span>
                    <span className="relative min-w-0 flex-1">
                      <span className={cx("flex items-center gap-2 text-[14.5px] font-medium", n.live ? "text-text" : "text-muted")}>
                        {n.name}
                        {n.live ? <span className="font-mono text-[12px] text-leaf">✓</span> : <span className="rounded-full border border-line px-2 py-px text-[12px] font-normal text-muted">soon</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {n.facts.map((f) => (
                          <span key={f} className="rounded-md bg-[#181818] px-1.5 py-px font-mono text-[12px] text-muted">
                            {f}
                          </span>
                        ))}
                      </span>
                      <span className="mt-1 block text-[12px] text-muted">{n.tools}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <a href="/roadmap" className="net-row block border-t border-line px-4 py-2.5 text-[12px] text-muted transition-colors hover:text-text" style={{ animationDelay: "0.22s" }}>
              More networks in the roadmap →
            </a>
          </div>,
          document.body,
        )}
    </div>
  );
}
