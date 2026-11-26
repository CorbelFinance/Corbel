"use client";

/**
 * Wallet · Paper account, laid out as a trading desk: the account on top, a market watch with quick buys and one
 * order line on the left, the book (positions, equity, recent fills) on the right, all visible at once. Pretend USDG,
 * real fills: every order is a quote simulated at the latest block, so price impact and pool fees are the real ones. Positions are marked at the market price (the pairs index
 * across venues) or the last fill. Kept in this browser only; nothing is sent or signed.
 */
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { Bay, CountUp, SubTabs } from "./Bay";
import { short } from "./kit";
import { TokenAvatar } from "./TokenAvatar";
import { usd } from "./walletData";

type Pos = { token: string; symbol: string; qty: number; cost: number; last: number };
type Fill = { at: number; token: string; symbol: string; side: "buy" | "sell"; qty: number; usdg: number; impact: number | null };
type Book = { cash: number; start: number; pos: Record<string, Pos>; fills: Fill[]; curve: { at: number; eq: number }[] };
type Hot = { token: string; symbol: string; price: number | null; change: number | null; stock: boolean };
const KEY = "corbel.paper";
const START = 10_000;
const fresh = (): Book => ({ cash: START, start: START, pos: {}, fills: [], curve: [] });

function load(): Book {
  try {
    const b = JSON.parse(localStorage.getItem(KEY) ?? "null") as Book | null;
    return b && typeof b.cash === "number" ? b : fresh();
  } catch {
    return fresh();
  }
}
function save(b: Book) {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // storage off: the book lives for this visit only
  }
}

