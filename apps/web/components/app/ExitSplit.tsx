"use client";

/**
 * Trade · Sell in parts. One large sell against the same sell cut into parts, each part simulated at the
 * latest block. In a thin pool one big sell pays its own price impact; parts pay less each, if other buyers
 * bring the pool back between them. The curve shows what each split would pay, the plan spaces the parts out
 * in time (with optional jitter so the pattern is less obvious), and the risk line says what can go wrong.
 */
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { Bay, CountUp, SubTabs } from "./Bay";
import { short } from "./kit";
import { TokenAvatar } from "./TokenAvatar";

type Q = { to: { decimals: number; symbol: string }; routes?: { amountOut: string | null }[]; best: number | null; impact: number | null; block?: string; error?: string };
const PARTS = [1, 2, 3, 5, 8, 12] as const;
const units = (raw: string, d: number) => Number(raw) / 10 ** d;
const fmt = (v: number, sym: string) => `${v.toLocaleString("en", { maximumFractionDigits: v < 1 ? 6 : 2 })} ${sym}`;
/** A difference as a percentage, precise enough that small gaps do not read as zero. */
const pctD = (v: number) => (Math.abs(v) < 0.000005 ? "same" : `${v > 0 ? "+" : "-"}${(Math.abs(v) * 100).toFixed(Math.abs(v) < 0.001 ? 3 : 2)}%`);
const JIT = { off: 0, light: 0.2, heavy: 0.5 } as const;
/** Same plan every time for the same inputs: a small seeded generator, not Math.random. */
const rnd = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);

