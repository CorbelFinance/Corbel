"use client";

/**
 * Trust · Check. A search bar on top, the report below it as a document: the verdict and the token on
 * one line, seven checks as rows, next steps at the side. While the chain is read, the seven steps light
 * up in order so the wait shows what is happening. No sign-in: anyone can check any token.
 */
import Link from "next/link";
import { ProjectResearch } from "./ProjectResearch";
import { RealityCheck } from "./RealityCheck";
import { useEffect, useRef, useState } from "react";
import { EXAMPLE_TRUST_REPORT, type TrustReport } from "@corbel/data";
import { cx } from "@corbel/ui";
import { CopyButton } from "../docs/CopyButton";
import { WatchButton } from "./WatchButton";
import { short, Verdict } from "./kit";
import { briefOf, score, shareLine, type Check as ScoreCheck, type HoldersIn, type MarketIn } from "./score";
import { useHolders } from "./HoldersPanel";
import { ScanOrb } from "./TokenPulse";

const MARK = {
  pass: { sign: "✓", word: "Pass", cls: "text-leaf", row: "" },
  warn: { sign: "▲", word: "Caution", cls: "text-text", row: "" },
  fail: { sign: "✕", word: "Fail", cls: "text-flesh", row: "bg-flesh-deep/30" },
  unknown: { sign: "?", word: "Unknown", cls: "text-muted", row: "" },
} as const;

/** What each check runs, shown under its name. Order matches the report. */
const HOW: Record<string, string> = {
  honeypot: "A buy and a sell, simulated against the live pool.",
  exit: "What a buyer-size bag sells for, with nobody buying first.",
  tax: "Expected against received, on both legs.",
  owner: "Admin powers read from the bytecode and proxy slot.",
  liquidity: "LP burned, or who holds each v4 position.",
  ticker: "Other contracts using the same symbol.",
  creator: "How many pools the launcher made this week.",
};
const STEPS = ["Honeypot", "Exit now", "Tax", "Owner", "Liquidity", "Ticker", "Creator"] as const;

