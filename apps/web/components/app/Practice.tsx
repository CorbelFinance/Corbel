"use client";

/**
 * Trade · Practice. $10,000 of paper USDG and the real chain: every buy and sell is quoted by the same router as a live
 * swap, at the latest block, with its price impact, and booked against the paper account. Nothing is signed, nothing
 * moves. Before a buy the token check runs, so practice also teaches checking first. Every trade carries a reason tag;
 * after 20 trades "your agent" (Agents · Learn) drafts a mandate from them. The account lives in this browser, and with
 * the wallet when it is signed in (/api/practice).
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument, Led } from "./kit";
import { PRACTICE_START, TAGS, TEACH_AT, USDG, bookBuy, bookSell, bookStats, fresh, loadBook, saveBook, syncBook, type Book, type Tag } from "@/lib/practice";

type Q = { to: { symbol: string; decimals: number }; from: { symbol: string; decimals: number }; block: string; routes: { hops: { venue: string }[]; amountOut: string | null; ok: boolean }[]; best: number | null; impact: number | null; error?: string };
type Check = { checks?: { id: string; name: string; result: "pass" | "warn" | "fail" | "unknown"; reason: string }[]; meta?: { symbol: string | null }; error?: string };
type Pick = { token: string; symbol: string; why: string };

const CORBEL = "0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1";
const usd = (n: number, d = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const amt = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(2)}K` : n.toLocaleString("en-US", { maximumFractionDigits: 4 }));
const dec = (n: number, d: number) => n.toFixed(Math.min(d, 18)).replace(/\.?0+$/, "") || "0";
const RES = { pass: "text-leaf border-leaf/40", warn: "text-amber border-amber/40", fail: "text-flesh border-flesh/50", unknown: "text-muted border-line" } as const;

export function Practice() {
  const [book, setBook] = useState<Book | null>(null);
  const [token, setToken] = useState("");
  const [picks, setPicks] = useState<Pick[]>([{ token: CORBEL, symbol: "CORBEL", why: "our token" }]);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [size, setSize] = useState("100");
  const [part, setPart] = useState(50);
  const [tag, setTag] = useState<Tag | null>(null);
  const [reason, setReason] = useState("");
  const [q, setQ] = useState<Q | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState<null | "quote" | "check" | "marks">(null);
  const [err, setErr] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, number | null>>({});

  useEffect(() => {
    // after mount only: the account is in this browser
    const b = loadBook();
    void Promise.resolve().then(() => setBook(b));
    // signed in: the newer of this browser's account and the wallet's
    void syncBook(b).then((s) => s !== b && setBook(s));
    fetch("/api/pulse")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { events?: { kind: string; token: string; symbol: string | null; pad: string | null }[] } | null) => {
        const fresh = (j?.events ?? []).filter((e) => e.kind !== "drained" && e.symbol).slice(0, 5).map((e) => ({ token: e.token, symbol: e.symbol!, why: e.kind === "launch" ? `new on ${e.pad ?? "a launchpad"}` : "just reached a DEX" }));
        setPicks((p) => [...p, ...fresh.filter((f) => !p.some((x) => x.token === f.token))]);
      })
      .catch(() => undefined);
  }, []);
  const commit = (b: Book) => {
    setBook(b);
    saveBook(b);
  };

  const addr = token.trim().toLowerCase();
  const valid = /^0x[0-9a-f]{40}$/.test(addr);
  const pos = book && valid ? book.positions[addr] : undefined;
  const stats = useMemo(() => (book ? bookStats(book, marks) : null), [book, marks]);

  async function choose(a: string) {
    setToken(a);
    setQ(null);
    setErr(null);
    setCheck(null);
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return;
    setBusy("check");
    try {
      const r = await fetch(`/api/token?q=${a}`);
      setCheck((await r.json()) as Check);
    } catch {
      setCheck({ error: "The check did not answer." });
    } finally {
      setBusy(null);
    }
  }

  async function quote() {
    if (!valid || !book) return;
    setErr(null);
    setQ(null);
    let url: string;
    if (side === "buy") {
      const n = Number(size);
      if (!(n > 0)) return setErr("Type an amount above zero.");
      if (n > book.cash) return setErr(`Your paper cash is ${usd(book.cash)}.`);
      url = `/api/quote?from=${USDG}&to=${addr}&amount=${dec(n, 6)}`;
    } else {
      if (!pos) return setErr("You hold none of this token on paper.");
      url = `/api/quote?from=${addr}&to=${USDG}&amount=${dec((pos.amount * part) / 100, pos.decimals)}`;
    }
    setBusy("quote");
    try {
      const j = (await (await fetch(url)).json()) as Q;
      if (j.error || j.best == null || !j.routes[j.best]?.ok || !j.routes[j.best]?.amountOut) setErr(j.error ?? "No route fills this right now.");
      else setQ(j);
    } catch {
      setErr("The quote did not answer. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function fill() {
    if (!q || !book || !tag || q.best == null) return;
    const r = q.routes[q.best]!;
    const out = Number(r.amountOut) / 10 ** q.to.decimals;
    const fails = check?.checks?.filter((c) => c.result === "fail").map((c) => c.name);
    const venues = r.hops.map((h) => h.venue);
    if (side === "buy") {
      const n = Number(size);
      const nb = bookBuy(book, { token: addr, symbol: q.to.symbol, usd: n, amount: out, price: n / out, impact: q.impact, block: q.block, venues, tag, reason: reason.trim() || undefined, fails });
      nb.positions[addr] = { ...nb.positions[addr]!, decimals: q.to.decimals };
      commit(nb);
    } else if (pos) {
      const sold = (pos.amount * part) / 100;
      commit(bookSell(book, { token: addr, symbol: pos.symbol, usd: out, amount: sold, price: out / sold, impact: q.impact, block: q.block, venues, tag, reason: reason.trim() || undefined, fails }));
    }
    setQ(null);
    setReason("");
    setTag(null);
  }

  async function refreshMarks() {
    if (!book) return;
    setBusy("marks");
    const next: Record<string, number | null> = {};
    for (const p of Object.values(book.positions).slice(0, 12)) {
      try {
        const j = (await (await fetch(`/api/quote?from=${p.token}&to=${USDG}&amount=${dec(p.amount, p.decimals)}`)).json()) as Q;
        const r = j.best != null ? j.routes[j.best] : null;
        next[p.token] = r?.ok && r.amountOut ? Number(r.amountOut) / 1e6 : 0;
      } catch {
        next[p.token] = null;
      }
    }
    setMarks(next);
    setBusy(null);
  }

  if (!book || !stats) return <p className="caret p-5 font-mono text-[13px] text-muted">Opening your practice account</p>;
  const best = q && q.best != null ? q.routes[q.best] : null;
  const out = best?.amountOut ? Number(best.amountOut) / 10 ** (q?.to.decimals ?? 18) : null;
  const fails = check?.checks?.filter((c) => c.result === "fail") ?? [];
  const taught = Math.min(book.trades.length, TEACH_AT);

  return (
    <div className="space-y-4">
      {/* the account */}
      <section className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-5">
        {[
          ["Equity", usd(stats.equity), Object.keys(marks).length ? "positions at live quotes" : "positions at cost until refreshed"],
          ["Return", `${stats.ret >= 0 ? "+" : ""}${(stats.ret * 100).toFixed(2)}%`, `from ${usd(PRACTICE_START, 0)} paper`],
          ["Paper cash", usd(book.cash), "USDG on paper"],
          ["Trades", String(stats.trades), `${stats.closed} closed`],
          ["Win rate", stats.winRate == null ? "—" : `${Math.round(stats.winRate * 100)}%`, `realized ${stats.realized >= 0 ? "+" : ""}${usd(stats.realized)}`],
        ].map(([k, v, s], i) => (
          <div key={k} className="bg-bg p-4">
            <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{k}</p>
            <p className={cx("mt-1 font-mono text-[22px] tabular-nums", i === 1 ? (stats.ret >= 0 ? "text-leaf" : "text-flesh") : "text-text")}>{v}</p>
            <p className="mt-0.5 text-[12px] text-muted">{s}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Instrument code="T-50" title="Practice ticket" busy={busy === "quote" || busy === "check"} status={<Led tone="on" label="Paper · real prices" />} foot={<span>Quoted by the same router as a live swap, at the latest block. Booked on paper: nothing is signed and no funds move.</span>}>
          <div className="space-y-4 p-4">
            <div>
              <label htmlFor="pr-t" className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Token</label>
              <input id="pr-t" value={token} onChange={(e) => void choose(e.target.value.trim())} placeholder="Token address 0x…" spellCheck={false} className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-[13px] text-text placeholder:text-muted focus:border-leaf focus:outline-none" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {picks.map((p) => (
                  <button key={p.token} type="button" onClick={() => void choose(p.token)} className={cx("rounded-full border px-2.5 py-1 text-[12.5px]", addr === p.token ? "border-leaf text-leaf" : "border-line text-text hover:border-[#4a4a4a]")} title={p.why}>
                    {`$${p.symbol}`} <span className="text-muted">{p.why}</span>
                  </button>
                ))}
              </div>
            </div>

            {valid && (
              <div className="rounded-xl border border-line p-3">
                <p className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                  <span>Check first</span>
                  <Link href={`/app/trust/check?q=${addr}`} className="normal-case tracking-normal text-leaf underline underline-offset-4">full check ↗</Link>
                </p>
                {busy === "check" ? (
                  <p className="caret mt-2 font-mono text-[12.5px] text-muted">Reading the chain</p>
                ) : check?.checks ? (
                  <>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {check.checks.map((c) => (
                        <span key={c.id} title={c.reason} className={cx("rounded-md border px-2 py-0.5 font-mono text-[12px]", RES[c.result])}>
                          {c.name}
                        </span>
                      ))}
                    </div>
                    {fails.length > 0 && <p className="mt-2 text-[12.5px] text-flesh">{`${fails.length} red flag${fails.length > 1 ? "s" : ""}: ${fails.map((f) => f.name).join(", ")}. On paper you can still buy, and see what happens.`}</p>}
                  </>
                ) : (
                  <p className="mt-2 text-[12.5px] text-muted">{check?.error ?? "Pick a token to read it."}</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {(["buy", "sell"] as const).map((s) => (
                <button key={s} type="button" onClick={() => (setSide(s), setQ(null))} className={cx("h-9 rounded-lg border px-4 text-[13px] font-semibold", side === s ? (s === "buy" ? "border-leaf bg-leaf/10 text-leaf" : "border-flesh bg-flesh/10 text-flesh") : "border-line text-muted")}>
                  {s === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
              {side === "buy" ? (
                <>
                  <input value={size} onChange={(e) => (setSize(e.target.value.replace(/[^\d.]/g, "")), setQ(null))} inputMode="decimal" aria-label="USDG to spend" className="h-9 w-28 rounded-lg border border-line bg-bg px-3 font-mono text-[13px] text-text focus:border-leaf focus:outline-none" />
                  {[50, 100, 250, 1000].map((n) => (
                    <button key={n} type="button" onClick={() => (setSize(String(n)), setQ(null))} className="h-9 rounded-lg border border-line px-2.5 font-mono text-[12.5px] text-muted hover:text-text">{`$${n}`}</button>
                  ))}
                </>
              ) : (
                [25, 50, 100].map((n) => (
                  <button key={n} type="button" onClick={() => (setPart(n), setQ(null))} className={cx("h-9 rounded-lg border px-3 font-mono text-[12.5px]", part === n ? "border-text text-text" : "border-line text-muted")}>{`${n}%`}</button>
                ))
              )}
            </div>
            {side === "sell" && valid && <p className="text-[12.5px] text-muted">{pos ? `You hold ${amt(pos.amount)} ${pos.symbol} on paper, cost ${usd(pos.cost)}.` : "You hold none of this token on paper."}</p>}

            <div>
              <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Why this trade</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {TAGS.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTag(t.id)} className={cx("rounded-full border px-2.5 py-1 text-[12.5px]", tag === t.id ? "border-leaf bg-leaf/10 text-leaf" : "border-line text-muted hover:text-text")}>
                    {t.label}
                  </button>
                ))}
              </div>
              <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 140))} placeholder="One line, optional: kept with your practice account" className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-text placeholder:text-muted focus:border-leaf focus:outline-none" />
            </div>

            {err && <p className="text-[13px] text-flesh">{err}</p>}
            {q && best && out != null && (
              <div className="rounded-xl border border-leaf/30 bg-leaf/[0.04] p-3 font-mono text-[13px]">
                <p className="text-text">{side === "buy" ? `${usd(Number(size))} → ${amt(out)} ${q.to.symbol}` : `${amt(((pos?.amount ?? 0) * part) / 100)} ${pos?.symbol} → ${usd(out)}`}</p>
                <p className="mt-1 text-[12px] text-muted">{`route ${best.hops.map((h) => h.venue).join(" → ")} · impact ${q.impact != null ? `${(q.impact * 100).toFixed(2)}%` : "—"} · block ${Number(q.block).toLocaleString("en-US")}`}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={!valid || busy !== null} onClick={() => void quote()} className="ibtn-ghost h-11 px-5">{busy === "quote" ? "Quoting at the latest block…" : "Quote"}</button>
              <button type="button" disabled={!q || !tag} onClick={fill} className="ibtn h-11 px-5">{side === "buy" ? "Buy on paper" : "Sell on paper"}</button>
              {q && !tag && <span className="text-[12.5px] text-amber">Pick why, then fill.</span>}
            </div>
          </div>
        </Instrument>

        <div className="space-y-4">
          <Instrument code="T-51" title="Your agent is watching" status={<Led tone={taught >= TEACH_AT ? "on" : "off"} label={`${taught} of ${TEACH_AT} trades`} />} foot={<span>From your practice trades the agent drafts a mandate: what you trade, how big, how much slippage, which hours.</span>}>
            <div className="p-4">
              <div className="h-2 overflow-hidden rounded-full bg-[#1d1d1d]">
                <i className="block h-full rounded-full bg-leaf transition-all" style={{ width: `${(taught / TEACH_AT) * 100}%` }} />
              </div>
              <p className="mt-3 text-[13.5px] text-muted">{taught >= TEACH_AT ? "Enough to draft your agent's rules." : `${TEACH_AT - taught} more trade${TEACH_AT - taught === 1 ? "" : "s"} and your agent drafts its rules from how you trade.`}</p>
              <Link href="/app/agents/learn" className="mt-3 inline-flex text-[13px] text-leaf underline underline-offset-4">{taught >= TEACH_AT ? "Open your agent's draft →" : "See what it learns →"}</Link>
            </div>
          </Instrument>

          <Instrument code="T-52" title="Positions" busy={busy === "marks"} status={<Led tone={Object.keys(book.positions).length ? "on" : "off"} label={`${Object.keys(book.positions).length} open`} />}>
            {Object.keys(book.positions).length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                      {["Token", "Holding", "Cost", "Now", "P&L"].map((h) => (
                        <th key={h} scope="col" className="px-4 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(book.positions).map((p) => {
                      const now = marks[p.token];
                      const pl = now != null ? now - p.cost : null;
                      return (
                        <tr key={p.token} className="cursor-pointer border-b border-line/50 hover:bg-white/[0.02]" onClick={() => (setSide("sell"), void choose(p.token))}>
                          <td className="px-4 py-2 font-mono text-text">{p.symbol}</td>
                          <td className="px-4 py-2 font-mono text-muted">{amt(p.amount)}</td>
                          <td className="px-4 py-2 font-mono text-text">{usd(p.cost)}</td>
                          <td className="px-4 py-2 font-mono text-text">{now == null ? "—" : usd(now)}</td>
                          <td className={cx("px-4 py-2 font-mono", pl == null ? "text-muted" : pl >= 0 ? "text-leaf" : "text-flesh")}>{pl == null ? "—" : `${pl >= 0 ? "+" : ""}${usd(pl)}`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-4 text-[13.5px] text-muted">No paper positions yet. Pick a token and buy on paper.</p>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-line p-3">
              <button type="button" disabled={busy !== null || !Object.keys(book.positions).length} onClick={() => void refreshMarks()} className="ibtn-ghost h-9 px-3">{busy === "marks" ? "Quoting each position…" : "Value at live quotes"}</button>
              <button type="button" onClick={() => confirm(`Start over with ${usd(PRACTICE_START, 0)} of paper USDG? Your practice trades here will be cleared.`) && (commit(fresh()), setMarks({}))} className="text-[12.5px] text-muted underline underline-offset-4 hover:text-text">Reset account</button>
            </div>
          </Instrument>
        </div>
      </div>

      <Instrument code="T-53" title="Journal" status={<Led tone={book.trades.length ? "on" : "off"} label={`${book.trades.length} trades`} />} foot={<span>Your reasons are kept with your practice account: in this browser, and with your wallet when you are signed in. Red flags are what the token check found at the time of the trade.</span>}>
        {book.trades.length ? (
          <div className="max-h-[26rem] overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
              <thead className="sticky top-0 bg-bg">
                <tr className="border-b border-line font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                  {["When", "Side", "Token", "Amount", "USDG", "Why", "Result"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {book.trades.map((t) => (
                  <tr key={t.id} className="border-b border-line/50 align-top">
                    <td className="px-4 py-2 font-mono text-[12px] text-muted">{new Date(t.at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className={cx("px-4 py-2 font-mono", t.side === "buy" ? "text-leaf" : "text-flesh")}>{t.side}</td>
                    <td className="px-4 py-2 font-mono text-text">
                      {t.symbol}
                      {t.fails?.length ? <span className="ml-2 text-[12px] text-flesh" title={t.fails.join(", ")}>{`${t.fails.length} flag${t.fails.length > 1 ? "s" : ""}`}</span> : null}
                    </td>
                    <td className="px-4 py-2 font-mono text-muted">{amt(t.amount)}</td>
                    <td className="px-4 py-2 font-mono text-text">{usd(t.usd)}</td>
                    <td className="px-4 py-2 text-[12.5px] text-muted">
                      {TAGS.find((x) => x.id === t.tag)?.label}
                      {t.reason && <span className="block text-[12px] text-[#7d8a83]">{t.reason}</span>}
                    </td>
                    <td className={cx("px-4 py-2 font-mono", t.pnl == null ? "text-muted" : t.pnl >= 0 ? "text-leaf" : "text-flesh")}>{t.pnl == null ? "open" : `${t.pnl >= 0 ? "+" : ""}${usd(t.pnl)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-[13.5px] text-muted">Your trades will show here with why you made them and how they turned out.</p>
        )}
      </Instrument>
    </div>
  );
}
