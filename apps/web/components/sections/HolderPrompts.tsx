/**
 * Token · AI for holders. The tiers from @corbel/config (AI_ACCESS) as one table, and the rules that keep one person
 * from farming many wallets. Every holder gets the text models; the light tier gets selected fast models in standard
 * quality; top holders get all 185 models at full quality. Live since the token launch.
 */
import { AI_ACCESS, FULL_MODELS, type AiTier } from "@corbel/config";

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("en", { maximumFractionDigits: 1 })}M` : n >= 1_000 ? `${(n / 1_000).toLocaleString("en", { maximumFractionDigits: 1 })}K` : String(n));
const cell = (n: number, unit = "") => (n ? `${n}${unit}` : "—");
const SHOWN = AI_ACCESS.tiers;
const ROWS: [string, (t: AiTier) => string][] = [
  ["Models", (t) => (t.id === "full" ? `All ${FULL_MODELS}` : "Selected fast models")],
  ["Quality", (t) => (t.id === "full" ? "Highest: sharpest pictures, full-HD video" : "Standard: lighter pictures and video")],
  ["Text messages", (t) => `${t.text} a day`],
  ["Per message", (t) => `${t.chars.toLocaleString("en")} characters`],
  ["Pictures", (t) => cell(t.image, " a day")],
  ["Video", (t) => cell(t.video, " a day")],
  ["Voice", (t) => cell(t.voice, " a day")],
  ["Music, upscale", (t) => (t.music ? `${t.music} + ${t.upscale} a day` : "—")],
  ["Credit cap", (t) => (t.cap ? `${t.cap} a day` : "—")],
];
const RULES = [
  ["7d", "The lowest balance counts", `your tier is set by the lowest balance of the last ${AI_ACCESS.holdDays} days, so coins passed between wallets or borrowed for a minute do not count`],
  ["1×", "One person, one limit", "wallets that clearly belong to one person share one tier's limits; every group is reviewed by a person"],
  ["00", "A fresh day at 00:00 UTC", "counts reset daily and do not roll over; each wallet also has a cap in credits, whatever the counts allow"],
] as const;

export function HolderPrompts() {
  return (
    <div className="mt-16 overflow-hidden rounded-2xl border border-line bg-[#0f0f0f] p-6 sm:p-8">
      <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--ai)]">AI for holders · live</p>
      <h3 className="mt-3 font-display text-[clamp(1.5rem,1rem+1.2vw,2.2rem)] leading-tight text-text">Hold Corbel. {`Top holders use all ${FULL_MODELS} models.`}</h3>
      <p className="mt-2 max-w-2xl text-[14px] text-muted">Text, pictures, video, voice and music in one chat. What a wallet opens depends on the coins it holds, read from the chain.</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[30rem] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-[#0c0c0c] text-left">
                  <th className="px-3 py-2.5 font-normal text-muted" />
                  {SHOWN.map((x) => (
                    <th key={x.id} className={x.id === "full" ? "px-3 py-2.5 font-medium text-[var(--ai)]" : "px-3 py-2.5 font-medium text-text"}>
                      {x.id === "full" ? "Top holders" : x.name}
                      <span className="block font-mono text-[12px] font-normal text-muted">{`${fmt(x.minCoins)}+ coins`}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([k, f]) => (
                  <tr key={k} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2 text-muted">{k}</td>
                    {SHOWN.map((x) => (
                      <td key={x.id} className={x.id === "full" ? "bg-[var(--ai)]/[0.05] px-3 py-2 font-mono tabular-nums text-text" : "px-3 py-2 font-mono tabular-nums text-[#c9d3cc]"}>
                        {f(x)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <ol className="space-y-3">
          {RULES.map(([sym, k, v]) => (
            <li key={k} className="grid grid-cols-[2.4rem_minmax(0,1fr)] items-start gap-3">
              <span className="grid h-8 w-9 place-items-center rounded-lg border border-line font-mono text-[12px] text-[var(--ai)]">{sym}</span>
              <span>
                <span className="block text-[14px] text-text">{k}</span>
                <span className="block text-[12.5px] text-muted">{v}</span>
              </span>
            </li>
          ))}
          <li className="pt-1 text-[12px] text-muted">Limits are set at launch and may change with demand; this table always shows the current ones.</li>
        </ol>
      </div>
    </div>
  );
}