/** Real tokens to try, read from the chain on 2026-11-15. */
const TRY = [
  { label: "USDG", q: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" },
  { label: "WETH", q: "0x0bd7d308f8e1639fab988df18a8011f41eacad73" },
  { label: "TSLA", q: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d" },
  { label: "NVDA lookalike", q: "0x207aa8fb30274c2d1102c59eb175278a659b981b" },
];

type Candidate = { address: string; symbol: string | null; name: string | null; pools: number };
type State = { kind: "idle" } | { kind: "loading"; what: string } | { kind: "error"; msg: string } | { kind: "pick"; list: Candidate[]; q: string } | { kind: "done"; report: TrustReport };

const RECENT_KEY = "corbel.check.recent";
function readRecent(): { q: string; label: string }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as { q: string; label: string }[];
  } catch {
    return [];
  }
}
function pushRecent(q: string, label: string) {
  try {
    const next = [{ q, label }, ...readRecent().filter((r) => r.q.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage off: recent list is only a convenience
  }
}

function verdict(r: TrustReport) {
  const n = (k: string) => r.checks.filter((c) => c.result === k).length;
  const fails = n("fail"), warns = n("warn"), unknown = n("unknown");
  if (fails) return { tone: "fail" as const, text: `${fails} failed check${fails > 1 ? "s" : ""}. Read ${fails > 1 ? "them" : "it"} before you buy.` };
  if (warns) return { tone: "warn" as const, text: `Nothing failed. ${warns} to read with care.` };
  if (unknown) return { tone: "unknown" as const, text: `Nothing failed, but ${unknown} check${unknown > 1 ? "s" : ""} could not run.` };
  return { tone: "pass" as const, text: "Every check passed. Still not a guarantee." };
}

export function TrustCheck() {
  const [q, setQ] = useState("");
  const [s, setS] = useState<State>({ kind: "done", report: EXAMPLE_TRUST_REPORT });
  const [step, setStep] = useState(0);
  const [recent, setRecent] = useState<{ q: string; label: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void Promise.resolve().then(() => setRecent(readRecent()));
  }, []);

  // light the seven steps in turn while the chain is read
  useEffect(() => {
    if (s.kind !== "loading") return;
    void Promise.resolve().then(() => setStep(0));
    const id = setInterval(() => setStep((x) => Math.min(STEPS.length - 1, x + 1)), 450);
    return () => clearInterval(id);
  }, [s.kind]);

  async function check(value: string): Promise<void> {
    const v = value.trim();
    if (!v) return;
    const isAddr = /^0x[0-9a-fA-F]{40}$/.test(v);
    setS({ kind: "loading", what: isAddr ? "Simulating a buy and a sell on the live pool" : "Searching the index" });
    try {
      const [r] = await Promise.all([fetch(`/api/token?q=${encodeURIComponent(v)}`), new Promise((ok) => setTimeout(ok, isAddr ? STEPS.length * 450 : 0))]);
      const j = await r.json();
      if (!r.ok) return setS({ kind: "error", msg: (j as { error: string }).error });
      if ("candidates" in j) {
        const list = (j as { candidates: Candidate[] }).candidates;
        if (list.length === 1) {
          setQ(list[0]!.address);
          return check(list[0]!.address);
        }
        return setS(list.length ? { kind: "pick", list, q: v } : { kind: "error", msg: `No indexed token uses the ticker ${v}.` });
      }
      const rep = j as TrustReport;
      setS({ kind: "done", report: rep });
      pushRecent(rep.token, rep.meta?.symbol ?? short(rep.token));
      setRecent(readRecent());
      const u = new URL(window.location.href);
      u.searchParams.set("q", rep.token);
      window.history.replaceState(null, "", u);
    } catch {
      setS({ kind: "error", msg: "No answer. Try again." });
    }
  }

  // ?q=… (from the landing, the radar, a shared link): fill in and run once
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("q");
    if (!v) return;
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      setQ(v);
      void check(v);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on arrival, by design
  }, []);

  const run = (v: string) => {
    setQ(v);
    void check(v);
  };
  const report = s.kind === "done" ? s.report : null;
  const v = report ? verdict(report) : null;
  const passed = report ? report.checks.filter((c) => c.result === "pass").length : 0;

  const by = (id: string) => report?.checks.find((c) => c.id === id);
  // holders take up to a minute on a busy token: the score starts without them and takes them in when they land
  const { d: hd } = useHolders(report && !(report as { holders?: HoldersIn | null }).holders ? report.token : null);
  // an address with no token code (the zero address, a wallet, a plain contract) gets no score and no "can be sold"
  const notToken = !!report && report.checks.some((c) => /^Not a token contract|^No contract at this address|^No symbol\(\) on this contract/.test(c.reason));
  const sc = report && !notToken ? score(report.checks as ScoreCheck[], (report as { holders?: HoldersIn | null }).holders ?? briefOf(hd as Parameters<typeof briefOf>[0]), (report as { market?: MarketIn | null }).market) : null;
  const tone = (n: number) => (n >= 80 ? "text-leaf" : n >= 60 ? "text-text" : n >= 40 ? "text-[var(--lav)]" : "text-flesh");

  return (
    <div className="space-y-4">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void check(q);
        }}
        className="rounded-2xl border border-[#242424] bg-[#131313] p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="token" className="text-[15px] font-semibold text-text">
            Token check
          </label>
          <span className="text-[13px] text-muted">Seven reads of the live chain before you buy. No sign-in, nothing is sent.</span>
        </div>
        <div className="mt-3 flex h-14 overflow-hidden rounded-xl border border-[#242424] bg-bg focus-within:border-ui/60 focus-within:ring-1 focus-within:ring-ui/40">
          <span aria-hidden className="flex items-center pl-4 text-muted">
            ⌕
          </span>
          <input ref={input} id="token" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Paste a contract address or a ticker" autoComplete="off" spellCheck={false} maxLength={64} className="min-w-0 flex-1 bg-transparent px-3 font-mono text-[15px] text-text outline-none placeholder:text-muted" style={{ outline: "none" }} />
          <button type="submit" disabled={s.kind === "loading"} className="ibtn m-1.5 px-8">
            {s.kind === "loading" ? "Reading…" : "Check"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="mr-1 text-muted">Try</span>
          {TRY.map((x) => (
            <button key={x.q} type="button" onClick={() => run(x.q)} className="rounded-full border border-[#242424] bg-[#181818] px-3 py-1 text-text hover:border-ui/60">
              {x.label}
            </button>
          ))}
          {recent.length > 0 && <span className="ml-3 mr-1 text-muted">Recent</span>}
          {recent.map((r) => (
            <button key={r.q} type="button" onClick={() => run(r.q)} className="rounded-full border border-[#242424] px-3 py-1 text-muted hover:text-text">
              {r.label}
            </button>
          ))}
        </div>
      </form>

      <div aria-live="polite" className="space-y-4">
        {s.kind === "error" && <p className="rounded-xl border border-flesh/40 bg-flesh-deep/40 px-4 py-3 text-sm text-text">{s.msg}</p>}

        {s.kind === "loading" && (
          <div className="grid gap-4 rounded-2xl border border-[#242424] bg-[#131313] p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center">
            <div className="hidden h-36 sm:block">
              <ScanOrb />
            </div>
            <div>
            <p className="text-[13px] text-leaf">{s.what}…</p>
            <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-7">
              {STEPS.map((name, n) => (
                <li key={name} className={cx("rounded-xl border px-3 py-3 transition-colors", n < step ? "border-[#242424] text-text" : n === step ? "border-leaf/60 bg-leaf/10 text-leaf" : "border-[#242424] text-muted/60")}>
                  <span className="font-mono text-[12px]">{String(n + 1).padStart(2, "0")}</span>
                  <span className="mt-1 block text-[13px]">{name}</span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[#242424]">
                    <span className={cx("block h-full rounded-full bg-leaf transition-all", n < step ? "w-full" : n === step ? "w-1/2 animate-pulse" : "w-0")} />
                  </span>
                </li>
              ))}
            </ol>
            </div>
          </div>
        )}

        {s.kind === "pick" && (
          <div className="rounded-2xl border border-[#242424] bg-[#131313]">
            <p className="border-b border-[#242424] px-4 py-3 text-[14px] text-text">
              {s.list.length} tokens use “{s.q.toUpperCase()}”. <span className="text-muted">A ticker is not an identity: pick by address.</span>
            </p>
            <ul className="divide-y divide-[#242424]">
              {s.list.map((c) => (
                <li key={c.address}>
                  <button type="button" onClick={() => run(c.address)} className="grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-3 text-left hover:bg-[#181818]">
                    <span className="min-w-0">
                      <span className="text-text">{c.symbol ?? "?"}</span> <span className="text-sm text-muted">{c.name}</span>
                      <span className="block truncate font-mono text-[12px] text-muted">{c.address}</span>
                    </span>
                    <span className="self-center font-mono text-[12px] text-muted">{c.pools} pools →</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {report && v && (
          <>
            {(() => {
              const sym = report.meta?.symbol ?? (report.example ? "This example token" : short(report.token));
              const exit = by("exit");
              const fails = report.checks.filter((c) => c.result === "fail").length;
              const warns = report.checks.filter((c) => c.result === "warn" || c.result === "unknown").length;
              const tick = by("ticker");
              const hp = by("honeypot");
              const sentence = notToken
                ? `${short(report.token)} is not a token: no token code lives at this address. There is nothing to buy or sell here.`
                : tick?.result === "fail" && /lookalike/i.test(tick.reason)
                  ? `This is not the real ${sym}. It copies the name; the issuer's code is not here.`
                  : tick?.result === "fail" && /you asked for/i.test(tick.reason)
                    ? `${tick.reason} Check the address before anything else.`
                  : exit?.result === "fail"
                  ? `You may not be able to sell ${sym}. ${exit.reason}`
                  : hp?.result === "unknown"
                    ? `A sale of ${sym} could not be tested: ${hp.reason.charAt(0).toLowerCase()}${hp.reason.slice(1).replace(/\.$/, "")}.`
                  : fails
                    ? `${sym} can be sold, but ${fails} check${fails > 1 ? "s" : ""} failed: read ${fails > 1 ? "them" : "it"} before you buy.`
                    : warns
                      ? `${sym} can be sold. Nothing failed; ${warns} to read with care.`
                      : `${sym} can be sold and every check passed. Still not a guarantee.`;
              return (
                <Verdict
                  kicker={report.example ? "Example report · can you sell it" : `${sym} · ${short(report.token)} · can you sell it`}
                  tone={notToken || exit?.result === "fail" || fails ? "bad" : warns ? "caution" : "good"}
                  value={notToken ? "Not a token" : sc ? <>{sc.total}<span className="text-[0.45em] text-muted">/90</span></> : `${passed}/${report.checks.length}`}
                  valueLabel={notToken ? "no score: nothing here can be traded" : sc ? `Corbel score, ${sc.total} of a possible 90 · ${sc.tag}` : "checks passed"}
                  facts={[
                    ["Checks passed", `${passed} of ${report.checks.length}`],
                    ["Exit now", by("exit")?.metric ?? "—"],
                    ["Tax", by("tax")?.metric ?? "—"],
                    ["Liquidity", by("liquidity")?.metric ?? "—"],
                  ]}
                  visual={
                    <div className="grid gap-x-6 gap-y-3 pb-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                        {(sc?.parts ?? []).map((p) => (
                          <div key={p.id}>
                            <p className="flex justify-between text-[13px]">
                              <span className="text-muted">{p.label}</span>
                              <span className={cx("tabular-nums", tone(p.score))}>{p.score}</span>
                            </p>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#242424]">
                              <div className={cx("bar-grow h-full rounded-full", p.score >= 60 ? "bg-leaf" : p.score >= 40 ? "bg-amber" : "bg-flesh")} style={{ width: `${p.score}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-end gap-1" aria-label={`${passed} of ${report.checks.length} checks passed`}>
                        {report.checks.map((c) => (
                          <span key={c.id} title={`${c.name}: ${c.result}`} className={cx("h-6 w-2.5 rounded-sm", c.result === "pass" ? "bg-leaf" : c.result === "fail" ? "bg-flesh" : c.result === "warn" ? "bg-amber" : "bg-[#303030]")} />
                        ))}
                      </div>
                    </div>
                  }
                >
                  {sentence}
                </Verdict>
              );
            })()}
            {sc && !report.example && (
              <p className="flex flex-wrap items-center gap-3 px-1 text-[13px] text-muted">
                <span className="min-w-0 flex-1">{sc.why}</span>
                <span className="flex items-center gap-2">
                  Share on X <CopyButton text={shareLine(report.meta?.symbol ?? short(report.token), sc)} />
                </span>
              </p>
            )}

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="overflow-hidden rounded-2xl border border-[#242424] bg-[#131313]">
                <div className="flex items-center justify-between border-b border-[#242424] px-4 py-3">
                  <span className="text-[15px] font-semibold text-text">{report.checks.length === 7 ? "Seven checks" : `${report.checks.length} checks`}</span>
                  {report.meta && (
                    <span className="font-mono text-[12px] text-muted">
                      {report.meta.venue ?? "no pool"} · block {Number(report.meta.block).toLocaleString("en-US")} · {(report.meta.ms / 1000).toFixed(1)} s
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
                    <thead>
                      <tr className="border-b border-[#242424] text-[12px] text-muted">
                        <th scope="col" className="w-10 px-4 py-2 font-normal">#</th>
                        <th scope="col" className="px-2 py-2 font-normal">Check</th>
                        <th scope="col" className="px-2 py-2 font-normal">Result</th>
                        <th scope="col" className="px-2 py-2 font-normal">Finding</th>
                        <th scope="col" className="px-4 py-2 text-right font-normal">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.checks.map((c, n) => {
                        const m = MARK[c.result];
                        return (
                          <tr key={c.id} className={cx("border-b border-[#242424] last:border-0", c.result === "fail" && "bg-flesh-deep/20")}>
                            <td className="px-4 py-3 align-top font-mono text-[12px] text-muted">{String(n + 1).padStart(2, "0")}</td>
                            <th scope="row" className="px-2 py-3 align-top font-normal">
                              <span className="text-text">{c.name}</span>
                              {HOW[c.id] && <span className="mt-0.5 block text-[12px] text-muted">{HOW[c.id]}</span>}
                            </th>
                            <td className="px-2 py-3 align-top">
                              <span className={cx("inline-flex whitespace-nowrap rounded-full border border-current/40 px-2 py-0.5 text-[12px]", m.cls)}>
                                {m.sign} {m.word}
                              </span>
                            </td>
                            <td className="px-2 py-3 align-top text-muted">{c.reason}</td>
                            <td className="px-4 py-3 text-right align-top tabular-nums text-[13px] text-text">{c.metric ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-[#242424] px-4 py-2.5 text-[12px] text-muted">A clean check is not a guarantee: it reads the chain, not intent.</p>
              </div>

              <aside className="space-y-3">
                <div className="rounded-2xl border border-[#242424] bg-[#131313] p-4">
                  <p className="text-[15px] font-semibold text-text">Next</p>
                  {!report.example ? (
                    <ul className="mt-3 space-y-2">
                      {[
                        [`/app/trade/terminal?token=${report.token}`, "Open the chart", "Swaps, depth, exit plan"],
                        [`/app/trade/quote?from=ETH&to=${report.token}&amount=0.01`, "Quote a buy", "Every route, simulated"],
                        [`/app/trade/quote?from=${report.token}&to=ETH&amount=1000`, "Quote a sell", "What leaving pays"],
                      ].map(([href, a, b]) => (
                        <li key={href}>
                          <Link href={href!} className="block rounded-xl border border-[#242424] bg-[#181818] px-3 py-2.5 hover:border-ui/60">
                            <span className="flex justify-between text-[14px] text-text">
                              {a} <span aria-hidden className="text-leaf">→</span>
                            </span>
                            <span className="text-[12px] text-muted">{b}</span>
                          </Link>
                        </li>
                      ))}
                      <li className="pt-1">
                        <WatchButton kind="token" value={report.token} label={report.meta?.symbol ?? ""} />
                      </li>
                    </ul>
                  ) : (
                    <button type="button" onClick={() => input.current?.focus()} className="ibtn mt-3 h-11 w-full">
                      Check a real token
                    </button>
                  )}
                </div>
                <div className="rounded-2xl border border-[#242424] bg-[#131313] p-4 text-[13px] text-muted">
                  <p className="font-semibold text-text">How to read it</p>
                  <ul className="mt-2 space-y-1">
                    <li><span className="text-leaf">✓ Pass</span> ran, nothing wrong</li>
                    <li><span className="text-text">▲ Caution</span> read with care</li>
                    <li><span className="text-flesh">✕ Fail</span> a real problem</li>
                    <li><span className="text-muted">? Unknown</span> could not run; not a pass</li>
                  </ul>
                </div>
              </aside>
            </div>
            {!report.example && <ProjectResearch token={report.token} />}
            {!report.example && <RealityCheck token={report.token} />}
          </>
        )}
      </div>
    </div>
  );
}
