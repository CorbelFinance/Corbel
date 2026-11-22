"use client";

/**
 * Corbel in numbers. Everything is read live from the same endpoints the app uses: the pool index (new pools by the
 * hour, venues, liveness), the swaps of the last day, the big swaps, the Predict contract, the mandate contract's
 * decisions and the model catalogue. Hover a chart for the hour; every chain figure links to its transaction.
 */
import { useEffect, useMemo, useState } from "react";
import { ROAD_BLOCKS } from "@corbel/config";
import { cx } from "@corbel/ui";

const T = Object.fromEntries(ROAD_BLOCKS.map((b) => [b.id, b.tone])) as Record<string, string>;
const SCAN = "https://robinhoodchain.blockscout.com";
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
const num = (v: number) => v.toLocaleString("en");
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const hhmm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);
const dayHour = (t: number) => new Date(t * 1000).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

type Launches = { pools: number; launchers: number; hours: { ago: number; v2: number; v4: number }[]; venues: { label: string; n: number }[]; liveness: { v2Known: number; v2Dead: number; v4Live: number } };
type Trend = { at: number; swaps?: number; rows: { symbol: string | null; token: string; swaps: number; buys: number; volume: number }[] };
type Whale = { symbol: string | null; t: number; side: "buy" | "sell"; usd: number; who: string; tx: string };
type Market = { id: number; state: string; closeAt: number; yesPot: string; noPot: string; pool: { symbol: string; baseSymbol: string } | null };
type Entry = { id: number; minute: number; scenario: string; block: string; rule: string; traded: boolean };
type ModelRow = { kind: string; avail?: boolean; media?: boolean };
type Data = { now: number; launches?: Launches; trend?: Trend; whales?: Whale[]; markets?: Market[]; log?: Entry[]; models?: ModelRow[] };

function get<T>(u: string): Promise<T | null> {
  return fetch(u)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);
}

