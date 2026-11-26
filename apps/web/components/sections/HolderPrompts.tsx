"use client";

/**
 * Token · AI for holders. The tiers from @corbel/config (AI_ACCESS): a ladder of thresholds you can pick from, the
 * full table with the picked tier lit and a bar under every number (its share of the top tier), and the rules that
 * keep one person from farming many wallets. Motion: the steps grow, the bars fill, rows arrive as the block scrolls
 * in; all of it off under prefers-reduced-motion.
 */
import { useState } from "react";
import { AI_ACCESS, FULL_MODELS, hasFull, type AiTier } from "@corbel/config";

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("en", { maximumFractionDigits: 1 })}M` : n >= 1_000 ? `${(n / 1_000).toLocaleString("en", { maximumFractionDigits: 1 })}K` : String(n));
const cell = (n: number, unit = "") => (n ? `${n}${unit}` : "—");
const pct = (v: number) => `${+(v * 100).toFixed(1)}%`;
const T = AI_ACCESS.tiers;
/** label, text, and the number a bar is drawn from (higher is better; null = no bar) */
const ROWS: [string, (t: AiTier) => string, ((t: AiTier) => number) | null][] = [
  ["Models", (t) => (hasFull(t) ? `All ${FULL_MODELS}` : "More models"), null],
  ["Quality", (t) => (hasFull(t) ? "Highest" : "Standard"), null],
  ["Text messages", (t) => `${t.text} a day`, (t) => t.text],
  ["Per message", (t) => `${t.chars.toLocaleString("en")} characters`, (t) => t.chars],
  ["Pictures", (t) => cell(t.image, " a day"), (t) => t.image],
  ["Video", (t) => cell(t.video, " a day"), (t) => t.video],
  ["Voice", (t) => cell(t.voice, " a day"), (t) => t.voice],
  ["Music, upscale", (t) => (t.music ? `${t.music} + ${t.upscale} a day` : "—"), (t) => t.music + t.upscale],
  ["Credit cap", (t) => (t.cap ? `${t.cap} a day` : "—"), (t) => t.cap],
  ["Markup on Credits", (t) => (t.markup ? pct(t.markup) : "None"), (t) => 0.1 - t.markup],
  ["Top-up bonus", (t) => `+${pct(t.topUpBonus)}`, (t) => t.topUpBonus],
  ["Free GPU time", (t) => (t.gpuMinutes ? `${t.gpuMinutes} min a day` : "—"), (t) => t.gpuMinutes],
  ["API limits", (t) => `${t.apiBoost}×`, (t) => t.apiBoost],
  ["Telegram alerts", (t) => (t.alerts === null ? "Any number of tokens" : `${t.alerts} tokens`), (t) => (t.alerts === null ? 1e9 : t.alerts)],
  ["Drain alarm", (t) => (t.drain === null ? "Any number of wallets" : `${t.drain} wallets`), (t) => (t.drain === null ? 1e9 : t.drain)],
  ["Also", (t) => t.extra, null],
];
const RULES = [
  ["7d", "The lowest balance counts", `Your tier is set by the lowest balance of the last ${AI_ACCESS.holdDays} days, so coins passed between wallets or borrowed for a minute do not count.`],
  ["1×", "One person, one limit", "Wallets that clearly belong to one person share one tier's limits; every group is reviewed by a person."],
  ["00", "A fresh day at 00:00 UTC", "Counts reset daily and do not roll over; each wallet also has a cap in credits, whatever the counts allow."],
] as const;
// step heights on a log scale of the threshold, so 100K and 10M both read
const lo = Math.log10(T[0]!.minCoins), hi = Math.log10(T.at(-1)!.minCoins);
const stepH = (t: AiTier) => 48 + ((Math.log10(t.minCoins) - lo) / Math.max(1e-9, hi - lo)) * 52;

const CSS = `
.hp-step{transform-origin:bottom}
.hp-bar>i{transform-origin:left;transition:transform .7s cubic-bezier(.2,.8,.2,1)}
@media (prefers-reduced-motion:no-preference){
  .hp-step{animation:hp-grow .9s cubic-bezier(.2,.8,.2,1) both}
  .hp-bar>i{animation:hp-fill .9s cubic-bezier(.2,.8,.2,1) both}
  .hp-row{animation:hp-in .5s cubic-bezier(.2,.8,.2,1) both}
  .hp-rule{animation:hp-in .6s cubic-bezier(.2,.8,.2,1) both}
  .hp-col{transition:background-color .35s ease,color .35s ease}
  @supports (animation-timeline:view()){
    .hp-step,.hp-bar>i,.hp-row,.hp-rule{animation-timeline:view();animation-range:entry 5% cover 35%;animation-delay:0s!important}
  }
}
@keyframes hp-grow{from{transform:scaleY(.08);opacity:.2}}
@keyframes hp-fill{from{transform:scaleX(0)}}
@keyframes hp-in{from{opacity:0;transform:translateY(10px)}}
`;

export function HolderPrompts() {
  const [pick, setPick] = useState<string>(T.find(hasFull)?.id ?? T[0]!.id);
  const at = T.find((t) => t.id === pick) ?? T[0]!;
  return (
    <div className="mt-16 overflow-hidden rounded-2xl border border-line bg-[#0f0f0f]">
      <style>{CSS}</style>
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-end">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--ai)]">AI for holders · live</p>
          <h3 className="mt-3 font-display text-[clamp(1.6rem,1rem+1.5vw,2.5rem)] leading-[1.08] tracking-tight text-text">
            Hold Corbel. {`Top holders use all ${FULL_MODELS} models.`}
          </h3>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">Text, pictures, video, voice and music in one chat. What a wallet opens depends on the coins it holds, read from the chain. Pick a tier to see it in the table.</p>
          <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
            {([
              ["Text a day", `${at.text}`],
              ["Pictures a day", `${at.image}`],
              ["Top-up bonus", `+${pct(at.topUpBonus)}`],
            ] as const).map(([k, v]) => (
              <div key={k} className="bg-[#0f0f0f] px-4 py-3">
                <dt className="text-[12.5px] text-muted">{k}</dt>
                <dd key={`${at.id}-${k}`} className="hp-row mt-1 font-display text-2xl tabular-nums text-text">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* the ladder: one step per tier, height by the threshold on a log scale */}
        <div role="radiogroup" aria-label="Tier" className="relative grid h-56 grid-cols-4 items-end gap-2 sm:gap-3">
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-line" />
          {T.map((t, i) => {
            const on = t.id === pick;
            const full = hasFull(t);
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPick(t.id)}
                className="group relative flex h-full flex-col justify-end text-left outline-none"
              >
                <span
                  className={`hp-step relative flex flex-col justify-between overflow-hidden rounded-t-xl border border-b-0 p-3 transition-colors duration-300 ${on ? "border-[var(--ai)]/60 bg-[var(--ai)]/[0.12]" : "border-line bg-[#141414] group-hover:border-[#3a3a3a] group-focus-visible:border-[var(--ai)]/60"}`}
                  style={{ height: `${stepH(t)}%`, animationDelay: `${i * 90}ms` }}
                >
                  <span aria-hidden className={`absolute inset-x-0 top-0 h-[2px] transition-opacity duration-300 ${on ? "opacity-100" : "opacity-0"}`} style={{ background: "var(--ai)" }} />
                  <span>
                    <span className={`block text-[15px] font-medium ${full ? "text-[var(--ai)]" : "text-text"}`}>{t.name}</span>
                    <span className="block font-mono text-[12px] text-muted">{`${fmt(t.minCoins)}+`}</span>
                  </span>
                  <span className="mt-2 hidden font-mono text-[11.5px] leading-snug text-muted sm:block">
                    {t.markup ? `${pct(t.markup)} markup` : "No markup"}
                    <br />
                    {t.gpuMinutes ? `${t.gpuMinutes} min GPU` : "—"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto border-y border-line">
        <table className="w-full min-w-[44rem] text-[13.5px]">
          <thead>
            <tr className="border-b border-line bg-[#0c0c0c] text-left">
              <th className="px-4 py-3 font-normal text-muted sm:px-6" />
              {T.map((x) => (
                <th key={x.id} className={`hp-col px-4 py-3 font-medium ${x.id === pick ? "bg-[var(--ai)]/[0.08] text-[var(--ai)]" : hasFull(x) ? "text-text" : "text-text"}`}>
                  <button type="button" onClick={() => setPick(x.id)} className="text-left outline-none focus-visible:underline">
                    {x.name}
                    <span className="block font-mono text-[12px] font-normal text-muted">{`${fmt(x.minCoins)}+ coins`}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([k, f, v], r) => {
              const top = v ? Math.max(...T.map(v)) : 0;
              return (
                <tr key={k} className="hp-row border-b border-line/60 last:border-0" style={{ animationDelay: `${r * 35}ms` }}>
                  <td className="px-4 py-2.5 text-muted sm:px-6">{k}</td>
                  {T.map((x) => {
                    const share = v && top > 0 ? Math.min(1, v(x) / top) : 0;
                    return (
                      <td key={x.id} className={`hp-col px-4 py-2.5 font-mono tabular-nums ${x.id === pick ? "bg-[var(--ai)]/[0.06] text-text" : "text-[#c9d3cc]"}`}>
                        {f(x)}
                        {v && (
                          <span aria-hidden className="hp-bar mt-1.5 block h-[3px] w-full max-w-[9rem] overflow-hidden rounded-full bg-[#1d1d1d]">
                            <i className="block h-full rounded-full" style={{ transform: `scaleX(${share})`, background: x.id === pick ? "var(--ai)" : "#4a4a4a" }} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ol className="grid gap-px bg-line md:grid-cols-3">
        {RULES.map(([sym, k, v], i) => (
          <li key={k} className="hp-rule grid grid-cols-[2.6rem_minmax(0,1fr)] items-start gap-3 bg-[#0f0f0f] p-5 sm:p-6" style={{ animationDelay: `${i * 90}ms` }}>
            <span className="grid h-9 w-10 place-items-center rounded-lg border border-line font-mono text-[12.5px] text-[var(--ai)]">{sym}</span>
            <span>
              <span className="block text-[15px] text-text">{k}</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-muted">{v}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="border-t border-line px-6 py-3 text-[12.5px] text-muted sm:px-8">Limits may change with demand; this table always shows the current ones.</p>
    </div>
  );
}
