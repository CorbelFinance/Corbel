/**
 * Spec instruments for the tabs that describe contracts and rules rather than read live data:
 * flow, failure modes, contract register, order types, filler interface, agent limits, strategies,
 * prop desk, shield rules, launch dashboard, alerts. Same shell as the live tools (kit.tsx).
 */
import Link from "next/link";
import {
  CONTRACTS,
  FILLER_CALLS,
  FILLER_FLOW,
  ORDER_TYPES,
  PROP_TERMS,
  SHIELD_RULES,
  STRATEGY_COLUMNS,
  factText,
  type Layer,
} from "@corbel/config";
import { Rich, cx } from "@corbel/ui";
import { Instrument, Led, Readout } from "./kit";

const pad = (n: number) => String(n).padStart(2, "0");
const TH = "px-4 py-3 font-medium text-[12px] font-normal uppercase tracking-[0.08em] text-muted";
const code = (layer: Layer) => layer.name.slice(0, 1).toUpperCase();

function Head({ cols, className }: { cols: string[]; className?: string }) {
  return (
    <thead>
      <tr className={cx("border-b border-line", className)}>
        {cols.map((h) => (
          <th key={h} scope="col" className={TH}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function State({ on, label }: { on: boolean; label: string }) {
  return <Led tone={on ? "on" : "off"} live={on} label={label} />;
}

/** How the layer works, as a pipeline of stages joined by a rail. */
export function Flow({ layer }: { layer: Layer }) {
  return (
    <Instrument
      code={`${code(layer)}-00`}
      title="Flow"
      status={<Led tone="off" label={`${layer.steps.length} stages`} />}
    >
      <ol className="flow grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-5">
        {layer.steps.map(([name, line], i) => (
          <li key={name} className="flow-step relative bg-bg p-5">
            <div className="flex items-center gap-3">
              <span className="font-medium text-[12px] uppercase tracking-[0.08em] text-leaf">
                S{pad(i + 1)}
              </span>
              <span aria-hidden className="h-px flex-1 bg-line" />
              <span aria-hidden className="font-mono text-[12px] text-muted">
                {i < layer.steps.length - 1 ? "→" : "■"}
              </span>
            </div>
            <p className="mt-4 font-display text-xl tracking-tight">{name}</p>
            <p className="mt-2 text-sm text-muted">
              <Rich text={line} />
            </p>
          </li>
        ))}
      </ol>
    </Instrument>
  );
}

/** The layer's risks as a numbered register: the failure, then what it means. */
export function RiskMatrix({ layer }: { layer: Layer }) {
  const rows = layer.risks.map((r) => {
    const cut = r.indexOf(". ");
    return cut > 0 && cut < 40 ? { head: r.slice(0, cut), body: r.slice(cut + 2) } : { head: r, body: "" };
  });
  return (
    <Instrument
      code={`${code(layer)}-R1`}
      title="Failure modes"
      status={<Led tone="bad" label={`${rows.length} known`} />}
      foot={<span>Read these before you use {layer.name}.</span>}
    >
      <ul className="divide-y divide-line">
        {rows.map((r, i) => (
          <li
            key={r.head}
            className="irow grid grid-cols-[3.5rem_1fr] gap-x-4 px-4 py-4 sm:grid-cols-[4rem_16rem_1fr]"
          >
            <span className="text-[12px] tabular-nums text-flesh">R{pad(i + 1)}</span>
            <span className="text-text">{r.head}</span>
            {r.body && <span className="col-start-2 mt-1 text-sm text-muted sm:col-start-3 sm:mt-0">{r.body}</span>}
          </li>
        ))}
      </ul>
    </Instrument>
  );
}

/** Contracts behind the layer: role, guarantees, and the forge tests that prove them. */
export function ContractRegister({ layer }: { layer: Layer }) {
  const list = CONTRACTS.filter((c) => c.layer === layer.id);
  const tests = list.reduce((a, c) => a + c.tests.length, 0);
  return (
    <div className="space-y-6">
      <Instrument
        code={`${code(layer)}-T1`}
        title="Contract register"
        status={<Led tone={list.some((c) => c.deployed) ? "on" : "off"} label={list.some((c) => c.deployed) ? "Live · not audited" : "Not deployed · not audited"} />}
      >
        <div className="grid gap-px bg-line sm:grid-cols-3">
          <Readout label="Contracts" value={list.length} />
          <Readout label="Tests passing" value={tests} sub={list.some((c) => c.tests.some((t) => t.kind === "fork")) ? "forge, incl. a fork of the live chain" : "forge unit tests"} />
          <Readout label="Last audit" value={factText("lastAudit")} dim sub="none yet" />
        </div>
      </Instrument>
      {list.map((c, i) => (
        <Instrument
          key={c.name}
          code={`${code(layer)}-T${i + 2}`}
          title={c.name}
          status={c.deployed ? <a href={`https://robinhoodchain.blockscout.com/address/${c.deployed.address}`} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-leaf underline underline-offset-2">{`${c.deployed.address.slice(0, 6)}…${c.deployed.address.slice(-4)} ↗`}</a> : <State on={false} label="Address after deploy" />}
        >
          <div className="grid gap-px bg-line lg:grid-cols-[1.2fr_1fr]">
            <div className="bg-bg p-5">
              <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Role</p>
              <p className="mt-2 text-text">{c.role}</p>
              <p className="mt-5 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Guarantees</p>
              <ul className="mt-2 space-y-2">
                {c.guarantees.map((g, j) => (
                  <li key={g} className="grid grid-cols-[2.5rem_1fr] text-sm">
                    <span className="font-mono text-[12px] text-leaf">G{pad(j + 1)}</span>
                    <span className="text-muted">{g}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-bg p-5">
              <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                Proof · {c.tests.length} tests
              </p>
              <ul className="mt-2 space-y-1.5 font-mono text-xs">
                {c.tests.map((t) => (
                  <li key={t.name} className="flex items-baseline gap-3">
                    <span className="text-leaf" aria-label="passing">
                      ✓
                    </span>
                    <span className="flex-1 text-text">{t.name}</span>
                    <span className="text-[12px] uppercase tracking-[0.08em] text-muted">{t.kind}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Instrument>
      ))}
    </div>
  );
}

/** Trade → Orders: the three order types and the life of one order. */
export function OrderTypes() {
  const life = [
    ["place", "Owner escrows the input and sets slices, clock and floor."],
    ["due", "Anyone asks whether a slice is ready and what it would get."],
    ["fill", "A slice runs through the V2 router; the floor is checked on arrival."],
    ["cancel", "Owner stops it at any time and gets the rest back."],
  ] as const;
  return (
    <div className="space-y-6">
      <Instrument
        code="T-11"
        title="Order types"
        status={<State on={false} label="CorbelOrders · not deployed" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">Order types handled by one contract</caption>
            <Head cols={["Type", "Slices", "Clock", "Fills"]} />
            <tbody>
              {ORDER_TYPES.map((o) => (
                <tr key={o.type} className="irow border-b border-line last:border-0">
                  <th
                    scope="row"
                    className="px-4 py-3 font-medium text-xs font-normal uppercase tracking-[0.08em] text-leaf"
                  >
                    {o.type}
                  </th>
                  <td className="px-4 py-3 font-mono text-xs text-text">{o.slices}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text">{o.clock}</td>
                  <td className="px-4 py-3 text-muted">{o.fills}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Instrument>
      <Instrument
        code="T-12"
        title="Life of an order"
        foot={<span>No admin key. Output always goes to the owner.</span>}
      >
        <ol className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {life.map(([fn, what], i) => (
            <li key={fn} className="bg-bg p-5">
              <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                Step {pad(i + 1)}
              </p>
              <p className="mt-3 font-mono text-sm text-leaf">{fn}()</p>
              <p className="mt-2 text-sm text-muted">{what}</p>
            </li>
          ))}
        </ol>
      </Instrument>
    </div>
  );
}

/** Trade → Filler desk: the keeper interface of CorbelOrders. */
export function FillerDesk() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <Instrument code="T-21" title="Interface" status={<State on={false} label="Opens at deploy" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <caption className="sr-only">Calls a filler makes</caption>
            <Head cols={["Call", "Kind", "Does"]} />
            <tbody>
              {FILLER_CALLS.map((c) => (
                <tr key={c.call} className="irow border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-3 font-mono text-xs font-normal text-text">
                    {c.call}
                  </th>
                  <td
                    className={cx(
                      "px-4 py-3 font-medium text-[12px] uppercase tracking-[0.08em]",
                      c.kind === "write" ? "text-leaf" : "text-muted",
                    )}
                  >
                    {c.kind}
                  </td>
                  <td className="px-4 py-3 text-muted">{c.does}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Instrument>
      <Instrument
        code="T-22"
        title="Keeper loop"
        foot={<span>The tip is paid from the slice. Nothing is paid for a failed fill.</span>}
      >
        <ol className="divide-y divide-line">
          {FILLER_FLOW.map((s, i) => (
            <li key={s} className="irow grid grid-cols-[3rem_1fr] px-4 py-3 text-sm">
              <span className="font-mono text-[12px] text-leaf">K{pad(i + 1)}</span>
              <span className="text-muted">{s}</span>
            </li>
          ))}
        </ol>
      </Instrument>
    </div>
  );
}

/** Agents → Limits: what an owner can change and how fast it applies. */
export function AgentLimits() {
  const rows = [
    ["Raise a limit", `Waits ${factText("agentLimitDelay")}`, "A stolen key can't widen the box at once."],
    ["Lower a limit", "At once", "Tightening is never delayed."],
    ["Freeze the agent", "At once", "Owner only. Trading stops in the same block."],
    ["Send funds out", "Never", "Funds only return to your account."],
  ] as const;
  return (
    <Instrument code="G-11" title="Limit changes" status={<Led tone="on" label="Enforced by the contract" />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <caption className="sr-only">How limit changes apply</caption>
          <Head cols={["Action", "Applies", "Why"]} />
          <tbody>
            {rows.map(([a, when, why]) => (
              <tr key={a} className="irow border-b border-line last:border-0">
                <th scope="row" className="px-4 py-3 font-normal text-text">
                  {a}
                </th>
                <td
                  className={cx(
                    "px-4 py-3 font-medium text-xs uppercase tracking-[0.08em]",
                    when === "Never" ? "text-flesh" : "text-leaf",
                  )}
                >
                  {when}
                </td>
                <td className="px-4 py-3 text-muted">{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Instrument>
  );
}

/** Agents → Strategies: the registry of live mandates. Today one: the team's own demo on the rule-06 factory. */
export function Strategies() {
  return (
    <Instrument
      code="G-21"
      title="Mandate registry"
      status={<State on label="Factory live · not audited" />}
      foot={
        <Link href="/app/agents/break" className="text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
          Try to break a mandate on live pools →
        </Link>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <caption className="sr-only">Live mandates</caption>
          <Head cols={[...STRATEGY_COLUMNS]} />
          <tbody>
            <tr className="border-t border-line text-[13px]">
              <td className="px-4 py-3 font-mono text-text">0xc1DC…A79F</td>
              <td className="px-4 py-3">
                <a href="https://robinhoodchain.blockscout.com/address/0xc5a6CAe3eCDd2d09A6d308543F27a3325acDa94E" target="_blank" rel="noreferrer" className="font-mono text-text underline decoration-line underline-offset-4">0xc5a6…a94E ↗</a>
                <span className="ml-2 text-[12px] text-muted">team demo</span>
              </td>
              <td className="px-4 py-3 tabular-nums text-text">{`${0} USDG`}</td>
              <td className="px-4 py-3 tabular-nums text-text">{`${0} of ${3}`}</td>
              <td className="px-4 py-3 tabular-nums text-text">{`${0.04} USDG`}</td>
              <td className="px-4 py-3 text-muted">New agent, no bond yet</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-3 text-[13px] text-muted">The one mandate today is ours: the owner and the agent are team wallets, with demo amounts. Mandates on the three earlier factories are retired.</p>
    </Instrument>
  );
}

/** Agents → Prop desk: the terms of a funded seat. */
export function PropDesk() {
  return (
    <Instrument
      code="G-31"
      title="Funded seats, after the desk opens"
      status={<State on={false} label="Planned" />}
      foot={<span>Values are set per tier before the desk opens.</span>}
    >
      <ul className="divide-y divide-line">
        {PROP_TERMS.map((t, i) => (
          <li
            key={t.term}
            className="irow grid grid-cols-[3rem_8rem_1fr] items-baseline gap-x-4 px-4 py-3.5 text-sm"
          >
            <span className="font-mono text-[12px] text-leaf">P{pad(i + 1)}</span>
            <span className="font-medium text-xs uppercase tracking-[0.08em] text-text">{t.term}</span>
            <span className="text-muted">{t.value}</span>
          </li>
        ))}
      </ul>
    </Instrument>
  );
}

/** Shield → Rules: each rule and the check that backs it. */
export function ShieldRules() {
  const live = SHIELD_RULES.filter((r) => r.source === "live").length;
  return (
    <Instrument
      code="S-11"
      title="Rule set"
      status={<Led tone="on" live label={`${live} of ${SHIELD_RULES.length} checks run today`} />}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <caption className="sr-only">Shield rules and their checks</caption>
          <Head cols={["#", "Rule", "Backed by", "State"]} />
          <tbody>
            {SHIELD_RULES.map((r, i) => (
              <tr key={r.rule} className="irow border-b border-line last:border-0">
                <td className="px-4 py-3 font-mono text-[12px] text-leaf">S{pad(i + 1)}</td>
                <th scope="row" className="px-4 py-3 font-normal text-text">
                  {r.rule}
                </th>
                <td className="px-4 py-3 font-mono text-xs text-muted">{r.backedBy}</td>
                <td className="px-4 py-3">
                  {r.source === "live" ? (
                    <Link href="/app/trust/check" className="inline-flex items-center gap-2 hover:underline">
                      <State on label="Live in Trust" />
                      <span aria-hidden className="text-leaf">→</span>
                    </Link>
                  ) : (
                    <State on={false} label="Planned" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Instrument>
  );
}

/** Launch → Dashboard: launches made through Corbel, and the terms every launch gets. */
export function LaunchDashboard({ layer }: { layer: Layer }) {
  return (
    <div className="space-y-6">
      <Instrument
        code="L-11"
        title="Corbel launches"
        status={<State on={false} label="Launchpad not deployed" />}
      >
        <div className="grid gap-px bg-line sm:grid-cols-4">
          <Readout label="Launches" value="—" dim sub="after deploy" />
          <Readout label="Graduated" value="—" dim sub="curve sold out" />
          <Readout label="Refunded" value="—" dim sub="target missed" />
          <Readout label="Liquidity locked" value="—" dim sub="in v4, no remove" />
        </div>
      </Instrument>
      <Instrument
        code="L-12"
        title="Terms every launch gets"
        foot={
          <Link href="/app/trust/launches" className="text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
            Every launch on the chain this week →
          </Link>
        }
      >
        <ul className="divide-y divide-line">
          {layer.terms.map((t, i) => (
            <li
              key={t.label}
              className="irow grid grid-cols-[3rem_1fr_auto] items-baseline gap-x-4 px-4 py-3.5 text-sm"
            >
              <span className="font-mono text-[12px] text-leaf">L{pad(i + 1)}</span>
              <span className="text-text">{t.label}</span>
              <span className="text-xs tabular-nums text-text">{factText(t.fact)}</span>
            </li>
          ))}
        </ul>
      </Instrument>
    </div>
  );
}

/** Stocks → Alerts: the alerts that will exist, closed for now. */
export function Alerts() {
  const rows = [
    ["Weekend gap", "The token drifts from Friday's close while mint and burn are shut."],
    ["Premium", "Chain price moves away from the reference by more than your threshold."],
    ["Float", "A large share of a token's float moves into meme pools."],
  ] as const;
  return (
    <Instrument
      code="K-31"
      title="Alert types"
      status={<State on={false} label="Closed" />}
      foot={<span>Opens with the Stocks layer.</span>}
    >
      <ul className="divide-y divide-line">
        {rows.map(([name, what], i) => (
          <li
            key={name}
            className="irow grid grid-cols-[3rem_9rem_1fr] items-baseline gap-x-4 px-4 py-3.5 text-sm"
          >
            <span className="font-mono text-[12px] text-muted">A{pad(i + 1)}</span>
            <span className="font-medium text-xs uppercase tracking-[0.08em] text-text">{name}</span>
            <span className="text-muted">{what}</span>
          </li>
        ))}
      </ul>
    </Instrument>
  );
}
