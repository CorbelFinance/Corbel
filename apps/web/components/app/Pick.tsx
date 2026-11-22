"use client";

/**
 * A dropdown in the house style, in place of the browser's native select: a button with the current choice and a
 * chevron, a dark list that drops in under it with the choice ticked, keyboard as a listbox (arrows, Home/End,
 * Enter, Escape, type to jump). Colours follow the surrounding bay through --bay-* variables.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "@corbel/ui";

export type PickOption<T extends string> = { value: T; label: string; hint?: string; icon?: ReactNode };

export function Pick<T extends string>({ value, onChange, options, label, placeholder = "Choose", className, id, wide }: { value: T; onChange: (v: T) => void; options: readonly PickOption<T>[]; label: string; placeholder?: string; className?: string; id?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const auto = useId();
  const lid = `${id ?? auto}-list`;
  const cur = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.children[hi]?.scrollIntoView({ block: "nearest" });
  }, [open, hi]);

  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
  };
  const openAt = () => {
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const key = (e: React.KeyboardEvent) => {
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      return openAt();
    }
    if (!open) return;
    if (e.key === "Escape") return (e.preventDefault(), setOpen(false));
    if (e.key === "ArrowDown") return (e.preventDefault(), setHi((h) => Math.min(options.length - 1, h + 1)));
    if (e.key === "ArrowUp") return (e.preventDefault(), setHi((h) => Math.max(0, h - 1)));
    if (e.key === "Home") return (e.preventDefault(), setHi(0));
    if (e.key === "End") return (e.preventDefault(), setHi(options.length - 1));
    if (e.key === "Enter" || e.key === " ") return (e.preventDefault(), choose(hi));
    if (e.key === "Tab") return setOpen(false);
    if (e.key.length === 1) {
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setHi(i);
    }
  };

  return (
    <div ref={box} className={cx("relative", className)}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={lid}
        onClick={() => (open ? setOpen(false) : openAt())}
        onKeyDown={key}
        className={cx("pick-btn flex h-10 w-full items-center gap-2 rounded-xl border px-3 text-left text-[13px] transition-colors", open && "is-open")}
      >
        {cur?.icon}
        <span className={cx("min-w-0 flex-1 truncate", cur ? "text-text" : "text-muted")}>{cur?.label ?? placeholder}</span>
        <svg aria-hidden viewBox="0 0 12 12" className={cx("h-3 w-3 shrink-0 text-muted transition-transform duration-200", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {open && (
        <ul ref={list} id={lid} role="listbox" aria-label={label} className={cx("pick-list absolute left-0 top-full z-[60] mt-1.5 max-h-72 overflow-auto rounded-xl border p-1", wide ? "min-w-[min(22rem,90vw)]" : "min-w-full")}>
          {options.map((o, i) => {
            const sel = o.value === value;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={sel}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                className={cx("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition-colors", i === hi ? "pick-hi text-text" : "text-[#c8d3cd]")}
              >
                {o.icon}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 font-mono text-[12px] text-muted">{o.hint}</span>}
                <svg aria-hidden viewBox="0 0 12 12" className={cx("h-3 w-3 shrink-0", sel ? "pick-tick" : "opacity-0")} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m2.5 6.2 2.3 2.3 4.7-5" />
                </svg>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