/** Bars by the hour, newest on the right; hover or focus a bar for its hour. Two series stack (a under b). */
function HourBars({ cols, tone, toneB, fmt, label, legend }: { cols: { at: number; a: number; b: number }[]; tone: string; toneB: string; fmt: (v: number) => string; label: string; legend: [string, string] }) {
  const [hov, setHov] = useState<number | null>(null);
  const max = Math.max(1, ...cols.map((c) => c.a + c.b));
  const cur = cols[hov ?? cols.length - 1];
  return (
    <figure className="mt-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[12px]">
        <span className="text-text">{cur ? `${dayHour(cur.at)} UTC${hov === null ? " · this hour" : ""}` : ""}</span>
        <span className="flex gap-4 text-muted">
          <span>
            <i className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: tone }} />
            {`${legend[0]} ${cur ? fmt(cur.a) : ""}`}
          </span>
          <span>
            <i className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: toneB }} />
            {`${legend[1]} ${cur ? fmt(cur.b) : ""}`}
          </span>
        </span>
      </figcaption>
      <div className="relative mt-3 h-44" role="img" aria-label={label} onMouseLeave={() => setHov(null)}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f} className="absolute inset-x-0 border-t border-dashed border-[#212121]" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 right-0 bg-[#0e0e0e] pl-1 font-mono text-[12px] text-[#7d8a83]">{fmt(max * f)}</span>
          </span>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px] pr-10">
          {cols.map((c, i) => (
            <span key={c.at} onMouseEnter={() => setHov(i)} className={cx("num-bar relative flex h-full flex-1 flex-col justify-end rounded-t-[2px]", hov === i && "bg-white/[0.04]")} style={{ animationDelay: `${i * 0.012}s` }}>
              <span className="block rounded-t-[2px]" style={{ height: `${(c.b / max) * 100}%`, background: toneB, opacity: hov === null || hov === i ? 1 : 0.55 }} />
              <span className="block" style={{ height: `${(c.a / max) * 100}%`, background: tone, opacity: hov === null || hov === i ? 1 : 0.55 }} />
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between pr-10 font-mono text-[12px] text-[#7d8a83]">
        {cols
          .filter((_, i) => i % Math.ceil(cols.length / 6) === 0)
          .map((c) => (
            <span key={c.at}>{hhmm(c.at)}</span>
          ))}
      </div>
    </figure>
  );
}

function Panel({ tone, kicker, title, note, children, className }: { tone: string; kicker: string; title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("relative overflow-hidden rounded-[24px] border bg-[#0e0e0e] p-5 sm:p-6", className)} style={{ borderColor: `${tone}30` }}>
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-[0.12] blur-3xl" style={{ background: tone }} />
      <p className="relative font-mono text-[12px]" style={{ color: tone }}>
        {kicker}
      </p>
      <h2 className="relative mt-1 text-[18px] font-semibold tracking-tight text-text">{title}</h2>
      {note && <p className="relative mt-1 text-[13px] text-muted">{note}</p>}
      <div className="relative">{children}</div>
    </section>
  );
}

const Wait = () => <p className="caret mt-4 font-mono text-[12px] text-muted">Reading</p>;

export function Numbers() {
  const [d, setD] = useState<Data>({ now: 0 });
  useEffect(() => {
    let off = false;
    const put = (p: Partial<Data>) => !off && setD((x) => ({ ...x, ...p }));
    void Promise.resolve().then(() => put({ now: Math.floor(Date.now() / 1000) }));
    void get<Launches>("/api/launches").then((j) => j && put({ launches: j }));
    void get<Trend>("/api/trending").then((j) => j?.rows && put({ trend: j }));
    void get<{ rows: Whale[] }>("/api/whales").then((j) => put({ whales: j?.rows ?? [] }));
    void get<{ markets: Market[] }>("/api/predict").then((j) => put({ markets: j?.markets ?? [] }));
    void get<{ entries: Entry[] }>("/api/mandate?log").then((j) => put({ log: j?.entries ?? [] }));
    void get<{ rows: ModelRow[] }>("/api/compute?what=models").then((j) => j?.rows && put({ models: j.rows }));
    return () => {
      off = true;
    };
  }, []);

  const hourNow = Math.floor(d.now / 3600) * 3600;
  const poolCols = useMemo(() => (d.launches ? [...d.launches.hours].reverse().map((h) => ({ at: hourNow - h.ago * 3600, a: h.v2, b: h.v4 })) : []), [d.launches, hourNow]);
  const whaleCols = useMemo(() => {
    if (!d.whales || !d.now) return [];
    const cols = Array.from({ length: 24 }, (_, i) => ({ at: hourNow - (23 - i) * 3600, a: 0, b: 0 }));
    for (const w of d.whales) {
      const i = 23 - Math.floor((hourNow - Math.floor(w.t / 3600) * 3600) / 3600);
      if (i >= 0 && i < 24) cols[i]![w.side === "buy" ? "a" : "b"] += w.usd;
    }
    return cols;
  }, [d.whales, d.now, hourNow]);

  const vol = d.trend?.rows.reduce((s, r) => s + r.volume, 0) ?? 0;
  const swaps = d.trend ? (d.trend.swaps ?? d.trend.rows.reduce((s, r) => s + r.swaps, 0)) : null;
  const staked = d.markets?.reduce((s, m) => s + (Number(m.yesPot) + Number(m.noPot)) / 1e6, 0) ?? null;
  const traded = d.log?.filter((e) => e.traded).length ?? 0;
  const live = d.launches?.liveness;
  const kpis = [
    { tone: T.check!, k: "Pools indexed", v: d.launches ? num(d.launches.pools) : null, s: d.launches ? `opened by ${num(d.launches.launchers)} wallets` : "" },
    { tone: T.trade!, k: "Swaps, last day", v: swaps != null ? num(swaps) : null, s: d.trend ? `${usd(vol)} across ${d.trend.rows.length} busiest tokens` : "" },
    { tone: T.trade!, k: "Big swaps, last day", v: d.whales ? num(d.whales.length) : null, s: d.whales ? `${usd(d.whales.reduce((s, w) => s + w.usd, 0))} in total` : "" },
    { tone: T.predict!, k: "Staked in Predict", v: staked != null ? `${staked.toFixed(2)} USDG` : null, s: d.markets ? `${d.markets.length} ${d.markets.length === 1 ? "market" : "markets"} on the contract` : "" },
    { tone: T.agents!, k: "Agent decisions", v: d.log ? num(d.log.length) : null, s: d.log ? `${traded} traded, ${d.log.length - traded} stopped by the rules` : "" },
    { tone: T.compute!, k: "AI models listed", v: d.models ? num(d.models.length) : null, s: d.models ? `${d.models.filter((m) => m.avail).length} available now` : "" },
  ];
  const top = (d.trend?.rows ?? []).filter((r) => r.volume > 0).sort((a, b) => b.volume - a.volume).slice(0, 10);
  const vmax = Math.max(1, ...top.map((r) => r.volume));
  const kinds = useMemo(() => {
    const c = new Map<string, { n: number; on: number }>();
    for (const m of d.models ?? []) {
      const x = c.get(m.kind) ?? { n: 0, on: 0 };
      x.n++;
      if (m.avail) x.on++;
      c.set(m.kind, x);
    }
    return [...c.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [d.models]);
  const KIND: Record<string, string> = { text: "Write", code: "Code", vision: "See", image: "Draw", video: "Film", audio: "Hear" };
  const kmax = Math.max(1, ...kinds.map(([, x]) => x.n));

  return (
    <>
      <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[24px] border border-[#242424] bg-[#242424] lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.k} className="relative bg-[#0e0e0e] p-4 sm:p-5">
            <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: k.tone }} />
            <p className="text-[12.5px] text-muted">{k.k}</p>
            <p className="mt-2 truncate font-display text-3xl leading-none text-text sm:text-[2.1rem]">{k.v ?? <span className="text-[#7d8a83]">···</span>}</p>
            <p className="mt-2 text-[12px] text-muted">{k.s}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel tone={T.check!} kicker="Check · Launch" title="New pools, hour by hour" note="Every pool opened on Robinhood Chain in the last 48 hours, from our own index of the chain.">
          {poolCols.length ? <HourBars cols={poolCols} tone="#5d7cff" toneB={T.check!} fmt={(v) => `${Math.round(v)}`} label="New pools per hour, last 48 hours" legend={["V2", "v4"]} /> : <Wait />}
        </Panel>
        <Panel tone={T.trade!} kicker="Trade" title="Big swaps, hour by hour" note="Dollar value of the largest swaps of the last 24 hours, buys against sells.">
          {whaleCols.length && whaleCols.some((c) => c.a + c.b > 0) ? <HourBars cols={whaleCols} tone={T.trade!} toneB="#ff6b81" fmt={usd} label="Big swaps per hour, last 24 hours" legend={["Buys", "Sells"]} /> : d.whales ? <p className="mt-6 text-[13px] text-muted">No big swaps were read in the last 24 hours.</p> : <Wait />}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel tone={T.trade!} kicker="Trade" title="Where the volume went" note="The busiest tokens of the last day by dollar volume; the green share is buys.">
          {!d.trend && <Wait />}
          <ul className="mt-4 space-y-2">
            {top.map((r, i) => (
              <li key={r.token} className="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-[12.5px]">
                <a href={`/app/trade/terminal?t=${r.token}`} className="truncate font-mono text-text hover:underline">
                  {r.symbol ?? short(r.token)}
                </a>
                <span className="h-3 overflow-hidden rounded-full bg-[#181818]">
                  <span className="bar-grow flex h-full rounded-full" style={{ width: `${Math.max(2, (r.volume / vmax) * 100)}%`, animationDelay: `${i * 0.04}s` }}>
                    <span className="h-full" style={{ width: `${r.swaps ? (r.buys / r.swaps) * 100 : 50}%`, background: T.trade }} />
                    <span className="h-full flex-1 bg-[#ff6b81]" />
                  </span>
                </span>
                <span className="text-right font-mono text-muted">{usd(r.volume)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel tone={T.check!} kicker="Check" title="Where pools open, and what survives" note="Every indexed pool by venue and base, and how many V2 pools were drained.">
          {!d.launches && <Wait />}
          {d.launches && (
            <>
              <div className="mt-4 flex h-4 overflow-hidden rounded-full">
                {d.launches.venues.slice(0, 6).map((v, i) => (
                  <span key={v.label} title={`${v.label}: ${num(v.n)}`} className="h-full" style={{ width: `${(v.n / d.launches!.pools) * 100}%`, background: ["#6cc0d0", "#5d7cff", "#9b86e4", "#6fe7a8", "#f2c46d", "#ff9a5c"][i] }} />
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                {d.launches.venues.slice(0, 6).map((v, i) => (
                  <li key={v.label} className="flex items-center gap-2">
                    <i className="h-2 w-2 shrink-0 rounded-sm" style={{ background: ["#6cc0d0", "#5d7cff", "#9b86e4", "#6fe7a8", "#f2c46d", "#ff9a5c"][i] }} />
                    <span className="truncate text-text">{v.label}</span>
                    <span className="ml-auto font-mono text-muted">{num(v.n)}</span>
                  </li>
                ))}
              </ul>
              {live && live.v2Known > 0 && (
                <div className="mt-5 rounded-2xl bg-[#141414] p-4">
                  <p className="flex items-baseline justify-between text-[12.5px] text-muted">
                    V2 pools drained or left as dust
                    <span className="font-display text-2xl text-text">{`${((live.v2Dead / live.v2Known) * 100).toFixed(0)}%`}</span>
                  </p>
                  <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[#1f1f1f]">
                    <span className="bar-grow block h-full rounded-full bg-[#ff6b81]" style={{ width: `${(live.v2Dead / live.v2Known) * 100}%` }} />
                  </span>
                  <p className="mt-2 font-mono text-[12px] text-muted">{`${num(live.v2Dead)} of ${num(live.v2Known)} checked`}</p>
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel tone={T.predict!} kicker="Predict" title="Markets on the contract" note="Each market's pots in USDG, read from the chain.">
          {!d.markets && <Wait />}
          {d.markets && !d.markets.length && <p className="mt-4 text-[13px] text-muted">The contract did not answer just now. Open Predict for the live markets.</p>}
          <ul className="mt-4 space-y-3">
            {(d.markets ?? []).map((m) => {
              const y = Number(m.yesPot) / 1e6, n = Number(m.noPot) / 1e6, tot = y + n;
              return (
                <li key={m.id} className="rounded-2xl bg-[#13101c] p-4">
                  <a href="/app/predict" className="flex items-baseline justify-between gap-2 text-[13px] text-text hover:underline">
                    {`#${m.id} · Will ${m.pool ? `${m.pool.symbol}/${m.pool.baseSymbol}` : "the pool"} keep its liquidity?`}
                    <span className="shrink-0 font-mono text-[12px]" style={{ color: T.predict }}>
                      {m.state}
                    </span>
                  </a>
                  <span className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-[#221d33]">
                    <span className="h-full bg-leaf" style={{ width: `${tot ? (y / tot) * 100 : 50}%` }} />
                    <span className="h-full flex-1 bg-[#ff6b81]" style={{ opacity: tot ? 1 : 0.3 }} />
                  </span>
                  <span className="mt-2 flex justify-between font-mono text-[12px] text-muted">
                    <span>{`YES ${y.toFixed(2)}`}</span>
                    <span>{d.now && m.closeAt > d.now ? `closes in ${Math.ceil((m.closeAt - d.now) / 3600)}h` : "closed for stakes"}</span>
                    <span>{`NO ${n.toFixed(2)}`}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel tone={T.agents!} kicker="Agents" title="What the mandate contract decided" note="Each run on the chain: traded, or stopped by a rule.">
          {!d.log && <Wait />}
          <ul className="mt-4 divide-y divide-[#1a2030]">
            {(d.log ?? []).slice(0, 7).map((e) => (
              <li key={e.id} className="grid grid-cols-[1.2rem_minmax(0,1fr)_auto] items-center gap-2 py-2 text-[12.5px]">
                <i className={cx("h-2.5 w-2.5 rounded-full", e.traded ? "bg-leaf" : "bg-[#93a6ff]")} />
                <span className="truncate text-text">{`${e.scenario} · ${e.traded ? "traded" : `stopped: ${e.rule}`}`}</span>
                <a href={`${SCAN}/block/${e.block}`} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-muted hover:text-text">
                  {`#${e.block}`}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel tone={T.compute!} kicker="AI" title="Models by what they do" note="The full catalogue; the bright part of each bar is available now.">
          {!d.models && <Wait />}
          <ul className="mt-4 space-y-2.5">
            {kinds.map(([k, x], i) => (
              <li key={k} className="grid grid-cols-[3.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-[12.5px]">
                <span className="text-text">{KIND[k] ?? k}</span>
                <span className="h-3 overflow-hidden rounded-full bg-[#1c130e]">
                  <span className="bar-grow flex h-full" style={{ width: `${(x.n / kmax) * 100}%`, animationDelay: `${i * 0.05}s` }}>
                    <span className="h-full" style={{ width: `${(x.on / x.n) * 100}%`, background: T.compute }} />
                    <span className="h-full flex-1 bg-[#ff9a5c]/30" />
                  </span>
                </span>
                <span className="text-right font-mono text-muted">{num(x.n)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel tone={T.trade!} kicker="Trade" title="Newest big swaps" note="The largest swaps of the last day, newest first, each with its transaction." className="mt-6">
        {!d.whales && <Wait />}
        {d.whales && !d.whales.length && <p className="mt-4 text-[13px] text-muted">No big swaps in the last 24 hours.</p>}
        <div className={cx("mt-4 overflow-x-auto", !d.whales?.length && "hidden")}>
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#242424] text-[12px] text-muted">
                {["Time, UTC", "Token", "Side", "Value", "Wallet", "Transaction"].map((h, i) => (
                  <th key={h} className={cx("py-2 pr-4 font-normal", i === 3 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...(d.whales ?? [])]
                .sort((a, b) => b.t - a.t)
                .slice(0, 10)
                .map((w) => (
                  <tr key={w.tx} className="border-b border-[#181818]">
                    <td className="py-2 pr-4 font-mono text-muted">{dayHour(w.t)}</td>
                    <td className="py-2 pr-4 text-text">{w.symbol ?? "?"}</td>
                    <td className={cx("py-2 pr-4 font-mono", w.side === "buy" ? "text-leaf" : "text-[#ff6b81]")}>{w.side}</td>
                    <td className="py-2 pr-4 text-right font-mono text-text">{usd(w.usd)}</td>
                    <td className="py-2 pr-4 font-mono text-muted">{short(w.who)}</td>
                    <td className="py-2 font-mono">
                      <a href={`${SCAN}/tx/${w.tx}`} target="_blank" rel="noreferrer" className="text-muted hover:text-text">
                        {`${short(w.tx)} ↗`}
                      </a>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
