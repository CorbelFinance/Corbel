/**
 * Agents · Limits: the first mandate on mainnet, as it stands. Its limits and the two trades that tested them, each
 * with the transaction on the explorer: one inside the cap went through, one over the cap was refused and the bond
 * paid the owner. Figures are the ones the mandate was created with; the links are the proof.
 */
import { MANDATES } from "../../lib/predict";

const TX = "https://robinhoodchain.blockscout.com/tx/";
const ADDR = "https://robinhoodchain.blockscout.com/address/";
const CAP = 0.2, BOND = 1, SLASH = 0.1;

export function LiveMandate() {
  const steps = [
    { at: "bond", k: "Agent posts its bond", v: `${BOND} USDG`, tx: null as string | null, tone: "text-text" },
    { at: "0.1", k: "Trade of 0.1 USDG, inside the cap", v: "traded", tx: MANDATES.honest, tone: "text-leaf" },
    { at: "0.3", k: "Trade of 0.3 USDG, over the cap", v: "refused", tx: MANDATES.stopped, tone: "text-flesh" },
    { at: "slash", k: `Bond cut by ${SLASH * 100}%, paid to the owner`, v: `${BOND * (1 - SLASH)} USDG left`, tx: MANDATES.stopped, tone: "text-flesh" },
  ];
  return (
    <section className="rounded-2xl border border-line px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] text-text">The first mandate on mainnet (retired)</p>
        <a href={`${ADDR}${MANDATES.mandate}`} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-leaf underline underline-offset-2">
          {`${MANDATES.mandate.slice(0, 6)}…${MANDATES.mandate.slice(-4)} ↗`}
        </a>
      </div>
      {/* the cap as a ruler: where each trade landed against it */}
      <div className="relative mt-6 h-10">
        <span className="absolute inset-x-0 top-4 h-1.5 rounded-full bg-[#1f1f1f]" />
        <span className="absolute left-0 top-4 h-1.5 rounded-full bg-leaf/50" style={{ width: `${(CAP / 0.4) * 100}%` }} />
        <span className="absolute top-1 h-7 w-px bg-text" style={{ left: `${(CAP / 0.4) * 100}%` }} />
        <span className="absolute -top-4 -translate-x-1/2 font-mono text-[12px] text-text" style={{ left: `${(CAP / 0.4) * 100}%` }}>{`cap ${CAP}`}</span>
        <i className="absolute top-[13px] h-3 w-3 -translate-x-1/2 rounded-full bg-leaf" style={{ left: `${(0.1 / 0.4) * 100}%` }} />
        <i className="absolute top-[13px] h-3 w-3 -translate-x-1/2 rounded-full bg-flesh" style={{ left: `${(0.3 / 0.4) * 100}%` }} />
        <span className="absolute top-7 -translate-x-1/2 font-mono text-[12px] text-leaf" style={{ left: `${(0.1 / 0.4) * 100}%` }}>0.1</span>
        <span className="absolute top-7 -translate-x-1/2 font-mono text-[12px] text-flesh" style={{ left: `${(0.3 / 0.4) * 100}%` }}>0.3</span>
      </div>
      <ol className="mt-5 border-t border-line">
        {steps.map((s) => (
          <li key={s.at} className="grid grid-cols-[minmax(0,1fr)_auto_4.5rem] items-baseline gap-3 border-b border-line/60 py-2.5 text-[13px] last:border-0">
            <span className="text-text">{s.k}</span>
            <span className={`font-mono text-[12px] ${s.tone}`}>{s.v}</span>
            {s.tx ? (
              <a href={`${TX}${s.tx}`} target="_blank" rel="noreferrer" className="text-right tabular-nums text-[12px] text-muted underline underline-offset-2">
                tx ↗
              </a>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-muted">USDG per trade. The cap and the slash are checked by the contract, not by Corbel. This mandate is retired: every asset unlisted, the owner&apos;s funds withdrawn. The live one is in the registry under Strategies.</p>
    </section>
  );
}
