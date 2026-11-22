"use client";

/**
 * Earn · Pools. What liquidity providers earned in the deepest pools over the last day, read from the
 * chain, and a deposit simulator: your share, fees a day if volume holds, and what a price move costs
 * (impermanent loss). Past numbers, not a promise; Corbel holds nothing and signs nothing.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { fmtPx } from "./Candles";
import { TokenAvatar } from "./TokenAvatar";
import { LpPositions } from "./LpPositions";
import { EarnBoard } from "./EarnBoard";
import { Idle, Instrument, Led, short } from "./kit";

type Row = { token: string; symbol: string; name: string; pair: string; base: string; liquidity: number; volume: number; fees: number; hours: number; apr: number | null; swaps: number; hourly: number[]; price: number | null; net: number | null; move: number | null };
const usd = (v: number) => (!Number.isFinite(v) ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(v < 10 ? 2 : 0)}`);
const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(v < 0.1 ? 2 : 1)}%`);
/** Value lost against holding when one side's price moves by `r` (×), for a 50/50 constant-product pool. */
/** The V2 pool fee and the price move used for the break-even line. */
const POOL_FEE = 0.003;
/** Mirrors the API: pools below this liquidity are counted, not listed. */
const MIN_SHOWN = 1000;
const il = (r: number) => (2 * Math.sqrt(r)) / (1 + r) - 1;
/** The price ratio on each side where impermanent loss equals `f` (fees as a share of the deposit). */
function band(f: number): [number, number] | null {
  if (!(f > 0)) return null;
  if (f >= 1) return [0, Infinity];
  const solve = (lo: number, hi: number, up: boolean) => {
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const loss = -il(mid);
      if ((loss < f) === up) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return [solve(1e-6, 1, false), solve(1, 1e6, true)];
}
const SCEN = [
  { id: "half", label: "Half the volume", k: 0.5 },
  { id: "same", label: "Same as last day", k: 1 },
  { id: "double", label: "Double", k: 2 },
] as const;
/** Price moves drawn on the payoff chart, as ratios. */
const MOVES = Array.from({ length: 81 }, (_, i) => 0.2 + i * 0.035);

function Payoff({ f, at }: { f: number; at: number }) {
  const W = 320, H = 150, P = 6;
  const ys = MOVES.map((r) => il(r) + f);
  const lo = Math.min(-0.2, ...ys), hi = Math.max(0.05, ...ys);
  const X = (r: number) => P + ((r - MOVES[0]!) / (MOVES[MOVES.length - 1]! - MOVES[0]!)) * (W - 2 * P);
  const Y = (v: number) => P + ((hi - v) / (hi - lo)) * (H - 2 * P);
  const line = MOVES.map((r, i) => `${i ? "L" : "M"}${X(r).toFixed(1)},${Y(ys[i]!).toFixed(1)}`).join("");
  const area = `${line}L${X(MOVES[MOVES.length - 1]!)},${Y(0)}L${X(MOVES[0]!)},${Y(0)}Z`;
  const cur = il(at) + f;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label="Your result against holding, by price move">
      <defs>
        <clipPath id="pf-up">
          <rect x="0" y="0" width={W} height={Y(0)} />
        </clipPath>
        <clipPath id="pf-dn">
          <rect x="0" y={Y(0)} width={W} height={H} />
        </clipPath>
      </defs>
      <path d={area} fill="rgb(61 220 132 / 0.18)" clipPath="url(#pf-up)" />
      <path d={area} fill="rgb(255 69 96 / 0.14)" clipPath="url(#pf-dn)" />
      <line x1={P} x2={W - P} y1={Y(0)} y2={Y(0)} stroke="var(--line)" />
      <line x1={X(1)} x2={X(1)} y1={P} y2={H - P} stroke="var(--line)" strokeDasharray="3 3" />
      <path d={line} fill="none" stroke="var(--text)" strokeWidth={1.5} />
      {at >= MOVES[0]! && at <= MOVES[MOVES.length - 1]! && <circle cx={X(at)} cy={Y(cur)} r={4} fill={cur >= 0 ? "var(--leaf)" : "var(--flesh)"} />}
      <text x={X(1) + 4} y={H - P - 2} className="fill-[var(--muted)] font-mono text-[12px]">no move</text>
      <text x={P} y={Y(0) - 4} className="fill-[var(--muted)] font-mono text-[12px]">holding</text>
    </svg>
  );
}

