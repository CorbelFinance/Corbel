"use client";

/**
 * Agents · Guard. A policy an agent must pass before every trade, and the same check a bot calls as
 * GET /api/guard. Deny-first: each rule must pass, and a rule that cannot be checked denies.
 * Four bays, each its own instrument: the trade gate (every rule drawn as a gate the trade passes, lit in
 * turn by the real answer), the policy (strictness gauge, limits, checks, lists), a replay on today's
 * trending tokens (tiles and the rules that refused them) and the hand-off console (HTTP, MCP, JSON, link).
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { short } from "./kit";
import { Bay, CountUp, Gauge, SubTabs } from "./Bay";
import { GuardMap, judge } from "./GuardMap";
import { TokenAvatar } from "./TokenAvatar";
import { Pick } from "./Pick";
import { AsciiGates } from "./AsciiGates";

type Pay = "USDG" | "ETH" | "WETH";
type Policy = { maxIn: string; minScore: number; maxImpact: number; must: string[]; noHooks: boolean; allow: string; deny: string };
type Rule = { id: string; name: string; ok: boolean; detail: string };
type Verdict = { verdict: "allow" | "deny"; symbol: string | null; score?: { total: number; tag: string }; quote: { amountOut: string; decimals: number; symbol: string; impact: number | null; hops: number; block: string } | null; rules?: Rule[]; failed?: string[]; ms?: number; error?: string };
type Gate = { id: string; name: string; sub: string };

const CHECKS: { id: string; label: string; what: string }[] = [
  { id: "honeypot", label: "Sells go through", what: "A sell is simulated. A token you cannot sell fails." },
  { id: "exit", label: "Exit pays now", what: "Selling the position pays out at the latest block." },
  { id: "tax", label: "No transfer tax", what: "Nothing is skimmed when the token moves." },
  { id: "owner", label: "No live owner powers", what: "No key can still change how the token behaves." },
  { id: "liquidity", label: "Liquidity locked", what: "The pool's LP tokens are locked or burnt." },
  { id: "ticker", label: "Not a lookalike", what: "The name does not copy a known token." },
  { id: "creator", label: "Creator has no rugs", what: "The deployer has no pulled pools on record." },
];
/** The policy said as one sentence, the way you would tell the agent; it is built from the same fields the API reads. */
function sentence(p: Policy): string {
  const must = p.must.map((id) => CHECKS.find((c) => c.id === id)?.label.toLowerCase()).filter(Boolean) as string[];
  const parts = [
    `Trade only tokens with a Corbel score of ${p.minScore} or more`,
    `price impact under ${(p.maxImpact * 100).toFixed(p.maxImpact < 0.01 ? 1 : 0)}%`,
    p.maxIn ? `at most ${Number(p.maxIn).toLocaleString("en")} per trade` : null,
  ].filter(Boolean);
  let out = parts.join(", ") + ".";
  if (must.length) out += ` Never when any of these fails: ${must.join(", ")}.`;
  if (p.noHooks) out += " Never through v4 hooks.";
  if (list(p.allow).length) out += ` Only the ${list(p.allow).length} tokens on the allow list.`;
  if (list(p.deny).length) out += ` Never the ${list(p.deny).length} on the deny list.`;
  return out + " Anything that cannot be checked is refused.";
}

const PRESETS: { id: string; label: string; line: string; p: Policy }[] = [
  { id: "strict", label: "Treasury", line: "Blue chips only, tiny impact", p: { maxIn: "250", minScore: 70, maxImpact: 0.005, must: ["honeypot", "exit", "tax", "ticker", "creator"], noHooks: true, allow: "", deny: "" } },
  { id: "balanced", label: "Balanced", line: "Real exits, small impact", p: { maxIn: "500", minScore: 60, maxImpact: 0.02, must: ["honeypot", "exit", "tax"], noHooks: true, allow: "", deny: "" } },
  { id: "degen", label: "Launch hunter", line: "New tokens, never a trap", p: { maxIn: "100", minScore: 35, maxImpact: 0.05, must: ["honeypot", "tax"], noHooks: false, allow: "", deny: "" } },
];
const KEY = "corbel.guard.policy";
const pctS = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function qs(p: Policy, token: string, side: "buy" | "sell", pay: Pay, amount: string) {
  const u = new URLSearchParams({ token, side, pay, amount, minScore: String(p.minScore), maxImpact: String(p.maxImpact), must: p.must.join(",") });
  if (p.maxIn) u.set("maxIn", p.maxIn);
  if (p.noHooks) u.set("hooks", "0");
  if (p.allow.trim()) u.set("allow", p.allow.replace(/\s+/g, ""));
  if (p.deny.trim()) u.set("deny", p.deny.replace(/\s+/g, ""));
  return `/api/guard?${u.toString()}`;
}

