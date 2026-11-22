"use client";

/**
 * Owner's panel · People and Limits. Counts come from lib/stats.ts (random per-tab visit ids, no IP, no wallet next to
 * an event); limits are written to the settings store and apply on the next request.
 */
import { useState } from "react";
import { cx } from "@corbel/ui";
import { Verdict } from "./kit";

export type Stats = {
  days: number;
  perDay: { day: string; visits: number; views: number; clicks: number }[];
  regs: { day: string; n: number }[];
  active: { day: string; n: number }[];
  totalWallets: number;
  pages: { path: string; views: number; visits: number; exits: number }[];
  clicks: { path: string; label: string; n: number; visits: number }[];
  funnel: { visits: number; app: number; used: number; signed: number };
  depth: { views: number; n: number }[];
  medianMs: number | null;
};
export type LimitRow = { k: string; label: string; value: number; min: number; max: number; setAt: number | null };

const n0 = (v: number) => v.toLocaleString("en");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const dur = (ms: number | null) => (ms == null ? null : ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

/** Bars for the last days; a day with nothing is a thin stub, never a gap. */
function DayBars({ series, tone, label }: { series: { day: string; n: number }[]; tone: string; label: string }) {
  const max = Math.max(1, ...series.map((s) => s.n));
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <div className="mt-2 flex h-20 items-end gap-1" role="img" aria-label={label}>
        {series.map((s) => (
          <span key={s.day} title={`${s.day}: ${n0(s.n)}`} className={cx("flex-1 rounded-t", tone)} style={{ height: `${Math.max(4, (s.n / max) * 100)}%` }} />
        ))}
      </div>
      <p className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{series[0]?.day.slice(5)}</span>
        <span>{series.at(-1)?.day.slice(5)}</span>
      </p>
    </div>
  );
}

/** The days of the window, each with a number (zero when nothing happened). */
function fill(days: number, rows: { day: string; n: number }[]) {
  const by = new Map(rows.map((r) => [r.day, r.n]));
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { day, n: by.get(day) ?? 0 };
  });
}

