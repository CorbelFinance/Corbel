"use client";

/**
 * Token check · claims against reality. What the project says about itself (its site and the pages it links, its
 * public Telegram channel, its X profile, its code), each claim quoted word for word, next to what we could check:
 * backed, nothing behind it, or contradicted. The score is computed from that evidence, never by the model.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Bay, Gauge } from "./Bay";

type Claim = { claim: string; quote: string; source: string; kind: string; status: "backed" | "unbacked" | "contradicted"; evidence: string[] };
type Ev = { id: string; label: string; state: "yes" | "no" | "unknown"; detail: string; url?: string };
type Res = { na?: string; score: number | null; label: string; why: string; claims: Claim[]; evidence: Ev[]; sources: { id: string; kind: string; url: string }[]; model: boolean; error?: string };
const STATUS = { backed: ["Backed", "bg-leaf/15 text-leaf"], unbacked: ["Nothing behind it", "bg-[#202020] text-muted"], contradicted: ["Contradicted", "bg-flesh/15 text-flesh"] } as const;
const KIND: Record<string, string> = { shipped: "says it is live", planned: "promises", partner: "partner", metric: "number", team: "team" };
const MARK = { yes: ["✓", "text-leaf"], no: ["✕", "text-flesh"], unknown: ["?", "text-muted"] } as const;

export function RealityCheck({ token }: { token: string }) {
  const [res, setRes] = useState<Res | null>(null);
  useEffect(() => {
    let off = false;
    void Promise.resolve().then(() => setRes(null));
    fetch(`/api/reality?token=${token}`)
      .then((r) => r.json())
      .then((j: Res) => !off && setRes(j))
      .catch(() => !off && setRes({ score: null, label: "", why: "", claims: [], evidence: [], sources: [], model: false, error: "The read did not answer." }));
    return () => {
      off = true;
    };
  }, [token]);
  const src = (id: string) => res?.sources.find((s) => s.id === id)?.url;
  const tone = (n: number) => (n >= 60 ? "text-leaf" : n >= 40 ? "text-text" : "text-flesh");
  return (
    <Bay tone="ice" kicker="In words and in fact" title="Claims against reality" busy={!res} className="mt-4" foot={<span>Each claim is quoted word for word from the project&apos;s own site, channel and X posts; the verdict comes from evidence read here.</span>}>
      {!res && <p className="caret px-5 pb-6 font-mono text-[13px] text-muted">Reading its site, channel, profile and code, then checking each claim</p>}
      {res?.error && <p className="px-5 pb-5 text-[13px] text-flesh">{res.error}</p>}
      {res?.na && <p className="px-5 pb-5 text-[13px] text-muted">{res.na}</p>}
      {res && !res.error && !res.na && (
        <div className="grid gap-4 px-5 pb-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="flex flex-col items-center rounded-2xl bg-(--bay-bg2) p-4">
            {res.score === null ? (
              <p className="py-10 text-center text-[13px] text-muted">Nothing to read: no site, channel or profile is listed.</p>
            ) : (
              <>
                <Gauge value={res.score / 100} label="Reality" sub={`${res.score} of 100`} size={150} />
                <p className={cx("mt-1 font-mono text-[13px] font-semibold", res.label === "UNPROVEN" ? "text-muted" : tone(res.score))}>{res.label}</p>
                <p className="mt-2 text-center text-[12px] text-muted">{res.why}</p>
              </>
            )}
          </div>
          <div className="min-w-0 space-y-4">
            {res.claims.length > 0 ? (
              <ul className="space-y-1.5">
                {res.claims.map((c, i) => (
                  <li key={i} className="tile-in rounded-xl bg-(--bay-bg2) px-3 py-2.5 text-[13px]" style={{ animationDelay: `${i * 0.04}s` }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cx("rounded-md px-2 py-0.5 text-[12px] font-medium", STATUS[c.status][1])}>{STATUS[c.status][0]}</span>
                      <span className="text-text">{c.claim}</span>
                      <span className="ml-auto text-[12px] text-muted">{KIND[c.kind] ?? c.kind}</span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-muted">
                      &ldquo;{c.quote}&rdquo;{" "}
                      {src(c.source) && (
                        <a href={src(c.source)} target="_blank" rel="noreferrer nofollow" className="text-(--bay-acc) hover:underline">
                          source ↗
                        </a>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-(--bay-bg2) px-3 py-3 text-[13px] text-muted">{res.model ? "No claim a buyer relies on was found in its own words." : "Claims are not read right now; the evidence below still counts."}</p>
            )}
            <ul className="grid gap-1 sm:grid-cols-2">
              {res.evidence.map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-[12.5px]">
                  <span className={cx("w-3 shrink-0 font-mono", MARK[e.state][1])}>{MARK[e.state][0]}</span>
                  <span>
                    <span className="text-text">{e.url ? <a href={e.url} target="_blank" rel="noreferrer nofollow" className="hover:underline">{e.label}</a> : e.label}</span>
                    <span className="block text-muted">{e.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Bay>
  );
}
