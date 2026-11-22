"use client";

/**
 * Planners for the tabs that describe contracts which are not deployed yet. They compute from the inputs
 * (and, for the order planner, from a live quote), place nothing, and say so. Every figure is derived from
 * what the user types or from the chain; no performance is promised.
 */
import { useEffect, useMemo, useState } from "react";
import { MANDATE_DEMO, factText } from "@corbel/config";
import { cx } from "@corbel/ui";
import { CopyButton } from "../docs/CopyButton";
import { Instrument, Led, Meter, Readout, Seg, fmtNum } from "./kit";

const num = (s: string, d = 0) => {
  const v = Number(s.replace(/,/g, ""));
  return Number.isFinite(v) && v >= 0 ? v : d;
};

function Field({
  id,
  label,
  value,
  onChange,
  suffix,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
        {label}
      </label>
      <div className="ifield mt-1.5 h-10">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          className="px-3 font-mono text-sm text-text"
        />
        {suffix && <span className="flex items-center px-3 font-mono text-[12px] text-muted">{suffix}</span>}
      </div>
      {hint && <p className="mt-1.5 text-[12px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ orders */

type Kind = "limit" | "dca" | "twap";
const KINDS = [
  { id: "limit", label: "Limit" },
  { id: "dca", label: "DCA" },
  { id: "twap", label: "TWAP" },
] as const;
const DEFAULTS: Record<Kind, { slices: string; every: string; floor: string }> = {
  limit: { slices: "1", every: "0", floor: "2" },
  dca: { slices: "7", every: "1", floor: "-1" },
  twap: { slices: "10", every: "5", floor: "-0.5" },
};

/** Orders: plan a limit, DCA or TWAP sell of ETH for USDG against the live price. Nothing is placed. */
export function OrderPlanner() {
  const [kind, setKind] = useState<Kind>("dca");
  const [amount, setAmount] = useState("1");
  const [slices, setSlices] = useState(DEFAULTS.dca.slices);
  const [every, setEvery] = useState(DEFAULTS.dca.every);
  const [floor, setFloor] = useState(DEFAULTS.dca.floor);
  const [ref, setRef] = useState<number | null>(null);
  const [block, setBlock] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let off = false;
    fetch("/api/quote?from=ETH&to=USDG&amount=1")
      .then((r) => r.json())
      .then((j: { routes?: { ok: boolean; amountOut: string | null }[]; best?: number; block?: string }) => {
        const r = j.routes?.[j.best ?? 0];
        if (off) return;
        if (r?.ok && r.amountOut) {
          setRef(Number(r.amountOut) / 1e6);
          setBlock(j.block ?? null);
        } else setFailed(true);
      })
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, []);

  function pick(k: Kind) {
    setKind(k);
    setSlices(DEFAULTS[k].slices);
    setEvery(DEFAULTS[k].every);
    setFloor(DEFAULTS[k].floor);
  }

  const n = Math.max(1, Math.min(60, Math.round(num(slices, 1))));
  const amt = num(amount, 0);
  const pct = Number(floor.replace(",", "."));
  const off = Number.isFinite(pct) ? pct : 0;
  const unit = kind === "dca" ? "day" : "min";
  const gap = kind === "limit" ? 0 : Math.max(0, num(every, 0));
  const px = ref ? ref * (1 + off / 100) : null;
  const each = amt / n;
  const rows = Array.from({ length: Math.min(n, 12) }, (_, i) => i);
  const span = gap * (n - 1);

  return (
    <Instrument
      code="T-10"
      title="Order planner"
      status={<Led tone="off" label="Plan · nothing is placed" />}
      foot={
        <>
          <span>
            {ref
              ? `Live price ${fmtNum(ref, 2)} USDG per ETH · block ${Number(block).toLocaleString("en")}`
              : failed
                ? "Live price unavailable: enter your own floor below"
                : "Reading the live price…"}
          </span>
          <span>ETH → USDG</span>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-4 border-b border-line p-4">
        <Seg label="Order type" value={kind} options={KINDS} onChange={pick} />
        <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
          {kind === "limit"
            ? "One slice, fills when the pool pays your floor or better"
            : kind === "dca"
              ? "One slice per day, each with its own floor"
              : "One slice per few minutes, to trade size without one big print"}
        </p>
      </div>
      <div className="grid gap-4 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="op-amt" label="Sell in total" value={amount} onChange={setAmount} suffix="ETH" />
        <Field
          id="op-n"
          label="Slices"
          value={slices}
          onChange={setSlices}
          hint={kind === "limit" ? "A limit is one slice" : "1 to 60"}
        />
        {kind !== "limit" && (
          <Field
            id="op-gap"
            label={kind === "dca" ? "Every" : "Every"}
            value={every}
            onChange={setEvery}
            suffix={unit === "day" ? "days" : "min"}
          />
        )}
        <Field
          id="op-floor"
          label="Floor vs live price"
          value={floor}
          onChange={setFloor}
          suffix="%"
          hint={kind === "limit" ? "+ above: waits for a better price" : "− below: accepts a worse price"}
        />
      </div>
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line lg:grid-cols-4">
        <Readout label="Each slice" value={`${fmtNum(each, 6)} ETH`} />
        <Readout label="Floor price" value={px ? `${fmtNum(px, 2)}` : "—"} sub="USDG per ETH" dim={!px} />
        <Readout
          label="Least you receive"
          value={px ? `${fmtNum(amt * px, 2)}` : "—"}
          sub="USDG, if every slice fills"
          dim={!px}
        />
        <Readout
          label="Runs for"
          value={
            kind === "limit" ? "until it fills" : `${fmtNum(span, 4)} ${unit === "day" ? "days" : "min"}`
          }
          sub={kind === "limit" ? "or you cancel" : `${n} slices`}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <caption className="sr-only">Planned slices</caption>
          <thead>
            <tr className="border-b border-line">
              {["Slice", "When", "Sells", "Floor price", "Least out"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-4 py-3 font-medium text-[12px] font-normal uppercase tracking-[0.08em] text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i} className="irow border-b border-line last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs text-leaf">{String(i + 1).padStart(2, "0")}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">
                  {kind === "limit"
                    ? "when the floor is met"
                    : i === 0
                      ? "at once"
                      : `+${fmtNum(gap * i, 4)} ${unit === "day" ? "d" : "min"}`}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-text">{fmtNum(each, 6)} ETH</td>
                <td className="px-4 py-2.5 font-mono text-xs text-text">{px ? fmtNum(px, 2) : "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-text">
                  {px ? `${fmtNum(each * px, 2)} USDG` : "—"}
                </td>
              </tr>
            ))}
            {n > rows.length && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-2.5 font-medium text-[12px] uppercase tracking-[0.08em] text-muted"
                >
                  + {n - rows.length} more slices, the same way
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Instrument>
  );
}

/* ------------------------------------------------------------------ agent limits */

/** Agents · Limits: the one-hour delay on raising a limit, drawn on a timeline you can scrub. */
export function LimitDelay() {
  const [now, setNow] = useState("1,000");
  const [next, setNext] = useState("2,500");
  const [min, setMin] = useState(0);
  const delay = 60;
  const a = num(now, 0);
  const b = num(next, 0);
  const raising = b > a;
  const applied = !raising || min >= delay;
  const eff = applied ? b : a;
  const cells = 24;
  const on = Math.round((Math.min(min, delay) / delay) * cells);

  return (
    <Instrument
      code="G-12"
      title="Limit change timeline"
      status={<Led tone="on" label={`Delay ${factText("agentLimitDelay")} · target`} />}
      foot={<span>The delay is a design target, not yet enforced on a deployed contract</span>}
    >
      <div className="grid gap-4 border-b border-line p-4 sm:grid-cols-2">
        <Field id="ld-now" label="Per-trade cap now" value={now} onChange={setNow} suffix="USDG" />
        <Field id="ld-next" label="Owner asks for" value={next} onChange={setNext} suffix="USDG" />
      </div>
      <div className="border-b border-line p-4">
        <label htmlFor="ld-min" className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
          Minutes since the request
        </label>
        <input
          id="ld-min"
          type="range"
          min={0}
          max={90}
          value={min}
          onChange={(e) => setMin(Number(e.target.value))}
          className="mt-3 block w-full accent-[var(--ui)]"
        />
        <div className="mt-4 flex items-center gap-4">
          <Meter
            value={raising ? Math.min(min, delay) / delay : 1}
            cells={cells}
            tone={raising && !applied ? "mid" : "good"}
            label="Time until the new limit applies"
          />
          <span className="shrink-0 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
            {raising ? (applied ? "applied" : `${delay - min} min left`) : "applies at once"}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-line">
        <Readout
          label="Cap the agent can use"
          value={`${fmtNum(eff, 2)} USDG`}
          tone={applied ? "good" : undefined}
          sub={
            raising
              ? applied
                ? "the raised limit is live"
                : "still the old limit"
              : "tightening is never delayed"
          }
        />
        <Readout
          label="Change type"
          value={raising ? "Raise" : b === a ? "No change" : "Lower"}
          sub={raising ? `waits ${factText("agentLimitDelay")}` : "at once"}
        />
      </div>
      <p className="sr-only">
        {on} of {cells} cells filled
      </p>
    </Instrument>
  );
}

/* ------------------------------------------------------------------ mandate builder */

/** The pool fee cap in the mandate (the demo contract refuses pools above it). */
const POOL_FEE_CAP = 0.01;
/** Slash per violation and violations before freeze, as in the demo contract. */
const SLASH = 0.1;
const FREEZE = 3;
const PRESET_MANDATES = [
  {
    id: "treasury",
    label: "Treasury bot",
    cap: "250",
    budget: "500",
    slip: "0.3",
    bond: "500",
    cool: "60",
    stop: "3",
    weekdays: true,
  },
  {
    id: "trader",
    label: "Active trader",
    cap: "1,000",
    budget: "2,000",
    slip: "1",
    bond: "500",
    cool: "10",
    stop: "10",
    weekdays: true,
  },
  {
    id: "hunter",
    label: "Launch hunter",
    cap: "100",
    budget: "500",
    slip: "3",
    bond: "200",
    cool: "0",
    stop: "25",
    weekdays: false,
  },
] as const;

/** Agents · Mandate: draft the rules and see what they allow on the worst day, the worst month, and when the agent cheats. */
export function MandateBuilder() {
  const [cap, setCap] = useState("1,000");
  const [budget, setBudget] = useState("2,000");
  const [slip, setSlip] = useState("1");
  const [bond, setBond] = useState("500");
  const [cool, setCool] = useState("10");
  const [stop, setStop] = useState("10");
  const [weekdays, setWeekdays] = useState(true);
  const [preset, setPreset] = useState<string>("trader");

  const m = useMemo(() => {
    const capN = num(cap),
      budgetN = num(budget),
      slipN = Math.min(10, num(slip)),
      bondN = num(bond),
      coolN = num(cool),
      stopN = Math.min(100, num(stop));
    const byCool = coolN > 0 ? Math.floor((24 * 60) / coolN) : Infinity;
    const byBudget = capN > 0 ? Math.floor(budgetN / capN) : 0;
    const tradesPerDay = Math.min(byBudget, byCool);
    // inside the rules, the most an agent can leak is what every trade may give away: slippage plus the pool fee
    const leakDay = budgetN * (slipN / 100 + POOL_FEE_CAP);
    const days = weekdays ? 22 : 30;
    const leakMonth = leakDay * days;
    const coverDays = leakDay > 0 ? bondN / leakDay : Infinity;
    const perViolation = bondN * SLASH;
    // strength: one point per sound rule, out of 100
    const checks: [string, boolean, string][] = [
      [
        "Per-trade cap under the daily budget",
        capN > 0 && capN <= budgetN,
        "Otherwise the budget is the only real limit.",
      ],
      [
        "Slippage at most the demo's rule",
        slipN <= 1,
        `A loose price lets a sandwich take up to ${slipN}% of every trade.`,
      ],
      ["Bond covers a week of worst-case leakage", coverDays >= 7, "A small bond makes cheating cheap."],
      ["A cooldown between trades", coolN > 0, "Without it, the whole budget can go in one burst."],
      ["A drawdown stop", stopN > 0 && stopN <= 20, "Stops the agent after a set loss, whatever the reason."],
      [
        "Weekdays only for stock tokens",
        weekdays,
        "Mint and burn are shut on weekends; gaps open without a pull back.",
      ],
    ];
    const strength = Math.round((checks.filter((c) => c[1]).length / checks.length) * 100);
    // the rogue run: an agent that breaks a rule every day until frozen
    const rogue: { n: number; take: number; left: number; frozen: boolean }[] = [];
    for (let i = 0, left = bondN; i < FREEZE; i++) {
      const take = i === FREEZE - 1 ? left : left * SLASH;
      left -= take;
      rogue.push({ n: i + 1, take, left, frozen: i === FREEZE - 1 });
    }
    const json = JSON.stringify(
      {
        draft: true,
        assets: ["USDG", "WETH", "ETH"],
        perTradeCap: { USDG: capN },
        dailyBudget: { USDG: budgetN },
        maxSlippagePct: slipN,
        maxPoolFeePct: POOL_FEE_CAP * 100,
        unknownHooks: false,
        weekdaysOnly: weekdays,
        cooldownMinutes: coolN,
        drawdownStopPct: stopN,
        bond: { USDG: bondN },
        slashPerViolationPct: SLASH * 100,
        freezeAfterViolations: FREEZE,
      },
      null,
      2,
    );
    return {
      capN,
      budgetN,
      slipN,
      bondN,
      coolN,
      stopN,
      tradesPerDay,
      leakDay,
      leakMonth,
      days,
      coverDays,
      perViolation,
      checks,
      strength,
      rogue,
      json,
    };
  }, [cap, budget, slip, bond, cool, stop, weekdays]);

  const pick = (id: string) => {
    const x = PRESET_MANDATES.find((p) => p.id === id)!;
    setPreset(id);
    setCap(x.cap);
    setBudget(x.budget);
    setSlip(x.slip);
    setBond(x.bond);
    setCool(x.cool);
    setStop(x.stop);
    setWeekdays(x.weekdays);
  };
  const touch =
    <T,>(f: (v: T) => void) =>
    (v: T) => (f(v), setPreset("custom"));
  const guardHref = `/app/agents/guard`;
  const tone = m.strength >= 80 ? "text-leaf" : m.strength >= 50 ? "text-text" : "text-flesh";
  const maxBar = Math.max(m.leakMonth, m.bondN, 1);

  const passed = m.checks.filter((c) => c[1]).length;
  return (
    <div className="space-y-4">
      {/* what the Agents section is for, in three steps */}
      <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
        {(
          [
            [
              "1",
              "Set the rules",
              "How much an AI agent may trade from your money, how fast, and at what price. This page.",
              null,
            ],
            [
              "2",
              "Check each trade",
              "Before the agent trades, the Guard runs the trade against these rules on the chain.",
              "/app/agents/guard",
            ],
            [
              "3",
              "Cheating costs it",
              "A broken rule is refused, and the agent's bond is paid to you. Try it in Break it.",
              "/app/agents/break",
            ],
          ] as const
        ).map(([n, h, s, href]) => (
          <li key={n} className="flex gap-3 bg-[#0e0e0e] px-4 py-3.5">
            <span
              className={cx(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[12px]",
                href ? "border border-line text-muted" : "bg-ui text-[#0b0b0b]",
              )}
            >
              {n}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-text">{h}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{s}</span>
              {href && (
                <a
                  href={href}
                  className="mt-1 inline-block text-[12.5px] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui"
                >
                  Open →
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Instrument
          code="G-20"
          title="Your agent's rules"
          status={<Led tone="off" label="Draft" />}
          foot={
            <span>
              A draft. Nothing here is a live mandate and nothing on this page holds funds. The mandate
              factory itself is live: see the registry and Transparency.
            </span>
          }
        >
          <div className="p-4">
            <p className="text-[13px] text-muted">Start from a ready set, then change any number.</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PRESET_MANDATES.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => pick(x.id)}
                  className={cx(
                    "rounded-xl border px-3 py-2.5 text-left text-[13px] font-semibold",
                    preset === x.id
                      ? "border-leaf/60 bg-leaf/10 text-text"
                      : "border-[#242424] bg-[#131313] text-muted hover:text-text",
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-x-5 gap-y-5 border-t border-line p-5 sm:grid-cols-2 2xl:grid-cols-3">
            <Field
              id="mb-cap"
              label="Per-trade cap"
              value={cap}
              onChange={touch(setCap)}
              suffix="USDG"
              hint="The most one trade may spend."
            />
            <Field
              id="mb-bud"
              label="Daily budget"
              value={budget}
              onChange={touch(setBudget)}
              suffix="USDG"
              hint="The most it may spend in a day."
            />
            <Field
              id="mb-slip"
              label="Max slippage"
              value={slip}
              onChange={touch(setSlip)}
              suffix="%"
              hint={`How much worse than the quote a fill may be. Demo rule: ${MANDATE_DEMO.slippage}.`}
            />
            <Field
              id="mb-bond"
              label="Agent bond"
              value={bond}
              onChange={touch(setBond)}
              suffix="USDG"
              hint="The agent's own deposit. You are paid from it when it breaks a rule."
            />
            <Field
              id="mb-cool"
              label="Cooldown"
              value={cool}
              onChange={touch(setCool)}
              suffix="min"
              hint="The wait between two trades."
            />
            <Field
              id="mb-stop"
              label="Drawdown stop"
              value={stop}
              onChange={touch(setStop)}
              suffix="%"
              hint="The agent stops after losing this share."
            />
            <div>
              <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Trading window</p>
              <div className="mt-1.5">
                <Seg
                  label="Trading window"
                  value={weekdays ? "wk" : "all"}
                  options={[
                    { id: "wk", label: "Weekdays" },
                    { id: "all", label: "Every day" },
                  ]}
                  onChange={(v) => touch(setWeekdays)(v === "wk")}
                />
              </div>
              <p className="mt-1.5 text-[12px] text-muted">
                Stock tokens drift on weekends, when the share does not trade.
              </p>
            </div>
          </div>
          <details className="border-t border-line">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 font-medium text-[12px] uppercase tracking-[0.08em] text-muted hover:text-text">
              Show the rules as mandate.json
            </summary>
            <div className="flex justify-end border-t border-line px-4 py-2">
              <CopyButton text={m.json} />
            </div>
            <pre
              tabIndex={0}
              aria-label="Mandate draft"
              className="max-h-56 overflow-auto border-t border-line p-4 font-mono text-[12px] leading-relaxed text-muted"
            >
              <code>{m.json}</code>
            </pre>
          </details>
        </Instrument>

        <div className="space-y-4">
          <Instrument
            code="G-22"
            tone="moss"
            title="What they allow"
            status={
              <span
                className={cx("font-mono text-[13px]", tone)}
              >{`${passed} of ${m.checks.length} sound`}</span>
            }
          >
            <div className="grid grid-cols-2 gap-px bg-line">
              {(
                [
                  [
                    "Trades a day",
                    Number.isFinite(m.tradesPerDay) ? String(m.tradesPerDay) : "—",
                    "text-text",
                  ],
                  [
                    "Bond covers",
                    Number.isFinite(m.coverDays) ? `${fmtNum(m.coverDays, 1)} days` : "—",
                    m.coverDays >= 7 ? "text-leaf" : "text-flesh",
                  ],
                  ["Worst day", `${fmtNum(m.leakDay, 0)} USDG`, "text-flesh"],
                  [`Worst ${m.days} days`, `${fmtNum(m.leakMonth, 0)} USDG`, "text-flesh"],
                ] as const
              ).map(([k, v, c]) => (
                <div key={k} className="bg-[#0e0e0e] px-4 py-2.5">
                  <p className="text-[12px] text-muted">{k}</p>
                  <p className={cx("font-mono text-[17px]", c)}>{v}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 border-t border-line px-4 py-3">
              {[
                ["Worst month", m.leakMonth, "bg-flesh"],
                ["Bond", m.bondN, "bg-leaf"],
              ].map(([k, v, c]) => (
                <div key={k as string} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-[12px]">
                  <span className="text-muted">{k}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-[#242424]">
                    <span
                      className={cx("block h-full rounded-full", c as string)}
                      style={{ width: `${Math.min(100, ((v as number) / maxBar) * 100)}%` }}
                    />
                  </span>
                </div>
              ))}
            </div>
            <ul className="border-t border-line px-4 py-2.5 text-[12.5px]">
              {m.checks.map(([k, ok, why]) => (
                <li key={k} className="flex gap-2 py-0.5" title={ok ? undefined : why}>
                  <span className={ok ? "text-leaf" : "text-flesh"}>{ok ? "✓" : "✕"}</span>
                  <span className={ok ? "text-muted" : "text-text"}>{k}</span>
                </li>
              ))}
            </ul>
          </Instrument>

          <Instrument
            code="G-24"
            title="If the agent cheats"
            status={<Led tone="bad" label={`Frozen at strike ${FREEZE}`} />}
          >
            <ol className="px-4 py-2.5 text-[12.5px]">
              {m.rogue.map((r) => (
                <li key={r.n} className="flex items-center gap-3 py-1">
                  <span className="w-14 font-medium text-[12px] uppercase text-muted">{`Strike ${r.n}`}</span>
                  <span className="flex-1 text-text">
                    {r.frozen ? "Frozen, rest of the bond to you" : "Refused, bond slashed"}
                  </span>
                  <span className="font-mono text-leaf">{`+${fmtNum(r.take, 0)}`}</span>
                </li>
              ))}
            </ol>
            <a
              href={guardHref}
              className="block border-t border-line px-4 py-2.5 text-[12.5px] text-leaf hover:bg-leaf/[0.05]"
            >
              Test a real trade in the Guard →
            </a>
          </Instrument>
        </div>
      </div>
      <TradeCard
        cap={m.capN}
        budget={m.budgetN}
        slip={m.slipN}
        cool={m.coolN}
        weekdays={weekdays}
        bond={m.bondN}
        guardHref={guardHref}
      />
    </div>
  );
}

/** A row of choices for the trade card (no native select). */
function Btns({
  label,
  value,
  opts,
  unit,
  on,
}: {
  label: string;
  value: number;
  opts: number[];
  unit: string;
  on: (v: number) => void;
}) {
  return (
    <div>
      <p className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-muted">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={label}>
        {opts.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => on(o)}
            className={cx(
              "min-w-11 rounded-md border px-2 py-1.5 font-mono text-[12.5px]",
              value === o ? "border-leaf bg-leaf/10 text-text" : "border-line text-muted hover:text-text",
            )}
          >
            {`${fmtNum(o, o < 10 ? 1 : 0)}${unit}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A trade the agent wants to make, checked against the draft in the contract's own order (asset, size, daily budget,
 * price, window, cooldown, pool), so the owner sees which rule stops it and what that costs the agent's bond.
 */
function TradeCard({
  cap,
  budget,
  slip,
  cool,
  weekdays,
  bond,
  guardHref,
}: {
  cap: number;
  budget: number;
  slip: number;
  cool: number;
  weekdays: boolean;
  bond: number;
  guardHref: string;
}) {
  const [amount, setAmount] = useState(250);
  const [spent, setSpent] = useState(0);
  const [move, setMove] = useState(0.5);
  const [since, setSince] = useState(60);
  const [weekend, setWeekend] = useState(false);
  const [approved, setApproved] = useState(true);
  const rules: [string, boolean, string][] = [
    ["Asset on the list", true, "USDG is listed"],
    ["Size", amount <= cap, `${fmtNum(amount, 0)} against a cap of ${fmtNum(cap, 0)}`],
    ["Daily budget", spent + amount <= budget, `${fmtNum(spent + amount, 0)} of ${fmtNum(budget, 0)} today`],
    ["Price from mark", move <= slip, `${move}% against ${slip}%`],
    [
      "Window",
      !(weekdays && weekend),
      weekdays ? (weekend ? "weekend, and the rule is weekdays only" : "a weekday") : "any day",
    ],
    ["Cooldown", since >= cool, `${since} min since the last trade, ${cool} needed`],
    ["Pool approved by the owner", approved, approved ? "approved" : "a pool the owner never approved"],
  ];
  const first = rules.findIndex((r) => !r[1]);
  const ok = first < 0;
  return (
    <Instrument
      code="G-25"
      title="Try a trade against these rules"
      status={<Led tone={ok ? "on" : "bad"} label={ok ? "Executed" : `Refused · ${rules[first]![0]}`} />}
      foot={
        <span>
          Checked here in the contract&apos;s own order. The Guard runs the same trade against the real
          contract inside a simulation.
        </span>
      }
    >
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Btns
            label="The agent wants to spend (USDG)"
            value={amount}
            opts={[50, 250, 1000, 2500]}
            unit=""
            on={setAmount}
          />
          <Btns label="Already spent today" value={spent} opts={[0, 500, 1500]} unit="" on={setSpent} />
          <Btns label="Price from the mark" value={move} opts={[0.2, 0.5, 1, 3]} unit="%" on={setMove} />
          <Btns
            label="Minutes since its last trade"
            value={since}
            opts={[2, 10, 60]}
            unit=" min"
            on={setSince}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={weekend}
              onClick={() => setWeekend(!weekend)}
              className={cx(
                "rounded-md border px-3 py-1.5 text-[12.5px]",
                weekend ? "border-amber text-amber" : "border-line text-muted hover:text-text",
              )}
            >
              {weekend ? "On a weekend" : "On a weekday"}
            </button>
            <button
              type="button"
              aria-pressed={!approved}
              onClick={() => setApproved(!approved)}
              className={cx(
                "rounded-md border px-3 py-1.5 text-[12.5px]",
                approved ? "border-line text-muted hover:text-text" : "border-flesh text-flesh",
              )}
            >
              {approved ? "Pool approved" : "Pool not approved"}
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-line">
          <p className="border-b border-line px-4 py-2.5 font-mono text-[12.5px] text-text">{`Agent → buy with ${fmtNum(amount, 0)} USDG`}</p>
          <ol className="px-4 py-2 text-[12.5px]">
            {rules.map(([k, pass, why], i) => {
              const reached = first < 0 || i <= first;
              return (
                <li
                  key={k}
                  className={cx(
                    "grid grid-cols-[1rem_9.5rem_minmax(0,1fr)] gap-2 py-1",
                    !reached && "opacity-40",
                  )}
                >
                  <span className={pass ? "text-leaf" : "text-flesh"}>
                    {reached ? (pass ? "✓" : "✕") : "·"}
                  </span>
                  <span className="text-text">{k}</span>
                  <span className="text-muted">{why}</span>
                </li>
              );
            })}
          </ol>
          <p className={cx("border-t border-line px-4 py-2.5 text-[13px]", ok ? "text-leaf" : "text-flesh")}>
            {ok
              ? "Every rule passes: the trade is made."
              : `Stopped at “${rules[first]![0]}”. Nothing is swapped, ${fmtNum(bond * SLASH, 0)} USDG of the bond goes to you.`}
          </p>
          <a
            href={guardHref}
            className="block border-t border-line px-4 py-2.5 text-[12.5px] text-leaf hover:bg-leaf/[0.05]"
          >
            Run this trade against the real contract in the Guard →
          </a>
        </div>
      </div>
    </Instrument>
  );
}
