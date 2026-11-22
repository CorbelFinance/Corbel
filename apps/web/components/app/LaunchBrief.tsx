"use client";

/**
 * Radar · the launch watch agent. Reads /api/pads/brief: up to six lines written over the last day of launches, where
 * the launches came from (per launchpad, day and last hour), and the
 * flags behind them (creators launching again and again, money-ticker copies, tickers launched many times, drained
 * pools). The lines print like a terminal log; each flag opens the token check.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { TokenAvatar } from "./TokenAvatar";
import { Verdict } from "./kit";

type Flag = {
  kind: "serial" | "lookalike" | "clone" | "drained";
  title: string;
  note: string;
  token?: string;
  creator?: string;
  pad?: string;
};
type Near = { token: string; symbol: string | null; pad: string; sold: number; ago: number };
type Brief = {
  at: number;
  by: "agent" | "rules";
  lines: string[];
  flags: Flag[];
  near?: Near[];
  onCurve?: number;
  counts: { hour: number; day: number; pads: number; drained?: number };
  byPad?: { name: string; day: number; hour: number }[];
};
const age = (s: number) =>
  s < 3600
    ? `${Math.max(1, Math.round(s / 60))}m`
    : s < 86_400
      ? `${Math.round(s / 3600)}h`
      : `${Math.round(s / 86_400)}d`;
const TAG: Record<Flag["kind"], string> = {
  serial: "serial creator",
  lookalike: "copies money",
  clone: "same ticker",
  drained: "drained",
};
/** One line per kind of flag, said as a group. */
const GROUP: Record<Flag["kind"], string> = {
  drained: "Drained pools",
  lookalike: "Copies of a money ticker",
  clone: "Tickers launched again and again",
  serial: "Serial creators",
};
const SCAN = "https://robinhoodchain.blockscout.com/address/";

