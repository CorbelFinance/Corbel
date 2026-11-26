"use client";

/**
 * Terminal · the company behind an issuer stock token: what it does, its sector and its own links, next to the chart
 *. Shown only when /api/company finds a clear match; nothing is filled in by hand.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import type { Company } from "@/lib/companyInfo";

export function CompanyCard({ symbol, name, stock }: { symbol: string; name: string; stock?: boolean }) {
  const [c, setC] = useState<Company | null | undefined>(undefined);
  const [more, setMore] = useState(false);
  useEffect(() => {
    let off = false;
    fetch(`/api/company?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { company?: Company | null } | null) => !off && setC(j?.company ?? null))
      .catch(() => !off && setC(null));
    return () => {
      off = true;
    };
  }, [symbol, name]);
  if (c === null) return null;
  const links = c ? ([["Website", c.links.site], ["X", c.links.x], ["GitHub", c.links.github], ["Docs", c.links.docs], ["LinkedIn", c.links.linkedin], ["Blog", c.links.blog]] as const).filter(([, u]) => u) : [];
  const money = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);
  return (
    <section aria-label="Company" className="term-pane co-card flex min-w-0 flex-col overflow-hidden rounded-lg border border-[#242424] bg-[#141414]">
      <header className="flex min-h-9 items-center gap-3 border-b border-line px-3 py-1">
        <span className="text-[13px] font-semibold text-text">{stock ? "Company" : "Project"}</span>
        <span className="ml-auto text-[12px] text-muted">{symbol}</span>
      </header>
      {c === undefined ? (
        <div className="space-y-2 p-3">
          <span className="block h-4 w-32 animate-pulse rounded bg-[#1f1f1f]" />
          <span className="block h-3 w-full animate-pulse rounded bg-[#1c1c1c]" />
          <span className="block h-3 w-4/5 animate-pulse rounded bg-[#1c1c1c]" />
        </div>
      ) : (
        <div className="p-3">
          <p className="text-[15px] font-semibold text-text">{c.name}</p>
          {c.line && <p className="text-[12px] text-muted">{c.line}</p>}
          <p className={cx("mt-2 text-[12.5px] leading-relaxed text-[#c9ccca]", !more && "line-clamp-4")}>{c.about}</p>
          {c.about.length > 220 && (
            <button type="button" onClick={() => setMore((m) => !m)} className="mt-1 text-[12px] text-leaf hover:underline">
              {more ? "Show less" : "Show more"}
            </button>
          )}
          {c.tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {c.tags.map((t) => (
                <span key={t} className="rounded-md bg-[#1c1c1c] px-1.5 py-0.5 text-[11.5px] text-muted">
                  {t}
                </span>
              ))}
            </div>
          )}
          {(c.funding != null || c.backers.length > 0) && (
            <dl className="mt-3 space-y-1.5 border-t border-line pt-2.5 text-[12.5px]">
              {c.funding != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Raised</dt>
                  <dd className="font-mono text-text">{money(c.funding)}</dd>
                </div>
              )}
              {c.backers.length > 0 && (
                <div>
                  <dt className="text-muted">Backed by</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {c.backers.map((b) =>
                      b.x ? (
                        <a key={b.name} href={b.x} target="_blank" rel="noreferrer noopener" className={cx("rounded-md px-1.5 py-0.5 text-[11.5px] transition-colors hover:text-text", b.lead ? "bg-leaf/10 text-leaf" : "bg-[#1c1c1c] text-muted")}>
                          {b.name}
                        </a>
                      ) : (
                        <span key={b.name} className={cx("rounded-md px-1.5 py-0.5 text-[11.5px]", b.lead ? "bg-leaf/10 text-leaf" : "bg-[#1c1c1c] text-muted")}>
                          {b.name}
                        </span>
                      ),
                    )}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {links.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {links.map(([k, u]) => (
                <a key={k} href={u} target="_blank" rel="noreferrer noopener" className="grid h-8 place-items-center rounded-lg border border-[#2a2a2a] text-[12px] text-muted transition-colors hover:border-[#3a3a3a] hover:text-text">
                  {k}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
