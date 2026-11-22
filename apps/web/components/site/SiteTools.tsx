"use client";

/**
 * Site tools: one button in the header that opens a panel of things a visitor sets once and keeps: text size, table density, motion, plus
 * quick actions (copy this page's link, jump to the check, the keyboard keys). Kept in this browser only.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cx } from "@corbel/ui";

type Prefs = { text: "normal" | "large"; density: "normal" | "compact"; motion: "on" | "off" };
const DEF: Prefs = { text: "normal", density: "normal", motion: "on" };
import { PREFS_KEY as KEY } from "@/lib/prefsScript";


function apply(p: Prefs) {
  const d = document.documentElement;
  const set = (k: string, on: boolean, v: string) => (on ? (d.dataset[k] = v) : delete d.dataset[k]);
  delete d.dataset.theme;
  set("text", p.text === "large", "large");
  set("density", p.density === "compact", "compact");
  set("motion", p.motion === "off", "off");
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="mt-1.5 grid grid-flow-col gap-1 rounded-xl border border-line p-1">
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cx("rounded-lg px-2.5 py-1.5 text-[13px] transition-colors", value === v ? "bg-leaf/15 text-leaf" : "text-muted hover:text-text")}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SiteTools() {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<Prefs>(DEF);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Prefs>;
      void Promise.resolve().then(() => setP({ ...DEF, ...saved }));
    } catch {}
  }, []);
  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) void Promise.resolve().then(() => setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) }));
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener("mousedown", close);
    addEventListener("keydown", close);
    return () => (removeEventListener("mousedown", close), removeEventListener("keydown", close));
  }, [open]);

  const edit = (x: Partial<Prefs>) => {
    const n = { ...p, ...x };
    setP(n);
    apply(n);
  };

  return (
    <>
      <button ref={btn} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label="Site tools" title="Site tools" onClick={() => setOpen((v) => !v)} className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition-colors", open ? "border-leaf/60 text-leaf" : "border-line text-muted hover:text-text")}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" strokeLinecap="round" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </svg>
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={panel} role="dialog" aria-label="Site tools" className="fixed z-[80] w-[19rem] rounded-2xl border border-line bg-surface p-4 shadow-[0_20px_60px_rgba(0,0,0,.6)]" style={{ top: pos.top, right: pos.right }}>
            <p className="text-[14px] font-medium text-text">Site tools</p>
            <p className="text-[12px] text-muted">Kept in this browser only.</p>
            <div className="mt-4 space-y-3">
              <Seg label="Text size" value={p.text} options={[["normal", "Normal"], ["large", "Larger"]]} onChange={(v) => edit({ text: v })} />
              <Seg label="Tables" value={p.density} options={[["normal", "Roomy"], ["compact", "Compact"]]} onChange={(v) => edit({ density: v })} />
              <Seg label="Motion" value={p.motion} options={[["on", "On"], ["off", "Still"]]} onChange={(v) => edit({ motion: v })} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
              <button type="button" onClick={() => void navigator.clipboard.writeText(location.href).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))} className="rounded-xl border border-line px-3 py-2 text-[13px] text-text hover:border-leaf/50">
                {copied ? "Copied" : "Copy page link"}
              </button>
              <button type="button" onClick={() => (setOpen(false), router.push("/app/trust/check"))} className="rounded-xl border border-line px-3 py-2 text-[13px] text-text hover:border-leaf/50">
                Check a token
              </button>
              <button type="button" onClick={() => (setOpen(false), router.push("/app/trade/terminal"))} className="rounded-xl border border-line px-3 py-2 text-[13px] text-text hover:border-leaf/50">
                Open terminal
              </button>
              <button type="button" onClick={() => edit(DEF)} className="rounded-xl border border-line px-3 py-2 text-[13px] text-muted hover:text-text">
                Reset
              </button>
            </div>
            <p className="mt-3 text-[12px] text-muted">
              Keys: <kbd className="rounded border border-line px-1 font-mono">/</kbd> ask Corbel on the home page, <kbd className="rounded border border-line px-1 font-mono">Esc</kbd> closes this panel.
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