export function ExitSplit() {
  const [hot, setHot] = useState<{ token: string; symbol: string; price: number | null; liquidity: number }[]>([]);
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("1000");
  const [to, setTo] = useState<"USDG" | "ETH">("USDG");
  const [n, setN] = useState<(typeof PARTS)[number]>(5);
  const [gap, setGap] = useState(30);
  const [jit, setJit] = useState<keyof typeof JIT>("light");
  const [q, setQ] = useState<Record<number, Q | null> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/trending")
      .then((r) => r.json())
      .then((j: { rows?: { token: string; symbol: string | null; price?: number | null; liquidity?: number }[] }) => {
        const h = (j.rows ?? [])
          .filter((r) => r.symbol !== "ETH" && r.symbol !== "WETH")
          .slice(0, 8)
          .map((r) => ({ token: r.token, symbol: r.symbol ?? short(r.token), price: r.price ?? null, liquidity: r.liquidity ?? 0 }));
        setHot(h);
        // start on the busiest token with a real pool behind it, about a thousand dollars of it
        const top = h.find((x) => x.liquidity > 50_000) ?? h[0];
        if (top) {
          setToken((t) => t || top.token);
          if (top.price) setAmount(String(Number((1000 / top.price).toPrecision(3))));
        }
      })
      .catch(() => undefined);
  }, []);

  const run = async () => {
    const a = Number(amount);
    if (!/^0x[0-9a-fA-F]{40}$/.test(token) || !(a > 0)) return;
    setBusy(true);
    const got: Record<number, Q | null> = {};
    setQ({});
    // three quotes at a time
    let next = 0;
    const worker = async () => {
      while (next < PARTS.length) {
        const k = PARTS[next++]!;
        const part = Number((a / k).toPrecision(8));
        try {
          got[k] = (await fetch(`/api/quote?from=${token}&to=${to}&amount=${part}`).then((r) => r.json())) as Q;
        } catch {
          got[k] = null;
        }
        setQ({ ...got });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(false);
  };

  // compare once on its own as soon as the first token and amount are in, so the chart is never an empty box
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    if (auto || !token || !(Number(amount) > 0)) return;
    void Promise.resolve().then(() => {
      setAuto(true);
      void run();
    });
  }, [auto, token, amount]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = hot.find((h) => h.token.toLowerCase() === token.toLowerCase());
  const sym = cur?.symbol ?? (token ? short(token) : "token");
  const worth = cur?.price && Number(amount) > 0 ? cur.price * Number(amount) : null;
  const pts = useMemo(
    () =>
      PARTS.map((k) => {
        const x = q?.[k];
        const b = x && x.best !== null && x.routes ? x.routes[x.best] : null;
        const per = b?.amountOut ? units(b.amountOut, x!.to.decimals) : null;
        return { k, per, total: per === null ? null : per * k, impact: x?.impact ?? null, sym: x?.to.symbol ?? to };
      }),
    [q, to],
  );
  const one = pts[0]!.total;
  const sel = pts.find((p) => p.k === n)!;
  const best = pts.reduce<(typeof pts)[number] | null>((m, p) => (p.total !== null && (!m || p.total > m.total!) ? p : m), null);
  const maxT = Math.max(1e-12, ...pts.map((p) => p.total ?? 0));
  const minT = Math.min(...pts.filter((p) => p.total !== null).map((p) => p.total!), maxT);

  const plan = useMemo(() => {
    const r = rnd(n * 7919 + gap * 31 + JIT[jit] * 1000);
    const out: number[] = [];
    let t = 0;
    for (let i = 0; i < n; i++) {
      if (i) t += gap * (1 + (r() * 2 - 1) * JIT[jit]);
      out.push(Math.round(t));
    }
    return out;
  }, [n, gap, jit]);
  const span = plan[plan.length - 1] ?? 0;

  return (
    <Bay
      tone="violet"
      kicker="One big sell pays its own impact"
      title="Sell in parts"
      busy={busy}
      right={<span className="text-[12px] text-muted">Simulated at the latest block · nothing is signed</span>}
      foot={<span>Parts only pay more if other buyers bring the price back between them. If the price keeps falling, waiting costs more than the impact saved.</span>}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        className="mx-5 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--bay-edge)] bg-[var(--bay-bg2)] p-2"
      >
        <span className="px-2 text-[13px] text-muted">Sell</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" aria-label="Amount to sell" className="h-10 w-32 rounded-xl bg-transparent px-2 text-right tabular-nums text-[18px] text-text outline-none" />
        <div className="flex h-10 min-w-[15rem] flex-1 items-center gap-2 rounded-xl border border-[var(--bay-edge)] bg-[var(--bay-bg)] pl-2 focus-within:border-[var(--bay-acc)]">
          {token && <TokenAvatar address={token} symbol={sym} size={22} />}
          <span className="text-[13px] font-semibold text-text">{sym}</span>
          <input value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="Token address 0x…" spellCheck={false} aria-label="Token address" className="h-full min-w-0 flex-1 bg-transparent pr-2 font-mono text-[12px] text-muted outline-none focus:text-text" />
        </div>
        {worth !== null && <span className="font-mono text-[12px] text-muted">{`≈ $${worth.toLocaleString("en", { maximumFractionDigits: worth < 10 ? 2 : 0 })}`}</span>}
        <span className="px-1 text-[13px] text-muted">for</span>
        <SubTabs label="Receive" value={to} onChange={setTo} tabs={[{ id: "USDG", label: "USDG" }, { id: "ETH", label: "ETH" }]} />
        <button type="submit" disabled={busy} className="bay-btn">
          {busy ? "Simulating…" : "Compare splits →"}
        </button>
      </form>
      {hot.length > 0 && (
        <div className="mx-5 mt-2 flex flex-wrap gap-1.5">
          {hot.map((h) => (
            <button key={h.token} type="button" onClick={() => (setToken(h.token), h.price && setAmount(String(Number((1000 / h.price).toPrecision(3)))), setQ(null))} aria-pressed={token.toLowerCase() === h.token.toLowerCase()} className="bay-ghost !rounded-full !py-0.5 !pl-0.5">
              <TokenAvatar address={h.token} symbol={h.symbol} size={18} />
              {h.symbol}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid border-t border-[var(--bay-edge)] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* the curve: total received by number of parts */}
        <div className="min-w-0 px-5 py-4">
          <p className="text-[12.5px] text-text">What the whole sell pays, by number of parts</p>
          {!q ? (
            <p className="py-16 text-center text-[13px] text-muted">Pick a token and an amount, then compare. Six splits are simulated, three at a time.</p>
          ) : !busy && pts.every((p) => p.total === null) ? (
            <p className="py-16 text-center text-[13px] text-muted">{`No route Corbel can simulate sells ${sym} for ${to}. Its pool may sit on a venue the router does not read yet.`}</p>
          ) : (
            <div className="mt-3 grid h-52 grid-cols-6 items-end gap-3">
              {pts.map((p, i) => {
                const h = p.total === null ? 0 : 12 + ((p.total - minT) / Math.max(1e-12, maxT - minT)) * 88;
                return (
                  <button key={p.k} type="button" onClick={() => setN(p.k)} className="group flex h-full flex-col items-center justify-end gap-1.5" aria-pressed={n === p.k}>
                    <span className="font-mono text-[12px] text-muted">{p.total === null ? (q[p.k] === undefined ? "…" : "—") : one ? pctD((p.total - one) / one) : ""}</span>
                    <span className={cx("stack-in w-full rounded-t-lg transition-colors", n === p.k ? "bg-[var(--bay-acc)] shadow-[0_0_14px_var(--bay-acc)]" : best?.k === p.k ? "bg-[color-mix(in_srgb,var(--bay-acc)_55%,transparent)]" : "bg-[var(--bay-dim)] group-hover:bg-[color-mix(in_srgb,var(--bay-acc)_40%,transparent)]")} style={{ height: `${h}%`, animationDelay: `${i * 0.05}s` }} />
                    <span className={cx("text-[12px]", n === p.k ? "text-text" : "text-muted")}>{p.k === 1 ? "one sell" : `${p.k} parts`}</span>
                  </button>
                );
              })}
            </div>
          )}
          {q && best && !busy && <p className="mt-3 text-[12px] text-muted">{best.k === 1 ? "Here one sell pays the most: the pool is deep enough for this size." : `The most at ${best.k} parts. Bars start from the lowest result, so small gaps look tall.`}</p>}
          {/* the same six splits as numbers: what each pays, and what the wait between parts earns per hour */}
          {q && one !== null && !busy && (
            <table className="mt-4 w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-[var(--bay-edge)] text-[12px] text-muted">
                  {["Parts", "Each part", "Whole sell", "Impact each", "Against one sell", "Per hour waited"].map((h, i) => (
                    <th key={h} className={cx("py-1.5 font-normal", i > 0 && "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {pts.map((p) => {
                  const diff = p.total !== null ? p.total - one : null;
                  const hours = ((p.k - 1) * gap) / 60;
                  return (
                    <tr key={p.k} onClick={() => setN(p.k)} className={cx("cursor-pointer border-b border-[var(--bay-edge)]/50 last:border-0", n === p.k ? "text-text" : "text-muted hover:text-text")}>
                      <td className="py-1.5">{p.k === 1 ? "one sell" : `${p.k} parts`}</td>
                      <td className="py-1.5 text-right">{p.per === null ? "—" : fmt(p.per, p.sym)}</td>
                      <td className="py-1.5 text-right">{p.total === null ? "—" : fmt(p.total, p.sym)}</td>
                      <td className="py-1.5 text-right">{p.impact === null ? "—" : `${(p.impact * 100).toFixed(2)}%`}</td>
                      <td className={cx("py-1.5 text-right", diff !== null && diff > 0 ? "text-leaf" : diff !== null && diff < 0 ? "text-flesh" : "")}>{diff === null || p.k === 1 ? "—" : `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff), p.sym)}`}</td>
                      <td className="py-1.5 text-right">{diff === null || p.k === 1 || hours <= 0 ? "—" : `${fmt(diff / hours, p.sym)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* the chosen split */}
        <div className="border-t border-[var(--bay-edge)] bg-[color-mix(in_srgb,var(--bay-bg2)_60%,transparent)] px-5 py-4 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] text-text">{n === 1 ? "One sell" : `${n} parts`}</p>
            <SubTabs label="Parts" value={String(n) as `${(typeof PARTS)[number]}`} onChange={(v) => setN(Number(v) as (typeof PARTS)[number])} tabs={PARTS.map((k) => ({ id: String(k) as `${(typeof PARTS)[number]}`, label: String(k) }))} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ["You get in total", sel.total === null ? "—" : fmt(sel.total, sel.sym)],
              ["Each part", sel.per === null ? "—" : fmt(sel.per, sel.sym)],
              ["Impact per part", sel.impact === null ? "—" : `${(sel.impact * 100).toFixed(2)}%`],
              ["Against one sell", sel.total === null || !one ? "—" : `${sel.total >= one ? "+" : ""}${fmt(sel.total - one, sel.sym)}`],
            ].map(([k, v], i) => (
              <div key={k} className="rounded-xl bg-[var(--bay-bg)] px-3 py-2">
                <p className="text-[12px] text-muted">{k}</p>
                <p className={cx("mt-0.5 truncate font-mono text-[14px]", i === 3 && sel.total !== null && one ? (sel.total >= one ? "text-leaf" : "text-flesh") : "text-text")}>{i === 0 && sel.total !== null ? <CountUp value={sel.total} fmt={(x) => fmt(x, sel.sym)} /> : v}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="flex justify-between text-[12px] text-muted">
                Time between parts
                <span className="font-mono text-[var(--bay-acc)]">{`${gap} min`}</span>
              </span>
              <input type="range" min={5} max={240} step={5} value={gap} onChange={(e) => setGap(Number(e.target.value))} className="mt-1 w-full" />
            </label>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted">Timing jitter</span>
              <SubTabs label="Jitter" value={jit} onChange={setJit} tabs={[{ id: "off", label: "Off" }, { id: "light", label: "Light" }, { id: "heavy", label: "Heavy" }]} />
            </div>
            {/* the plan as a timeline */}
            <div className="relative h-14 rounded-xl bg-[var(--bay-bg)] px-3">
              <span className="absolute inset-x-3 top-1/2 h-px bg-[var(--bay-edge)]" />
              {plan.map((t, i) => (
                <span key={i} className="tile-in absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `calc(0.75rem + ${span ? (t / span) * 100 : 50}% * 0.94)`, animationDelay: `${i * 0.04}s` }}>
                  <span className="h-3 w-3 rounded-full border-2 border-[var(--bay-acc)] bg-[var(--bay-bg)]" />
                  {(i === 0 || i === plan.length - 1) && <span className="absolute top-4 whitespace-nowrap font-mono text-[12px] text-muted">{i === 0 ? "now" : span >= 120 ? `+${(t / 60).toFixed(1)} h` : `+${t} min`}</span>}
                </span>
              ))}
            </div>
            <p className="text-[12px] text-muted">{n === 1 ? "One sell, now." : `${n} sells over ${span >= 120 ? `${(span / 60).toFixed(1)} hours` : `${span} minutes`}. Set them as a TWAP order once Orders opens.`}</p>
          </div>
        </div>
      </div>
    </Bay>
  );
}
