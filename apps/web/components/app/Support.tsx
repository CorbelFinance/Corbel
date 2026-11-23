"use client";

/**
 * Support in the terminal: a button in the corner opens a small panel. "Answers" has the questions people ask most,
 * each with the real figure or link; "Write to us" sends a message the team reads in its panel. Nothing about the
 * visitor is sent with it except what they type and the page they are on.
 */
import { useState } from "react";
import Link from "next/link";
import { AI_ACCESS, BRAND, TOKEN, FULL_TIER } from "@corbel/config";
import { cx } from "@corbel/ui";

const light = AI_ACCESS.tiers[0]!, full = FULL_TIER;
const coins = (n: number) => n.toLocaleString("en-US");

const ANSWERS: { q: string; a: string; href?: string; link?: string }[] = [
  { q: "Which $CORBEL address is real?", a: `Only this one: ${TOKEN.contract}. It is also on the home page. Any other address is not ours.`, href: TOKEN.explorer, link: "Open on the explorer" },
  { q: "Do you ever ask for my keys?", a: "No. Corbel never asks for a private key or a seed phrase, and signing in is a message, never a transaction. Anyone who asks is not us." },
  { q: "What does holding $CORBEL give me?", a: `The AI chat opens for your wallet: ${light.name} from ${coins(light.minCoins)} coins, ${full.name} from ${coins(full.minCoins)}. It counts the lowest balance of the last ${AI_ACCESS.holdDays} days.`, href: "/app/ai/chat", link: "Open the chat" },
  { q: "How is the Corbel Score counted?", a: "From what was measured: a simulated buy and sell, owner powers, liquidity, holders and the creator's record. The method and the weights are public.", href: "/docs", link: "Read the docs" },
  { q: "A swap says no route fills it", a: "The pool may be thin, or its hook refuses the trade. The quote shows each route and why it failed. Try a smaller amount or another pair.", href: "/app/trade/quote", link: "Open Swap quote" },
  { q: "Where is the code?", a: "It is public on GitHub.", href: BRAND.social.github ?? undefined, link: "Open GitHub" },
];

export function Support() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"answers" | "write">("answers");
  const [pick, setPick] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setErr(null);
    setState("busy");
    try {
      const r = await fetch("/api/support", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, contact, page: location.pathname + location.search }) });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(j.error ?? "It did not go through.");
        setState("idle");
        return;
      }
      setState("sent");
      setText("");
    } catch {
      setErr("No answer. Try again, or write to us in Telegram.");
      setState("idle");
    }
  }

  const tg = BRAND.social.telegram ? `${BRAND.social.telegram}?direct` : null;
  return (
    <div className="fixed bottom-20 right-4 z-40 xl:bottom-12 flex flex-col items-end gap-2">
      {open && (
        <section role="dialog" aria-label="Support" className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-[#0e0e0e] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)]">
          <header className="flex items-center gap-2 border-b border-line px-4 py-3">
            <span aria-hidden className="led" data-tone="on" />
            <p className="text-[14px] font-semibold text-text">Support</p>
            <p className="text-[12px] text-muted">answers in a minute, or write to us</p>
            <button type="button" aria-label="Close support" onClick={() => setOpen(false)} className="ml-auto text-muted hover:text-text">
              ×
            </button>
          </header>
          <div role="tablist" aria-label="Support" className="flex gap-1 border-b border-line p-2">
            {(
              [
                ["answers", "Answers"],
                ["write", "Write to us"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("rounded-lg px-3 py-1 text-[13px]", tab === id ? "bg-[#202020] font-semibold text-text" : "text-muted hover:text-text")}>
                {label}
              </button>
            ))}
          </div>
          {tab === "answers" ? (
            <ul className="max-h-[22rem] divide-y divide-line overflow-auto">
              {ANSWERS.map((x, i) => (
                <li key={x.q}>
                  <button type="button" aria-expanded={pick === i} onClick={() => setPick(pick === i ? null : i)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13.5px] text-text hover:bg-[#131313]">
                    <span className="flex-1">{x.q}</span>
                    <span aria-hidden className="text-muted">{pick === i ? "−" : "+"}</span>
                  </button>
                  {pick === i && (
                    <div className="px-4 pb-3 text-[13px] leading-relaxed text-muted">
                      <p className="break-words">{x.a}</p>
                      {x.href && (x.href.startsWith("/") ? (
                        <Link href={x.href} className="mt-2 inline-block text-leaf underline underline-offset-4">{x.link} →</Link>
                      ) : (
                        <a href={x.href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-leaf underline underline-offset-4">{x.link} ↗</a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
              <li className="px-4 py-3 text-[13px] text-muted">
                Not here?{" "}
                <button type="button" onClick={() => setTab("write")} className="text-leaf underline underline-offset-4">
                  Write to us
                </button>
                .
              </li>
            </ul>
          ) : state === "sent" ? (
            <div className="p-5 text-[13.5px]">
              <p className="font-semibold text-text">Got it. We read every message.</p>
              <p className="mt-2 text-muted">If you left a contact, we answer there. For something urgent, Telegram is faster.</p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setState("idle")} className="ibtn-ghost h-9 px-4">Write another</button>
                {tg && <a href={tg} target="_blank" rel="noreferrer" className="ibtn-ghost grid h-9 place-items-center px-4">Telegram ↗</a>}
              </div>
            </div>
          ) : (
            <form
              className="space-y-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label htmlFor="sp-text" className="sr-only">Your message</label>
              <textarea id="sp-text" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={1200} placeholder="What went wrong, or what do you need? The page you are on is sent with it." className="w-full resize-none rounded-lg border border-line bg-[#090909] p-3 text-[13.5px] text-text placeholder:text-muted focus:border-ui/60 focus:outline-none" />
              <label htmlFor="sp-contact" className="sr-only">How to reach you (optional)</label>
              <input id="sp-contact" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={80} placeholder="Telegram @handle or e-mail (optional)" autoComplete="off" spellCheck={false} className="h-10 w-full rounded-lg border border-line bg-[#090909] px-3 text-[13.5px] text-text placeholder:text-muted focus:border-ui/60 focus:outline-none" />
              {err && <p className="text-[13px] text-flesh">{err}</p>}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={state === "busy" || text.trim().length < 5} className="ibtn h-10 px-5 disabled:opacity-50">
                  {state === "busy" ? "Sending…" : "Send"}
                </button>
                {tg && <a href={tg} target="_blank" rel="noreferrer" className="text-[13px] text-muted underline underline-offset-4 hover:text-text">or Telegram ↗</a>}
              </div>
              <p className="text-[12px] text-muted">We keep only what you type and the page. Never paste a key or a seed phrase.</p>
            </form>
          )}
        </section>
      )}
      {/* phones: an icon only, so the pill does not sit over the ticket's buttons */}
      <button type="button" aria-expanded={open} aria-label="Support" onClick={() => setOpen(!open)} className="flex h-11 w-11 items-center justify-center gap-2 rounded-full border border-line bg-[#101010] text-[13.5px] sm:w-auto sm:px-4 font-semibold text-text shadow-[0_10px_30px_-8px_rgba(0,0,0,0.9)] hover:border-ui/60">
        <svg viewBox="0 0 24 24" aria-hidden className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16v11H9l-5 4V5Z" />
        </svg>
        <span className="hidden sm:inline">Support</span>
      </button>
    </div>
  );
}
