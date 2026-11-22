"use client";

/**
 * Stocks · the weekend gap. Each issuer stock token's pool price on Robinhood Chain against the stock's
 * last close. When the stock market is shut the token still trades; this is how far it has drifted.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { fmtPx } from "./Candles";
import { TokenAvatar } from "./TokenAvatar";
import { Idle, Instrument, Led } from "./kit";

type Row = { token: string; symbol: string; name: string; chain: number; liquidity: number | null; pool?: "v2" | "v4"; base: string; close: number | null; closeAt: number | null; last: number | null; gap: number | null };
/** Below this a pool's price is a signal, not a size you can trade. */
const THIN = 1000;
/** A gap past this on a pool whose depth is not read is the pool being off, not the stock drifting. */
const WILD = 0.25;
/** The gap means something only where the pool can carry a trade. */
const real = (r: Row) => r.gap !== null && r.close !== null && (r.liquidity !== null ? r.liquidity >= THIN : Math.abs(r.gap) <= WILD);
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(v < 10 ? 2 : 0)}`);

/** US regular session in UTC (Mon–Fri, 14:30–21:00 in winter, 13:30–20:00 in summer). Holidays are not modelled. */
function session(d: Date) {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return "Weekend: the stock market is shut, tokens still trade";
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  const summer = d.getUTCMonth() > 2 && d.getUTCMonth() < 10;
  const open = summer ? 13 * 60 + 30 : 14 * 60 + 30;
  return m >= open && m < open + 390 ? "Market open" : "Market closed: tokens still trade";
}

export function WeekendGap() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [state, setState] = useState<"loading" | "warming" | "ok" | "error">("loading");
  const [src, setSrc] = useState("");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let off = false;
    let timer: ReturnType<typeof setTimeout>;
    void Promise.resolve().then(() => setNow(new Date()));
    const load = () =>
      fetch("/api/gap")
        .then(async (r) => ({ code: r.status, j: (await r.json()) as { rows?: Row[]; source?: string; error?: string } }))
        .then(({ code, j }) => {
          if (off) return;
          if (code === 202) return (setState("warming"), (timer = setTimeout(load, 15_000)));
          if (!j.rows) return setState("error");
          setRows(j.rows);
          setSrc(j.source ?? "");
          setState("ok");
        })
        .catch(() => !off && setState("error"));
    void load();
    return () => {
      off = true;
      clearTimeout(timer);
    };
  }, []);

  const deep = rows?.filter((r) => r.liquidity !== null && r.liquidity >= THIN && r.gap !== null) ?? [];
  const shown = rows?.filter(real) ?? [];
  const off = rows?.filter((r) => !real(r)) ?? [];
  const widest = [...deep].sort((a, b) => Math.abs(b.gap!) - Math.abs(a.gap!))[0];

  return (
    <Instrument
      code="K-05"
      title="Weekend gap"
      busy={state === "loading" || state === "warming"}
      status={<Led tone={state === "ok" ? "on" : state === "error" ? "bad" : "off"} live={state === "ok"} label={now ? session(now) : "…"} />}
      foot={
        <>
          <span>Chain = the pool&apos;s mid price from its reserves · Close = last regular session, {src || "public chart data"}</span>
          <span>Holidays not modelled</span>
        </>
      }
    >
      {state === "error" && <p className="bg-flesh-deep/50 px-4 py-3 text-sm text-text">The gap could not be read right now.</p>}
      {!rows && state !== "error" && <Idle className="min-h-48">{state === "warming" ? "Reading pool prices and last closes. The first read takes a minute." : "Reading…"}</Idle>}
      {rows && (
        <>
          {rows.every((r) => r.close === null) && (
            <p className="border-b border-line bg-flesh-deep/30 px-4 py-2.5 text-[13px] text-text">Last closes could not be read right now. Chain prices are live; the gap returns with the next read.</p>
          )}
          {widest && (
            <p className="border-b border-line px-4 py-3 text-[14px] text-text">
              Widest gap with real depth: <b className="font-mono font-medium">{widest.symbol}</b> trades{" "}
              <b className={cx("font-mono font-medium", widest.gap! >= 0 ? "text-leaf" : "text-flesh")}>
                {widest.gap! >= 0 ? "+" : ""}
                {(widest.gap! * 100).toFixed(2)}%
              </b>{" "}
              from its last close, in a pool of {usd(widest.liquidity ?? 0)}.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <caption className="sr-only">Issuer stock tokens: chain price against the last close</caption>
              <thead>
                <tr className="border-b border-line">
                  {["Token", "Last close", "On chain now", "Gap", "Pool", ""].map((h, i) => (
                    <th key={i} scope="col" className="px-4 py-3 font-medium text-[12px] font-normal uppercase tracking-[0.08em] text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const thin = r.liquidity !== null && r.liquidity < THIN;
                  return (
                    <tr key={r.token} className="irow border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-2.5 font-normal">
                        <span className="flex items-center gap-3">
                          <TokenAvatar address={r.token} symbol={r.symbol} stock size={30} />
                          <span>
                            <span className="font-mono text-leaf">{r.symbol}</span> <span className="text-muted">{r.name}</span>
                          </span>
                        </span>
                      </th>
                      <td className="px-4 py-2.5 font-mono text-xs text-text">
                        {r.close !== null ? `$${fmtPx(r.close)}` : "—"}
                        {r.closeAt && <span className="block text-[12px] text-muted">{new Date(r.closeAt * 1000).toUTCString().slice(0, 11)}</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-text">${fmtPx(r.chain)}</td>
                      <td className={cx("px-4 py-2.5 font-mono text-sm", r.gap === null ? "text-muted" : thin ? "text-muted" : r.gap >= 0 ? "text-leaf" : "text-flesh")}>
                        {r.gap === null ? "—" : `${r.gap >= 0 ? "+" : ""}${(r.gap * 100).toFixed(2)}%`}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {r.liquidity === null ? <span className="text-muted">v4 · depth not read</span> : <span className={thin ? "text-flesh" : "text-text"}>{usd(r.liquidity)}</span>}
                        {thin && <span className="block text-[12px] uppercase tracking-[0.08em] text-muted">thin: a signal, not a size</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <Link href={`/app/trade/terminal?token=${r.token}`} className="font-medium text-[12px] uppercase tracking-[0.08em] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                          Chart →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {off.length > 0 && (
            <p className="border-t border-line px-4 py-3 text-[13px] text-muted">
              <span className="text-text">{off.length} more</span> trade in pools too thin to price against the close:{" "}
              {off.map((r, i) => (
                <span key={r.token}>
                  {i > 0 && ", "}
                  <Link href={`/app/trade/terminal?token=${r.token}`} className="font-mono text-text hover:underline">
                    {r.symbol}
                  </Link>
                </span>
              ))}
              .
            </p>
          )}
        </>
      )}
    </Instrument>
  );
}