function Curve({ pts }: { pts: { at: number; eq: number }[] }) {
  if (pts.length < 2) return <p className="rounded-xl border border-dashed border-line py-6 text-center text-[12px] text-muted">The equity line starts after your first trade.</p>;
  const W = 600, H = 120;
  const lo = Math.min(...pts.map((p) => p.eq)), hi = Math.max(...pts.map((p) => p.eq));
  const X = (i: number) => (i / (pts.length - 1)) * W;
  const Y = (v: number) => H - 8 - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 16);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.eq).toFixed(1)}`).join("");
  const up = pts[pts.length - 1]!.eq >= pts[0]!.eq;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label="Paper account equity over trades">
      <path d={`${d}L${W},${H}L0,${H}Z`} fill={up ? "#6fe7a8" : "#ff6b6b"} fillOpacity="0.12" />
      <path d={d} fill="none" stroke={up ? "#6fe7a8" : "#ff6b6b"} strokeWidth="2" vectorEffect="non-scaling-stroke" className="draw-line" />
    </svg>
  );
}

export function PaperBook() {
  const [b, setB] = useState<Book>(fresh);
  const [hot, setHot] = useState<Hot[]>([]);
  const [token, setToken] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("500");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => setB(load()));
    fetch("/api/trending")
      .then((r) => r.json())
      .then((j: { rows?: { token: string; symbol: string | null; price?: number | null; liquidity?: number; change?: number | null }[]; stocks?: { token: string; symbol: string; price: number | null; change?: number | null }[] }) => {
        const rows = (j.rows ?? []).filter((r) => (r.liquidity ?? 0) > 20_000 && r.symbol !== "ETH").slice(0, 7).map((r) => ({ token: r.token, symbol: r.symbol ?? short(r.token), price: r.price ?? null, change: r.change ?? null, stock: false }));
        const st = (j.stocks ?? []).slice(0, 7).map((r) => ({ token: r.token, symbol: r.symbol, price: r.price, change: r.change ?? null, stock: true }));
        const all = [...st, ...rows.filter((r) => !st.some((x) => x.token === r.token))];
        setHot(all);
        setToken((t) => t || all[0]?.token || "");
      })
      .catch(() => undefined);
  }, []);

  // the list's price only when it is in the same range as the last fill: a price in other units would value a position
  // thousands of times over
  const sane = (px: number | null | undefined, last: number) => (px && px > 0 && (!(last > 0) || (px / last < 20 && last / px < 20)) ? px : last);
  const mark = (p: Pos) => sane(hot.find((h) => h.token.toLowerCase() === p.token.toLowerCase())?.price, p.last);
  const positions = Object.values(b.pos).filter((p) => p.qty > 0);
  const held = positions.reduce((s, p) => s + p.qty * mark(p), 0);
  const equity = b.cash + held;
  const pnl = equity - b.start;
  const symOf = (t: string) => hot.find((h) => h.token.toLowerCase() === t.toLowerCase())?.symbol ?? b.pos[t.toLowerCase()]?.symbol ?? (t ? short(t) : "");
  const sym = symOf(token);
  const have = b.pos[token.toLowerCase()];
  const sells = b.fills.filter((f) => f.side === "sell");

  const trade = async (tok: string, sd: "buy" | "sell", a: number) => {
    setMsg(null);
    const s = symOf(tok);
    if (!/^0x[0-9a-fA-F]{40}$/.test(tok) || !(a > 0)) return setMsg({ text: "Pick a token and an amount.", ok: false });
    if (sd === "buy" && a > b.cash) return setMsg({ text: `Only ${usd(b.cash)} of paper USDG left.`, ok: false });
    const pos = b.pos[tok.toLowerCase()];
    const qtySell = sd === "sell" ? (pos?.qty ?? 0) * Math.min(1, a / 100) : 0;
    if (sd === "sell" && !(qtySell > 0)) return setMsg({ text: `No ${s} in the paper book.`, ok: false });
    setBusy(`${tok}:${sd}:${a}`);
    try {
      const url = sd === "buy" ? `/api/quote?from=USDG&to=${tok}&amount=${a}` : `/api/quote?from=${tok}&to=USDG&amount=${Number(qtySell.toPrecision(10))}`;
      const res = await fetch(url);
      if (res.status === 429) return setMsg({ text: "Too many quotes in a minute. Wait a moment and try again.", ok: false });
      const q = (await res.json().catch(() => ({ best: null, impact: null, error: `The quote answered ${res.status}. Try again.` }))) as { routes?: { amountOut: string | null }[]; best: number | null; impact: number | null; to?: { decimals: number; symbol: string }; error?: string };
      const best = q.best !== null && q.routes ? q.routes[q.best] : null;
      if (!best?.amountOut || !q.to) return setMsg({ text: q.error ?? "No route fills this order at the latest block.", ok: false });
      const out = Number(best.amountOut) / 10 ** q.to.decimals;
      const next: Book = JSON.parse(JSON.stringify(b)) as Book;
      const k = tok.toLowerCase();
      const p = next.pos[k] ?? { token: tok, symbol: s, qty: 0, cost: 0, last: 0 };
      if (sd === "buy") {
        next.cash -= a;
        p.qty += out;
        p.cost += a;
        p.last = a / out;
        next.fills.unshift({ at: Date.now(), token: tok, symbol: s, side: sd, qty: out, usdg: a, impact: q.impact });
      } else {
        const frac = qtySell / p.qty;
        next.cash += out;
        p.cost -= p.cost * frac;
        p.qty -= qtySell;
        p.last = out / qtySell;
        next.fills.unshift({ at: Date.now(), token: tok, symbol: s, side: sd, qty: qtySell, usdg: out, impact: q.impact });
      }
      next.pos[k] = p;
      next.fills = next.fills.slice(0, 200);
      const eqNow = next.cash + Object.values(next.pos).reduce((acc, x) => acc + x.qty * sane(hot.find((h) => h.token.toLowerCase() === x.token.toLowerCase())?.price, x.last), 0);
      next.curve = [...(next.curve.length ? next.curve : [{ at: Date.now() - 1, eq: next.start }]), { at: Date.now(), eq: eqNow }].slice(-300);
      setB(next);
      save(next);
      setMsg({
        text: `${sd === "buy" ? "Bought" : "Sold"} ${(sd === "buy" ? out : qtySell).toLocaleString("en", { maximumFractionDigits: 4 })} ${s} for ${usd(sd === "buy" ? a : out)}${q.impact != null ? `, impact ${(q.impact * 100).toFixed(2)}%` : ""}.${q.impact != null && q.impact > 0.1 ? " The pool is thin: a real order this size would lose most of it." : ""}`,
        ok: true,
      });
    } catch {
      setMsg({ text: "No answer from the quote. Try again.", ok: false });
    } finally {
      setBusy(null);
    }
  };
  const reset = () => {
    const f = fresh();
    setB(f);
    save(f);
    setMsg({ text: "Paper book reset to ten thousand USDG.", ok: true });
  };
  const sorted = useMemo(() => [...positions].sort((x, y) => y.qty * mark(y) - y.cost - (x.qty * mark(x) - x.cost)), [positions, hot]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* the account */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["Equity", equity, "text-text", false],
            ["Profit and loss", pnl, pnl >= 0 ? "text-leaf" : "text-flesh", true],
            ["Paper USDG", b.cash, "text-text", false],
            ["In positions", held, "text-text", false],
          ] as const
        ).map(([k, val, c, signed]) => (
          <div key={k} className="bg-[#0f0f0f] px-4 py-3">
            <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{k}</p>
            <p className={cx("mt-1 text-[20px] tabular-nums", c)}>
              <CountUp value={val} fmt={(n) => `${signed && n > 0 ? "+" : ""}${usd(n)}`} />
            </p>
            {signed && <p className={cx("font-mono text-[12px]", c)}>{`${pnl >= 0 ? "+" : ""}${((pnl / b.start) * 100).toFixed(2)}%`}</p>}
          </div>
        ))}
        <div className="bg-[#0f0f0f] px-4 py-3">
          <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Trades</p>
          <p className="mt-1 text-[20px] tabular-nums text-text">{b.fills.length}</p>
          <p className="font-mono text-[12px] text-muted">{`${b.fills.length - sells.length} buys · ${sells.length} sells`}</p>
        </div>
        <div className="flex flex-col justify-between bg-[#0f0f0f] px-4 py-3">
          <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Kept in this browser</p>
          <button type="button" onClick={reset} className="mt-1 self-start rounded-lg border border-line px-3 py-1 text-[12px] text-text hover:border-flesh hover:text-flesh">
            Reset to ten thousand
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* the market */}
        <Bay tone="moss" kicker="Real quotes at the latest block, pretend money" title="Market watch" busy={!!busy} foot={<span>Every fill is a quote at the latest block: the real price impact and pool fee, no money moves.</span>}>
          <div className="px-5 pb-4">
            <div className="rounded-xl border border-line bg-[#0d0d0d] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 font-mono text-[13px] text-text">
                  {token && <TokenAvatar address={token} symbol={sym} size={20} />}
                  {sym || "Pick a market"}
                </span>
                <span className="ml-auto">
                  <SubTabs label="Side" value={side} onChange={(v) => (setSide(v), setAmt(v === "buy" ? "500" : "100"))} tabs={[{ id: "buy", label: "Buy" }, { id: "sell", label: "Sell" }]} />
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <label className="flex h-10 min-w-0 flex-1 items-center rounded-lg border border-line bg-[#090909] px-3 focus-within:border-ui/60">
                  <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" aria-label={side === "buy" ? "Spend, paper USDG" : "Percent of the position to sell"} className="w-full bg-transparent font-mono text-[15px] text-text outline-none" />
                  <span className="font-mono text-[12px] text-muted">{side === "buy" ? "USDG" : `% of ${have ? have.qty.toLocaleString("en", { maximumFractionDigits: 3 }) : "0"}`}</span>
                </label>
                {(side === "buy" ? [100, 500, 1000] : [25, 50, 100]).map((x) => (
                  <button key={x} type="button" onClick={() => setAmt(String(x))} className="h-10 rounded-lg border border-line px-2.5 font-mono text-[12px] text-text hover:border-ui/60">
                    {side === "buy" ? usd(x).replace(".00", "") : `${x}%`}
                  </button>
                ))}
                <button type="button" disabled={!!busy} onClick={() => void trade(token, side, Number(amt))} className={cx("h-10 rounded-lg px-4 text-[13px] font-semibold disabled:opacity-60", side === "buy" ? "bg-ui text-[#0b0b0b]" : "bg-flesh text-[#1a0508]")}>
                  {busy === `${token}:${side}:${Number(amt)}` ? "Filling…" : side === "buy" ? "Paper buy" : "Paper sell"}
                </button>
              </div>
              <input value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="Or any token address 0x…" spellCheck={false} aria-label="Token address" className="mt-2 h-8 w-full rounded-lg border border-line bg-[#090909] px-3 font-mono text-[12px] text-text outline-none focus:border-ui/60" />
              {msg && <p className={cx("pane-in mt-2 text-[12.5px]", msg.ok ? "text-text" : "text-flesh")}>{msg.text}</p>}
            </div>
            <table className="mt-3 w-full text-[12.5px]">
              <thead>
                <tr className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 text-left font-normal">Market</th>
                  <th className="py-2 text-right font-normal">Price</th>
                  <th className="py-2 text-right font-normal">24h</th>
                  <th className="py-2 text-right font-normal">Quick buy</th>
                </tr>
              </thead>
              <tbody>
                {!hot.length && (
                  <tr>
                    <td colSpan={4} className="caret py-6 font-mono text-[12px] text-muted">
                      Reading the busiest markets
                    </td>
                  </tr>
                )}
                {hot.map((h) => {
                  const on = h.token.toLowerCase() === token.toLowerCase();
                  return (
                    <tr key={h.token} onClick={() => setToken(h.token)} className={cx("cursor-pointer border-t border-[#1a1a1a]", on ? "bg-leaf/[0.06]" : "hover:bg-[#141414]")}>
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <TokenAvatar address={h.token} symbol={h.symbol} stock={h.stock} size={20} />
                          <span className="font-mono text-text">{h.symbol}</span>
                          {b.pos[h.token.toLowerCase()]?.qty ? <span className="rounded bg-leaf/10 px-1 font-mono text-[12px] text-leaf">held</span> : null}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-[#c9d6cf]">{h.price != null ? `$${h.price < 1 ? h.price.toPrecision(3) : h.price.toFixed(2)}` : "—"}</td>
                      <td className={cx("py-2 text-right tabular-nums", h.change == null ? "text-muted" : h.change >= 0 ? "text-leaf" : "text-flesh")}>{h.change == null ? "—" : `${h.change >= 0 ? "+" : ""}${h.change.toFixed(1)}%`}</td>
                      <td className="py-2 text-right">
                        <span className="inline-flex gap-1">
                          {[100, 500].map((x) => (
                            <button key={x} type="button" disabled={!!busy} onClick={(e) => (e.stopPropagation(), setToken(h.token), void trade(h.token, "buy", x))} className="rounded-md border border-line px-2 py-0.5 font-mono text-[12px] text-text hover:border-ui/60 hover:text-leaf disabled:opacity-50">
                              {busy === `${h.token}:buy:${x}` ? "…" : `+${usd(x).replace(".00", "")}`}
                            </button>
                          ))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Bay>

        {/* the book */}
        <Bay tone="violet" kicker="Stored in this browser only" title="Paper book">
          <div className="space-y-5 px-5 pb-5">
            <div>
              <p className="mb-2 flex items-baseline justify-between text-[12.5px] text-text">
                Positions
                <span className="font-mono text-[12px] text-muted">click one to sell</span>
              </p>
              {sorted.length ? (
                <ul className="space-y-1">
                  {sorted.map((p) => {
                    const val = p.qty * mark(p);
                    const g = val - p.cost;
                    return (
                      <li key={p.token}>
                        <button type="button" onClick={() => (setToken(p.token), setSide("sell"), setAmt("100"))} className="grid w-full grid-cols-[auto_minmax(0,1fr)_5.5rem_5.5rem] items-center gap-3 rounded-xl px-2 py-2 text-left text-[12.5px] hover:bg-(--bay-bg2)">
                          <TokenAvatar address={p.token} symbol={p.symbol} size={24} />
                          <span className="min-w-0">
                            <span className="block text-text">{p.symbol}</span>
                            <span className="block font-mono text-[12px] text-muted">{`${p.qty.toLocaleString("en", { maximumFractionDigits: 4 })} · cost ${usd(p.cost)}`}</span>
                          </span>
                          <span className="text-right tabular-nums text-text">{usd(val)}</span>
                          <span className={cx("text-right tabular-nums", g >= 0 ? "text-leaf" : "text-flesh")}>{`${g >= 0 ? "+" : ""}${usd(g)}`}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-line px-4 py-5 text-[12.5px] text-muted">No positions yet. Use a quick buy on the left: the fill is the real quote at the latest block.</p>
              )}
            </div>
            <div>
              <p className="mb-1 flex items-baseline justify-between text-[12.5px] text-text">
                Equity
                <span className="font-mono text-[12px] text-muted">after each trade</span>
              </p>
              <Curve pts={b.curve} />
            </div>
            <div>
              <p className="mb-2 flex items-baseline justify-between text-[12.5px] text-text">
                Recent fills
                <span className="font-mono text-[12px] text-muted">time UTC · impact</span>
              </p>
              {b.fills.length ? (
                <ul className="space-y-0.5">
                  {b.fills.slice(0, 6).map((f, i) => (
                    <li key={f.at + i} className="grid grid-cols-[3.2rem_2.4rem_minmax(0,1fr)_5rem_3.6rem] items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-(--bay-bg2)">
                      <span className="font-mono text-muted">{new Date(f.at).toISOString().slice(11, 16)}</span>
                      <span className={f.side === "buy" ? "text-leaf" : "text-flesh"}>{f.side === "buy" ? "Buy" : "Sell"}</span>
                      <span className="truncate text-text">{`${f.qty.toLocaleString("en", { maximumFractionDigits: 4 })} ${f.symbol}`}</span>
                      <span className="text-right tabular-nums text-text">{usd(f.usdg)}</span>
                      <span className="text-right tabular-nums text-[12px] text-muted">{f.impact != null ? `${(f.impact * 100).toFixed(2)}%` : "—"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-muted">Each fill lands here with its real price impact.</p>
              )}
            </div>
          </div>
        </Bay>
      </div>
    </div>
  );
}
