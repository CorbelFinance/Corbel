"use client";

/**
 * One address's holdings in dollars, from /api/portfolio (or a share link's /api/share?t=): ETH, WETH and USDG
 * balances plus every token the index saw arrive, each valued at spot through its ETH pool. Used by Exposure,
 * Stress test and the shared view.
 */
import { useEffect, useState } from "react";

type Holding = { token: string; symbol: string | null; name: string | null; decimals: number; raw: string; ethSpot: number | null };
export type Raw = { eth: string; weth: string; usdg: string; usdgPerEth: number | null; holdings: Holding[]; block: string; scanned?: { complete: boolean }; launches?: { launches: number; dead: number } | null; exp?: number; tag?: string; error?: string };
export type Line = { token: string; symbol: string; name: string; amount: number; usd: number; kind: "base" | "stock" | "token" };

const ETH = "0x0000000000000000000000000000000000000000";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const dec = (raw: string, d: number) => {
  const s = raw.padStart(d + 1, "0");
  return Number(`${s.slice(0, s.length - d)}.${s.slice(s.length - d)}`);
};
export const isStock = (name: string | null) => !!name && (name.includes("Robinhood") || name.includes("xStock") || name.includes("ST0x"));

export function linesOf(p: Raw): { lines: Line[]; total: number } {
  const k = p.usdgPerEth ?? 0;
  const base: Line[] = [
    { token: ETH, symbol: "ETH", name: "Ether", amount: dec(p.eth, 18), usd: dec(p.eth, 18) * k, kind: "base" },
    { token: WETH, symbol: "WETH", name: "Wrapped Ether", amount: dec(p.weth, 18), usd: dec(p.weth, 18) * k, kind: "base" },
    { token: USDG, symbol: "USDG", name: "Global Dollar", amount: dec(p.usdg, 6), usd: dec(p.usdg, 6), kind: "base" },
  ];
  const held: Line[] = p.holdings.map((h) => ({ token: h.token, symbol: h.symbol ?? "?", name: h.name ?? "", amount: dec(h.raw, h.decimals), usd: (h.ethSpot ?? 0) * k, kind: isStock(h.name) ? "stock" : "token" }));
  const lines = [...base, ...held].filter((l) => l.amount > 0);
  lines.sort((a, b) => b.usd - a.usd);
  return { lines, total: lines.reduce((s, l) => s + l.usd, 0) };
}

/**
 * One request per address for the whole page: every block on the wallet tab shares it (60 s), and a "busy" or
 * "too many" answer is retried after the server's retry-after instead of being shown as an error.
 */
const shared = new Map<string, { at: number; p: Promise<Raw> }>();
export function loadPortfolio(url: string, force = false): Promise<Raw> {
  const hit = shared.get(url);
  if (!force && hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async () => {
    for (let i = 0; ; i++) {
      const r = await fetch(url, { cache: "no-store" });
      const j = (await r.json().catch(() => ({ error: "No answer. Try again." }))) as Raw;
      if ((r.status === 503 || r.status === 429) && i < 5) {
        const wait = Math.min(8, Number(r.headers.get("retry-after")) || 3);
        await new Promise((ok) => setTimeout(ok, wait * 1000));
        continue;
      }
      return j;
    }
  })();
  shared.set(url, { at: Date.now(), p });
  p.then((j) => j.error && shared.delete(url)).catch(() => shared.delete(url));
  return p;
}

/** Load by address (url = /api/portfolio?address=) or by share token (url = /api/share?t=). */
export function usePortfolio(url: string | null) {
  const [p, setP] = useState<Raw | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!url) return;
    let off = false;
    void Promise.resolve().then(() => (setBusy(true), setErr(null), setP(null)));
    loadPortfolio(url)
      .then((j: Raw) => {
        if (off) return;
        if (j.error) setErr(j.error);
        else setP(j);
      })
      .catch(() => !off && setErr("No answer. Try again."))
      .finally(() => !off && setBusy(false));
    return () => {
      off = true;
    };
  }, [url]);
  return { p, err, busy };
}

export const usd = (v: number): string => (!Number.isFinite(v) ? "—" : v < 0 ? `−${usd(-v)}` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(2)}`);
