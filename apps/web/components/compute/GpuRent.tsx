"use client";

/**
 * AI & GPUs · free GPU time for Full holders. Pick a GPU, start it, open it through Corbel's own link with the password
 * shown here; it stops itself when the time is up, or with Stop. Everything comes from /api/gpu.
 */
import { useCallback, useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { useSession } from "../app/session";

type State = {
  signedIn: boolean;
  full: boolean;
  need: number;
  holdDays: number;
  rules?: readonly string[];
  apps?: { id: string; label: string; app: string; line: string }[];
  soon?: { id: string; label: string; vram: number; line: string }[];
  open: boolean;
  choices: { id: string; label: string; vram: number; line: string }[];
  minutesPerDay: number;
  minutesLeft: number | null;
  budgetLeft: number;
  busy: boolean;
  active: { id: string; gpu: string; app: string; started: number; ends: number; status: string; access: string | null; password: string } | null;
  last: { id: string; gpu: string; started: number; stopped: number | null; status: string; steps: { at: number; step: string; block: number | null }[] } | null;
  booking: { gpu: string; at: number; status: string; note: string | null } | null;
  paid?: { open: boolean; balance: number | null; minutes: readonly number[]; hourly: Record<string, number> };
};

const inWords = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);
const hhmmss = (t: number) => new Date(t).toISOString().slice(11, 19);

