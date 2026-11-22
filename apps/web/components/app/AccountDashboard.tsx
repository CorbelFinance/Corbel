"use client";

/**
 * Earn · Dashboard: one cabinet for one address. The address is set once (the linked wallet, or any pasted one) and
 * every panel reads it:
 *  - the identity strip: the address, wallet or contract, transactions sent, how it is linked, sign-in;
 *  - five totals: net worth, in tokens, in pools, pool fees in the last day, transactions;
 *  - holdings: every token with its amount, value and share, each one a click from a check or a trade;
 *  - allocation by kind (base, stock tokens, other tokens, pool shares), the LP positions, and the next steps.
 * The quick read (/api/wallet, /api/lp) lands first; the full token scan (/api/portfolio) follows and says so.
 * Read-only: nothing is signed or sent from here.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Verdict, short } from "./kit";
import { TokenAvatar } from "./TokenAvatar";
import { LinkPanel, SignInRow, useLinked } from "./wallet";
import { useSession } from "./session";
import { linesOf, usd, usePortfolio, type Line } from "./walletData";

type Quick = { address: string; block: string; isContract: boolean; txCount: number; balances: { symbol: string; raw: string; value: string }[]; launches: { launches: number; dead: number; checked: number } | null; error?: string };
type Pos = { token: string; symbol: string; base: string; pair: string; share: number; value: number; feesDay: number; apr: number | null };
type Lp = { positions: Pos[]; total: number; feesDay: number; pools: number; error?: string };

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const KIND_TONE: Record<string, string> = { base: "bg-[#6cc0d0]", stock: "bg-[#9b86e4]", token: "bg-leaf", pool: "bg-[#f2c46d]" };
const KIND_LABEL: Record<string, string> = { base: "ETH and dollars", stock: "Stock tokens", token: "Other tokens", pool: "Pool shares" };
const amt = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v >= 1 ? v.toFixed(2) : v.toPrecision(3));

function Panel({ title, hint, children, className }: { title: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-[#0f0f0f]", className)}>
      <header className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3">
        <span className="text-[14px] font-semibold text-text">{title}</span>
        {hint && <span className="font-mono text-[12px] text-muted">{hint}</span>}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

/** A small mark drawn from the address, so the same wallet always looks the same. */
function Mark({ address }: { address: string }) {
  const h = address.toLowerCase().slice(2);
  return (
    <span aria-hidden className="grid h-11 w-11 shrink-0 grid-cols-4 gap-[2px] overflow-hidden rounded-xl bg-[#0d0d0d] p-1.5 ring-1 ring-line">
      {Array.from({ length: 16 }, (_, i) => {
        const v = parseInt(h[(i * 2) % h.length]!, 16);
        return <i key={i} className="rounded-[2px]" style={{ background: v > 9 ? "var(--leaf)" : v > 5 ? "#1f6b45" : "#1a1a1a" }} />;
      })}
    </span>
  );
}