export function LaunchBrief({ logOnly = false, verdict = true }: { logOnly?: boolean; verdict?: boolean } = {}) {
  const [b, setB] = useState<Brief | null>(null);
  const [err, setErr] = useState(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let off = false;
    const load = () =>
      fetch("/api/pads/brief")
        .then((r) => (r.ok ? (r.json() as Promise<Brief>) : null))
        .then((j) => {
          if (off) return;
          if (!j?.lines) return setErr(true);
          setErr(false);
          setB((old) => {
            if (!old || old.at !== j.at) setShown(0);
            return j;
          });
        })
        .catch(() => !off && setErr(true));
    void load();
    const t = setInterval(load, 120_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, []);
  // the lines come in one by one, as the agent's log would print them
  useEffect(() => {
    if (!b || shown >= b.lines.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown ? 420 : 150);
    return () => clearTimeout(t);
  }, [b, shown]);

  // the clock for "n min ago", read in an effect so render stays pure
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const i = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(i);
    };
  }, [b]);
  const mins = b && now ? Math.max(0, Math.round((now - b.at) / 60_000)) : 0;
  const [openKind, setOpenKind] = useState<string | null>(null);

  const log = (
    <div className={cx("bg-[#0a0a0a] px-5 py-4", logOnly && "flex h-full flex-col")}>
      <p className="flex items-center gap-2 font-mono text-[12px] text-muted">
        <span className={cx("h-1.5 w-1.5 rounded-full", b ? "bg-leaf" : "bg-[#303030]")} />
        {`launch agent · last 24h · ${b ? (mins ? `${mins} min ago` : "just now") : "reading"}`}
        <span className="ml-auto">{b ? (b.by === "agent" ? "written by the agent" : "written by rules") : ""}</span>
      </p>
      <div className={cx("mt-3 space-y-1.5 font-mono text-[13.5px] leading-snug", logOnly && "flex-1")} aria-live="polite">
        {err && !b && <p className="text-muted">The agent has not read the launches yet.</p>}
        {!b &&
          !err &&
          [92, 78, 85, 64].map((w, i) => (
            <span key={i} aria-hidden className="block h-3.5 rounded bg-[#181818]" style={{ width: `${w}%` }} />
          ))}
        {b?.lines.slice(0, shown).map((l, i) => (
          <p key={i} className="text-text">
            <span className="mr-2 text-leaf">›</span>
            {l}
          </p>
        ))}
      </div>
      {b?.byPad && b.byPad.length > 0 && (
        <div className="mt-4 border-t border-[#1a1a1a] pt-3">
          <p className="flex items-baseline justify-between text-[12px] text-muted">
            Where they came from
            <span>24h · last hour</span>
          </p>
          <ul className="mt-2 space-y-1.5">
            {b.byPad.map((p, i) => (
              <li key={p.name} className="grid grid-cols-[8rem_minmax(0,1fr)_3.4rem_2.8rem] items-center gap-3 text-[13px]">
                <span className="truncate text-text">{p.name}</span>
                <span className="relative h-2 overflow-hidden rounded-full bg-[#161616]">
                  <span className="bar-grow absolute inset-y-0 left-0 rounded-full bg-[#7d8a83]" style={{ width: `${(p.day / (b.byPad![0]!.day || 1)) * 100}%`, animationDelay: `${i * 0.06}s` }} />
                </span>
                <span className="text-right tabular-nums text-text">{p.day.toLocaleString("en")}</span>
                <span className="text-right tabular-nums text-muted">{`+${p.hour}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  if (logOnly) return <section className="h-full overflow-hidden rounded-3xl border border-line">{log}</section>;

  // the flags grouped by kind, the most dangerous kind first: one row per kind, the worst case named
  const SEV: Flag["kind"][] = ["drained", "lookalike", "clone", "serial"];
  const groups = SEV.map((k) => ({ k, list: (b?.flags ?? []).filter((f) => f.kind === k) })).filter((g) => g.list.length);
  const worst = groups[0]?.list[0];
  const total = (b?.flags ?? []).length;
  const danger = (k: Flag["kind"]) => k === "drained" || k === "lookalike";

  return (
    <div className="space-y-4">
      {!verdict ? null : b ? (
        <Verdict
          kicker="Launches · last 24 hours"
          tone={total ? "bad" : "good"}
          value={total}
          valueLabel={total ? "patterns flagged by the agent" : "nothing flagged"}
          facts={[
            ["Launched", b.counts.day.toLocaleString("en")],
            ["This hour", b.counts.hour],
            ["Sources", b.counts.pads],
            ...(b.counts.drained != null ? ([["Pools drained", b.counts.drained]] as [string, number][]) : []),
            ...(b.onCurve ? ([["On a curve", b.onCurve]] as [string, number][]) : []),
          ]}
        >
          {worst ? `${b.counts.day.toLocaleString("en")} tokens launched today. The most dangerous: ${worst.title.replace(/\.$/, "")}.` : `${b.counts.day.toLocaleString("en")} tokens launched today, and nothing out of line.`}
        </Verdict>
      ) : (
        <div aria-hidden className="h-40 rounded-2xl border border-line bg-[#0e0e0e] p-8">
          <span className="block h-3 w-40 rounded bg-[#181818]" />
          <span className="mt-5 block h-8 w-[55%] rounded bg-[#181818]" />
        </div>
      )}

      <section className="grid overflow-hidden rounded-2xl border border-line lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {log}
        <div className="border-t border-line bg-[#0e0e0e] lg:border-l lg:border-t-0">
          <div className="px-5 py-4">
            <p className="text-[14px] font-semibold text-text">What it flagged</p>
            {b && !groups.length && <p className="mt-2 text-[13px] text-muted">Nothing out of line in the last day.</p>}
            <ul className="mt-3 space-y-2">
              {groups.map((g) => {
                const open = openKind === g.k;
                return (
                  <li key={g.k} className={cx("rounded-xl border", danger(g.k) ? "border-flesh/25 bg-flesh/[0.04]" : "border-[#e3b341]/20 bg-[#e3b341]/[0.03]")}>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <button type="button" aria-expanded={open} onClick={() => setOpenKind(open ? null : g.k)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className={cx("font-display text-[24px] leading-none tabular-nums", danger(g.k) ? "text-flesh" : "text-[#e3b341]")}>{g.list.length}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] text-text">{GROUP[g.k]}</span>
                          <span className="block truncate text-[12px] text-muted">{g.list[0]!.title}</span>
                        </span>
                        {g.list.length > 1 && <span className="text-[12px] text-muted">{open ? "Hide" : "All"}</span>}
                      </button>
                      {g.list[0]!.token && (
                        <Link href={`/app/trust/check?q=${g.list[0]!.token}`} className="text-[13px] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                          Check →
                        </Link>
                      )}
                    </div>
                    {open && (
                      <ul className="pane-in border-t border-line/60 px-3 py-2">
                        {g.list.map((f, i) => (
                          <li key={i} className="flex items-center gap-3 py-1.5 text-[13px]">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-text">{f.title}</span>
                              <span className="block truncate text-[12px] text-muted">{f.note}</span>
                            </span>
                            {f.creator && (
                              <a href={`${SCAN}${f.creator}`} target="_blank" rel="noreferrer" className="text-[12px] text-muted underline underline-offset-2">
                                creator ↗
                              </a>
                            )}
                            {f.token && (
                              <Link href={`/app/trust/check?q=${f.token}`} className="text-[12px] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                                Check →
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
              {!b && [0, 1, 2].map((i) => <li key={i} aria-hidden className="h-14 rounded-xl bg-[#161616]" />)}
            </ul>
          </div>
          <div className="border-t border-line px-5 py-4">
            <p className="flex items-baseline justify-between text-[14px] font-semibold text-text">
              Near graduation
              <span className="text-[12px] font-normal text-muted">{b?.onCurve ? `${b.onCurve} on a curve` : ""}</span>
            </p>
            {b && !b.near?.length && <p className="mt-2 text-[13px] text-muted">{b.onCurve ? "No curve is close to full yet." : "No token is on a launch curve right now."}</p>}
            <ul className="mt-2 space-y-2">
              {b?.near?.slice(0, 5).map((n) => (
                <li key={n.token}>
                  <Link href={`/app/trust/check?q=${n.token}`} className="block rounded-lg px-1 py-1 hover:bg-leaf/[0.04]">
                    <span className="flex items-center gap-2 text-[13px]">
                      <TokenAvatar address={n.token} symbol={n.symbol} size={18} />
                      <span className="truncate font-mono text-text">{n.symbol ?? "?"}</span>
                      <span className="truncate text-[12px] text-muted">{`${n.pad}${n.ago ? ` · ${age(n.ago)}` : ""}`}</span>
                      <span className="ml-auto font-mono text-[13px] text-text">{`${Math.round(n.sold * 100)}%`}</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#1f1f1f]">
                      <span className="bar-grow block h-full rounded-full bg-leaf" style={{ width: `${n.sold * 100}%` }} />
                    </span>
                  </Link>
                </li>
              ))}
              {!b && [0, 1, 2].map((i) => <li key={i} aria-hidden className="h-8 rounded-lg bg-[#161616]" />)}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
