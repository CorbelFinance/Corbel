/**
 * Token check · launch-tax waivers. The wallets a creator exempted from the launch fee in the launch transaction,
 * and what they did with it: share of supply bought, how much in the first two seconds, what they hold today.
 * A fact next to the score, not part of it. It states what the chain shows and accuses nobody.
 */
import { cx } from "@corbel/ui";
import { short } from "./kit";

export type WaiversIn = { tx: string; block: string; wallets: number; bought: number; fast: number; buyers: number; eth: number; holdNow: number | null; top: { address: string; bought: number }[] };

const SCAN = "https://robinhoodchain.blockscout.com";
const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.01 ? 2 : 1)}%`;

export function LaunchWaivers({ w }: { w: WaiversIn }) {
  const heavy = w.bought >= 0.2;
  if (!w.wallets)
    return (
      <section aria-label="Launch-fee waivers" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#242424] bg-[#131313] px-4 py-3">
        <p className="text-[14px] text-text">
          <span className="text-leaf">✓</span> No wallet was exempted from the launch fee. Every early buyer paid the same fee.
        </p>
        <a href={`${SCAN}/tx/${w.tx}`} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-muted hover:text-text">
          launch tx · block {Number(w.block).toLocaleString("en-US")} ↗
        </a>
      </section>
    );
  return (
    <section aria-label="Launch-fee waivers" className={cx("overflow-hidden rounded-2xl border bg-[#131313]", heavy ? "border-flesh/50" : "border-[#242424]")}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#242424] px-4 py-3">
        <p className="text-[15px] font-semibold text-text">
          {`The creator exempted ${w.wallets} wallet${w.wallets === 1 ? "" : "s"} from the launch fee`}
        </p>
        <a href={`${SCAN}/tx/${w.tx}`} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-muted hover:text-text">
          launch tx · block {Number(w.block).toLocaleString("en-US")} ↗
        </a>
      </header>
      <div className="grid grid-cols-2 divide-[#242424] border-b border-[#242424] sm:grid-cols-4 sm:divide-x">
        {[
          ["Bought of supply", pct(w.bought), heavy],
          ["In the first 2 s", pct(w.fast), w.fast >= 0.2],
          ["Hold today", w.holdNow === null ? "—" : pct(w.holdNow), false],
          ["Paid in", `${w.eth.toFixed(w.eth < 1 ? 3 : 2)} ETH`, false],
        ].map(([k, v, bad]) => (
          <div key={k as string} className="px-4 py-3">
            <p className="text-[12px] text-muted">{k}</p>
            <p className={cx("mt-0.5 font-mono text-[20px] tabular-nums", bad ? "text-flesh" : "text-text")}>{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 px-4 py-3 md:grid-cols-[1fr_minmax(0,18rem)]">
        <p className="text-[13.5px] text-muted">
          {`Listed in the launch transaction, these wallets paid the 1% base fee while other buyers in the first seconds paid about 7%. ${w.buyers} of them bought in the first six minutes.`}
          {w.holdNow !== null && w.bought > 0 && w.holdNow < w.bought / 4 ? " Most of what they bought has left those wallets: sold or moved." : ""}
          {" A waiver is the creator's choice and can be honest (team, friends); a large share bought this way is supply the market did not get at the same price."}
        </p>
        {w.top.length > 0 && (
          <ol className="space-y-1.5">
            {w.top.map((t) => (
              <li key={t.address} className="flex items-center justify-between gap-3 text-[13px]">
                <a href={`${SCAN}/address/${t.address}`} target="_blank" rel="noreferrer" className="font-mono text-text hover:underline">{short(t.address)} ↗</a>
                <span className="font-mono tabular-nums text-muted">{pct(t.bought)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
