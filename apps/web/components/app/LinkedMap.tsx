"use client";

/**
 * Wallet · linked wallets: the wallets an address is tied to on chain, drawn around it. A line is $CORBEL sent between
 * two wallets (thicker = more), green when it comes in to the centre, red when it goes out; wallets that share a first
 * gas funder are ringed. Chain data only; for holders from the Plus tier.
 */
import { useState } from "react";
import { cx } from "@corbel/ui";

type Node = { address: string; center: boolean; contract: boolean | null; funder: string | null; inflow: number; outflow: number };
type Edge = { src: string; dst: string; total: number; count: number; last: number };
type R = { address: string; nodes: Node[]; edges: Edge[]; sharedFunders: { funder: string; wallets: string[] }[]; error?: string };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const big = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0));
const SCAN = "https://robinhoodchain.blockscout.com/address/";
const W = 640, H = 420, CX = W / 2, CY = H / 2;

export function LinkedMap() {
  const [q, setQ] = useState("");
  const [r, setR] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (a = q) => {
    setBusy(true);
    const j = (await fetch(`/api/wallet/linked?a=${encodeURIComponent(a.trim())}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ error: "Not answering." }))) as R;
    setR(j);
    setBusy(false);
  };
  const ring = r && !r.error ? r.nodes.filter((n) => !n.center) : [];
  const pos = new Map<string, { x: number; y: number }>();
  if (r && !r.error) {
    pos.set(r.address, { x: CX, y: CY });
    ring.forEach((n, i) => {
      const a = (i / Math.max(1, ring.length)) * Math.PI * 2 - Math.PI / 2;
      const rad = ring.length > 14 ? (i % 2 ? 175 : 125) : 160;
      pos.set(n.address, { x: CX + Math.cos(a) * rad * 1.35, y: CY + Math.sin(a) * rad });
    });
  }
  const maxT = r && !r.error ? Math.max(1, ...r.edges.map((e) => e.total)) : 1;
  const sharedSet = new Set((r?.sharedFunders ?? []).flatMap((s) => s.wallets));
  return (
    <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#141414]">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-[14px] font-semibold text-text">Linked wallets</span>
        <form
          className="ml-auto flex min-w-0 flex-1 gap-2 sm:max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            void go();
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="0x… any wallet" spellCheck={false} className="h-9 min-w-0 flex-1 rounded-lg border border-[#2a2a2a] bg-[#0b0b0b] px-3 font-mono text-[13px] text-text outline-none" />
          <button type="submit" disabled={busy} className="h-9 rounded-lg bg-leaf px-3 text-[13px] font-medium text-[#07130c] disabled:opacity-50">
            {busy ? "Reading…" : "Map"}
          </button>
        </form>
      </header>
      {r?.error && <p className="px-4 py-6 text-[13px] text-flesh">{r.error}</p>}
      {!r && <p className="px-4 py-6 text-[13px] text-muted">Paste any wallet to see who it sent $CORBEL to, who sent it $CORBEL, and which of them share a first gas funder.</p>}
      {r && !r.error && (
        <>
          {r.edges.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-muted">No $CORBEL moved between this wallet and another in the indexed window.</p>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Wallets linked to ${short(r.address)}`}>
              {r.edges.map((e) => {
                const a = pos.get(e.src), b = pos.get(e.dst);
                if (!a || !b) return null;
                const into = e.dst === r.address, from = e.src === r.address;
                return <line key={`${e.src}>${e.dst}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={into ? "#3ee08f" : from ? "#ff6b6b" : "#5b5b5b"} strokeOpacity={0.7} strokeWidth={1 + 5 * Math.sqrt(e.total / maxT)} />;
              })}
              {r.nodes.map((n) => {
                const p = pos.get(n.address);
                if (!p) return null;
                return (
                  <g key={n.address}>
                    {sharedSet.has(n.address) && <circle cx={p.x} cy={p.y} r={n.center ? 17 : 12} fill="none" stroke="#c9a441" strokeWidth={2} strokeDasharray="3 3" />}
                    <circle cx={p.x} cy={p.y} r={n.center ? 12 : 7} fill={n.center ? "#ffffff" : n.contract ? "#6f8dff" : "#d8d8d8"} />
                    <text x={p.x} y={p.y + (n.center ? 28 : 20)} textAnchor="middle" className="fill-[#9a9a9a] font-mono text-[10px]">{short(n.address)}</text>
                  </g>
                );
              })}
            </svg>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-4 py-2 text-[12px] text-muted">
            <span><i className="mr-1 inline-block h-0.5 w-4 bg-[#3ee08f] align-middle" />$CORBEL in</span>
            <span><i className="mr-1 inline-block h-0.5 w-4 bg-[#ff6b6b] align-middle" />$CORBEL out</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#6f8dff] align-middle" />contract</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full border border-dashed border-[#c9a441] align-middle" />same first gas funder</span>
          </div>
          <ul className="max-h-72 divide-y divide-line/60 overflow-y-auto border-t border-line">
            {r.nodes
              .filter((n) => !n.center)
              .sort((a, b) => b.inflow + b.outflow - (a.inflow + a.outflow))
              .map((n) => (
                <li key={n.address} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2 font-mono text-[12.5px]">
                  <span className="min-w-0 truncate">
                    <a href={SCAN + n.address} target="_blank" rel="noreferrer noopener" className="text-text hover:underline">{`${short(n.address)} ↗`}</a>
                    {n.contract && <span className="ml-2 font-sans text-[11.5px] text-[#9fb2ff]">contract</span>}
                    {sharedSet.has(n.address) && <span className="ml-2 font-sans text-[11.5px] text-[#e0c46a]">same funder</span>}
                  </span>
                  <span className="text-leaf">{`in ${big(n.inflow)}`}</span>
                  <button type="button" onClick={() => (setQ(n.address), void go(n.address))} className={cx("rounded-md border border-line px-2 py-0.5 font-sans text-[12px] text-muted hover:text-text")}>
                    Map it
                  </button>
                </li>
              ))}
          </ul>
          <p className="border-t border-line px-4 py-2.5 text-[12px] text-muted">Only $CORBEL transfers and first gas funders, read from the chain. A link is a hint, not proof that one person runs both.</p>
        </>
      )}
    </section>
  );
}
