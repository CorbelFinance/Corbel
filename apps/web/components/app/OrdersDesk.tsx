"use client";

/**
 * Orders: limit buy, take profit, stop, DCA and TWAP, kept in this browser. While Corbel is open the page reads each
 * token's price once a minute; an order whose price is reached (or whose next slice is due) turns ready, and Fill opens
 * the swap with the amounts filled in for your wallet to sign. Nothing is held for you: orders that fill on their own
 * from escrow come with the Orders contract.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument } from "./kit";

type Kind = "limit" | "takeprofit" | "stop" | "dca" | "twap";
type Order = {
  id: string;
  kind: Kind;
  token: string;
  symbol: string;
  /** USD price that triggers a limit, take profit or stop */
  price?: number;
  /** USDG for a buy slice, tokens for a sell slice */
  amount: number;
  side: "buy" | "sell";
  /** DCA / TWAP: slices in all, minutes between them, slices done */
  parts?: number;
  every?: number;
  done: number;
  next?: number;
  created: number;
  state: "waiting" | "ready" | "done" | "cancelled";
};

const KEY = "corbel.orders.v1";
const KINDS: { id: Kind; label: string; line: string }[] = [
  { id: "limit", label: "Limit buy", line: "Buy when the price falls to your level" },
  { id: "takeprofit", label: "Take profit", line: "Sell when the price rises to your level" },
  { id: "stop", label: "Stop", line: "Sell when the price falls to your level" },
  { id: "dca", label: "DCA", line: "Buy the same amount on a schedule" },
  { id: "twap", label: "TWAP", line: "Split one big trade into timed parts" },
];
const load = (): Order[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Order[];
  } catch {
    return [];
  }
};
const save = (o: Order[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* private window: orders last until the tab closes */
  }
};
const fmt = (v: number) => (v >= 1 ? v.toLocaleString("en-US", { maximumFractionDigits: 4 }) : v.toPrecision(4));