function Spark({ v }: { v: number[] }) {
  const max = Math.max(...v, 1e-9);
  return (
    <svg viewBox="0 0 96 24" className="h-6 w-24" aria-hidden>
      {v.map((x, i) => (
        <rect key={i} x={i * 4} y={24 - (x / max) * 22} width={3} height={Math.max(0.5, (x / max) * 22)} fill="var(--lav)" opacity={x > 0 ? 0.9 : 0.2} />
      ))}
    </svg>
  );
}

/** One line that decides a pool for a provider: does it keep what it earns, and does it pay steadily. */
function verdict(x: Row): { k: string; tone: "bad" | "good" | "plain" } {
  const paid = x.hourly.filter((h) => h > 0).length;
  if (x.net !== null && x.net < 0) return { k: "Price moves ate the fees", tone: "bad" };
  if (paid < 8) return { k: `Paid in ${paid} of 24 hours`, tone: "bad" };
  if (paid >= 18 && x.net !== null && x.net >= 0) return { k: `Kept fees, paid ${paid}/24 h`, tone: "good" };
  return { k: `Paid in ${paid} of 24 hours`, tone: "plain" };
}

const sortKey = (sort: string) => (x: Row) => (sort === "yield" ? (x.apr ?? -1) : sort === "kept" ? (x.net ?? -1) : sort === "turn" ? x.volume / (x.liquidity || 1) : sort === "steady" ? x.hourly.filter((h) => h > 0).length : x.liquidity);

