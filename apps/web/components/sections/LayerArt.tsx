"use client";

/**
 * Stocks layer page · the week's clock: counting to the next US open or close (real time, UTC), with the days the
 * real share trades against the days only the token does.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";

/** The clock ticks between the server's render and the browser's: the ticking text is marked suppressHydrationWarning. */
function useNow(ms = 1000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return t;
}

/* stocks: the next US open (13:30 UTC, Mon–Fri) and close (20:00 UTC) */
function nextUs(now: number) {
  const at = (day: Date, h: number, m: number) => Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m);
  for (let i = 0; i < 8; i++) {
    const day = new Date(now + i * 86_400_000);
    const wd = day.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const open = at(day, 13, 30), close = at(day, 20, 0);
    if (now < open) return { kind: "opens", at: open };
    if (now < close) return { kind: "closes", at: close };
  }
  return { kind: "opens", at: now + 86_400_000 };
}
export function WeekArt() {
  const now = useNow();
  const n = nextUs(now);
  const left = Math.max(0, n.at - now);
  const h = Math.floor(left / 3_600_000), m = Math.floor((left % 3_600_000) / 60_000), s = Math.floor((left % 60_000) / 1000);
  const wd = new Date(now).getUTCDay(); // 0 Sun
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today = (wd + 6) % 7;
  const pad = (v: number) => String(v).padStart(2, "0");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 py-10">
      <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">{`The US market ${n.kind} in`}</p>
      <p suppressHydrationWarning className="font-mono text-[clamp(3rem,1.5rem+5vw,6.5rem)] leading-none tabular-nums text-text">{`${pad(h)}:${pad(m)}:${pad(s)}`}</p>
      <div className="grid w-full max-w-3xl grid-cols-7 gap-1.5" aria-hidden>
        {DAYS.map((d, i) => {
          const wknd = i >= 5;
          return (
            <div key={d} className="text-center">
              <div className={cx("relative h-16 overflow-hidden rounded-md border", i === today ? "border-text" : "border-line", wknd ? "bg-[repeating-linear-gradient(135deg,#1a1410_0_6px,#0e0b09_6px_12px)]" : "bg-[#0e0e0e]")}>
                {!wknd && <span className="absolute inset-x-0 bottom-0 bg-[#d9a441]/40" style={{ top: `${35}%` }} />}
                {i === today && <span suppressHydrationWarning className="week-now absolute inset-y-0 w-0.5 bg-text" style={{ left: `${((now % 86_400_000) / 86_400_000) * 100}%` }} />}
              </div>
              <p className={cx("mt-1.5 font-mono text-[12px]", wknd ? "text-[#d9a441]" : "text-muted")}>{d}</p>
            </div>
          );
        })}
      </div>
      <p className="max-w-lg text-center text-[13px] text-muted">The amber band is when the real share trades. The stripes are when only the token does.</p>
    </div>
  );
}
