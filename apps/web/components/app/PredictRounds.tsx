"use client";

/**
 * Predict · Rounds (preview). Short Up / Down rounds on an asset's price, settled by the chain: a contract reads the
 * Uniswap V2 pair's running price average at the start and at the end of each round, so nobody resolves them. Not open
 * yet: this page shows the live price and how a round would look, and every stake button is off.
 *
 * The odds in the grid are a model, not stakes: the chance the price ends beyond each level, from the size of the
 * asset's recent moves (a random walk scaled to the round's length), paid at 0.99 / chance. Marked as such.
 */
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { TokenAvatar } from "./TokenAvatar";

type Trade = { t: number; price: number };
type Asset = { id: string; token: string; symbol: string; name: string; stock?: boolean };
const ASSETS: Asset[] = [{ id: "eth", token: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", symbol: "ETH", name: "Ether" }];
const ROUNDS = [
  { id: "5m", s: 300 },
  { id: "15m", s: 900 },
  { id: "1h", s: 3600 },
  { id: "4h", s: 14_400 },
] as const;
const usd = (v: number) => `$${v.toLocaleString("en", { maximumFractionDigits: v >= 100 ? 2 : 4 })}`;
const vol = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
// standard normal tail
const tail = (z: number) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? p : 1 - p;
};

export function PredictRounds() {
  const [asset, setAsset] = useState<Asset>(ASSETS[0]!);
  const [round, setRound] = useState<(typeof ROUNDS)[number]>(ROUNDS[0]);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [list, setList] = useState<{ token: string; symbol: string; name: string; price: number | null; change: number | null; volume: number; stock: boolean }[]>([]);
  const [now, setNow] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "updown" | "above">("all");

  useEffect(() => {
    let off = false;
    const load = () =>
      fetch(`/api/market?token=${asset.token}&w=4`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { trades?: { t: number; price: number }[] } | null) => !off && j?.trades && setTrades([...j.trades].reverse().map((x) => ({ t: x.t, price: x.price }))))
        .catch(() => undefined);
    void load();
    const i = setInterval(load, 20_000);
    return () => {
      off = true;
      clearInterval(i);
    };
  }, [asset]);
  useEffect(() => {
    fetch("/api/trending")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: { token: string; symbol: string | null; name: string | null; price?: number | null; change?: number | null; volume: number }[]; stocks?: { token: string; symbol: string; name: string; price: number | null; change: number | null; volume: number }[] } | null) => {
        if (!j) return;
        const eth = (j.rows ?? []).find((r) => ["ETH", "WETH"].includes((r.symbol ?? "").toUpperCase()));
        setList([
          ...(eth ? [{ token: ASSETS[0]!.token, symbol: "ETH", name: "Ether", price: eth.price ?? null, change: eth.change ?? null, volume: eth.volume, stock: false }] : []),
          ...(j.stocks ?? []).filter((s) => s.volume > 20_000 && s.price).sort((a, b) => b.volume - a.volume).slice(0, 8).map((s) => ({ token: s.token, symbol: s.symbol, name: s.name.replace(/\s*•.*$/, ""), price: s.price, change: s.change, volume: s.volume, stock: true })),
        ]);
      })
      .catch(() => undefined);
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    const f = setTimeout(tick, 0);
    const i = setInterval(tick, 1000);
    return () => {
      clearTimeout(f);
      clearInterval(i);
    };
  }, []);

  const price = trades?.length ? trades[trades.length - 1]!.price : null;
  const start = now ? Math.floor(now / round.s) * round.s : 0;
  const left = start ? start + round.s - now : 0;
  const beat = useMemo(() => {
    if (!trades?.length || !start) return null;
    const before = trades.filter((x) => x.t <= start);
    return (before.length ? before[before.length - 1]! : trades[0]!).price;
  }, [trades, start]);
  // per-second volatility from the recent trades (log returns over time), floored so a quiet hour is not a sure thing
  const sigma = useMemo(() => {
    if (!trades || trades.length < 6) return 0.0004;
    let s = 0, n = 0;
    for (let i = 1; i < trades.length; i++) {
      const dt = Math.max(1, trades[i]!.t - trades[i - 1]!.t);
      const r = Math.log(trades[i]!.price / trades[i - 1]!.price);
      s += (r * r) / dt;
      n++;
    }
    return Math.max(0.00005, Math.sqrt(s / n));
  }, [trades]);

  // the grid: four rounds to the right, price levels above and below
  const step = price ? price * Math.max(0.0015, sigma * Math.sqrt(round.s) * 0.6) : 0;
  const levels = price ? Array.from({ length: 9 }, (_, i) => price + (4 - i) * step) : [];
  const cols = [0, 1, 2, 3].map((k) => ({ k, ends: start + (k + 1) * round.s }));
  const odds = (lvl: number, ends: number) => {
    if (!price) return { up: true, m: 0 };
    const tleft = Math.max(1, ends - now);
    const z = Math.log(lvl / price) / (sigma * Math.sqrt(tleft));
    const up = lvl >= price;
    const p = Math.min(0.995, Math.max(0.005, up ? tail(z) : 1 - tail(z)));
    return { up, m: 0.99 / p };
  };

  // chart
  const W = 760, H = 380;
  const shown = (trades ?? []).filter((x) => x.t >= now - round.s * 6);
  const lo = Math.min(...shown.map((x) => x.price), ...(levels.length ? [levels[levels.length - 1]!] : [])), hi = Math.max(...shown.map((x) => x.price), ...(levels.length ? [levels[0]!] : []));
  const Y = (v: number) => H - 10 - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 20);
  const t0 = now - round.s * 6;
  const X = (t: number) => ((t - t0) / Math.max(1, now - t0)) * W;
  const line = shown.map((x, i) => `${i ? "L" : "M"}${X(x.t).toFixed(1)},${Y(x.price).toFixed(1)}`).join(" ");

  const rows = list
    .flatMap((a) => [
      { a, kind: "updown" as const, label: `Up or down · ${round.id}`, upShare: 0.5 },
      ...(a.price ? [{ a, kind: "above" as const, label: `Above ${usd(Math.round(a.price * 1.01 * 100) / 100)} · daily`, upShare: 0.42 }] : []),
    ])
    .filter((r) => (kind === "all" || r.kind === kind) && (!q || `${r.a.symbol} ${r.a.name}`.toLowerCase().includes(q.toLowerCase())));
  const pad = (v: number) => String(v).padStart(2, "0");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-[#9b86e4]/40 bg-[#9b86e4]/[0.07] px-4 py-2.5 text-[13px]">
        <span className="rounded-full bg-[#9b86e4]/20 px-2 py-0.5 font-medium text-[12px] uppercase tracking-[0.08em] text-[#c4b5fd]">Preview</span>
        <span className="text-text">Rounds are not open yet. The price is live; the odds are a model from recent moves, not stakes. Stake buttons are off.</span>
      </div>

      {/* the round strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-[#0e0e0e] px-4 py-3">
        <span className="flex items-center gap-2.5">
          <TokenAvatar address="0x0000000000000000000000000000000000000000" symbol="ETH" size={30} />
          <span>
            <span className="block text-[15px] font-semibold text-text">{asset.name}</span>
            <span className="block text-[12px] text-muted">Up or down</span>
          </span>
        </span>
        <span className="font-display text-[26px] tabular-nums text-text">{price ? usd(price) : "…"}</span>
        <span className="flex gap-1 rounded-xl bg-[#090909] p-1">
          {ROUNDS.map((r) => (
            <button key={r.id} type="button" onClick={() => setRound(r)} aria-pressed={round.id === r.id} className={cx("rounded-lg px-3 py-1 text-[13px]", round.id === r.id ? "bg-[#202020] text-text" : "text-muted hover:text-text")}>
              {r.id}
            </button>
          ))}
        </span>
        <span>
          <span className="block text-[12px] text-muted">Price to beat</span>
          <span className="block font-mono text-[15px] text-text">{beat ? usd(beat) : "…"}</span>
        </span>
        <span>
          <span className="block text-[12px] text-muted">Ends in</span>
          <span className="flex items-center gap-2 font-mono text-[15px] text-text">
            {`${Math.floor(left / 60)}m ${pad(left % 60)}s`}
            <span className="flex gap-[2px]">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} className={cx("h-3 w-[3px] rounded-[1px]", i < Math.round((1 - left / round.s) * 12) ? "bg-[#424242]" : i === Math.round((1 - left / round.s) * 12) ? "bg-leaf" : "bg-[#242424]")} />
              ))}
            </span>
          </span>
        </span>
        <span>
          <span className="block text-[12px] text-muted">24h volume</span>
          <span className="block font-mono text-[15px] text-text">{list[0] ? vol(list[0].volume) : "…"}</span>
        </span>
        {beat && price && (
          <span className={cx("ml-auto rounded-full px-3 py-1 font-mono text-[12px]", price >= beat ? "bg-leaf/15 text-leaf" : "bg-flesh/15 text-flesh")}>{price >= beat ? "▲ Up, so far" : "▼ Down, so far"}</span>
        )}
      </div>

      {/* chart and the grid of odds */}
      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="relative bg-[#0e0e0e] p-3">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[380px] w-full" role="img" aria-label={`${asset.symbol} price over the last six rounds`}>
            {Array.from({ length: 7 }, (_, i) => (
              <line key={i} x1={(i / 6) * W} x2={(i / 6) * W} y1={0} y2={H} stroke="#181818" vectorEffect="non-scaling-stroke" />
            ))}
            {levels.map((l) => (
              <line key={l} x1={0} x2={W} y1={Y(l)} y2={Y(l)} stroke="#181818" vectorEffect="non-scaling-stroke" />
            ))}
            {beat && <line x1={0} x2={W} y1={Y(beat)} y2={Y(beat)} stroke="var(--muted)" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />}
            {price && <line x1={0} x2={W} y1={Y(price)} y2={Y(price)} stroke="var(--leaf)" strokeOpacity={0.6} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />}
            <path d={line} fill="none" stroke="var(--leaf)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
          {price && <span className="absolute right-3 rounded bg-ui px-1.5 font-mono text-[12px] text-[#0b0b0b]" style={{ top: `calc(${(Y(price) / H) * 100}% + 2px)` }}>{price.toFixed(2)}</span>}
          {!trades && <p className="caret absolute inset-0 grid place-items-center font-mono text-[12px] text-muted">Reading the price</p>}
        </div>
        <div className="bg-[#0e0e0e] p-3">
          <div className="grid grid-cols-4 gap-1 pb-1 text-center font-mono text-[12px] text-muted">
            {cols.map((c) => (
              <span key={c.k}>{`ends ${new Date(c.ends * 1000).toISOString().slice(11, 16)}`}</span>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {levels.flatMap((l) =>
              cols.map((c) => {
                const o = odds(l, c.ends);
                const id = `${l}-${c.k}`;
                return (
                  <button key={id} type="button" onClick={() => setPick(id)} title={`${o.up ? "Above" : "Below"} ${usd(l)} at ${new Date(c.ends * 1000).toISOString().slice(11, 16)} UTC`} className={cx("flex h-[38px] flex-col items-center justify-center rounded-lg font-mono transition-colors", o.up ? "bg-leaf/[0.09] hover:bg-leaf/20" : "bg-flesh/[0.09] hover:bg-flesh/20", pick === id && "ring-1 ring-text")}>
                    <span className="text-[12.5px] text-text">{`${o.m < 10 ? o.m.toFixed(2) : o.m.toFixed(1)}x`}</span>
                    <span className={cx("text-[12px]", o.up ? "text-leaf" : "text-flesh")}>{o.up ? "↑ Up" : "↓ Down"}</span>
                  </button>
                );
              }),
            )}
          </div>
          <div className="mt-3 rounded-xl bg-[#090909] p-3 text-[12px]">
            {pick ? (
              <>
                <p className="text-text">The ticket opens with the rounds contract.</p>
                <button type="button" disabled className="mt-2 h-10 w-full cursor-not-allowed rounded-xl bg-[#1c1c1c] text-[13px] text-muted">
                  Stake · soon
                </button>
              </>
            ) : (
              <p className="text-muted">Pick a cell: a level, a round, a side. Payouts shown are model odds after the fee.</p>
            )}
          </div>
        </div>
      </div>

      {/* every market, searchable */}
      <div className="overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: ETH, NVDA, TSLA…" aria-label="Search rounds" className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-[#090909] px-3 text-[13.5px] text-text outline-none focus:border-ui/60" />
          <span className="flex gap-1 rounded-xl bg-[#090909] p-1">
            {(
              [
                ["all", "All"],
                ["updown", "Up / Down"],
                ["above", "Above / Below"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cx("rounded-lg px-3 py-1 text-[13px]", kind === k ? "bg-[#202020] text-text" : "text-muted hover:text-text")}>
                {l}
              </button>
            ))}
          </span>
        </div>
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-line font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
              {["Market", "Price", "24h", "Up / Yes", "Ends in"].map((h, i) => (
                <th key={h} className={cx("px-4 py-2.5 font-normal", i > 0 && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.a.token}-${r.kind}`} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#141414]">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <TokenAvatar address={r.a.symbol === "ETH" ? "0x0000000000000000000000000000000000000000" : r.a.token} symbol={r.a.symbol} stock={r.a.stock} size={26} />
                    <span>
                      <span className="block font-semibold text-text">{r.a.name}</span>
                      <span className="block text-[12px] text-muted">{r.label}</span>
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text">{r.a.price ? usd(r.a.price) : "…"}</td>
                <td className={cx("px-4 py-2.5 text-right tabular-nums", (r.a.change ?? 0) >= 0 ? "text-leaf" : "text-flesh")}>{r.a.change == null ? "" : `${r.a.change >= 0 ? "+" : ""}${r.a.change.toFixed(1)}%`}</td>
                <td className="px-4 py-2.5">
                  <span className="ml-auto flex w-36 items-center gap-2">
                    <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-flesh/40">
                      <span className="bg-leaf" style={{ width: `${r.upShare * 100}%` }} />
                    </span>
                    <span className="font-mono text-[12px] text-muted">{`${Math.round(r.upShare * 100)}%`}</span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">{r.kind === "updown" ? `${Math.floor(left / 60)}m ${pad(left % 60)}s` : `${pad(23 - new Date(now * 1000).getUTCHours())}h`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-2.5 text-[12px] text-muted">Up / Yes is the model share before any stake. Stock rounds follow the token&apos;s own pool on Robinhood Chain.</p>
      </div>
    </div>
  );
}
