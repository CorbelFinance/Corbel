"use client";

import { useEffect, useRef, useState } from "react";
import { MANDATE_DEMO } from "@corbel/config";
import { cx } from "@corbel/ui";
import { Idle, Instrument, Led, Meter, fmtNum } from "./kit";

type Scenario = { id: string; repeat: number; day: string };
const label = (id: string) => MANDATE_DEMO.scenarios[id] ?? { title: id, attempt: "" };
type Attempt = {
  rule: string;
  traded: boolean;
  out: string;
  slashed: string;
  bondAfter: string;
  strikes: number;
  frozen: boolean;
};
type Result = { scenario: string; block: string; at: number; attempts: Attempt[]; ms: number };

const BOND = MANDATE_DEMO.bondUnits;
const RULES = MANDATE_DEMO.rules;
const WHY: Record<string, string> = {
  Size: "Over the per-trade limit.",
  Budget: "Over the day's budget.",
  Price: "Worse than the pool allows, or a pool the mandate won't touch.",
  Assets: "That token isn't on the owner's list.",
  Window: "Outside the trading window.",
  Bond: "No bond posted.",
};
const usdg = (raw: string) => Number(raw) / 1e6;
const dayName = (t: number) => new Date(t * 1000).toUTCString().slice(0, 16);

