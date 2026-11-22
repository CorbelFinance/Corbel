"use client";

/**
 * What a share link shows: the holdings and their values, read at the latest block, with the address left out
 * by the server. A countdown to the expiry; after it the link answers that it has expired.
 */
import { useEffect, useState } from "react";
import { Bay, CountUp } from "./Bay";
import { TokenAvatar } from "./TokenAvatar";
import { linesOf, usd, usePortfolio } from "./walletData";

const COL = ["#93a6ff", "#6fe7a8", "#9b86e4", "#6cc0d0", "#f2c46d", "#ff9a5c"];

export function SharedView({ t }: { t: string }) {
  const { p, err, busy } = usePortfolio(`/api/share?t=${encodeURIComponent(t)}`);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    const i = setInterval(tick, 1000);
    void Promise.resolve().then(tick);
    return () => clearInterval(i);
  }, []);
  const v = p ? linesOf(p) : null;
  const left = p?.exp && now ? Math.max(0, p.exp - now) : null;
  const fmtLeft = (s: number) => (s >= 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`);
  return (
    <Bay tone="ink" kicker="Shared wallet" title="Holdings" busy={busy} right={left !== null ? <span className="font-mono text-[12px] text-muted">{`expires in ${fmtLeft(left)}`}</span> : undefined} foot={<span>Read from Robinhood Chain at the latest block. The address is not part of this page.</span>}>
      {err && <p className="mx-5 mb-5 rounded-xl border border-flesh/40 bg-flesh/10 px-4 py-3 text-[13px] text-text">{err}</p>}
      {!v && !err && <p className="caret px-5 py-14 text-center font-mono text-[13px] text-muted">Reading the wallet</p>}
      {v && (
        <div className="px-5 pb-5">
          <p className="font-mono text-[34px] text-text">
            <CountUp value={v.total} fmt={usd} />
          </p>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-(--bay-edge)">
            {v.lines.slice(0, 6).map((l, i) => (
              <span key={l.token} className="bar-grow h-full" style={{ width: `${v.total ? (l.usd / v.total) * 100 : 0}%`, background: COL[i], animationDelay: `${i * 0.06}s` }} />
            ))}
          </div>
          <ul className="mt-4 space-y-1">
            {v.lines.map((l, i) => (
              <li key={l.token} className="tile-in grid grid-cols-[auto_1fr_8rem_6rem] items-center gap-3 rounded-xl px-2 py-2 text-[13px] hover:bg-(--bay-bg2)" style={{ animationDelay: `${i * 0.03}s` }}>
                <TokenAvatar address={l.token} symbol={l.symbol} size={26} stock={l.kind === "stock"} />
                <span className="min-w-0">
                  <span className="block text-text">{l.symbol}</span>
                  <span className="block truncate text-[12px] text-muted">{l.name}</span>
                </span>
                <span className="text-right tabular-nums text-muted">{l.amount.toLocaleString("en", { maximumFractionDigits: 4 })}</span>
                <span className="text-right tabular-nums text-text">{usd(l.usd)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Bay>
  );
}
