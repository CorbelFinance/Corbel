"use client";

/**
 * Launch · launchpads. One card per launchpad we can tell apart on the chain: launches in the last day and three
 * days, how many of its pools are already drained, and the newest tokens that came out of it, each opening in the
 * terminal. Pools made by hand on Uniswap and pools we cannot label close the list.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument } from "./kit";
import { TokenAvatar } from "./TokenAvatar";

type Tok = { token: string; symbol: string | null; name: string | null; ago: number; dead: 0 | 1 | null; lookalike?: boolean; stage?: "curve" | "pool" };
type Pad = { id: string; name: string; tone: string; url: string | null; day: number; total: number; dead: number; checked: number; tokens: Tok[] };
const ago = (s: number) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))}m` : s < 172_800 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86_400)}d`);

export function PadBoard() {
  const [pads, setPads] = useState<Pad[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let off = false;
    const load = () =>
      fetch("/api/pads")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { pads: Pad[] }) => !off && setPads(j.pads))
        .catch(() => !off && setErr(true));
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, []);
  const named = (pads ?? []).filter((p) => p.id !== "other");
  const top = Math.max(1, ...named.map((p) => p.day));

  return (
    <Instrument code="L-00" title="Launchpads and what came out of them" foot={<span>Last three days of our own index. A launchpad is told apart by its pools&apos; hook or the contract that made them.</span>}>
      {!pads && !err && <p className="caret px-4 py-6 font-mono text-[13px] text-muted">Reading launches</p>}
      {err && <p className="px-4 py-6 text-[14px] text-muted">The index did not answer. Try again in a minute.</p>}
      {pads && (
        <div className="grid gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-3">
          {named.map((p, i) => (
            <section key={p.id} className="tile-in flex flex-col rounded-2xl border bg-[#101010] p-4" style={{ borderColor: `${p.tone}40`, animationDelay: `${i * 0.05}s` }}>
              <header className="flex items-center gap-2">
                <i className="h-2.5 w-2.5 rounded-full" style={{ background: p.tone, boxShadow: `0 0 10px ${p.tone}` }} />
                <h3 className="text-[15px] font-semibold text-text">{p.name}</h3>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noreferrer nofollow" className="text-[13px] text-muted hover:text-text">
                    site ↗
                  </a>
                )}
                <span className="ml-auto font-mono text-[13px] text-muted">{`${p.total} in 3d`}</span>
              </header>
              <div className="mt-3 flex items-end gap-4">
                <div>
                  <p className="font-display text-3xl leading-none text-text">{p.day}</p>
                  <p className="mt-1 text-[13px] text-muted">launched today</p>
                </div>
                <div className="flex-1">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-[#1c1c1c]">
                    <span className="bar-grow block h-full rounded-full" style={{ width: `${(p.day / top) * 100}%`, background: p.tone }} />
                  </span>
                  <p className="mt-1.5 font-mono text-[13px] text-muted">{p.checked ? `${Math.round((p.dead / p.checked) * 100)}% of checked pools drained` : "liveness not read yet"}</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1">
                {p.tokens.slice(0, 6).map((t) => (
                  <li key={t.token}>
                    <Link href={`/app/trade/terminal?token=${t.token}`} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-[13px] transition-colors hover:bg-[#181818]">
                      <TokenAvatar address={t.token} symbol={t.symbol} size={22} />
                      <span className={cx("w-20 truncate font-mono", t.dead === 1 ? "text-muted line-through" : "text-text")}>{t.symbol ?? "?"}</span>
                      {t.lookalike ? <span className="rounded-full bg-flesh/15 px-1.5 text-[13px] text-flesh">lookalike</span> : null}
                      {t.stage === "curve" ? <span className="rounded-full border border-[#8d72e8]/50 px-1.5 text-[13px] text-[#9b86e4]">on curve</span> : null}
                      <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{t.name ?? ""}</span>
                      <span className="shrink-0 font-mono text-[13px] text-muted">{ago(t.ago)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {pads && pads.some((p) => p.id === "other") && (
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted">{`${pads.find((p) => p.id === "other")!.total} more pools came from contracts we have not labelled yet.`}</p>
      )}
    </Instrument>
  );
}