export function OrdersDesk() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [now, setNow] = useState(0);
  const [kind, setKind] = useState<Kind>("limit");
  const [token, setToken] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [parts, setParts] = useState("5");
  const [every, setEvery] = useState("60");
  const [twapSide, setTwapSide] = useState<"buy" | "sell">("sell");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setOrders(load());
      setNow(Date.now());
    });
  }, []);
  const update = useCallback((f: (o: Order[]) => Order[]) => setOrders((cur) => {
    const next = f(cur);
    save(next);
    return next;
  }), []);

  // prices for the tokens with open orders, once a minute
  const open = useMemo(() => orders.filter((o) => o.state === "waiting" || o.state === "ready"), [orders]);
  const tokens = useMemo(() => [...new Set(open.map((o) => o.token))], [open]);
  useEffect(() => {
    let off = false;
    const read = async () => {
      setNow(Date.now());
      for (const t of tokens) {
        const j = (await fetch(`/api/market?token=${t}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { price: number | null; base: { usd: number } } | null;
        if (!off) setPrices((p) => ({ ...p, [t]: j?.price != null ? j.price * (j.base?.usd || 1) : (p[t] ?? null) }));
      }
    };
    void read();
    const id = setInterval(read, 60_000);
    return () => {
      off = true;
      clearInterval(id);
    };
  }, [tokens]);

  // an order turns ready when its price is reached or its next slice is due
  useEffect(() => {
    if (!now) return;
    const due = (o: Order) => {
      const p = prices[o.token];
      if (o.kind === "dca" || o.kind === "twap") return (o.next ?? 0) <= now;
      if (p == null || o.price == null) return false;
      return o.kind === "limit" || o.kind === "stop" ? p <= o.price : p >= o.price;
    };
    const changed = orders.some((o) => o.state === "waiting" && due(o));
    if (changed) void Promise.resolve().then(() => update((cur) => cur.map((o) => (o.state === "waiting" && due(o) ? { ...o, state: "ready" } : o))));
  }, [prices, now, orders, update]);

  async function add() {
    setErr(null);
    const t = token.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(t)) return setErr("Paste the token's contract address (0x…).");
    const a = Number(amount);
    if (!(a > 0)) return setErr("Enter an amount above zero.");
    const p = Number(price);
    const timed = kind === "dca" || kind === "twap";
    if (!timed && !(p > 0)) return setErr("Enter the trigger price in USD.");
    const n = Math.round(Number(parts)), m = Math.round(Number(every));
    if (timed && (!(n >= 2 && n <= 100) || !(m >= 5 && m <= 10_080))) return setErr("Use 2 to 100 parts, 5 minutes to 7 days apart.");
    const j = (await fetch(`/api/market?token=${t}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { token?: { symbol: string } } | null;
    if (!j?.token) return setErr("No pool found for that token.");
    const side: "buy" | "sell" = kind === "limit" || kind === "dca" ? "buy" : kind === "twap" ? twapSide : "sell";
    const o: Order = { id: Math.random().toString(36).slice(2), kind, token: t, symbol: j.token.symbol, price: timed ? undefined : p, amount: a, side, parts: timed ? n : undefined, every: timed ? m : undefined, done: 0, next: timed ? Date.now() : undefined, created: Date.now(), state: "waiting" };
    update((cur) => [o, ...cur]);
    setToken("");
    setPrice("");
    setAmount("");
  }

  const fillLink = (o: Order) => (o.side === "buy" ? `/app/trade/quote?from=USDG&to=${o.token}&amount=${o.amount}` : `/app/trade/quote?from=${o.token}&to=USDG&amount=${o.amount}`);
  const filled = (o: Order) =>
    update((cur) =>
      cur.map((x) => {
        if (x.id !== o.id) return x;
        if (x.kind === "dca" || x.kind === "twap") {
          const done = x.done + 1;
          return done >= (x.parts ?? 1) ? { ...x, done, state: "done" } : { ...x, done, next: Date.now() + (x.every ?? 60) * 60_000, state: "waiting" };
        }
        return { ...x, done: 1, state: "done" };
      }),
    );
  const cancel = (o: Order) => update((cur) => cur.map((x) => (x.id === o.id ? { ...x, state: "cancelled" } : x)));
  const timed = kind === "dca" || kind === "twap";
  const unit = kind === "limit" || kind === "dca" || (kind === "twap" && twapSide === "buy") ? "USDG" : "tokens";

  return (
    <Instrument code="T-20" title="Orders" foot={<span>Orders wait in this browser and are checked while Corbel is open. Fill opens the swap with the amounts set; your wallet signs it. Nothing is held for you.</span>}>
      <div className="border-b border-line px-4 py-4">
        <div role="group" aria-label="Order type" className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} title={k.line} className={cx("rounded-full border px-3 py-1 font-mono text-[12px]", kind === k.id ? "border-leaf/60 text-text" : "border-line text-muted hover:text-text")}>
              {k.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted">{KINDS.find((k) => k.id === kind)!.line}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token address 0x…" aria-label="Token address" spellCheck={false} className="h-10 rounded-lg border border-line bg-[#111] px-3 font-mono text-[13px] text-text placeholder:text-muted" />
          {!timed && <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="Price, USD" aria-label="Trigger price in USD" className="h-10 rounded-lg border border-line bg-[#111] px-3 font-mono text-[13px] text-text placeholder:text-muted" />}
          {timed && kind === "twap" && (
            <div role="group" aria-label="Side" className="flex rounded-lg border border-line">
              {(["buy", "sell"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={twapSide === s} onClick={() => setTwapSide(s)} className={cx("flex-1 font-mono text-[12.5px]", twapSide === s ? (s === "buy" ? "text-leaf" : "text-flesh") : "text-muted")}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={`${timed ? "Each part" : "Amount"}, ${unit}`} aria-label={`Amount in ${unit}`} className="h-10 rounded-lg border border-line bg-[#111] px-3 font-mono text-[13px] text-text placeholder:text-muted" />
          {timed && (
            <>
              <input value={parts} onChange={(e) => setParts(e.target.value)} inputMode="numeric" aria-label="Parts" placeholder="Parts" className="h-10 rounded-lg border border-line bg-[#111] px-3 font-mono text-[13px] text-text" />
              <input value={every} onChange={(e) => setEvery(e.target.value)} inputMode="numeric" aria-label="Minutes between parts" placeholder="Every, min" className="h-10 rounded-lg border border-line bg-[#111] px-3 font-mono text-[13px] text-text" />
            </>
          )}
          <button type="button" onClick={() => void add()} className="h-10 rounded-lg bg-leaf px-4 text-[13.5px] font-semibold text-[#06110b] hover:opacity-90">
            Place
          </button>
        </div>
        {err && <p className="mt-2 text-[13px] text-flesh">{err}</p>}
      </div>
      {orders.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-muted">No orders yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {orders.map((o) => {
            const p = prices[o.token];
            return (
              <li key={o.id} className={cx("grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center", (o.state === "done" || o.state === "cancelled") && "opacity-50")}>
                <p>
                  <span className={cx("font-mono text-[13px]", o.side === "buy" ? "text-leaf" : "text-flesh")}>{KINDS.find((k) => k.id === o.kind)!.label}</span>{" "}
                  <Link href={`/app/trade/terminal?token=${o.token}`} className="text-[14px] text-text hover:underline">
                    {o.symbol}
                  </Link>
                  <span className="block font-mono text-[12px] text-muted">
                    {o.kind === "dca" || o.kind === "twap" ? `${fmt(o.amount)} ${o.side === "buy" ? "USDG" : o.symbol} × ${o.parts}, every ${o.every} min · ${o.done} done` : `${fmt(o.amount)} ${o.side === "buy" ? "USDG" : o.symbol} at $${fmt(o.price!)}`}
                  </span>
                </p>
                <p className="font-mono text-[12.5px] text-muted">{p != null ? `now $${fmt(p)}` : "reading the price…"}</p>
                <p className={cx("font-mono text-[12.5px]", o.state === "ready" ? "text-leaf" : "text-muted")}>
                  {o.state === "ready" ? "ready to fill" : o.state === "waiting" ? (o.next && o.next > now ? `next part in ${Math.ceil((o.next - now) / 60_000)} min` : "waiting") : o.state}
                </p>
                <span className="flex gap-2">
                  {o.state === "ready" && (
                    <>
                      <Link href={fillLink(o)} className="rounded-full border border-leaf/60 px-3 py-1 text-[12.5px] text-text hover:bg-leaf/10">
                        Fill
                      </Link>
                      <button type="button" onClick={() => filled(o)} className="rounded-full border border-line px-3 py-1 text-[12.5px] text-muted hover:text-text">
                        Mark filled
                      </button>
                    </>
                  )}
                  {(o.state === "waiting" || o.state === "ready") && (
                    <button type="button" onClick={() => cancel(o)} className="rounded-full border border-line px-3 py-1 text-[12.5px] text-muted hover:text-text">
                      Cancel
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Instrument>
  );
}