/** The gates a trade meets under this policy, in the order the server checks them. */
function plan(p: Policy): Gate[] {
  const g: Gate[] = [];
  if (list(p.deny).length) g.push({ id: "deny", name: "Deny list", sub: `${list(p.deny).length} blocked` });
  if (list(p.allow).length) g.push({ id: "allow", name: "Allow list", sub: `${list(p.allow).length} listed` });
  if (p.maxIn) g.push({ id: "size", name: "Size", sub: `cap ${p.maxIn}` });
  g.push({ id: "score", name: "Score", sub: `floor ${p.minScore}` });
  for (const id of p.must) g.push({ id: `check:${id}`, name: CHECKS.find((c) => c.id === id)?.label ?? id, sub: "must pass" });
  g.push({ id: "route", name: "Route fills", sub: "at latest block" });
  g.push({ id: "impact", name: "Impact", sub: `cap ${pctS(p.maxImpact)}` });
  if (p.noHooks) g.push({ id: "hooks", name: "No hooks", sub: "v4 refused" });
  return g;
}

/** How much of the market this policy refuses, by its settings alone: 0 opens everything, 100 is the tightest. */
function strictness(p: Policy) {
  const imp = 1 - Math.min(1, Math.max(0, (p.maxImpact - 0.001) / 0.099));
  return 0.3 * (p.minScore / 100) + 0.25 * imp + 0.3 * (p.must.length / CHECKS.length) + 0.1 * (p.noHooks ? 1 : 0) + 0.05 * (p.maxIn ? 1 : 0);
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cx("relative h-6 w-11 shrink-0 rounded-full border transition-colors", on ? "border-[var(--bay-acc)] bg-[color-mix(in_srgb,var(--bay-acc)_30%,transparent)]" : "border-[var(--bay-edge)] bg-[var(--bay-bg2)]")}>
      <span className={cx("absolute top-[3px] h-4 w-4 rounded-full transition-all", on ? "left-[22px] bg-[var(--bay-acc)]" : "left-[3px] bg-[#5b6660]")} />
    </button>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange, hint }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void; hint: string }) {
  const pos = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[12px] text-muted">{label}</span>
        <span className="bay-acc font-mono text-[15px]">{fmt(value)}</span>
      </span>
      <span className="relative mt-2 block h-6">
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--bay-edge)]" />
        <span aria-hidden className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--bay-acc)] shadow-[0_0_10px_var(--bay-acc)]" style={{ width: `${pos}%` }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="absolute inset-0 w-full cursor-pointer opacity-0" />
        <span aria-hidden className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--bay-acc)] bg-[var(--bay-bg)]" style={{ left: `${pos}%` }} />
      </span>
      <span className="mt-1 block text-[12px] text-muted">{hint}</span>
    </label>
  );
}

