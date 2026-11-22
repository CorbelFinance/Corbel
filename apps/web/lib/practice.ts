/**
 * Practice: a paper account for the terminal. Swaps are quoted on the real chain at the latest block (same quote as a
 * live swap) and booked against $10,000 of paper USDG; nothing is signed and no funds move. The account lives in this
 * browser (localStorage); when the wallet is signed in it is also saved with the account (/api/practice) so it follows
 * the wallet to another device. The trade list is also what "your agent learns from you" reads to draft a mandate.
 */
export const PRACTICE_START = 10_000;
export const TEACH_AT = 20;
export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const KEY = "corbel.practice.v1";

export type Tag = "fresh" | "momentum" | "dip" | "profit" | "cut" | "other";
export const TAGS: { id: Tag; label: string }[] = [
  { id: "fresh", label: "Fresh launch" },
  { id: "momentum", label: "Momentum" },
  { id: "dip", label: "Dip buy" },
  { id: "profit", label: "Take profit" },
  { id: "cut", label: "Cut loss" },
  { id: "other", label: "Other" },
];

export type Pos = { token: string; symbol: string; decimals: number; amount: number; cost: number };
export type Trade = {
  id: string;
  at: number;
  side: "buy" | "sell";
  token: string;
  symbol: string;
  /** USDG spent (buy) or received (sell) */
  usd: number;
  amount: number;
  /** USDG per token at the fill */
  price: number;
  impact: number | null;
  block: string;
  venues: string[];
  tag: Tag;
  reason?: string;
  /** sells only: USDG made or lost against the average cost of what was sold */
  pnl?: number;
  /** the token check's red flags at the time of the trade, if it was read */
  fails?: string[];
};
export type Book = { v: 1; start: number; cash: number; positions: Record<string, Pos>; trades: Trade[]; created: number; updated?: number };

export const fresh = (): Book => ({ v: 1, start: PRACTICE_START, cash: PRACTICE_START, positions: {}, trades: [], created: Date.now() });

export function loadBook(): Book {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const b = JSON.parse(raw) as Book;
    return b && b.v === 1 && Array.isArray(b.trades) ? b : fresh();
  } catch {
    return fresh();
  }
}
let push: ReturnType<typeof setTimeout> | null = null;
// set by syncBook from the server's answer: a guest's account stays in this browser and is never sent
let signedIn = false;
export function saveBook(b: Book) {
  const stamped = { ...b, updated: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(stamped));
  } catch {
    // private mode: the account lives for this tab only
  }
  // signed in: save it with the wallet too (a second later, so a burst of trades is one write)
  if (!signedIn) return;
  if (push) clearTimeout(push);
  push = setTimeout(() => void fetch("/api/practice", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ book: stamped }) }).catch(() => undefined), 1000);
}

/** The newer of this browser's account and the one saved with the signed-in wallet. */
export async function syncBook(local: Book): Promise<Book> {
  try {
    const r = (await (await fetch("/api/practice", { cache: "no-store" })).json()) as { signedIn: boolean; book: Book | null };
    signedIn = r.signedIn === true;
    if (!signedIn) return local;
    if (r.book && r.book.v === 1 && (r.book.updated ?? 0) > (local.updated ?? 0)) {
      try {
        localStorage.setItem(KEY, JSON.stringify(r.book));
      } catch {
        // kept in memory only
      }
      return r.book;
    }
    if (local.trades.length) saveBook(local);
    return local;
  } catch {
    return local;
  }
}

/** Book a filled paper buy: cash out, position in at the average cost. */
export function bookBuy(b: Book, t: Omit<Trade, "id" | "at" | "side" | "pnl">): Book {
  const p = b.positions[t.token] ?? { token: t.token, symbol: t.symbol, decimals: 18, amount: 0, cost: 0 };
  const next: Pos = { ...p, amount: p.amount + t.amount, cost: p.cost + t.usd };
  return { ...b, cash: b.cash - t.usd, positions: { ...b.positions, [t.token]: next }, trades: [{ ...t, side: "buy", id: crypto.randomUUID(), at: Date.now() }, ...b.trades] };
}
/** Book a filled paper sell: cash in, cost taken out pro rata, the trade's result against that cost. */
export function bookSell(b: Book, t: Omit<Trade, "id" | "at" | "side" | "pnl">): Book {
  const p = b.positions[t.token];
  if (!p || p.amount <= 0) return b;
  const share = Math.min(1, t.amount / p.amount);
  const costOut = p.cost * share;
  const left: Pos = { ...p, amount: p.amount - t.amount, cost: p.cost - costOut };
  const positions = { ...b.positions };
  if (left.amount <= p.amount * 1e-9) delete positions[t.token];
  else positions[t.token] = left;
  return { ...b, cash: b.cash + t.usd, positions, trades: [{ ...t, side: "sell", id: crypto.randomUUID(), at: Date.now(), pnl: t.usd - costOut }, ...b.trades] };
}

export function bookStats(b: Book, marks: Record<string, number | null>) {
  const held = Object.values(b.positions).reduce((s, p) => s + (marks[p.token] ?? p.cost), 0);
  const equity = b.cash + held;
  const sells = b.trades.filter((t) => t.side === "sell");
  const wins = sells.filter((t) => (t.pnl ?? 0) > 0).length;
  return { equity, ret: equity / b.start - 1, trades: b.trades.length, closed: sells.length, winRate: sells.length ? wins / sells.length : null, realized: sells.reduce((s, t) => s + (t.pnl ?? 0), 0) };
}