/** Agents → Break it. The browser calls only /api/mandate; the contract runs inside one eth_call. */
export function MandateLab() {
  const [list, setList] = useState<Scenario[]>([]);
  const [pick, setPick] = useState<string>("nvda-9000");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const out = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/mandate")
      .then((r) => r.json())
      .then((j: { scenarios?: Scenario[] }) => setList(j.scenarios ?? []))
      .catch(() => setErr("No answer. Try again."));
  }, []);

  async function run(id: string) {
    setPick(id);
    setBusy(true);
    setErr(null);
    setRes(null);
    // bring the result into view if it is below the fold
    const box = out.current?.getBoundingClientRect();
    if (box && box.top > window.innerHeight * 0.6)
      out.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const r = await fetch(`/api/mandate?s=${id}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error((j as { error: string }).error);
      setRes(j as Result);
    } catch (e) {
      setErr((e as Error).message || "No answer. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const last = res?.attempts.at(-1);
  const bond = last ? usdg(last.bondAfter) : BOND;
  const strikes = last?.strikes ?? 0;
  const frozen = !!last?.frozen;
  const lost = res ? res.attempts.reduce((a, x) => a + usdg(x.slashed), 0) : 0;

  const broken = new Set(res?.attempts.filter((a) => !a.traded).map((a) => a.rule) ?? []);
  // the contract checks rules in order and stops at the first one broken: later rules are never reached
  const firstBroken = RULES.findIndex((r) => broken.has(r.id));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <Instrument
        code="M-01"
        title="Pick an attack"
        status={<Led tone="on" label="Live pools" />}
        foot={<span>One eth_call each · nothing is sent</span>}
      >
        <ul className="divide-y divide-line">
          {list.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => void run(s.id)}
                disabled={busy}
                aria-pressed={pick === s.id && !!res}
                className={cx(
                  "irow grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left disabled:opacity-60",
                  pick === s.id && (res || busy) && "bg-[color-mix(in_oklab,var(--leaf)_8%,transparent)]",
                )}
              >
                <span className="font-mono text-[12px] text-muted">{`A${String(i + 1).padStart(2, "0")}`}</span>
                <span className="min-w-0">
                  <span className={cx("block text-[14px]", s.id === "honest" ? "text-leaf" : "text-text")}>{label(s.id).title}</span>
                  <span className="mt-0.5 block truncate font-mono text-[12px] text-muted">{label(s.id).attempt}</span>
                </span>
                <span className="flex items-center gap-2">
                  {s.repeat > 1 && <span className="rounded border border-line px-1.5 font-mono text-[12px] text-muted">{`×${s.repeat}`}</span>}
                  <span className="font-mono text-[12px] text-muted">{pick === s.id && busy ? "running…" : "Run →"}</span>
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && !err && <li className="px-4 py-6 font-medium text-xs uppercase tracking-[0.08em] text-muted">Loading…</li>}
        </ul>
      </Instrument>

      <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
      <Instrument
        code="M-00"
        title="The mandate"
        status={<Led tone="on" label="Enforced by the contract" />}
        foot={<span>{MANDATE_DEMO.bondLine}</span>}
      >
        {/* the rules as the contract checks them: in order, stopping at the first one broken */}
        <ol className="relative px-5 py-4">
          <span aria-hidden className="absolute bottom-6 left-[29px] top-6 w-px bg-line" />
          {RULES.map((r, idx) => {
            const hit = broken.has(r.id);
            const held = !!res && !hit && (firstBroken < 0 || idx < firstBroken);
            const skipped = !!res && !hit && firstBroken >= 0 && idx > firstBroken;
            return (
              <li key={r.id} className={cx("relative grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-3 py-2", skipped && "opacity-45")}>
                <span
                  className={cx(
                    "relative z-10 mt-1 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-[#0f0f0f]",
                    hit ? "bg-flesh shadow-[0_0_10px_var(--flesh)]" : held ? "bg-leaf" : "bg-[#303030]",
                  )}
                />
                <span className="min-w-0">
                  <span className={cx("block font-medium text-[12px] uppercase tracking-[0.08em]", hit ? "text-flesh" : "text-text")}>{`R${r.n} · ${r.id}`}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">{r.what}</span>
                </span>
                <span className={cx("mt-0.5 font-medium text-[12px] uppercase tracking-[0.08em]", hit ? "text-flesh" : held ? "text-leaf" : "text-muted")}>
                  {hit ? "✕ broken" : held ? "✓ passed" : skipped ? "not reached" : "armed"}
                </span>
              </li>
            );
          })}
        </ol>
      </Instrument>

      <div ref={out} className="scroll-mt-28">
        <Instrument
          code="M-02"
          title="What the contract did"
          busy={busy}
          status={
            res && (
              <Led
                tone={frozen ? "bad" : "on"}
                label={`Block #${Number(res.block).toLocaleString("en")} · ${dayName(res.at)} · ${(res.ms / 1000).toFixed(1)} s`}
              />
            )
          }
          foot={
            <span>
              A real CorbelMandate, deployed and run inside one eth_call against the chain as it is now
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-px border-b border-line bg-line">
            <div className="bg-bg p-4 sm:p-5">
              <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Agent bond</p>
              <p
                className={cx(
                  "mt-2 font-display text-2xl tabular-nums sm:text-3xl",
                  bond < BOND ? "text-flesh" : "text-text",
                )}
              >
                {fmtNum(bond, 2)}
              </p>
              <div className="mt-3">
                <Meter label="Bond left" value={bond / BOND} cells={20} tone={bond < BOND ? "bad" : "good"} />
              </div>
            </div>
            <div className="bg-bg p-4 sm:p-5">
              <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                Paid to the owner
              </p>
              <p
                className={cx(
                  "mt-2 font-display text-2xl tabular-nums sm:text-3xl",
                  lost > 0 ? "text-leaf" : "text-muted",
                )}
              >
                {fmtNum(lost, 2)}
              </p>
              <p className="mt-1.5 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                USDG, from the bond
              </p>
            </div>
            <div className="bg-bg p-4 sm:p-5">
              <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Strikes</p>
              <div className="mt-3 flex gap-1.5" role="img" aria-label={`${strikes} of 3 strikes`}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={cx("size-5 border", i < strikes ? "border-flesh bg-flesh" : "border-line")}
                  />
                ))}
              </div>
              <p
                className={cx(
                  "mt-2 font-medium text-[12px] uppercase tracking-[0.08em]",
                  frozen ? "text-flesh" : "text-muted",
                )}
              >
                {frozen ? "Frozen" : "Active"}
              </p>
            </div>
          </div>

          {err && <p className="bg-flesh-deep/50 px-4 py-3 text-sm text-text">{err}</p>}
          {!res && !busy && !err && (
            <Idle className="min-h-28">Pick an attack above. The contract decides, not this page.</Idle>
          )}
          {busy && <Idle>Deploying a mandate inside a simulation and running the agent…</Idle>}
          {res && (
            <ol className="divide-y divide-line" aria-live="polite">
              {res.attempts.map((a, i) => (
                <li
                  key={i}
                  className="grid gap-2 px-4 py-4 sm:grid-cols-[3rem_9rem_1fr_auto] sm:items-center"
                >
                  <span className="font-mono text-[12px] text-muted">TRY {i + 1}</span>
                  <span
                    className={cx(
                      "font-medium text-xs uppercase tracking-[0.08em]",
                      a.traded ? "text-leaf" : "text-flesh",
                    )}
                  >
                    <span aria-hidden>{a.traded ? "✓ " : "✕ "}</span>
                    {a.traded ? "Executed" : `${a.rule} rule`}
                  </span>
                  <span className="text-sm text-muted">
                    {a.traded
                      ? "Inside every rule. The output stays in the owner's vault."
                      : (WHY[a.rule] ?? "Refused.")}
                    {a.frozen && " The agent is frozen; its whole bond went to the owner."}
                  </span>
                  <span className="text-xs tabular-nums sm:text-right">
                    {a.traded ? (
                      <span className="text-text">no penalty</span>
                    ) : (
                      <span className="text-flesh">−{fmtNum(usdg(a.slashed), 2)} USDG bond</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Instrument>
      </div>
      </div>
    </div>
  );
}