export function AccountDashboard() {
  const { linked, link } = useLinked();
  const auth = useSession();
  const [addr, setAddr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState<Quick | null>(null);
  const [lp, setLp] = useState<Lp | null>(null);
  const [copied, setCopied] = useState(false);
  const [bad, setBad] = useState<string | null>(null);

  // follow the address linked in the header
  useEffect(() => {
    if (linked?.address && linked.address.toLowerCase() !== addr?.toLowerCase()) void Promise.resolve().then(() => setAddr(linked.address));
  }, [linked, addr]);

  useEffect(() => {
    if (!addr) return;
    let off = false;
    void Promise.resolve().then(() => (setQuick(null), setLp(null)));
    fetch(`/api/wallet?address=${addr}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<Quick>)
      .then((j) => !off && setQuick(j))
      .catch(() => !off && setQuick({ error: "No answer." } as Quick));
    fetch(`/api/lp?address=${addr}`)
      .then((r) => r.json() as Promise<Lp>)
      .then((j) => !off && setLp(j))
      .catch(() => !off && setLp({ positions: [], total: 0, feesDay: 0, pools: 0, error: "No answer." }));
    return () => {
      off = true;
    };
  }, [addr]);
  const { p, err: scanErr, busy: scanning } = usePortfolio(addr ? `/api/portfolio?address=${addr}` : null);

  const open = (v: string) => {
    const a = v.trim();
    if (!ADDR.test(a)) return setBad("Paste a 0x address, 42 characters.");
    setBad(null);
    setAddr(a);
    if (a.toLowerCase() !== linked?.address.toLowerCase()) link({ address: a, via: "watch" });
  };

  if (!addr)
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="relative overflow-hidden rounded-2xl border border-line bg-[#0f0f0f] p-6 sm:p-8">
          <p className="font-medium text-[12px] uppercase tracking-[0.1em] text-leaf">Your cabinet</p>
          <h2 className="mt-2 font-display text-[clamp(1.6rem,1rem+1.6vw,2.4rem)] leading-tight text-text">Everything one address holds, on one screen.</h2>
          <p className="mt-2 max-w-lg text-[14px] text-muted">Link your wallet or paste any address. Tokens, stock tokens, pool shares and their fees are read from the chain at the latest block.</p>
          <form onSubmit={(e) => (e.preventDefault(), open(q))} className="mt-6 flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="0x… any address on Robinhood Chain" spellCheck={false} aria-label="Address to open" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-[#090909] px-4 font-mono text-[13px] text-text outline-none focus:border-ui/60" />
            <button type="submit" className="h-11 rounded-xl bg-ui px-5 text-[13.5px] font-semibold text-[#0b0b0b]">
              Open
            </button>
          </form>
          {bad && <p className="mt-2 text-[12.5px] text-flesh">{bad}</p>}
          <ul className="mt-6 grid gap-2 sm:grid-cols-3">
            {[
              ["Totals", "Net worth, tokens, pool shares, fees"],
              ["Holdings", "Every token, valued at its pool"],
              ["Next steps", "Check, stress test, share"],
            ].map(([k, v]) => (
              <li key={k} className="rounded-xl bg-[#0d0d0d] px-3 py-2.5">
                <p className="text-[13px] text-text">{k}</p>
                <p className="text-[12px] text-muted">{v}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="overflow-hidden rounded-2xl border border-line bg-[#0f0f0f]">
          <header className="border-b border-line px-5 py-3 text-[14px] font-semibold text-text">Link a wallet</header>
          <div className="p-2">
            <LinkPanel />
          </div>
        </section>
      </div>
    );

  const { lines, total: held } = p ? linesOf(p) : { lines: [] as Line[], total: 0 };
  const pools = lp?.total ?? 0;
  const net = p ? held + pools : null;
  const kinds = new Map<string, number>();
  for (const l of lines) kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + l.usd);
  if (pools > 0) kinds.set("pool", pools);
  const kindTotal = [...kinds.values()].reduce((a, v) => a + v, 0);
  const signed = auth.address?.toLowerCase() === addr.toLowerCase();
  const tools = [
    { href: `/app/wallet/exposure`, k: "Exposure", v: "What others can read about it" },
    { href: `/app/wallet/stress`, k: "Stress test", v: "What a fall would cost" },
    { href: `/app/wallet/share`, k: "Share link", v: "Show holdings, hide the address" },
    { href: `/app/trust/check?q=${addr}`, k: "Check it", v: "Run the token check on it" },
  ];

  return (
    <div className="space-y-4">
      {/* who */}
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-[#0f0f0f] px-5 py-4">
        <Mark address={addr} />
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="font-mono text-[15px] text-text">{short(addr)}</span>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(addr).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200)))} className="rounded-md border border-line px-1.5 font-mono text-[12px] text-muted hover:text-text">
              {copied ? "copied" : "copy"}
            </button>
            <a href={`https://robinhoodchain.blockscout.com/address/${addr}`} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-muted underline underline-offset-2 hover:text-text">
              explorer ↗
            </a>
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[12px] text-muted">
            <span>{quick ? (quick.isContract ? "contract" : "wallet") : "reading"}</span>
            <span>{linked?.address.toLowerCase() === addr.toLowerCase() ? (linked.via === "wallet" ? `linked · ${linked.name ?? "wallet"}` : "watching") : "pasted"}</span>
            <span className={signed ? "text-leaf" : ""}>{signed ? "signed in" : "not signed in"}</span>
            {quick?.block && <span>{`block ${Number(quick.block).toLocaleString("en")}`}</span>}
          </p>
        </div>
        <form onSubmit={(e) => (e.preventDefault(), open(q), setQ(""))} className="ml-auto flex w-full gap-2 sm:w-auto">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Open another address 0x…" spellCheck={false} aria-label="Open another address" className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-[#090909] px-3 font-mono text-[12px] text-text outline-none focus:border-ui/60 sm:w-72" />
          <button type="submit" className="h-9 rounded-xl border border-line px-3 text-[12.5px] text-text hover:border-ui/60">
            Open
          </button>
        </form>
        {bad && <p className="w-full text-[12.5px] text-flesh">{bad}</p>}
        {!signed && linked?.via === "wallet" && linked.address.toLowerCase() === addr.toLowerCase() && (
          <div className="-mt-3 w-full sm:mt-0 sm:w-auto">
            <SignInRow address={addr} rdns={linked.rdns} />
          </div>
        )}
      </section>

      {/* the answer first: what this address is worth and what it earns */}
      {net == null ? (
        <div aria-hidden className="h-40 rounded-2xl border border-line bg-[#0e0e0e] p-8">
          <span className="block h-3 w-40 rounded bg-[#181818]" />
          <span className="mt-5 block h-8 w-[55%] rounded bg-[#181818]" />
          <span className="mt-3 block text-[13px] text-muted">Reading every token this address received. A busy wallet takes up to two minutes the first time.</span>
        </div>
      ) : (
        <Verdict
          kicker="This address · at the latest block"
          tone={lp && lp.feesDay > 0 ? "good" : "info"}
          value={usd(net)}
          valueLabel="net worth, tokens and pool shares"
          facts={[
            ["In tokens", usd(held)],
            ["In pools", lp ? usd(pools) : "reading"],
            ["Pool fees, 24h", lp ? usd(lp.feesDay) : "reading"],
            ["Holdings", lines.length],
            ["Transactions", quick?.txCount != null ? quick.txCount.toLocaleString("en") : "—"],
          ]}
        >
          {net > 0
            ? `${lines[0] ? `${lines[0].symbol} is ${((lines[0].usd / net) * 100).toFixed(0)}% of it. ` : ""}${lp && lp.positions.length ? `${lp.positions.length} pool positions earn ${usd(lp.feesDay)} a day in fees.` : "No liquidity in the pools on Earn yet."}`
            : "Nothing held at the latest block."}
        </Verdict>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        {/* holdings */}
        <Panel title="Holdings" hint={p ? `${lines.length} tokens · at block ${Number(p.block).toLocaleString("en")}` : scanning ? "scanning every token it received" : scanErr ?? ""}>
          {!p && (
            <div className="p-5">
              {scanErr ? (
                <p className="text-[13px] text-flesh">{scanErr}</p>
              ) : (
                <>
                  <p className="caret font-mono text-[12px] text-muted">Reading every token this address received. A busy wallet takes up to two minutes the first time.</p>
                  {quick?.balances && (
                    <ul className="mt-4 divide-y divide-[#1a1a1a] border-y border-[#1a1a1a]">
                      {quick.balances.map((b) => (
                        <li key={b.symbol} className="flex items-center justify-between py-2.5 text-[13px]">
                          <span className="font-mono text-text">{b.symbol}</span>
                          <span className="font-mono text-muted">{amt(Number(b.value))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
          {p && !lines.length && <p className="p-5 text-[13px] text-muted">Nothing held at the latest block.</p>}
          {p && lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                    <th className="px-5 py-2.5 font-normal">Token</th>
                    <th className="px-3 py-2.5 text-right font-normal">Amount</th>
                    <th className="px-3 py-2.5 text-right font-normal">Value</th>
                    <th className="w-[22%] px-3 py-2.5 font-normal">Share</th>
                    <th className="px-5 py-2.5 text-right font-normal">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.slice(0, 14).map((l) => (
                    <tr key={l.token} className="group border-b border-[#1a1a1a] last:border-0 hover:bg-[#141414]">
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <TokenAvatar address={l.token} symbol={l.symbol} stock={l.kind === "stock"} size={26} />
                          <span className="min-w-0">
                            <span className="block font-mono text-text">{l.symbol}</span>
                            <span className="block max-w-[14rem] truncate text-[12px] text-muted">{l.name}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#c9d6cf]">{amt(l.amount)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-text">{l.usd > 0 ? usd(l.usd) : "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1f1f1f]">
                            <span className={cx("bar-grow block h-full rounded-full", KIND_TONE[l.kind])} style={{ width: `${held ? (l.usd / held) * 100 : 0}%` }} />
                          </span>
                          <span className="w-10 text-right tabular-nums text-[12px] text-muted">{held ? `${((l.usd / held) * 100).toFixed(0)}%` : ""}</span>
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <span className="inline-flex gap-1.5 opacity-60 transition-opacity group-hover:opacity-100">
                          {l.kind !== "base" && (
                            <Link href={`/app/trust/check?q=${l.token}`} className="rounded-lg border border-line px-2 py-1 text-[12px] text-text hover:border-ui/60">
                              Check
                            </Link>
                          )}
                          <Link href={`/app/trade/terminal?token=${l.token}`} className="rounded-lg border border-line px-2 py-1 text-[12px] text-text hover:border-ui/60">
                            Trade
                          </Link>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lines.length > 14 && (
                <Link href="/app/portfolio" className="block border-t border-line px-5 py-2.5 text-[12.5px] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                  {`All ${lines.length} holdings in Portfolio →`}
                </Link>
              )}
            </div>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          {/* allocation */}
          <Panel title="Allocation" hint="by kind of asset">
            <div className="p-5">
              {kindTotal > 0 ? (
                <>
                  <div className="flex h-3 overflow-hidden rounded-full">
                    {[...kinds.entries()].map(([k, v]) => (
                      <span key={k} className={cx("bar-grow h-full", KIND_TONE[k])} style={{ width: `${(v / kindTotal) * 100}%` }} title={`${KIND_LABEL[k]} · ${usd(v)}`} />
                    ))}
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {[...kinds.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => (
                        <li key={k} className="flex items-center gap-2 text-[12.5px]">
                          <i className={cx("h-2 w-2 rounded-full", KIND_TONE[k])} />
                          <span className="text-text">{KIND_LABEL[k]}</span>
                          <span className="ml-auto font-mono text-muted">{usd(v)}</span>
                          <span className="w-10 text-right tabular-nums text-[12px] text-muted">{`${((v / kindTotal) * 100).toFixed(0)}%`}</span>
                        </li>
                      ))}
                  </ul>
                </>
              ) : (
                <p className={cx("font-mono text-[12px] text-muted", !p && "caret")}>{p ? "Nothing to split yet." : "Waiting for the token scan"}</p>
              )}
            </div>
          </Panel>

          {/* pools */}
          <Panel title="Pool positions" hint={lp ? `${lp.positions.length} in ${lp.pools} pools watched` : "reading"}>
            <div className="p-5">
              {!lp && <p className="caret font-mono text-[12px] text-muted">Reading LP tokens</p>}
              {lp?.error && <p className="text-[13px] text-flesh">{lp.error}</p>}
              {lp && !lp.error && !lp.positions.length && (
                <p className="text-[13px] text-muted">
                  No liquidity in the pools on Earn.{" "}
                  <Link href="/app/account/pools" className="text-leaf underline underline-offset-2">
                    See what they paid →
                  </Link>
                </p>
              )}
              <ul className="space-y-2">
                {lp?.positions.map((x) => (
                  <li key={x.pair}>
                    <Link href={`/app/pool/${x.pair}`} className="flex items-center gap-3 rounded-xl bg-[#0d0d0d] px-3 py-2.5 hover:bg-[#141414]">
                      <TokenAvatar address={x.token} symbol={x.symbol} size={24} />
                      <span className="min-w-0">
                        <span className="block font-mono text-[13px] text-text">{x.symbol}</span>
                        <span className="block text-[12px] text-muted">{`${(x.share * 100).toFixed(3)}% of the pool`}</span>
                      </span>
                      <span className="ml-auto text-right">
                        <span className="block font-mono text-[13px] text-text">{usd(x.value)}</span>
                        <span className="block font-mono text-[12px] text-leaf">{`+${usd(x.feesDay)} a day`}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          {/* next */}
          <Panel title="Next steps" hint="with this address">
            <ul className="grid grid-cols-2 gap-px bg-line">
              {tools.map((t) => (
                <li key={t.k}>
                  <Link href={t.href} className="group block h-full bg-[#0f0f0f] px-4 py-3 hover:bg-[#141414]">
                    <span className="flex items-center text-[13px] text-text">
                      {t.k}
                      <span aria-hidden className="ml-auto text-leaf opacity-0 transition-opacity group-hover:opacity-100">
                        →
                      </span>
                    </span>
                    <span className="block text-[12px] text-muted">{t.v}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