export function AdminPeople({ s }: { s: Stats | null }) {
  if (!s) return <p className="rounded-2xl border border-line bg-[#0f0f0f] p-8 text-[14px] text-muted">No statistics yet: they start with the first visit after this release.</p>;
  const f = s.funnel;
  const today = new Date().toISOString().slice(0, 10);
  const td = s.perDay.find((p) => p.day === today);
  const regToday = s.regs.find((r) => r.day === today)?.n ?? 0;
  const steps: { label: string; n: number; hint: string }[] = [
    { label: "Opened the site", n: f.visits, hint: "visits (one per browser tab)" },
    { label: "Opened the app", n: f.app, hint: "visited a page under /app" },
    { label: "Used a tool", n: f.used, hint: "clicked something inside the app" },
    { label: "Signed in", n: f.signed, hint: "wallets that signed in (counted apart, not tied to visits)" },
  ];
  const deep = s.depth.reduce((a, d) => a + d.n, 0);
  const one = s.depth.find((d) => d.views === 1)?.n ?? 0;
  return (
    <div className="space-y-4">
      <Verdict
        kicker={`People · last ${s.days} days`}
        tone="info"
        value={n0(f.visits)}
        valueLabel="visits"
        facts={[
          ["Today", td ? `${n0(td.visits)} visits · ${n0(td.views)} pages` : "no visits yet"],
          ["Wallets signed in ever", n0(s.totalWallets)],
          ["New wallets today", n0(regToday)],
          ["Left after one page", deep ? pct(one, deep) : null],
          ["Median visit", dur(s.medianMs)],
        ]}
      >
        {f.visits ? `${pct(f.app, f.visits)} of visitors open the app, ${pct(f.used, f.visits)} use a tool, and ${n0(f.signed)} wallets signed in.` : "No visits recorded in this window yet."}
      </Verdict>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-line bg-[#0f0f0f] p-5">
          <DayBars series={fill(s.days, s.perDay.map((p) => ({ day: p.day, n: p.visits })))} tone="bg-leaf/70" label="Visits per day" />
        </section>
        <section className="rounded-2xl border border-line bg-[#0f0f0f] p-5">
          <DayBars series={fill(s.days, s.regs)} tone="bg-[#6cc0d0]/70" label="New wallets per day (first sign-in)" />
        </section>
        <section className="rounded-2xl border border-line bg-[#0f0f0f] p-5">
          <DayBars series={fill(s.days, s.active)} tone="bg-[#ff9a5c]/70" label="Wallets signed in per day" />
        </section>
      </div>

      {/* the way in: where people drop */}
      <section className="rounded-2xl border border-line bg-[#0f0f0f] p-5">
        <h2 className="text-[15px] font-semibold text-text">Where people drop</h2>
        <ol className="mt-4 space-y-3">
          {steps.map((st, i) => {
            const prev = i ? steps[i - 1]!.n : st.n;
            const drop = i && i < 3 && prev ? Math.round((1 - st.n / prev) * 100) : null;
            return (
              <li key={st.label} className="grid grid-cols-[10rem_minmax(0,1fr)_9rem] items-center gap-4 text-[13.5px]">
                <span className="text-text" title={st.hint}>
                  {st.label}
                </span>
                <span className="h-6 overflow-hidden rounded-md bg-[#161616]">
                  <span className="block h-full rounded-md bg-gradient-to-r from-[#1f8a52] to-leaf" style={{ width: `${f.visits ? Math.max(1.5, (st.n / f.visits) * 100) : 0}%` }} />
                </span>
                <span className="text-right tabular-nums text-text">
                  {n0(st.n)} <span className={cx("text-[12px]", drop != null && drop > 50 ? "text-amber" : "text-muted")}>{drop != null ? `−${drop}%` : pct(st.n, f.visits)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-line bg-[#0f0f0f]">
          <header className="border-b border-line px-5 py-3.5">
            <h2 className="text-[15px] font-semibold text-text">Pages</h2>
            <p className="text-[12px] text-muted">Where people stop is the share of visits that ended on the page.</p>
          </header>
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-muted">
                <th className="px-5 py-2 font-medium">Page</th>
                <th className="px-3 py-2 text-right font-medium">Views</th>
                <th className="px-3 py-2 text-right font-medium">Visits</th>
                <th className="px-5 py-2 text-right font-medium">Stopped here</th>
              </tr>
            </thead>
            <tbody>
              {s.pages.map((p) => (
                <tr key={p.path} className="border-b border-line/60 last:border-0">
                  <td className="max-w-[16rem] truncate px-5 py-2 text-text">{p.path}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text">{n0(p.views)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{n0(p.visits)}</td>
                  <td className={cx("px-5 py-2 text-right tabular-nums", p.exits / Math.max(1, p.visits) > 0.6 && p.visits >= 5 ? "text-amber" : "text-muted")}>{pct(p.exits, p.visits)}</td>
                </tr>
              ))}
              {!s.pages.length && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-muted">
                    No page views yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="overflow-hidden rounded-2xl border border-line bg-[#0f0f0f]">
          <header className="border-b border-line px-5 py-3.5">
            <h2 className="text-[15px] font-semibold text-text">What they press</h2>
            <p className="text-[12px] text-muted">The label of the link or button and the page it was on. Nothing typed is kept.</p>
          </header>
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-muted">
                <th className="px-5 py-2 font-medium">Control</th>
                <th className="px-3 py-2 font-medium">On page</th>
                <th className="px-3 py-2 text-right font-medium">Presses</th>
                <th className="px-5 py-2 text-right font-medium">Visits</th>
              </tr>
            </thead>
            <tbody>
              {s.clicks.map((c) => (
                <tr key={`${c.path}|${c.label}`} className="border-b border-line/60 last:border-0">
                  <td className="max-w-[14rem] truncate px-5 py-2 text-text">{c.label}</td>
                  <td className="max-w-[10rem] truncate px-3 py-2 text-muted">{c.path}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text">{n0(c.n)}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-muted">{n0(c.visits)}</td>
                </tr>
              ))}
              {!s.clicks.length && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-muted">
                    No presses recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
      <p className="px-1 text-[12px] text-muted">
        Counted without IP, browser, cookie or wallet next to an event. A visit is one browser tab; the same person on another day is a new visit. Events older than 30 days are deleted.
      </p>
    </div>
  );
}

export function AdminLimits({ rows, onSaved }: { rows: LimitRow[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = rows.filter((r) => draft[r.k] !== undefined && Number(draft[r.k]) !== r.value);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    const limits = Object.fromEntries(changed.map((r) => [r.k, Number(draft[r.k])]));
    const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limits }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; errors?: string[] } | null;
    setBusy(false);
    if (j?.ok) {
      setDraft({});
      setMsg({ ok: true, text: "Saved. It applies on the next request." });
      onSaved();
    } else setMsg({ ok: false, text: j?.errors?.join(" ") ?? "Not saved." });
  };
  return (
    <section className="rounded-2xl border border-line bg-[#0f0f0f] p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold text-text">Limits</h2>
      <p className="mt-1 text-[13px] text-muted">A wallet&apos;s day starts and ends at 00:00 UTC. A change applies at once; the counts already used today stay.</p>
      <ul className="mt-5 divide-y divide-line/60">
        {rows.map((r) => {
          const v = draft[r.k] ?? String(r.value);
          return (
            <li key={r.k} className="grid items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_8rem]">
              <label htmlFor={`lim-${r.k}`} className="text-[14px] text-text">
                {r.label}
                <span className="block text-[12px] text-muted">{r.setAt ? `set in the panel ${new Date(r.setAt).toISOString().slice(0, 16).replace("T", " ")} UTC` : "default"}</span>
              </label>
              <input
                id={`lim-${r.k}`}
                inputMode="decimal"
                value={v}
                onChange={(e) => setDraft((d) => ({ ...d, [r.k]: e.target.value.replace(/[^\d.]/g, "") }))}
                className={cx("h-10 rounded-lg border bg-[#0e0e0e] px-3 text-right text-[15px] tabular-nums text-text outline-none focus:border-ui/60", Number(v) !== r.value ? "border-amber/60" : "border-line")}
              />
              <span className="text-[12px] text-muted sm:text-right">{`${r.min} to ${r.max}`}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex items-center gap-4">
        <button type="button" disabled={!changed.length || busy} onClick={() => void save()} className="h-11 rounded-xl bg-ui px-6 text-[14px] font-semibold text-[#0b0b0b] disabled:opacity-50">
          {busy ? "Saving…" : changed.length ? `Save ${changed.length} change${changed.length > 1 ? "s" : ""}` : "Nothing changed"}
        </button>
        {msg && <p className={cx("text-[13px]", msg.ok ? "text-leaf" : "text-flesh")}>{msg.text}</p>}
      </div>
    </section>
  );
}

export type Signups = { total: number; today: number; week: number; rows: { who: string; kind: "wallet" | "google"; first: number; last: number; coins: number | null; tier: string | null }[] };

const utc = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ");
const ago = (t: number) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60_000));
  return m < 2 ? "now" : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** Who signed in: newest first, with when, how, the coins held and the AI level they open. */
export function AdminSignups({ s }: { s: Signups | null }) {
  const [only, setOnly] = useState<"all" | "wallet" | "google" | "holders">("all");
  if (!s) return <p className="rounded-2xl border border-line bg-[#0f0f0f] p-8 text-[14px] text-muted">No sign-ins recorded yet.</p>;
  const rows = s.rows.filter((r) => (only === "all" ? true : only === "holders" ? !!r.tier : r.kind === only));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["Today", s.today],
            ["Last 7 days", s.week],
            ["All time", s.total],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-[#0f0f0f] p-5">
            <p className="text-[12px] text-muted">{k}</p>
            <p className="mt-1 font-display text-4xl tracking-tight text-text">{n0(v)}</p>
            <p className="mt-1 text-[12px] text-muted">new sign-ins</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-[#0f0f0f]">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <p className="mr-auto text-[14px] font-semibold text-text">
            Signed in <span className="font-normal text-muted">newest first, times in UTC</span>
          </p>
          {(["all", "wallet", "google", "holders"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={only === k} onClick={() => setOnly(k)} className={cx("rounded-lg px-3 py-1 text-[13px] capitalize", only === k ? "bg-[#202020] text-text" : "text-muted hover:text-text")}>
              {k}
            </button>
          ))}
        </div>
        <div className="max-h-[34rem] overflow-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-[#0f0f0f] text-[12px] text-muted">
              <tr>
                <th className="px-4 py-2 font-normal">First sign-in</th>
                <th className="px-4 py-2 font-normal">Who</th>
                <th className="px-4 py-2 font-normal">How</th>
                <th className="px-4 py-2 text-right font-normal">$CORBEL held</th>
                <th className="px-4 py-2 font-normal">Level</th>
                <th className="px-4 py-2 font-normal">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.who + r.first} className="border-t border-line">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-muted">{utc(r.first)}</td>
                  <td className="px-4 py-2 font-mono text-text">
                    {r.kind === "wallet" ? (
                      <a href={`https://robinhoodchain.blockscout.com/address/${r.who}`} target="_blank" rel="noreferrer" title={r.who} className="underline decoration-line underline-offset-4 hover:decoration-text">
                        {r.who.slice(0, 8)}…{r.who.slice(-6)}
                      </a>
                    ) : (
                      <span title="A Google sign-in is only a keyed hash: no e-mail, no name">Google · {r.who}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted">{r.kind === "wallet" ? "Wallet" : "Google"}</td>
                  <td className="px-4 py-2 text-right font-mono text-text">{r.coins == null ? "—" : n0(r.coins)}</td>
                  <td className="px-4 py-2">{r.tier ? <span className="rounded-full border border-line px-2 py-0.5 text-[12px] text-leaf">{r.tier}</span> : <span className="text-muted">—</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{ago(r.last)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    Nobody here yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line p-4 text-[12px] text-muted">A wallet address is public on chain. A Google sign-in shows only a short keyed hash. No IP, no e-mail and no name is shown or kept next to a sign-in.</p>
      </div>
    </div>
  );
}

export type Inbox = { open: number; rows: { id: number; at: number; page: string; text: string; contact: string | null; done: boolean }[] };

/** Messages from the terminal's Support button: open ones first; mark one done when it is answered. */
export function AdminInbox({ s, onChanged }: { s: Inbox | null; onChanged: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  async function mark(id: number, done: boolean) {
    setBusy(id);
    await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ support: { id, done } }) }).catch(() => null);
    setBusy(null);
    onChanged();
  }
  if (!s || s.rows.length === 0) return <p className="rounded-2xl border border-line bg-[#0f0f0f] p-8 text-[14px] text-muted">No messages yet. They arrive from the Support button in the terminal.</p>;
  return (
    <div className="rounded-2xl border border-line bg-[#0f0f0f]">
      <p className="border-b border-line p-4 text-[14px] font-semibold text-text">
        Support <span className="font-normal text-muted">{s.open} open · times in UTC</span>
      </p>
      <ul className="max-h-[36rem] divide-y divide-line overflow-auto">
        {s.rows.map((m) => (
          <li key={m.id} className={cx("p-4", m.done && "opacity-50")}>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-muted">
              <span>{utc(m.at)}</span>
              <span>{m.page}</span>
              {m.contact && <span className="text-leaf">{m.contact}</span>}
              <button type="button" disabled={busy === m.id} onClick={() => void mark(m.id, !m.done)} className="ibtn-ghost ml-auto h-7 px-3">
                {m.done ? "Reopen" : "Done"}
              </button>
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-[14px] text-text">{m.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
