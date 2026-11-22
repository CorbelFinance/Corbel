"use client";

/**
 * Wallet tools · what each tool shows before an address is loaded. Each one is drawn in its own form, so the four
 * tools stop looking alike:
 *  - Exposure: a radar of what anyone can read about an address, sweeping its six public facts.
 *  - Stress test: the shock you set, drawn as three columns falling to their new level, for an even split.
 *  - Share link: the card the viewer will see, with the address masked and the expiry counting down.
 * Plus, for any of them, a few busy wallets from the chain's largest recent swaps to try it on.
 */
import { useEffect, useState } from "react";


const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Real addresses behind the largest recent swaps, to try a tool on. */
export function TryWallets({ onPick }: { onPick: (a: string) => void }) {
  const [rows, setRows] = useState<{ who: string; usd: number; symbol: string }[]>([]);
  useEffect(() => {
    let off = false;
    fetch("/api/whales")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: { who: string; usd: number; symbol: string }[] } | null) => {
        if (off || !j?.rows) return;
        const seen = new Set<string>();
        setRows(j.rows.filter((r) => /^0x[0-9a-fA-F]{40}$/.test(r.who) && !seen.has(r.who.toLowerCase()) && !!seen.add(r.who.toLowerCase())).slice(0, 4));
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);
  if (!rows.length) return null;
  return (
    <div className="mx-5 mt-3 flex flex-wrap items-center gap-2 text-[12px]">
      <span className="text-muted">Try a busy wallet:</span>
      {rows.map((r) => (
        <button key={r.who} type="button" onClick={() => onPick(r.who)} className="rounded-full border border-line px-2.5 py-1 font-mono text-[12px] text-text transition-colors hover:border-ui/60">
          {`${short(r.who)} · ${r.symbol} $${Math.round(r.usd).toLocaleString("en")}`}
        </button>
      ))}
    </div>
  );
}

const FACTS = [
  { k: "Holdings", line: "every token and its value" },
  { k: "Swaps", line: "each trade, size and time" },
  { k: "Counterparties", line: "who it sends to and gets from" },
  { k: "First seen", line: "when it was funded, and from where" },
  { k: "Launches", line: "pools it created" },
  { k: "LP", line: "which pairs it backs" },
];

export function ExposureIdle() {
  return (
    <div className="grid items-center gap-8 px-5 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative mx-auto aspect-square w-full max-w-[300px]" aria-hidden>
        {[1, 0.72, 0.44].map((r) => (
          <span key={r} className="absolute rounded-full border border-[#232323]" style={{ inset: `${((1 - r) / 2) * 100}%` }} />
        ))}
        <span className="wi-sweep absolute inset-0 rounded-full" />
        {FACTS.map((f, i) => {
          const a = (i / FACTS.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <span key={f.k} className="wi-dot absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6cc0d0]" style={{ left: `${50 + Math.cos(a) * 38}%`, top: `${50 + Math.sin(a) * 38}%`, animationDelay: `${(i / FACTS.length) * 4}s` }} />
          );
        })}
        <span className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl border border-[#6cc0d0]/60 bg-[#0b1214] font-mono text-[12px] text-text">0x…</span>
      </div>
      <div>
        <p className="text-[15px] text-text">What anyone can read about an address</p>
        <ul className="mt-3 divide-y divide-[#1a1a1a] border-y border-[#1a1a1a]">
          {FACTS.map((f, i) => (
            <li key={f.k} className="wi-row flex items-baseline gap-3 py-2 text-[13px]" style={{ animationDelay: `${(i / FACTS.length) * 4}s` }}>
              <span className="w-28 shrink-0 font-mono text-[12px] text-[#6cc0d0]">{f.k}</span>
              <span className="text-muted">{f.line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-muted">Paste any address above, or connect yours. Nothing is signed.</p>
      </div>
    </div>
  );
}

export function StressIdle({ s }: { s: { eth: number; stock: number; token: number } }) {
  const cols = [
    { k: "ETH and WETH", v: s.eth },
    { k: "Stock tokens", v: s.stock },
    { k: "Other tokens", v: s.token },
  ];
  const even = (s.eth + s.stock + s.token) / 3;
  return (
    <div className="flex h-full flex-col px-5 py-6">
      <p className="text-[13px] text-muted">The shock you set, before any wallet: each column falls to its new level.</p>
      <div className="mt-5 grid flex-1 grid-cols-3 items-end gap-6" aria-hidden>
        {cols.map((c, i) => (
          <div key={c.k} className="flex h-48 flex-col justify-end">
            <div className="relative h-full overflow-hidden rounded-t-lg border border-b-0 border-[#242424]">
              <span className="absolute inset-x-0 bottom-0 bg-leaf/25" style={{ height: "100%" }} />
              <span key={`${c.v}`} className="wi-fall absolute inset-x-0 top-0 bg-[repeating-linear-gradient(135deg,rgba(255,106,120,0.35)_0_6px,rgba(255,106,120,0.12)_6px_12px)]" style={{ height: `${c.v}%`, animationDelay: `${i * 0.12}s` }} />
              <span className="absolute inset-x-0 border-t border-dashed border-flesh" style={{ top: `${c.v}%` }} />
            </div>
            <p className="mt-2 flex justify-between text-[12px]">
              <span className="text-text">{c.k}</span>
              <span className="font-mono text-flesh">{`−${c.v}%`}</span>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-xl bg-[#0d0d0d] px-4 py-3 text-[13px] text-text">
        {`A wallet split evenly across the three would lose `}
        <span className="font-mono text-flesh">{`${even.toFixed(1)}%`}</span>
        {`. Load a real wallet to see its own number.`}
      </p>
    </div>
  );
}

export function ShareIdle({ hours }: { hours: number }) {
  const [left, setLeft] = useState(hours * 3600);
  useEffect(() => {
    void Promise.resolve().then(() => setLeft(hours * 3600));
    const t = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : hours * 3600)), 1000);
    return () => clearInterval(t);
  }, [hours]);
  const hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-6">
      <p className="mb-3 self-start text-[12px] text-muted">What the viewer will see</p>
      <div className="wi-card w-full max-w-sm rounded-2xl border border-line bg-[#0d0d0d] p-4" aria-hidden>
        <p className="flex items-center justify-between font-mono text-[12px] text-muted">
          <span>corbel · shared view</span>
          <span className="text-text">{`${pad(hh)}:${pad(mm)}:${pad(ss)}`}</span>
        </p>
        <p className="mt-3 font-mono text-[15px] text-text">
          0x<span className="wi-mask">••••••••••••</span>
        </p>
        <ul className="mt-3 space-y-2">
          {[0.82, 0.55, 0.3].map((w, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="h-5 w-5 rounded-full bg-[#1f1f1f]" />
              <span className="h-2 rounded-full bg-[#242424]" style={{ width: `${w * 60}%` }} />
              <span className="ml-auto h-2 w-12 rounded-full bg-[#242424]" />
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-[12px] text-muted">Holdings and the total. No address, no swaps.</p>
      </div>
      <p className="mt-3 text-[12px] text-muted">Pick a wallet and the link appears here, ready to copy.</p>
    </div>
  );
}