export function AgentGuard() {
  const [p, setP] = useState<Policy>(PRESETS[1]!.p);
  const [preset, setPreset] = useState("balanced");
  const [token, setToken] = useState("0x0bd7d308f8e1639fab988df18a8011f41eacad73");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [pay, setPay] = useState<Pay>("USDG");
  const [amount, setAmount] = useState("100");
  const [v, setV] = useState<Verdict | null>(null);
  const [runId, setRunId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState<{ token: string; symbol: string }[]>([]);
  const [replay, setReplay] = useState<{ token: string; symbol: string; v: Verdict | null }[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [gTab, setGTab] = useState<"gates" | "rules" | "raw">("gates");
  const [pTab, setPTab] = useState<"limits" | "checks" | "lists">("limits");
  const [rTab, setRTab] = useState<"map" | "tiles" | "why">("map");
  const [oTab, setOTab] = useState<"http" | "mcp" | "json" | "share">("http");

  useEffect(() => {
    void Promise.resolve().then(() => setOrigin(window.location.origin));
    try {
      // a shared link (?policy=…) wins over the policy saved in this browser
      const shared = new URLSearchParams(window.location.search).get("policy");
      const s = shared ? atob(shared.replace(/-/g, "+").replace(/_/g, "/")) : localStorage.getItem(KEY);
      if (s) {
        const v = JSON.parse(s) as Policy;
        if (typeof v.minScore === "number" && Array.isArray(v.must)) void Promise.resolve().then(() => (setP(v), setPreset("custom")));
      }
    } catch {
      // defaults
    }
    fetch("/api/trending")
      .then((r) => r.json())
      .then((j: { rows?: { token: string; symbol: string | null }[] }) => setHot((j.rows ?? []).slice(0, 8).map((r) => ({ token: r.token, symbol: r.symbol ?? short(r.token) }))))
      .catch(() => undefined);
  }, []);
  const save = (next: Policy) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // convenience only
    }
  };
  const edit = (patch: Partial<Policy>) =>
    setP((cur) => {
      const next = { ...cur, ...patch };
      save(next);
      setPreset("custom");
      return next;
    });
  const pick = (id: string) => {
    const x = PRESETS.find((y) => y.id === id)!;
    setP(x.p);
    setPreset(id);
    save(x.p);
  };

  const url = useMemo(() => qs(p, token, side, pay, amount), [p, token, side, pay, amount]);
  const gates = useMemo(() => plan(p), [p]);
  const strict = strictness(p);
  const run = async () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return setV({ verdict: "deny", symbol: null, quote: null, error: "Paste the token's contract address." });
    setBusy(true);
    setV(null);
    try {
      setV((await fetch(url).then((r) => r.json())) as Verdict);
    } catch {
      setV({ verdict: "deny", symbol: null, quote: null, error: "No answer. The trade is denied." });
    } finally {
      setBusy(false);
      setRunId((n) => n + 1);
    }
  };
  const runReplay = async () => {
    const rows = hot.map((h) => ({ ...h, v: null as Verdict | null }));
    setReplay([...rows]);
    // three at a time: quick enough to watch, light enough for the server
    let next = 0;
    const worker = async () => {
      while (next < hot.length) {
        const i = next++;
        const h = hot[i]!;
        try {
          rows[i] = { ...h, v: (await fetch(qs(p, h.token, "buy", "USDG", p.maxIn || "100")).then((r) => r.json())) as Verdict };
        } catch {
          rows[i] = { ...h, v: { verdict: "deny", symbol: null, quote: null, error: "No answer" } };
        }
        setReplay([...rows]);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  };
  const copy = (k: string, text: string) => void navigator.clipboard?.writeText(text).then(() => (setCopied(k), setTimeout(() => setCopied(null), 1200)));
  const policyJson = JSON.stringify({ version: 1, mode: "deny-first", maxIn: p.maxIn ? Number(p.maxIn) : null, minScore: p.minScore, maxImpact: p.maxImpact, mustPass: p.must, noHooks: p.noHooks, allow: list(p.allow), deny: list(p.deny) }, null, 2);
  const shareLink = origin ? `${origin}/app/agents/guard?policy=${btoa(JSON.stringify(p)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}` : "";
  const allowed = replay?.filter((r) => judge(r, p.minScore, p.maxImpact)?.ok).length ?? 0;
  const done = replay?.filter((r) => r.v).length ?? 0;
  const why = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of replay ?? []) for (const x of judge(r, p.minScore, p.maxImpact)?.rules ?? []) if (!x.ok) m.set(x.name, (m.get(x.name) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [replay, p.minScore, p.maxImpact]);

  // the gates drawn on the track: the server's answer when there is one, the plan from the policy otherwise
  const shown: (Gate & { ok?: boolean; detail?: string })[] = v?.rules ? v.rules.map((r) => ({ id: r.id, name: gates.find((g) => g.id === r.id)?.name ?? r.name, sub: r.ok ? "pass" : "fail", ok: r.ok, detail: r.detail })) : gates;
  const firstBad = v?.rules ? v.rules.findIndex((r) => !r.ok) : -1;
  const fill = !v?.rules ? 0 : firstBad < 0 ? 100 : (firstBad / Math.max(1, shown.length - 1)) * 100;
  const sym = hot.find((h) => h.token.toLowerCase() === token.toLowerCase())?.symbol ?? v?.symbol ?? null;

  const mcpCall = JSON.stringify({ tool: "trade_guard", arguments: { token, side, pay, amount, ...(p.maxIn ? { maxIn: p.maxIn } : {}), minScore: p.minScore, maxImpact: p.maxImpact, must: p.must.join(","), noHooks: p.noHooks } }, null, 2);
  const consoleText = oTab === "http" ? `GET ${origin}${url}\n\n→ 200 { "verdict": "allow" | "deny", "rules": [ … ], "failed": [ … ] }\n\n# trade only when verdict is "allow"` : oTab === "mcp" ? mcpCall : oTab === "json" ? policyJson : shareLink;

  return (
    <div className="space-y-4">
      {/* ── Trade gate ───────────────────────────────────────── */}
      <Bay
        tone="ink"
        kicker="Every trade passes these gates first"
        title="Trade gate"
        busy={busy}
        right={<SubTabs label="Gate view" value={gTab} onChange={setGTab} tabs={[{ id: "gates", label: "Gates", n: shown.length }, { id: "rules", label: "Rules" }, { id: "raw", label: "Response" }]} />}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          className="mx-5 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--bay-edge)] bg-[var(--bay-bg2)] p-2"
        >
          <div className="flex rounded-xl bg-[var(--bay-bg)] p-[3px]">
            {(["buy", "sell"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSide(s)} className={cx("rounded-lg px-3.5 py-1.5 text-[13px] font-medium capitalize transition-colors", side === s ? (s === "buy" ? "bg-leaf/20 text-leaf" : "bg-flesh/20 text-flesh") : "text-muted hover:text-text")}>
                {s}
              </button>
            ))}
          </div>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" aria-label="Amount" className="h-10 w-24 rounded-xl bg-transparent px-2 text-right tabular-nums text-[18px] text-text outline-none" />
          <Pick label="Paid with" value={pay} onChange={setPay} className="w-28" options={(["USDG", "ETH", "WETH"] as const).map((x) => ({ value: x, label: x }))} />
          <span className="px-1 text-[13px] text-muted">{side === "buy" ? "into" : "of"}</span>
          <div className="flex h-10 min-w-[14rem] flex-1 items-center gap-2 rounded-xl border border-[var(--bay-edge)] bg-[var(--bay-bg)] pl-2 focus-within:border-[var(--bay-acc)]">
            <TokenAvatar address={token} symbol={sym ?? "?"} size={22} />
            {sym && <span className="text-[13px] font-semibold text-text">{sym}</span>}
            <input value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="Token address 0x…" spellCheck={false} aria-label="Token address" className="h-full min-w-0 flex-1 bg-transparent pr-2 font-mono text-[12px] text-muted outline-none focus:text-text" />
          </div>
          <button type="submit" disabled={busy} className="bay-btn">
            {busy ? "Checking…" : "Run the gate →"}
          </button>
        </form>
        {hot.length > 0 && (
          <div className="mx-5 mt-2 flex flex-wrap gap-1.5">
            {hot.map((h) => (
              <button key={h.token} type="button" onClick={() => setToken(h.token)} aria-pressed={token.toLowerCase() === h.token.toLowerCase()} className="bay-ghost !rounded-full !py-0.5 !pl-0.5">
                <TokenAvatar address={h.token} symbol={h.symbol} size={18} />
                {h.symbol}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 grid border-t border-[var(--bay-edge)] lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div key={`${gTab}-${runId}`} className="pane-in min-w-0 px-5 py-4">
            {v?.error && <p className="rounded-xl border border-flesh/40 bg-flesh/10 px-4 py-3 text-[13px] text-text">{v.error}</p>}
            {gTab === "gates" && (
              <div>
                {/* the gates as a ridge: the packet climbs it, each peak lights or turns red */}
                <div className="h-40 overflow-hidden rounded-xl bg-[#0a0a0a]">
                  <AsciiGates busy={busy} states={shown.map((g, i) => (busy ? "wait" : g.ok === undefined ? "idle" : g.ok ? "ok" : firstBad >= 0 && i > firstBad ? "skip" : "bad"))} />
                </div>
                <ol className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, shown.length)}, minmax(0, 1fr))` }}>
                  {shown.map((g, i) => (
                    <li key={g.id} title={g.detail} className="min-w-0 text-center">
                      <span className={cx("block font-mono text-[12px]", g.ok === false ? "text-flesh" : g.ok ? "text-leaf" : "text-muted")}>{g.ok === undefined ? String(i + 1).padStart(2, "0") : g.ok ? "✓" : "✕"}</span>
                      <span className="block truncate text-[12px] text-text">{g.name}</span>
                      <span className={cx("block truncate text-[12px]", g.ok === false ? "text-flesh" : "text-muted")}>{g.sub}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {gTab === "rules" &&
              (v?.rules ? (
                <ul className="space-y-1.5">
                  {v.rules.map((r, i) => (
                    <li key={r.id} className="tile-in grid grid-cols-[1.75rem_10rem_1fr] items-start gap-2 rounded-xl bg-[var(--bay-bg2)] px-3 py-2 text-[13px]" style={{ animationDelay: `${i * 0.04}s` }}>
                      <span className={cx("grid h-6 w-6 place-items-center rounded-md text-[12px]", r.ok ? "bg-leaf/15 text-leaf" : "bg-flesh/15 text-flesh")}>{r.ok ? "✓" : "✕"}</span>
                      <span className="text-text">{r.name}</span>
                      <span className="text-muted">{r.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-[13px] text-muted">Run the gate to see each rule with its reason.</p>
              ))}
            {gTab === "raw" && <pre className="max-h-72 overflow-auto rounded-xl bg-[#080a10] p-3 font-mono text-[12px] leading-relaxed text-muted">{v ? JSON.stringify(v, null, 2) : "// the JSON your agent receives appears here"}</pre>}
          </div>

          <aside className="flex flex-col justify-center gap-3 border-t border-[var(--bay-edge)] bg-[color-mix(in_srgb,var(--bay-bg2)_60%,transparent)] px-5 py-4 lg:border-l lg:border-t-0">
            {busy ? (
              <p className="caret font-mono text-[13px] text-muted">Simulating at the latest block</p>
            ) : v?.rules ? (
              <>
                <p key={runId} className={cx("stamp font-display text-6xl leading-none tracking-tight", v.verdict === "allow" ? "text-leaf" : "text-[#ff7a7a]")}>{v.verdict === "allow" ? "ALLOW" : "DENY"}</p>
                <p className="text-[12.5px] text-text">
                  {v.rules.filter((r) => r.ok).length} of {v.rules.length} gates pass
                  {firstBad >= 0 && <span className="block text-muted">Stopped at {shown[firstBad]?.name}</span>}
                </p>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <span className="rounded-lg bg-[var(--bay-bg)] px-2 py-1.5">
                    <span className="block text-muted">Score</span>
                    <span className="font-mono text-[15px] text-text">{v.score ? <CountUp value={v.score.total} /> : "—"}</span>
                  </span>
                  <span className="rounded-lg bg-[var(--bay-bg)] px-2 py-1.5">
                    <span className="block text-muted">Impact</span>
                    <span className="font-mono text-[15px] text-text">{v.quote?.impact != null ? pctS(v.quote.impact) : "—"}</span>
                  </span>
                  <span className="col-span-2 rounded-lg bg-[var(--bay-bg)] px-2 py-1.5">
                    <span className="block text-muted">Pays</span>
                    <span className="font-mono text-[13px] text-text">{v.quote ? `${(Number(v.quote.amountOut) / 10 ** v.quote.decimals).toLocaleString("en", { maximumFractionDigits: 6 })} ${v.quote.symbol}` : "no route"}</span>
                  </span>
                </div>
                {v.ms !== undefined && <p className="font-mono text-[12px] text-muted">{`block ${v.quote ? Number(v.quote.block).toLocaleString("en") : "—"} · ${(v.ms / 1000).toFixed(1)} s`}</p>}
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold text-text">Run a trade through the gate</p>
                <p className="text-[13px] text-muted">{`${gates.length} gates under this policy. The answer lands here: allow or deny, which gate stopped it, and what the trade would pay.`}</p>
              </>
            )}
          </aside>
        </div>
      </Bay>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        {/* ── Policy ───────────────────────────────────────── */}
        <Bay tone="violet" kicker="Your rules, deny-first" title="Policy" right={<SubTabs label="Policy part" value={pTab} onChange={setPTab} tabs={[{ id: "limits", label: "Limits" }, { id: "checks", label: "Checks", n: p.must.length }, { id: "lists", label: "Lists", n: list(p.allow).length + list(p.deny).length || undefined }]} />} foot={<span>Saved in this browser. A rule that cannot be checked denies.</span>}>
          <p className="mx-5 mb-3 rounded-2xl border border-[var(--bay-edge)] bg-[var(--bay-bg2)] px-4 py-3 text-[15px] leading-relaxed text-text">
            <span className="mb-1 block text-[12px] text-muted">Your agent&apos;s rule, in words</span>
            {sentence(p)}
          </p>
          <div className="mx-5 flex items-center gap-4 rounded-2xl border border-[var(--bay-edge)] bg-[var(--bay-bg2)] p-3">
            <Gauge value={strict} label="Strictness" sub={strict < 0.4 ? "Loose" : strict < 0.65 ? "Balanced" : "Strict"} size={124} />
            <div className="grid min-w-0 flex-1 gap-1">
              {PRESETS.map((x) => (
                <button key={x.id} type="button" onClick={() => pick(x.id)} className={cx("flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-colors", preset === x.id ? "bg-[color-mix(in_srgb,var(--bay-acc)_16%,transparent)]" : "hover:bg-[var(--bay-bg)]")}>
                  <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full border", preset === x.id ? "border-[var(--bay-acc)] bg-[var(--bay-acc)] shadow-[0_0_8px_var(--bay-acc)]" : "border-[var(--bay-dim)]")} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-text">{x.label}</span>
                    <span className="block truncate text-[12px] text-muted">{x.line}</span>
                  </span>
                </button>
              ))}
              {preset === "custom" && <span className="px-2.5 text-[12px] text-[var(--bay-acc)]">Custom policy</span>}
            </div>
          </div>
          <div key={pTab} className="pane-in space-y-5 px-5 py-5">
            {pTab === "limits" && (
              <>
                <label className="block">
                  <span className="text-[12px] text-muted">Largest trade, in what the agent pays</span>
                  <input value={p.maxIn} onChange={(e) => edit({ maxIn: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" placeholder="no cap" className="bay-field mt-1.5 font-mono" />
                </label>
                <Slider label="Lowest Corbel Score" value={p.minScore} min={0} max={100} step={5} fmt={(x) => String(x)} onChange={(x) => edit({ minScore: x })} hint="Tokens scored below this are refused." />
                <Slider label="Largest price impact" value={p.maxImpact} min={0.001} max={0.1} step={0.001} fmt={pctS} onChange={(x) => edit({ maxImpact: x })} hint="Measured by simulating the trade at the latest block." />
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--bay-bg2)] px-3 py-2.5">
                  <span>
                    <span className="block text-[13px] text-text">Refuse v4 hooks</span>
                    <span className="block text-[12px] text-muted">A hook can run its own code on every swap.</span>
                  </span>
                  <Switch on={p.noHooks} onChange={(x) => edit({ noHooks: x })} label="Refuse routes through v4 hooks" />
                </div>
              </>
            )}
            {pTab === "checks" && (
              <ul className="space-y-1.5">
                {CHECKS.map((c) => {
                  const on = p.must.includes(c.id);
                  return (
                    <li key={c.id} className={cx("flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors", on ? "border-[color-mix(in_srgb,var(--bay-acc)_40%,transparent)] bg-[color-mix(in_srgb,var(--bay-acc)_8%,transparent)]" : "border-[var(--bay-edge)]")}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-text">{c.label}</span>
                        <span className="block text-[12px] text-muted">{c.what}</span>
                      </span>
                      <Switch on={on} onChange={(x) => edit({ must: x ? [...p.must, c.id] : p.must.filter((y) => y !== c.id) })} label={c.label} />
                    </li>
                  );
                })}
              </ul>
            )}
            {pTab === "lists" && (
              <>
                {(
                  [
                    ["allow", "Only these tokens", "Leave empty to allow any token that passes the rest."],
                    ["deny", "Never these tokens", "Refused even when every other gate passes."],
                  ] as const
                ).map(([k, label, hint]) => (
                  <label key={k} className="block">
                    <span className="flex justify-between text-[12px] text-muted">
                      {label}
                      <span className="font-mono text-[var(--bay-acc)]">{list(p[k]).length}</span>
                    </span>
                    <textarea value={p[k]} onChange={(e) => edit({ [k]: e.target.value } as Partial<Policy>)} rows={3} placeholder="0x…, 0x…" spellCheck={false} className="bay-field mt-1.5 !h-auto py-2 font-mono text-[12px]" />
                    <span className="mt-1 block text-[12px] text-muted">{hint}</span>
                  </label>
                ))}
                {hot.length > 0 && (
                  <div>
                    <p className="text-[12px] text-muted">Add a trending token to the deny list</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {hot.map((h) => (
                        <button key={h.token} type="button" onClick={() => !list(p.deny).includes(h.token) && edit({ deny: [...list(p.deny), h.token].join(", ") })} className="bay-ghost !rounded-full !py-0.5 !pl-0.5">
                          <TokenAvatar address={h.token} symbol={h.symbol} size={16} />
                          {h.symbol}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </Bay>

        <div className="grid min-w-0 content-start gap-4">
          {/* ── Replay ───────────────────────────────────────── */}
          <Bay
            tone="amber"
            kicker="Too strict never trades, too loose buys traps"
            title="Replay on today's market"
            right={
              <>
                {replay && <SubTabs label="Replay view" value={rTab} onChange={setRTab} tabs={[{ id: "map", label: "Map" }, { id: "tiles", label: "Tokens", n: `${allowed}/${done}` }, { id: "why", label: "Why refused", n: why.length || undefined }]} />}
                <button type="button" disabled={!hot.length || (!!replay && done < replay.length)} onClick={() => void runReplay()} className="bay-btn !h-9 !text-[13px]">
                  {replay ? "Run again" : "Replay the policy"}
                </button>
              </>
            }
          >
            {!replay && <p className="px-5 pb-5 text-[13px] text-muted">{`Checks a buy of ${p.maxIn || "100"} USDG in each of the ${hot.length || "top"} trending tokens, one by one, with this policy.`}</p>}
            {replay && (
              <>
                <div className="mx-5 flex h-2 gap-[3px]">
                  {replay.map((r) => (
                    <span key={r.token} className={cx("flex-1 rounded-full transition-colors duration-500", !r.v ? "bg-[var(--bay-edge)]" : judge(r, p.minScore, p.maxImpact)?.ok ? "bg-leaf shadow-[0_0_8px_var(--leaf)]" : "bg-[#ff6b6b]/70")} />
                  ))}
                </div>
                <div key={rTab} className="pane-in px-5 py-4">
                  {rTab === "map" ? (
                    <GuardMap rows={replay} minScore={p.minScore} maxImpact={p.maxImpact} onFloor={(x) => edit({ minScore: x })} onCap={(x) => edit({ maxImpact: x })} />
                  ) : rTab === "tiles" ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {replay.map((r) =>
                        !r.v ? (
                          <div key={r.token} className="flex h-[5.5rem] items-center gap-2 rounded-xl border border-dashed border-[var(--bay-edge)] px-3 text-[12px] text-muted">
                            <TokenAvatar address={r.token} symbol={r.symbol} size={20} />
                            <span className="caret">{r.symbol}</span>
                          </div>
                        ) : (
                          <button key={r.token} type="button" onClick={() => (setToken(r.token), setV(r.v), setRunId((n) => n + 1), setGTab("gates"), window.scrollTo({ top: 0, behavior: "smooth" }))} className={cx("tile-in flex h-[5.5rem] flex-col justify-between rounded-xl border p-2.5 text-left transition-transform hover:-translate-y-0.5", judge(r, p.minScore, p.maxImpact)?.ok ? "border-leaf/40 bg-leaf/[0.07]" : "border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.05]")}>
                            <span className="flex items-center gap-1.5">
                              <TokenAvatar address={r.token} symbol={r.symbol} size={20} />
                              <span className="truncate text-[12.5px] font-semibold text-text">{r.symbol}</span>
                              <span className="ml-auto font-mono text-[12px] text-muted">{r.v.score?.total ?? "—"}</span>
                            </span>
                            <span className={cx("font-mono text-[15px] font-semibold", judge(r, p.minScore, p.maxImpact)?.ok ? "text-leaf" : "text-[#ff8a8a]")}>{judge(r, p.minScore, p.maxImpact)?.ok ? "ALLOW" : "DENY"}</span>
                            <span className="truncate text-[12px] text-muted">{r.v.error ?? (judge(r, p.minScore, p.maxImpact)?.ok ? "every gate passes" : judge(r, p.minScore, p.maxImpact)?.rules.find((x) => !x.ok)?.name)}</span>
                          </button>
                        ),
                      )}
                    </div>
                  ) : why.length === 0 ? (
                    <p className="py-6 text-center text-[13px] text-muted">{done ? "Nothing was refused." : "Waiting for the first answer."}</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {why.map(([name, n], i) => (
                        <li key={name} className="grid grid-cols-[10rem_1fr_2.5rem] items-center gap-3 text-[12.5px]">
                          <span className="truncate text-text">{name}</span>
                          <span className="h-2.5 overflow-hidden rounded-full bg-[var(--bay-edge)]">
                            <span className="bar-grow block h-full rounded-full bg-[var(--bay-acc)]" style={{ width: `${(n / Math.max(1, done)) * 100}%`, animationDelay: `${i * 0.06}s` }} />
                          </span>
                          <span className="text-right tabular-nums text-muted">{`${n}/${done}`}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </Bay>

          {/* ── Hand-off console ─────────────────────────────── */}
          <Bay tone="ice" kicker="The agent asks before it signs" title="Give it to your agent" right={<SubTabs label="Format" value={oTab} onChange={setOTab} tabs={[{ id: "http", label: "HTTP" }, { id: "mcp", label: "MCP" }, { id: "json", label: "Policy" }, { id: "share", label: "Link" }]} />}>
            <div className="mx-5 mb-5 overflow-hidden rounded-2xl border border-[var(--bay-edge)] bg-[#060c0e]">
              <div className="flex items-center gap-2 border-b border-[var(--bay-edge)] px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-[var(--bay-acc)] shadow-[0_0_8px_var(--bay-acc)]" />
                <span className="font-mono text-[12px] text-muted">{oTab === "http" ? "request" : oTab === "mcp" ? "tool call · trade_guard" : oTab === "json" ? "policy.json" : "share link"}</span>
                <button type="button" onClick={() => copy(oTab, consoleText)} className="bay-ghost ml-auto !py-0.5">
                  {copied === oTab ? "Copied" : "Copy"}
                </button>
              </div>
              <div key={oTab} className="console pane-in max-h-64 overflow-auto px-2 py-3 text-[#cfe9ee]">
                {consoleText.split("\n").map((l, i) => (
                  <span key={i} className={l.startsWith("#") || l.startsWith("→") ? "text-muted" : undefined}>
                    {l || " "}
                  </span>
                ))}
              </div>
            </div>
            <p className="px-5 pb-4 text-[12px] text-muted">
              {oTab === "mcp" ? "Same rules as an MCP tool for AI agents. " : oTab === "share" ? "Anyone who opens the link gets this exact policy. " : "Nothing is signed or sent. "}
              <Link href="/docs/mcp" className="bay-acc hover:underline">
                Agent docs →
              </Link>
            </p>
          </Bay>
        </div>
      </div>
    </div>
  );
}