/** The rental's own log: every step with its UTC time and the chain block it was stamped with. */
function Receipt({ last }: { last: NonNullable<State["last"]> }) {
  return (
    <div className="mt-5 rounded-2xl border border-[#3a2418] bg-[#0d0907] p-4">
      <p className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[12px] text-[#ff9a5c]">
        <span>{`Receipt · rental ${last.id}`}</span>
        <span className="text-[#a8907f]">{last.gpu}</span>
      </p>
      <ol className="mt-3 space-y-1.5 font-mono text-[12.5px]">
        {last.steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-3">
            <span className="text-[#a8907f]">{hhmmss(s.at)}</span>
            <span className="text-text">{s.step}</span>
            <span className="text-[#a8907f]">{s.block ? `#${s.block.toLocaleString("en-US")}` : ""}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-[#a8907f]">Times in UTC. Each step carries the chain block of that moment, so the record can be held against the chain.</p>
    </div>
  );
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function GpuRent() {
  const auth = useSession();
  const [st, setSt] = useState<State | null>(null);
  const [pick, setPick] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [agree, setAgree] = useState(false);
  const [app, setApp] = useState("");
  // free holder time, or paid time from Credits (any signed-in wallet)
  const [mode, setMode] = useState<"free" | "paid">("free");
  const [mins, setMins] = useState(30);

  const load = useCallback(() => fetch("/api/gpu", { cache: "no-store" }).then((r) => r.json()).then((j: State) => setSt(j)).catch(() => null), []);
  useEffect(() => {
    void Promise.resolve().then(load);
    // the clock for the booking hours and the countdown: read after mount, never during render
    void Promise.resolve().then(() => setNow(Date.now()));
    const slow = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(slow);
  }, [load, auth.address]);
  const active = st?.active ?? null;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    const p = setInterval(() => void load(), 10_000);
    return () => {
      clearInterval(t);
      clearInterval(p);
    };
  }, [active, load]);

  const [slot, setSlot] = useState<number | null>(null);
  async function act(method: "POST" | "DELETE", opts?: { at?: number; booking?: boolean }) {
    setBusy(true);
    setErr(null);
    try {
      const url = opts?.booking ? "/api/gpu?booking=1" : "/api/gpu";
      const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? JSON.stringify({ gpu: pick || st?.choices[0]?.id, app: app || st?.apps?.[0]?.id, agree, ...(paidMode && !opts?.at ? { paid: true, minutes: mins } : {}), ...(opts?.at ? { at: opts.at } : {}) }) : undefined });
      const j = (await r.json()) as State & { error?: string };
      if (!r.ok) setErr(j.error ?? "It did not work.");
      await load();
    } catch {
      setErr("No answer. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const shell = (body: React.ReactNode, status?: string) => (
    <section className="cmp-stage card-in relative overflow-hidden rounded-[28px] border border-[#3a2418] p-6 sm:p-8">
      <span aria-hidden className="cmp-glow" />
      <div className="relative flex flex-wrap items-center gap-3">
        <p className="font-mono text-[12px] text-[#ff9a5c]">Free GPU time · Full holders</p>
        {status && <span className="ml-auto rounded-full border border-[#3a2418] px-3 py-1 font-mono text-[12px] text-[#d8c2b4]">{status}</span>}
      </div>
      <div className="relative">{body}</div>
    </section>
  );

  if (!st) return shell(<p className="mt-4 text-[14px] text-muted">Reading…</p>);
  const head = (
    <>
      <h2 className="mt-1 max-w-xl font-display text-3xl tracking-tight text-text sm:text-4xl">{st.minutesPerDay} minutes of GPU a day, free.</h2>
      <p className="mt-2 max-w-xl text-[14px] text-[#d8c2b4]">
        For wallets holding {st.need.toLocaleString("en-US")} $CORBEL through the last {st.holdDays} days. A real GPU with Jupyter, opened through Corbel. It stops itself when the time is up.
      </p>
    </>
  );

  if (!st.signedIn || !auth.address) return shell(<>{head}<p className="mt-5 text-[14px] text-text">Sign in with your wallet from the top bar to start.</p></>);
  if (!st.full && !st.paid?.open) return shell(<>{head}<p className="mt-5 text-[14px] text-text">This wallet is not at Full yet. The level counts the lowest balance of the last {st.holdDays} days.</p></>);
  if (!st.open) return shell(<>{head}<p className="mt-5 text-[14px] text-text">The GPUs open soon. Your free minutes will be waiting.</p></>, "soon");

  if (active) {
    const left = active.ends - (now || active.started);
    const ready = active.status === "running";
    return shell(
      <>
        <h2 className="mt-1 font-display text-3xl tracking-tight text-text sm:text-4xl">{ready ? "Your GPU is running." : "Starting your GPU…"}</h2>
        <p className="mt-2 text-[14px] text-[#d8c2b4]">{`${active.app} on the ${active.gpu} · stops by itself in ${mmss(left)}`}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#3a2418] bg-[#140d0a]/90 p-4">
            <p className="font-mono text-[12px] text-[#ff9a5c]">Open</p>
            {active.access ? (
              <a href={active.access} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[15px] font-semibold text-text underline underline-offset-4">
                {`Open ${active.app} ↗`}
              </a>
            ) : (
              <p className="mt-2 text-[14px] text-muted">{ready ? "The link appears in a moment." : "A few minutes the first time: the program downloads. Your minutes start when it is ready."}</p>
            )}
          </div>
          <div className="rounded-2xl border border-[#3a2418] bg-[#140d0a]/90 p-4">
            <p className="font-mono text-[12px] text-[#ff9a5c]">Password, if it asks</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[14px] text-text">{active.password}</code>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(active.password)} className="rounded-full border border-[#3a2418] px-3 py-1 text-[12px] text-[#e9d6c8] hover:border-[#ff9a5c]/70">
                Copy
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-[#3a2418] bg-[#140d0a]/90 p-4">
            <p className="font-mono text-[12px] text-[#ff9a5c]">Time left</p>
            <p className="mt-2 font-mono text-2xl text-text">{mmss(left)}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => void act("DELETE")} className="h-11 rounded-full border border-[#ff9a5c]/60 px-6 text-[14px] font-semibold text-[#ff9a5c] hover:bg-[#ff9a5c]/10 disabled:opacity-50">
            Stop now
          </button>
          <p className="text-[12.5px] text-muted">Nothing is kept: the machine and its disk are deleted when it stops. Download your files before.</p>
        </div>
        {err && <p className="mt-3 text-[13px] text-flesh">{err}</p>}
        {st.last && st.last.steps.length > 0 && <Receipt last={st.last} />}
      </>,
      ready ? "running" : "starting",
    );
  }

  // the next 24 whole hours (UTC), for a booked start
  const base = now ? Math.ceil(now / 3600_000) * 3600_000 : 0;
  const hours = base ? Array.from({ length: 24 }, (_, i) => base + i * 3600_000) : [];
  const bk = st.booking;

  const cur = pick || st.choices[0]?.id;
  const curApp = app || st.apps?.[0]?.id;
  const paidMode = mode === "paid" || !st.full;
  const out = !paidMode && (st.minutesLeft ?? 0) < 5;
  const hourly = st.paid?.hourly[cur ?? ""] ?? 0;
  const reserve = Math.round(hourly * (mins / 60) * 100) / 100;
  const short = paidMode && (st.paid?.balance ?? 0) < reserve;
  return shell(
    <>
      {head}
      {(st.apps?.length ?? 0) > 0 && (
        <>
          <p className="mt-6 font-mono text-[12px] uppercase tracking-[0.1em] text-[#a8907f]">1 · What it opens to</p>
          <div role="group" aria-label="Program" className="mt-2 grid gap-3 sm:grid-cols-3">
            {st.apps!.map((a) => (
              <button key={a.id} type="button" aria-pressed={curApp === a.id} onClick={() => setApp(a.id)} className={cx("rounded-2xl border p-4 text-left transition-colors", curApp === a.id ? "border-[#ff9a5c] bg-[#1d120c]" : "border-[#3a2418] bg-[#140d0a]/90 hover:border-[#ff9a5c]/60")}>
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold text-text">{a.label}</span>
                  <span className="font-mono text-[12px] text-[#ff9a5c]">{a.app}</span>
                </p>
                <p className="mt-1 text-[13px] text-[#d8c2b4]">{a.line}</p>
              </button>
            ))}
          </div>
          <p className="mt-5 font-mono text-[12px] uppercase tracking-[0.1em] text-[#a8907f]">2 · The GPU</p>
        </>
      )}
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {st.choices.map((c) => (
          <button key={c.id} type="button" aria-pressed={cur === c.id} onClick={() => setPick(c.id)} className={cx("rounded-2xl border p-4 text-left transition-colors", cur === c.id ? "border-[#ff9a5c] bg-[#1d120c]" : "border-[#3a2418] bg-[#140d0a]/90 hover:border-[#ff9a5c]/60")}>
            <p className="flex items-baseline justify-between">
              <span className="text-[15px] font-semibold text-text">{c.label}</span>
              <span className="font-mono text-[12px] text-[#ff9a5c]">{c.vram} GB</span>
            </p>
            <p className="mt-1 text-[13px] text-[#d8c2b4]">{c.line}</p>
          </button>
        ))}
      </div>
      {(st.soon?.length ?? 0) > 0 && (
        <div className="mt-3">
          <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#a8907f]">Soon</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-5">
            {st.soon!.map((c) => (
              <li key={c.id} aria-disabled className="rounded-xl border border-dashed border-[#3a2418] p-3">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-[#d8c2b4]">{c.label}</span>
                  <span className="font-mono text-[11.5px] text-[#a8907f]">soon</span>
                </p>
                <p className="mt-1 text-[12px] text-[#a8907f]">{c.line}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {st.paid?.open && (
        <div className="mt-5 rounded-2xl border border-[#3a2418] bg-[#0d0907] p-4">
          <div role="group" aria-label="How to pay" className="flex flex-wrap gap-2">
            {st.full && (
              <button type="button" aria-pressed={!paidMode} onClick={() => setMode("free")} className={cx("rounded-full border px-4 py-1.5 text-[13px]", !paidMode ? "border-[#ff9a5c] text-text" : "border-[#3a2418] text-[#a8907f]")}>
                {`Free · ${st.minutesPerDay} min a day for holders`}
              </button>
            )}
            <button type="button" aria-pressed={paidMode} onClick={() => setMode("paid")} className={cx("rounded-full border px-4 py-1.5 text-[13px]", paidMode ? "border-[#ff9a5c] text-text" : "border-[#3a2418] text-[#a8907f]")}>
              {`From Credits · balance $${(st.paid.balance ?? 0).toFixed(2)}`}
            </button>
          </div>
          {paidMode && (
            <>
              <div role="group" aria-label="How long" className="mt-3 flex flex-wrap gap-1.5">
                {st.paid.minutes.map((m) => (
                  <button key={m} type="button" aria-pressed={mins === m} onClick={() => setMins(m)} className={cx("rounded-md border px-3 py-1 font-mono text-[12.5px]", mins === m ? "border-[#ff9a5c] text-text" : "border-[#3a2418] text-[#a8907f]")}>
                    {m < 60 ? `${m} min` : `${m / 60} h`}
                  </button>
                ))}
              </div>
              <p className="mt-2 font-mono text-[12.5px] text-[#d8c2b4]">{`$${hourly.toFixed(2)} an hour for this GPU, billed by the minute from the moment it is ready. Top up on the Credits tab.`}</p>
            </>
          )}
        </div>
      )}
      <div className="mt-5 rounded-2xl border border-[#3a2418] bg-[#0d0907] p-4">
        <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#ff9a5c]">Rules · beta</p>
        <ul className="mt-2 space-y-1 text-[13px] text-[#d8c2b4]">
          {(st.rules ?? []).map((r) => (
            <li key={r}>· {r}</li>
          ))}
        </ul>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13.5px] text-text">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-4 w-4 accent-[#ff9a5c]" />I accept these rules
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="button" disabled={busy || out || (!paidMode && st.busy) || !agree || short} onClick={() => void act("POST")} className="h-11 rounded-full bg-[#ff9a5c] px-7 text-[14px] font-semibold text-[#1a0d06] hover:bg-[#ffb07e] disabled:opacity-50">
          {busy ? "Starting…" : "Start my GPU"}
        </button>
        <p className="font-mono text-[12.5px] text-[#d8c2b4]">{paidMode ? `$${reserve.toFixed(2)} reserved now; you pay only the minutes used, the rest stays on your balance` : out ? "Today's minutes are used. Back at 00:00 UTC." : `${st.minutesLeft} min left today`}</p>
        {short && <p className="text-[12.5px] text-flesh">{`Balance $${(st.paid?.balance ?? 0).toFixed(2)}. Top up Credits first.`}</p>}
        {!paidMode && st.busy && <p className="text-[12.5px] text-muted">All free machines are in use right now.</p>}
      </div>
      <div className="mt-6 rounded-2xl border border-[#3a2418] bg-[#0d0907] p-4">
        <p className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#ff9a5c]">Or book a start · UTC</span>
          <span className="font-mono text-[12px] text-[#a8907f]">it starts by itself at that hour, with your minutes for the day</span>
        </p>
        {bk && bk.status === "booked" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="font-mono text-[14px] text-text">{`${bk.gpu} · starts at ${hhmm(bk.at)} UTC${now && bk.at > now ? ` · in ${inWords(bk.at - now)}` : ""}`}</p>
            <button type="button" disabled={busy} onClick={() => void act("DELETE", { booking: true })} className="rounded-full border border-[#3a2418] px-4 py-1.5 text-[12.5px] text-[#e9d6c8] hover:border-[#ff9a5c]/70 disabled:opacity-50">
              Cancel booking
            </button>
          </div>
        ) : (
          <>
            <div role="group" aria-label="Start hour, UTC" className="mt-3 grid grid-cols-6 gap-1 sm:grid-cols-12">
              {hours.map((h) => (
                <button key={h} type="button" aria-pressed={slot === h} onClick={() => setSlot(slot === h ? null : h)} className={cx("rounded-md border py-1.5 font-mono text-[12px] tabular-nums transition-colors", slot === h ? "border-[#ff9a5c] bg-[#ff9a5c]/15 text-text" : "border-[#3a2418] text-[#a8907f] hover:border-[#ff9a5c]/60 hover:text-text")}>
                  {hhmm(h)}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" disabled={busy || slot == null || !agree} onClick={() => slot && void act("POST", { at: slot })} className="h-10 rounded-full border border-[#ff9a5c]/70 px-5 text-[13.5px] font-semibold text-[#ff9a5c] hover:bg-[#ff9a5c]/10 disabled:opacity-40">
                {slot ? `Book ${hhmm(slot)} UTC` : "Pick an hour"}
              </button>
              {bk && bk.status !== "booked" && <p className={cx("font-mono text-[12.5px]", bk.status === "missed" ? "text-flesh" : "text-[#a8907f]")}>{`Last booking ${hhmm(bk.at)} UTC: ${bk.status}${bk.note ? `, ${bk.note}` : ""}`}</p>}
            </div>
          </>
        )}
      </div>
      {err && <p className="mt-3 text-[13px] text-flesh">{err}</p>}
      {st.last && st.last.steps.length > 0 && <Receipt last={st.last} />}
    </>,
  );
}
