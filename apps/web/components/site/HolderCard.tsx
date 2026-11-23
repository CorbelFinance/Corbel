"use client";

/**
 * /token · the holder card: the tier a wallet holds, the balance that sets it, how far the next tier is, and an
 * image to share on X that never shows the address. The linked wallet fills in by itself; any address can be pasted.
 */
import { useCallback, useEffect, useState } from "react";
import { useLinked } from "@/components/app/wallet";

type Tier = { id: string; name: string; minCoins: number };
type Card = { block: string; balance: number; held: number | null; locked?: number; holdDays: number; tier: Tier | null; next: (Tier & { missing: number }) | null; tiers: Tier[]; burned: number };
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const big = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0));

/** A 1200x675 picture of the card, drawn on a canvas: tier, held balance, progress. No address anywhere. */
function cardImage(c: Card): string {
  const cv = document.createElement("canvas");
  cv.width = 1200;
  cv.height = 675;
  const x = cv.getContext("2d")!;
  const g = x.createRadialGradient(240, 120, 20, 240, 120, 760);
  g.addColorStop(0, "#123a28");
  g.addColorStop(1, "#000");
  x.fillStyle = g;
  x.fillRect(0, 0, 1200, 675);
  x.strokeStyle = "rgba(255,255,255,.18)";
  x.strokeRect(24.5, 24.5, 1151, 626);
  x.fillStyle = "#6fe7a8";
  x.font = "600 26px ui-monospace,Consolas,monospace";
  x.fillText("$CORBEL · HOLDER CARD", 72, 108);
  x.fillStyle = "#fff";
  x.font = "800 150px system-ui,-apple-system,Segoe UI,sans-serif";
  x.fillText(c.tier?.name ?? "No tier yet", 66, 290);
  const held = (c.held ?? c.balance) + (c.locked ?? 0);
  x.font = "500 40px system-ui,-apple-system,Segoe UI,sans-serif";
  x.fillStyle = "rgba(255,255,255,.85)";
  x.fillText(`${big(held)} $CORBEL held through the week`, 72, 372);
  if (c.next) {
    const from = c.tier?.minCoins ?? 0;
    const p = Math.max(0, Math.min(1, (held - from) / (c.next.minCoins - from)));
    x.fillStyle = "rgba(255,255,255,.12)";
    x.fillRect(72, 440, 1056, 18);
    x.fillStyle = "#6fe7a8";
    x.fillRect(72, 440, 1056 * p, 18);
    x.fillStyle = "rgba(255,255,255,.7)";
    x.font = "500 30px system-ui,-apple-system,Segoe UI,sans-serif";
    x.fillText(`${big(c.next.missing)} more to ${c.next.name}`, 72, 510);
  }
  x.fillStyle = "#6fe7a8";
  x.font = "600 24px ui-monospace,Consolas,monospace";
  x.fillText("corbel.finance/token", 72, 610);
  return cv.toDataURL("image/png");
}

export function HolderCard() {
  const { linked } = useLinked();
  const [a, setA] = useState("");
  const [c, setC] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (v: string) => {
    if (!ADDR.test(v)) return setErr("Paste a 0x address, 42 characters.");
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch(`/api/holder?address=${v}`);
      const j = await r.json();
      if (!r.ok) return setErr((j as { error?: string }).error ?? "No answer. Try again.");
      setC(j as Card);
    } catch {
      setErr("No answer. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (linked?.address && !a) void Promise.resolve().then(() => (setA(linked.address), load(linked.address)));
  }, [linked, a, load]);

  const held = c ? (c.held ?? c.balance) + (c.locked ?? 0) : 0;
  const from = c?.tier?.minCoins ?? 0;
  const p = c?.next ? Math.max(0, Math.min(1, (held - from) / (c.next.minCoins - from))) : 1;

  return (
    <div className="rounded-2xl border border-[#242424] bg-[#0f0f0f] p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(a.trim());
        }}
        className="flex flex-wrap gap-2"
      >
        <input value={a} onChange={(e) => setA(e.target.value.trim())} placeholder="Wallet address 0x…" aria-label="Wallet address" spellCheck={false} className="h-11 min-w-60 flex-1 rounded-xl border border-[#2a2a2a] bg-[#0b0b0b] px-3 font-mono text-[13px] text-text outline-none focus:border-leaf" />
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-leaf px-5 text-[14px] font-semibold text-[#0b0b0b] disabled:opacity-60">
          {busy ? "Reading…" : "Show my card"}
        </button>
      </form>
      {err && <p className="mt-3 text-[14px] text-flesh">{err}</p>}
      {c && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">Your tier</p>
            <p className="mt-1 font-display text-5xl tracking-tight text-text">{c.tier?.name ?? "No tier yet"}</p>
            <p className="mt-3 text-[14px] text-muted">
              {c.held === null
                ? `Balance today: ${big(c.balance)} $CORBEL. The lowest balance of the last ${c.holdDays} days sets the tier on the live site.`
                : `Held through the last ${c.holdDays} days: ${big(c.held)} $CORBEL. Balance today: ${big(c.balance)}.`}
              {c.locked ? ` Locked on HoodLock: ${big(c.locked)}, counted in full.` : ""}
            </p>
            {c.next ? (
              <div className="mt-4">
                <div className="h-2.5 overflow-hidden rounded-full bg-[#1d1d1d]">
                  <div className="h-full rounded-full bg-leaf" style={{ width: `${(p * 100).toFixed(1)}%` }} />
                </div>
                <p className="mt-2 text-[14px] text-text">{`${big(c.next.missing)} more $CORBEL, held for ${c.holdDays} days, opens ${c.next.name}.`}</p>
              </div>
            ) : (
              <p className="mt-4 text-[14px] text-text">The top tier. Everything open today is open to you.</p>
            )}
            <p className="mt-3 font-mono text-[12.5px] text-muted">{`Burned by your spending: ${big(c.burned)} · burns start when Credits open · block ${Number(c.block).toLocaleString("en-US")}`}</p>
          </div>
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-[#242424] bg-[#0b0b0b] p-4">
            <ul className="space-y-2">
              {c.tiers.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-[14px]">
                  <span className={c.tier?.id === t.id ? "font-semibold text-leaf" : "text-text"}>{t.name}</span>
                  <span className="font-mono text-[13px] text-muted">{`from ${big(t.minCoins)}`}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                // drawn only when asked for: the picture is a large data URL
                const l = document.createElement("a");
                l.href = cardImage(c);
                l.download = "corbel-holder-card.png";
                l.click();
              }}
              className="rounded-xl border border-[#2a2a2a] px-4 py-2.5 text-center text-[14px] font-semibold text-text hover:border-leaf"
            >
              Save the card for X
            </button>
            <p className="text-[12.5px] text-muted">The image shows your tier and balance, never your address.</p>
          </div>
        </div>
      )}
    </div>
  );
}