export function EarnPools() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [state, setState] = useState<"loading" | "warming" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");
  const [pick, setPick] = useState(0);
  const [sort, setSort] = useState<"yield" | "kept" | "deep" | "turn" | "steady">("yield");
  const [amt, setAmt] = useState("1000");
  const [at, setAt] = useState<number | null>(null);
  const [hidden, setHidden] = useState(0);
  const [kind, setKind] = useState<"all" | "stocks" | "tokens">("all");
  const [q, setQ] = useState("");
  const [days, setDays] = useState(30);
  const [move, setMove] = useState(1.25);
  const [scen, setScen] = useState<(typeof SCEN)[number]["id"]>("same");

  useEffect(() => {
    let off = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      fetch("/api/earn")
        .then(async (r) => ({ code: r.status, j: (await r.json()) as { rows?: Row[]; at?: number; hidden?: number; error?: string } }))
        .then(({ code, j }) => {
          if (off) return;
          if (code === 202) {
            setState("warming");
            timer = setTimeout(load, 15_000);
            return;
          }
          if (j.error || !j.rows) return (setState("error"), setMsg(j.error ?? "The chain did not answer."));
          setRows(j.rows);
          setAt(j.at ?? null);
          setHidden(j.hidden ?? 0);
          setState("ok");
        })
        .catch(() => !off && (setState("error"), setMsg("The chain did not answer.")));
    void load();
    return () => {
      off = true;
      clearTimeout(timer);
    };
  }, []);

  const isStock = (x: Row) => x.name.includes("Robinhood") || x.name.includes("xStock") || x.name.includes("ST0x");
  const sorted = useMemo(() => {
    if (!rows) return null;
    const k = sortKey(sort);
    const s = q.trim().toLowerCase();
    return [...rows]
      .filter((x) => (kind === "all" ? true : kind === "stocks" ? isStock(x) : !isStock(x)))
      .filter((x) => !s || x.symbol.toLowerCase().includes(s) || x.name.toLowerCase().includes(s) || x.token.toLowerCase() === s)
      .sort((a, b) => k(b) - k(a));
  }, [rows, sort, kind, q]);
  const pickPair = (pair: string) => {
    const i = sorted?.findIndex((x) => x.pair === pair) ?? -1;
    if (i >= 0) return setPick(i);
    setKind("all");
    setQ("");
    setPick([...(rows ?? [])].sort((x, y) => sortKey(sort)(y) - sortKey(sort)(x)).findIndex((x) => x.pair === pair));
  };
  const r = sorted?.[pick];
  const a = Number(amt.replace(/,/g, "")) || 0;
  const sim = useMemo(() => {
    if (!r || !(a > 0)) return null;
    const share = a / (r.liquidity + a);
    const k = SCEN.find((x) => x.id === scen)!.k;
    const perDay = r.fees * (24 / r.hours) * share * k;
    const fees = perDay * days;
    const f = fees / a;
    const loss = il(move) * a;
    return { share, perDay, fees, f, loss, net: fees + loss, band: band(f) };
  }, [r, a, scen, days, move]);

  return (
    <div className="space-y-4">
    {rows && rows.length > 0 && <EarnBoard rows={rows} at={at} onPick={pickPair} picked={r?.pair} />}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
      <Instrument
        code="E-01"
        title="Pools and what their LPs earned"
        busy={state !== "ok" && state !== "error"}
        status={
          <>
            {rows && (
              <span role="group" aria-label="Sort pools" className="flex gap-1">
                {(
                  [
                    ["yield", "Fee yield"],
                    ["kept", "Kept after IL"],
                    ["turn", "Turnover"],
                    ["steady", "Steady"],
                    ["deep", "Deepest"],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={sort === id} onClick={() => (setSort(id), setPick(0))} className={cx("rounded-full border px-3 py-1 font-medium text-[12px] uppercase tracking-[0.08em]", sort === id ? "border-leaf bg-leaf/10 text-leaf" : "border-line text-muted hover:text-text")}>
                    {label}
                  </button>
                ))}
              </span>
            )}
            <Led tone={state === "error" ? "bad" : state === "ok" ? "on" : "off"} live={state === "ok"} label={state === "ok" ? `Read ${at ? new Date(at).toISOString().slice(11, 16) : ""} UTC · every 10 min` : state === "warming" ? "Reading a day of swaps" : state === "error" ? "Paused" : "Reading"} />
          </>
        }
        foot={
          <>
            <span>{`Fees = swaps in the window × ${POOL_FEE * 100}% pool fee, before any protocol cut · yearly = last day × 365`}</span>
            <span>Past, not promised</span>
          </>
        }
      >
        {rows && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
            <div className="flex rounded-full bg-[#181818] p-[3px] text-[12px]">
              {(
                [
                  ["all", "All"],
                  ["stocks", "Stocks"],
                  ["tokens", "Tokens"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" onClick={() => (setKind(k), setPick(0))} className={cx("rounded-full px-3 py-1", kind === k ? "bg-[#282828] text-text" : "text-muted hover:text-text")}>
                  {l}
                </button>
              ))}
            </div>
            <input value={q} onChange={(e) => (setQ(e.target.value), setPick(0))} placeholder="Find a pool" aria-label="Find a pool" className="h-8 w-44 rounded-full border border-[#242424] bg-[#101010] px-3 text-[12px] text-text outline-none focus:border-ui/60" />
            <span className="ml-auto text-[12px] text-muted">{sorted?.length ?? 0} pools</span>
          </div>
        )}
        {state === "error" && <p className="bg-flesh-deep/50 px-4 py-3 text-sm text-text">{msg}</p>}
        {!rows && state !== "error" && <Idle className="min-h-72">{state === "warming" ? "Reading a day of swaps in each pool. The first read takes a minute." : "Reading…"}</Idle>}
        {rows && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <caption className="sr-only">Pools ranked by liquidity, with fees earned over the last day</caption>
              <thead>
                <tr className="border-b border-line">
                  {["Pool", "Fee yield, yearly", "Fees − IL, window", "Volume by hour", "Paid hours", "Turnover", "Liquidity", "Volume", "LP fees"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium text-[12px] font-normal uppercase tracking-[0.08em] text-muted">
                      {h}
                      {(h === "Fee yield, yearly" || h === "Fees − IL, window") && <span title="Computed by Corbel from on-chain swaps" className="ml-1.5 text-[var(--lav)]">·calc</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted!.map((x, i) => (
                  <tr key={x.pair} onClick={() => setPick(i)} aria-selected={i === pick} className={cx("irow cursor-pointer border-b border-line last:border-0", i === pick && "bg-leaf/[0.06]")}>
                    <th scope="row" className="px-4 py-3 font-normal">
                      <button type="button" onClick={() => setPick(i)} className="flex items-center gap-3 text-left">
                        <TokenAvatar address={x.token} symbol={x.symbol} size={30} stock={x.name.includes("Robinhood")} />
                        <span>
                        <span className="block font-mono text-text">
                          {x.symbol} <span className="text-muted">/ {x.base}</span>
                        </span>
                        <span className="block max-w-[14rem] truncate text-xs text-muted">{x.name || short(x.token)}</span>
                        {(() => {
                          const v = verdict(x);
                          return <span className={cx("mt-0.5 block text-[12.5px] font-medium", v.tone === "bad" ? "text-flesh" : v.tone === "good" ? "text-leaf" : "text-text")}>{v.k}</span>;
                        })()}
                        </span>
                      </button>
                    </th>
                    <td className={cx("px-4 py-3 font-display text-lg tabular-nums", x.apr && x.apr > 0 ? "text-leaf" : "text-muted")}>{pct(x.apr)}</td>
                    <td className={cx("px-4 py-3 font-mono text-xs", x.net === null ? "text-muted" : x.net >= 0 ? "text-leaf" : "text-flesh")}>
                      {x.net === null ? "—" : `${x.net >= 0 ? "+" : ""}${(x.net * 100).toFixed(2)}%`}
                      {x.move !== null && <span className="block text-[12px] text-muted">{`price ${x.move >= 0 ? "+" : ""}${(x.move * 100).toFixed(1)}%`}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Spark v={x.hourly} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <span className={x.hourly.filter((h) => h > 0).length >= 18 ? "text-leaf" : x.hourly.filter((h) => h > 0).length >= 8 ? "text-text" : "text-flesh"}>{x.hourly.filter((h) => h > 0).length}</span>
                      <span className="text-muted"> / 24</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text">{x.liquidity > 0 ? `${(x.volume / x.liquidity).toFixed(2)}×` : "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text">{usd(x.liquidity)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text">
                      {usd(x.volume)}
                      <span className="block text-[12px] text-muted">{x.swaps} swaps · {Math.round(x.hours)}h</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-leaf">{usd(x.fees)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hidden > 0 && <p className="border-t border-line px-4 py-2.5 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{hidden} more pools read, each under {usd(MIN_SHOWN)} of liquidity: a yearly rate there means nothing</p>}
          </div>
        )}
      </Instrument>
      <LpPositions />
      </div>

      <div className="space-y-4 xl:sticky xl:top-[150px] xl:self-start">
        <Instrument code="E-02" title="Position planner" status={<Led tone="off" label="Nothing is signed" />} foot={<span>Your share of fees if volume follows the scenario, against holding the two tokens</span>}>
          {!r ? (
            <Idle className="min-h-48">Pick a pool</Idle>
          ) : (
            <div className="space-y-3 p-3">
              <div className="flex items-center gap-2">
                <TokenAvatar address={r.token} symbol={r.symbol} size={26} stock={isStock(r)} />
                <p className="font-mono text-sm text-text">
                  {r.symbol} / {r.base}
                </p>
                <span className="ml-auto font-mono text-[12px] text-muted">{pct(r.apr)} yearly</span>
              </div>
              <div>
                <label htmlFor="ep-amt" className="block text-[12px] text-muted">
                  You deposit, in USD, half in each token
                </label>
                <div className="ifield mt-1 h-11">
                  <input id="ep-amt" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" autoComplete="off" className="px-3 font-display text-xl text-text" />
                  <span className="flex items-center px-3 font-mono text-xs text-muted">USD</span>
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-1">
                  {["100", "500", "1000", "5000"].map((v) => (
                    <button key={v} type="button" onClick={() => setAmt(v)} className="h-7 rounded-md border border-line font-mono text-[12px] text-text hover:border-ui/60 hover:text-leaf">
                      {usd(Number(v))}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="flex justify-between text-[12px] text-muted">
                  <span>Hold for</span>
                  <span className="font-mono text-text">{days} days</span>
                </span>
                <input type="range" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full accent-[var(--ui)]" />
              </label>
              <label className="block">
                <span className="flex justify-between text-[12px] text-muted">
                  <span>{r.symbol} price by then</span>
                  <span className={cx("font-mono", move >= 1 ? "text-leaf" : "text-flesh")}>{`${move >= 1 ? "+" : ""}${Math.round((move - 1) * 100)}%`}</span>
                </span>
                <input type="range" min={0.2} max={3} step={0.05} value={move} onChange={(e) => setMove(Number(e.target.value))} className="w-full accent-[var(--ui)]" />
              </label>
              <div className="flex rounded-lg bg-[#181818] p-[3px] text-[12px]">
                {SCEN.map((x) => (
                  <button key={x.id} type="button" onClick={() => setScen(x.id)} className={cx("flex-1 rounded-md px-2 py-1", scen === x.id ? "bg-[#282828] text-text" : "text-muted hover:text-text")}>
                    {x.label}
                  </button>
                ))}
              </div>
              {sim && (
                <>
                  {/* the answer first: better or worse than just holding the two tokens */}
                  <div className={cx("rounded-xl border px-4 py-4", sim.net >= 0 ? "border-leaf/40 bg-leaf/[0.07]" : "border-flesh/40 bg-flesh/[0.07]")}>
                    <p className="text-[13px] text-text">Against simply holding</p>
                    <p className={cx("mt-1 font-display text-[44px] leading-none tabular-nums", sim.net >= 0 ? "text-leaf" : "text-flesh")}>{`${sim.net >= 0 ? "+" : "−"}${usd(Math.abs(sim.net))}`}</p>
                    <p className="mt-2 text-[13px] text-muted">
                      {sim.band
                        ? Number.isFinite(sim.band[1])
                          ? `Fees beat the price move while ${r.symbol} stays between ${Math.round((sim.band[0] - 1) * 100)}% and +${Math.round((sim.band[1] - 1) * 100)}%.`
                          : "Fees cover any price move over this time."
                        : "No fees in this scenario: any move is a loss."}
                    </p>
                    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line/60 pt-2 font-mono text-[13px]">
                      <span>
                        <span className="text-muted">fees</span> <span className="text-leaf">{`+${usd(sim.fees)}`}</span>
                      </span>
                      <span>
                        <span className="text-muted">price move</span> <span className="text-flesh">{`−${usd(Math.abs(sim.loss))}`}</span>
                      </span>
                      <span className="text-muted">{`${usd(sim.perDay)} a day · ${pct(sim.share)} of the pool`}</span>
                    </p>
                  </div>
                  <p className="rounded-lg border border-[#e3b341]/30 bg-[#e3b341]/[0.05] px-3 py-2 text-[13px] text-text">
                    <span className="text-[#e3b341]">Past, not promised.</span> Fees come from the volume you set above; a pool can be drained.
                  </p>
                  <Payoff f={sim.f} at={move} />
                </>
              )}
              <div className="flex flex-wrap gap-3">
                <Link href={`/app/trade/terminal?token=${r.token}`} className="font-medium text-[12px] uppercase tracking-[0.08em] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                  Chart →
                </Link>
                <Link href={`/app/trade/check?q=${r.token}`} className="font-medium text-[12px] uppercase tracking-[0.08em] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                  Check →
                </Link>
                <a href={`https://robinhoodchain.blockscout.com/address/${r.pair}`} target="_blank" rel="noreferrer" className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted hover:text-text">
                  Pool ↗
                </a>
              </div>
            </div>
          )}
        </Instrument>
        {r && r.price !== null && <p className="px-1 text-[12px] text-muted">{r.symbol} now ${fmtPx(r.price)} in this pool.</p>}
      </div>
    </div>
    </div>
  );
}
