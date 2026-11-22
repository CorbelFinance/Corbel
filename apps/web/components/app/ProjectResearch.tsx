"use client";

/**
 * Token check · project research. What the code checks cannot say: is there a real project behind the token?
 * Its links, whether its website answers and names this very contract, the domain's age, recent code, its social
 * accounts, and the creator wallet's record and holdings. Each finding shows its source; unknowns stay unknown.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Bay, Gauge } from "./Bay";

type Finding = { id: string; label: string; state: "yes" | "no" | "unknown"; detail: string; url?: string };
type Res = { findings: Finding[]; proofs: number; checked: number; creator: string | null; error?: string };
const MARK = { yes: ["✓", "bg-leaf/15 text-leaf"], no: ["✕", "bg-flesh/15 text-flesh"], unknown: ["?", "bg-[#202020] text-muted"] } as const;

export function ProjectResearch({ token }: { token: string }) {
  const [res, setRes] = useState<Res | null>(null);
  useEffect(() => {
    let off = false;
    void Promise.resolve().then(() => setRes(null));
    fetch(`/api/research?token=${token}`)
      .then((r) => r.json())
      .then((j: Res) => !off && setRes(j))
      .catch(() => !off && setRes({ findings: [], proofs: 0, checked: 0, creator: null, error: "The research did not answer." }));
    return () => {
      off = true;
    };
  }, [token]);
  const total = res?.findings.length ?? 0;
  return (
    <Bay tone="ice" kicker="What the code cannot show" title="Project research" busy={!res} className="mt-4" foot={<span>Read from the token&apos;s public listing, its website, public records and the chain. X activity is not read.</span>}>
      {!res && <p className="caret px-5 pb-6 font-mono text-[13px] text-muted">Reading the site, the links and the creator wallet</p>}
      {res?.error && <p className="px-5 pb-5 text-[13px] text-flesh">{res.error}</p>}
      {res && !res.error && (
        <div className="grid gap-4 px-5 pb-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="flex flex-col items-center rounded-2xl bg-(--bay-bg2) p-4">
            <Gauge value={total ? res.proofs / total : 0} label="Proofs found" sub={`${res.proofs} of ${total} found`} size={150} />
            <p className="mt-2 text-center text-[12px] text-muted">{res.proofs >= total * 0.7 ? "A working project shows up outside its code." : res.proofs >= total * 0.4 ? "Some proof, some gaps." : "Little outside proof of a working project."}</p>
          </div>
          <ul className="space-y-1.5">
            {res.findings.map((f, i) => (
              <li key={f.id} className="tile-in grid grid-cols-[1.6rem_minmax(0,14rem)_1fr] items-start gap-3 rounded-xl bg-(--bay-bg2) px-3 py-2.5 text-[13px]" style={{ animationDelay: `${i * 0.04}s` }}>
                <span className={cx("grid h-6 w-6 place-items-center rounded-md text-[12px]", MARK[f.state][1])}>{MARK[f.state][0]}</span>
                <span className="text-text">
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noreferrer nofollow" className="hover:text-(--bay-acc) hover:underline">
                      {f.label} ↗
                    </a>
                  ) : (
                    f.label
                  )}
                </span>
                <span className="text-muted">{f.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Bay>
  );
}
