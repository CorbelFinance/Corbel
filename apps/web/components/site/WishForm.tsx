"use client";

/**
 * The roadmap's wish box: pick the block it is for, then write to us by email (the subject names the block) or in
 * Telegram. Nothing is sent through this site and nothing is stored here.
 */
import { useEffect, useState } from "react";
import { BRAND, ROAD_BLOCKS } from "@corbel/config";
import { cx } from "@corbel/ui";

const OPTS = [...ROAD_BLOCKS.map((b) => ({ id: b.id as string, label: b.label, tone: b.tone })), { id: "other", label: "Something new", tone: "#e6ece9" }];
export const TELEGRAM = "https://t.me/corbelfinance";
const TG_DIRECT = `${TELEGRAM}?direct`;

export function WishForm() {
  const [block, setBlock] = useState("trade");
  useEffect(() => {
    const read = () => {
      const b = new URLSearchParams(window.location.search).get("b");
      if (b && OPTS.some((o) => o.id === b)) setBlock(b);
    };
    void Promise.resolve().then(read);
  }, []);
  const opt = OPTS.find((o) => o.id === block)!;
  const subject = `Roadmap wish · ${opt.label}`;
  const body = `Block: ${opt.label}\n\nWhat it should do:\n\n`;
  const mail = `mailto:${BRAND.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-[#2a2a2a] bg-[#0f0f0f] p-5 sm:p-8">
      <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl transition-colors duration-500" style={{ background: opt.tone }} />
      <fieldset className="relative">
        <legend className="text-[13px] text-muted">Which block is it for</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {OPTS.map((o) => (
            <button key={o.id} type="button" aria-pressed={block === o.id} onClick={() => setBlock(o.id)} className={cx("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors", block === o.id ? "text-[#07080b]" : "border-[#2a2a2a] text-text hover:border-[#424242]")} style={block === o.id ? { background: o.tone, borderColor: o.tone } : undefined}>
              <i className="h-2 w-2 rounded-full" style={{ background: block === o.id ? "#07080b" : o.tone }} />
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="relative mt-7 grid gap-3 sm:grid-cols-2">
        <a href={mail} className="group flex items-center gap-4 rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a] p-4 transition-colors hover:border-(--t)" style={{ ["--t" as string]: opt.tone }}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `${opt.tone}1f`, color: opt.tone }}>
            <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-text">Write an email</span>
            <span className="block truncate font-mono text-[12px] text-muted">{BRAND.email}</span>
            <span className="block truncate text-[12px] text-muted">{`Subject: ${subject}`}</span>
          </span>
          <span className="ml-auto text-muted transition-transform group-hover:translate-x-0.5">→</span>
        </a>
        <a href={TG_DIRECT} target="_blank" rel="noreferrer" className="group flex items-center gap-4 rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a] p-4 transition-colors hover:border-[#5fb8f0]">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#5fb8f0]/15 text-[#5fb8f0]">
            <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 4 3 11l6 2 2 6 3-4 5 4 2-15ZM9 13l9-6" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-text">Message us in Telegram</span>
            <span className="block truncate font-mono text-[12px] text-muted">t.me/corbelfinance</span>
            <span className="block truncate text-[12px] text-muted">{`Start with “${opt.label}”`}</span>
          </span>
          <span className="ml-auto text-muted transition-transform group-hover:translate-x-0.5">↗</span>
        </a>
      </div>
      <p className="relative mt-5 text-[12px] text-muted">A person on the team reads every message. Our only Telegram is t.me/corbelfinance; anyone else claiming to be us is not.</p>
    </div>
  );
}
