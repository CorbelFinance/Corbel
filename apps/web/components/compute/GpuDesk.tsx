"use client";

/**
 * AI & GPUs · the free holder machines, live: how many run and start now out of the most at once, which GPU types are
 * in use, minutes served today, the share of today's free budget used, and bookings waiting. Read from /api/gpu/status
 * every 15 s, with how fresh the reading is. Zeros are shown as zeros.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { AI_ACCESS } from "@corbel/config";

type Desk = {
  open: boolean;
  at: number;
  running: number;
  starting: number;
  maxAtOnce: number;
  rentalsToday: number;
  minutesToday: number;
  budgetUsedPct: number;
  booked: number;
  minutesPerDay: number;
  choices: { id: string; label: string; vram: number; line: string; inUse: number }[];
  soon?: { id: string; label: string; vram: number; line: string }[];
};

export function GpuDesk() {
  const [d, setD] = useState<Desk | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let off = false;
    const load = () =>
      fetch("/api/gpu/status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: Desk | null) => !off && (j ? (setD(j), setErr(false)) : setErr(true)))
        .catch(() => !off && setErr(true));
    void load();
    const p = setInterval(load, 15_000);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      off = true;
      clearInterval(p);
      clearInterval(t);
    };
  }, []);

  const age = d && now ? Math.max(0, Math.round((now - d.at) / 1000)) : 0;
  const slots = d ? Array.from({ length: d.maxAtOnce }, (_, i) => (i < d.running ? "run" : i < d.running + d.starting ? "start" : "free")) : [];
  return (
    <section aria-label="GPU desk" className="overflow-hidden rounded-[22px] border border-[#3a2418] bg-[#0d0907]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#3a2418] px-5 py-3">
        <span aria-hidden className={cx("h-2 w-2 rounded-full", d?.open ? "animate-pulse bg-[#ff9a5c]" : "bg-[#5a4334]")} />
        <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#ff9a5c]">GPU desk · free holder machines</p>
        <p className="ml-auto font-mono text-[12px] text-[#a8907f]">{err ? "no answer, retrying" : d ? `updated ${age}s ago` : "reading"}</p>
      </header>
      {d && (
        <div className="grid gap-px bg-[#3a2418] md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div className="bg-[#0d0907] p-5">
            <p className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-[#a8907f]">Machines now</p>
            <p className="mt-1 font-mono text-[28px] tabular-nums text-text">
              {d.running + d.starting}
              <span className="text-[16px] text-[#a8907f]">{` / ${d.maxAtOnce}`}</span>
            </p>
            <div role="img" className="mt-3 flex gap-1.5" aria-label={`${d.running} running, ${d.starting} starting, ${d.maxAtOnce - d.running - d.starting} free`}>
              {slots.map((s, i) => (
                <span key={i} className={cx("h-6 flex-1 rounded-[3px] border", s === "run" ? "border-[#ff9a5c] bg-[#ff9a5c]/80" : s === "start" ? "animate-pulse border-[#ff9a5c]/70 bg-[#ff9a5c]/25" : "border-[#3a2418] bg-[#140d0a]")} />
              ))}
            </div>
            <p className="mt-2 font-mono text-[11.5px] text-[#a8907f]">{`${d.running} running · ${d.starting} starting · ${Math.max(0, d.maxAtOnce - d.running - d.starting)} free`}</p>
          </div>
          <div className="bg-[#0d0907] p-5">
            <p className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-[#a8907f]">Served today</p>
            <p className="mt-1 font-mono text-[28px] tabular-nums text-text">{d.minutesToday}<span className="text-[16px] text-[#a8907f]"> min</span></p>
            <p className="mt-2 font-mono text-[11.5px] text-[#a8907f]">{`${d.rentalsToday} rental${d.rentalsToday === 1 ? "" : "s"} since 00:00 UTC`}</p>
          </div>
          <div className="bg-[#0d0907] p-5">
            <p className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-[#a8907f]">Free budget used</p>
            <p className="mt-1 font-mono text-[28px] tabular-nums text-text">{d.budgetUsedPct}<span className="text-[16px] text-[#a8907f]">%</span></p>
            <div className="mt-3 h-1.5 rounded-full bg-[#140d0a]">
              <i className="block h-full rounded-full bg-[#ff9a5c]" style={{ width: `${d.budgetUsedPct}%` }} />
            </div>
            <p className="mt-2 font-mono text-[11.5px] text-[#a8907f]">resets 00:00 UTC</p>
          </div>
          <div className="bg-[#0d0907] p-5">
            <p className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-[#a8907f]">Booked starts</p>
            <p className="mt-1 font-mono text-[28px] tabular-nums text-text">{d.booked}</p>
            <p className="mt-2 font-mono text-[11.5px] text-[#a8907f]">{`Free minutes a day by tier: ${AI_ACCESS.tiers.filter((t) => t.gpuMinutes).map((t) => `${t.name} ${t.gpuMinutes}`).join(" · ")}`}</p>
          </div>
        </div>
      )}
      {d && (
        <ul className="grid gap-px border-t border-[#3a2418] bg-[#3a2418] sm:grid-cols-2">
          {d.choices.map((c) => (
            <li key={c.id} className="flex items-center gap-3 bg-[#0d0907] px-5 py-3">
              <span className="rounded-md border border-[#3a2418] px-2 py-0.5 font-mono text-[12px] text-[#ff9a5c]">{`${c.vram} GB`}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-text">{c.label}</span>
              <span className="font-mono text-[12px] text-[#a8907f]">{c.inUse ? `${c.inUse} in use` : "none in use"}</span>
            </li>
          ))}
          {(d.soon ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-3 bg-[#0d0907] px-5 py-3">
              <span className="rounded-md border border-dashed border-[#3a2418] px-2 py-0.5 font-mono text-[12px] text-[#a8907f]">{`${c.vram} GB`}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#d8c2b4]">{c.label}</span>
              <span className="font-mono text-[12px] text-[#a8907f]">soon</span>
            </li>
          ))}
        </ul>
      )}
      {d && !d.open && <p className="border-t border-[#3a2418] px-5 py-3 text-[13px] text-[#d8c2b4]">The machines open soon. Everything here counts from the first rental.</p>}
    </section>
  );
}
