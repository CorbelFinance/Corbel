"use client";

import { useEffect, useRef, useState } from "react";
import { ONE_BALANCE } from "@corbel/config";
import { ACCOUNT_EXAMPLE as X } from "@corbel/data";
import { Label, cx } from "@corbel/ui";
import { PinnedScene } from "@corbel/ui/motion";

const n = (s: string) => Number(s.replace(/,/g, ""));
const fmt = (v: number, d = 2) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Eases a number toward `target`; follows prefers-reduced-motion by jumping. */
function useTween(target: number, ms = 900) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = still ? 1 : Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const x = a + (target - a) * e;
      setV(x);
      from.current = x;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Example accrual: a small, steady drip while the balance is idle. Illustrative only. */
function useDrip(on: boolean) {
  const [d, setD] = useState(0);
  useEffect(() => {
    if (!on || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setD((x) => x + 0.0003), 120);
    return () => clearInterval(id);
  }, [on]);
  return d;
}

const CURVE = Array.from({ length: 48 }, (_, i) => 0.55 - i * 0.008 + Math.sin(i * 0.7) * 0.05 + Math.sin(i * 0.23) * 0.07);

/** Yield line: a slow curve with a dot riding its last point. */
function YieldLine({ live }: { live: boolean }) {
  // rounded to 0.01: the server and the browser then write the same coordinates (no hydration mismatch)
  const pts = CURVE.map((y, i) => `${((i / (CURVE.length - 1)) * 100).toFixed(2)},${(y * 40 + 4).toFixed(2)}`);
  const last = pts.at(-1)!.split(",");
  return (
    <div className="relative mt-5 h-14">
    <svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden className="h-full w-full overflow-visible">
      <defs>
        <linearGradient id="ob-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--leaf)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--leaf)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M0,44 L${pts.join(" L")} L100,44 Z`} fill="url(#ob-fill)" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--leaf)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" className="ob-line" />
      {[0.25, 0.5, 0.75].map((x) => (
        <line key={x} x1={x * 100} x2={x * 100} y1="0" y2="44" stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
      <span aria-hidden className={cx("absolute right-0 h-2 w-2 -translate-y-1/2 translate-x-1/2 bg-leaf shadow-[0_0_10px_var(--leaf)]", live && "ob-pulse")} style={{ top: `${(Number(last[1]) / 44) * 100}%` }} />
    </div>
  );
}

const ROUTE = ["Shares", "USDG", "Pool", X.token] as const;
const STAGES = ["Build", "Sign", "Settle"] as const;

/** Product mock-up: the account card as the user would see it, driven by the scroll step. Example figures. */
function AccountMock({ step }: { step: number }) {
  const before = n(X.balanceBefore);
  const after = n(X.balanceAfter);
  const drip = useDrip(step === 0);
  const balance = useTween(step === 2 ? after : before);
  const shares = useTween(step === 2 ? n(X.sharesAfter) : n(X.shares));
  const out = useTween(step === 0 ? 0 : n(X.received), 1400);
  const stageAt = step === 0 ? -1 : step === 1 ? 1 : 3;

  return (
    <div className="ob relative overflow-hidden border border-line bg-surface shadow-[0_40px_120px_-40px_color-mix(in_srgb,var(--leaf)_25%,transparent)]" data-step={step}>
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="flex items-center gap-2">
          <span aria-hidden className={cx("h-2 w-2 bg-leaf", step === 0 && "ob-pulse")} />
          <Label tone="text">Account</Label>
        </span>
        <Label>Example · not live</Label>
      </div>

      <div className="grid gap-px bg-line sm:grid-cols-[1fr_1.05fr]">
        {/* Balance */}
        <div className={cx("bg-bg p-5 transition-colors duration-500", step === 0 && "bg-[color-mix(in_oklab,var(--rind)_22%,var(--bg))]")}>
          <div className="flex items-center justify-between">
            <Label>Balance</Label>
            <span className={cx("font-mono text-[12px] uppercase tracking-[0.08em]", step === 2 ? "text-text" : "text-leaf")}>{step === 2 ? "▼ spent from balance" : "● earning"}</span>
          </div>
          <p className="mt-3 font-display text-4xl tabular-nums tracking-tight text-text sm:text-5xl">
            {fmt(balance + drip, step === 0 ? 4 : 2)}
            <span className="ml-2 font-mono text-sm text-muted">USDG</span>
          </p>
          <YieldLine live={step === 0} />
          <dl className="mt-4 grid grid-cols-2 gap-px bg-line font-mono text-[12px] uppercase tracking-[0.08em]">
            <div className="bg-bg py-2 pr-2">
              <dt className="text-muted">Vault shares</dt>
              <dd className="mt-1 text-xs tabular-nums text-text">{fmt(shares)}</dd>
            </div>
            <div className="bg-bg py-2 pl-3">
              <dt className="text-muted">Vault</dt>
              <dd className="mt-1 text-xs text-text">Morpho · USDG</dd>
            </div>
          </dl>
        </div>

        {/* Swap */}
        <div className={cx("relative bg-bg p-5 transition-colors duration-500", step === 1 && "bg-[color-mix(in_oklab,var(--rind)_22%,var(--bg))]")}>
          <div className="flex items-center justify-between">
            <Label>One transaction</Label>
            <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
              {X.spend} USDG → {X.token}
            </span>
          </div>

          {/* route: nodes joined by a rail, packets run it while signing */}
          <div className="relative mt-5">
            <div aria-hidden className="absolute left-3 right-3 top-3 h-px bg-line" />
            <div aria-hidden className={cx("ob-rail absolute left-3 top-3 h-px bg-leaf", step === 0 ? "w-0" : "w-[calc(100%-1.5rem)]")} />
            {step === 1 && (
              <div aria-hidden className="absolute left-3 right-3 top-[9px] h-1.5">
                <span className="ob-packet" />
                <span className="ob-packet [animation-delay:0.45s]" />
                <span className="ob-packet [animation-delay:0.9s]" />
              </div>
            )}
            <ol className="relative grid grid-cols-4">
              {ROUTE.map((r, i) => {
                const lit = step === 2 || (step === 1 && i <= 2) || (step === 0 && i === 0);
                return (
                  <li key={r} className="flex flex-col items-center gap-2">
                    <span className={cx("grid h-6 w-6 place-items-center border font-mono text-[12px] transition-colors duration-500", lit ? "border-leaf bg-leaf text-bg" : "border-line bg-bg text-muted")}>{i + 1}</span>
                    <span className={cx("font-mono text-[12px] uppercase tracking-[0.08em]", lit ? "text-text" : "text-muted")}>{r}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="mt-5 border border-line bg-surface/60 p-3">
            <div className="flex justify-between font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
              <span>You receive</span>
              <span>min {X.minOut} · slip {X.slippage}</span>
            </div>
            <p className="mt-1.5 font-mono text-xl tabular-nums text-text">
              {step === 0 ? "—" : fmt(out, 1)} <span className="text-xs text-muted">{X.token}</span>
            </p>
          </div>

          {/* stages */}
          <ol className="mt-4 grid grid-cols-3 gap-px bg-line">
            {STAGES.map((s, i) => {
              const done = i < stageAt;
              const now = i === stageAt;
              return (
                <li key={s} className="bg-bg px-2 py-2">
                  <div className="h-1 w-full bg-line">
                    <div className={cx("h-full bg-leaf transition-[width] duration-700", done ? "w-full" : now ? "ob-fill w-1/2" : "w-0")} />
                  </div>
                  <span className={cx("mt-1.5 block font-mono text-[12px] uppercase tracking-[0.08em]", done ? "text-leaf" : now ? "text-text" : "text-muted")}>
                    {done ? "✓ " : now ? "● " : ""}
                    {s}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className={cx("mt-3 font-mono text-[12px] uppercase tracking-[0.08em] transition-opacity duration-500", step === 2 ? "text-leaf opacity-100" : "opacity-0")} aria-hidden={step !== 2}>
            Receipt · shares burned {X.spend} · min out met · rest keeps earning
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px border-t border-line bg-line font-mono text-[12px] uppercase tracking-[0.08em] sm:text-[12px]">
        {ONE_BALANCE.steps.map((s, i) => (
          <div key={s.tag} className={`relative overflow-hidden px-4 py-3 transition-colors ${i === step ? "bg-rind/40 text-text" : "bg-bg text-muted"}`}>
            {i === step && <span aria-hidden className="ob-step absolute bottom-0 left-0 h-px bg-leaf" />}
            <span aria-hidden>{i === step ? "● " : i < step ? "✓ " : "○ "}</span>
            {s.tag}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OneBalanceScene() {
  return (
    <PinnedScene
      className="mt-12"
      steps={ONE_BALANCE.steps.map((s, i) => (
        <div key={s.tag} className="max-w-md">
          <Label tone="leaf">
            {String(i + 1).padStart(2, "0")} · {s.tag}
          </Label>
          <h3 className="mt-4 font-display text-2xl tracking-tight sm:text-[2.25rem] sm:leading-tight">{s.title}</h3>
          <p className="mt-3 text-muted">{s.line}</p>
        </div>
      ))}
      stage={(active) => <AccountMock step={active} />}
    />
  );
}
