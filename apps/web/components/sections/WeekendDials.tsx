"use client";

import { useEffect, useState } from "react";

/** Next Saturday 00:00 UTC from the viewer's clock. Pure arithmetic, no market data. */
function untilWeekend(now: Date) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const add = (6 - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  const s = Math.max(0, Math.floor((d.getTime() - now.getTime()) / 1000));
  return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
}

const LABELS = ["DAYS", "HRS", "MIN", "SEC"];
const MAX = [7, 24, 60, 60];

/** Four countdown dials to the start of the weekend gap. */
export function WeekendDials() {
  const [v, setV] = useState<number[] | null>(null);
  useEffect(() => {
    const tick = () => setV(untilWeekend(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const C = 2 * Math.PI * 17;
  return (
    <svg width="280" height="120" viewBox="0 0 280 120" fill="none" aria-hidden className="loop">
      <rect x="14" y="10" width="252" height="88" stroke="var(--leaf)" strokeOpacity=".35" strokeDasharray="2 3" />
      {LABELS.map((l, k) => {
        const cx = 50 + k * 60;
        const val = v?.[k];
        const frac = val === undefined ? 0 : val / MAX[k]!;
        return (
          <g key={l}>
            <circle cx={cx} cy="50" r="17" stroke="var(--line)" strokeWidth="3" />
            <circle
              cx={cx}
              cy="50"
              r="17"
              stroke="var(--leaf)"
              strokeWidth="3"
              strokeDasharray={`${(C * frac).toFixed(1)} ${C.toFixed(1)}`}
              transform={`rotate(-90 ${cx} 50)`}
              style={{ filter: "drop-shadow(0 0 4px var(--leaf))", transition: "stroke-dasharray .6s ease" }}
            />
            <text x={cx} y="54" textAnchor="middle" fill="var(--text)" fontSize="11" fontFamily="var(--font-mono)">
              {val === undefined ? "--" : String(val).padStart(2, "0")}
            </text>
            <text x={cx} y="84" textAnchor="middle" fill="var(--muted)" fontSize="6.5" fontFamily="var(--font-mono)" letterSpacing="1">
              {l}
            </text>
          </g>
        );
      })}
      <text x="14" y="114" fill="var(--muted)" fontSize="7" fontFamily="var(--font-mono)">
        TO SAT 00:00 UTC · TOKEN TRADES, SHARE DOESN&apos;T
      </text>
    </svg>
  );
}
