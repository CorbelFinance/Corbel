"use client";

/**
 * Agents · Versus. Two mandates on the same market, run side by side by the real CorbelMandate inside an eth_call
 * against live pools: what each agent traded, what the contract refused and why, the bond it lost, whether it froze.
 * The pairs are the Break it scenarios that share a market; nothing is sent.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Bay } from "./Bay";

type Attempt = { rule: string; traded: boolean; out: string; slashed: string; bondAfter: string; strikes: number; frozen: boolean };
type Desc = { id: string; repeat: number; in: string; out: string; amount: number; acceptBps: number };
type Run = { scenario: string; block: string; attempts: Attempt[]; ms: number; error?: string };

const PAIRS = [
  {
    id: "price",
    title: "Same swap, two price rules",
    market: "WETH → USDG",
    a: { id: "honest", name: "Careful agent" },
    b: { id: "loose-price", name: "Loose agent" },
  },
  {
    id: "size",
    title: "Same stock pool, two sizes",
    market: "USDG → NVDA, a thin pool",
    a: { id: "trap-pool", name: "Small agent" },
    b: { id: "nvda-9000", name: "Big agent" },
  },
  {
    id: "repeat",
    title: "One try against three",
    market: "USDG → NVDA, a thin pool",
    a: { id: "nvda-9000", name: "Stops after one" },
    b: { id: "three-strikes", name: "Keeps trying" },
  },
] as const;

/** The agent's order in words, from the scenario the contract runs. */
const ruleOf = (d: Desc | undefined) =>
  d
    ? `${d.amount.toLocaleString("en-US")} ${d.in} into ${d.out}${d.repeat > 1 ? `, ${d.repeat} times in a row` : ", once"}${d.acceptBps ? `, accepting a price up to ${(d.acceptBps / 100).toFixed(1)}% worse than the pool` : ""}`
    : "…";

const usdg = (raw: string) => (Number(BigInt(raw)) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });

function Side({ name, rule, run }: { name: string; rule: string; run: Run | null | "busy" }) {
  const r = run && run !== "busy" ? run : null;
  const traded = r?.attempts.filter((x) => x.traded).length ?? 0;
  const refused = r ? r.attempts.length - traded : 0;
  const lost = r ? r.attempts.reduce((s, x) => s + BigInt(x.slashed), 0n) : 0n;
  const last = r?.attempts[r.attempts.length - 1];
  return (
    <div className="bg-[#0e0e0e] p-5">
      <p className="text-[15px] font-semibold text-text">{name}</p>
      <p className="mt-0.5 text-[13px] text-muted">{rule}</p>
      {run === "busy" && <p className="mt-4 text-[13.5px] text-muted">The contract is running it…</p>}
      {r?.error && <p className="mt-4 text-[13.5px] text-flesh">{r.error}</p>}
      {r && !r.error && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
            {[
              ["Traded", String(traded), traded ? "text-leaf" : "text-text"],
              ["Refused", String(refused), refused ? "text-flesh" : "text-text"],
              ["Bond lost", `${usdg(lost.toString())} USDG`, lost > 0n ? "text-flesh" : "text-text"],
            ].map(([k, v, c]) => (
              <div key={k} className="bg-[#0b0b0b] px-3 py-2.5">
                <p className="text-[12px] text-muted">{k}</p>
                <p className={cx("mt-0.5 font-mono text-[17px] tabular-nums", c)}>{v}</p>
              </div>
            ))}
          </div>
          <ol className="mt-4 space-y-1.5">
            {r.attempts.map((x, i) => (
              <li key={i} className="flex items-center justify-between gap-3 font-mono text-[13px]">
                <span className="text-muted">{`#${i + 1}`}</span>
                <span className={cx("flex-1", x.traded ? "text-leaf" : "text-flesh")}>{x.traded ? "Traded" : `Refused: ${x.rule} rule`}</span>
                <span className="text-muted">{`${x.strikes} strike${x.strikes === 1 ? "" : "s"}${x.frozen ? " · frozen" : ""}`}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12.5px] text-muted">{`Bond left ${last ? usdg(last.bondAfter) : "—"} USDG${last?.frozen ? "; the mandate is frozen, no more trades" : ""} · block ${Number(r.block).toLocaleString("en-US")}`}</p>
        </>
      )}
    </div>
  );
}

export function AgentVersus() {
  const [pair, setPair] = useState<(typeof PAIRS)[number]["id"]>("price");
  const [runs, setRuns] = useState<Record<string, Run | "busy">>({});
  const [desc, setDesc] = useState<Record<string, Desc>>({});
  useEffect(() => {
    fetch("/api/mandate")
      .then((r) => r.json() as Promise<{ scenarios?: Desc[] }>)
      .then((j) => setDesc(Object.fromEntries((j.scenarios ?? []).map((d) => [d.id, d]))))
      .catch(() => undefined);
  }, []);
  const p = PAIRS.find((x) => x.id === pair)!;

  async function one(id: string) {
    setRuns((r) => ({ ...r, [id]: "busy" }));
    try {
      const res = await fetch(`/api/mandate?s=${id}`);
      const j = (await res.json()) as Run;
      setRuns((r) => ({ ...r, [id]: res.ok ? j : { scenario: id, block: "0", attempts: [], ms: 0, error: j.error ?? "No answer." } }));
    } catch {
      setRuns((r) => ({ ...r, [id]: { scenario: id, block: "0", attempts: [], ms: 0, error: "No answer. Try again." } }));
    }
  }

  const busy = runs[p.a.id] === "busy" || runs[p.b.id] === "busy";
  return (
    <div className="space-y-4">
      <Bay
        tone="violet"
        kicker={`Versus · ${p.market}`}
        title={p.title}
        busy={busy}
        foot={<span>Both agents run on the real mandate contract inside one eth_call each, against the live pool at the latest block. Nothing is sent.</span>}
      >
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          {PAIRS.map((x) => (
            <button key={x.id} type="button" aria-pressed={pair === x.id} onClick={() => setPair(x.id)} className={cx("rounded-lg border px-3 py-1.5 text-[13.5px]", pair === x.id ? "border-leaf text-text" : "border-line text-muted hover:text-text")}>
              {x.title}
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => void Promise.all([one(p.a.id), one(p.b.id)])} className="ml-auto h-10 rounded-xl bg-leaf px-5 text-[14px] font-semibold text-[#0b0b0b] disabled:opacity-60">
            {busy ? "Running both…" : "Run both"}
          </button>
        </div>
      </Bay>
      <section aria-label="The two agents" className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
        <Side name={p.a.name} rule={ruleOf(desc[p.a.id])} run={runs[p.a.id] ?? null} />
        <Side name={p.b.name} rule={ruleOf(desc[p.b.id])} run={runs[p.b.id] ?? null} />
      </section>
    </div>
  );
}
