"use client";

/**
 * Wallet · Stress test. What the wallet is worth after a fall: ETH, stock tokens and other tokens move by the
 * amounts you set, USDG holds. LP positions fall by the square root of their pair's move (a 50/50 pool gives
 * back the falling side). The exit check sells the biggest token holdings into their pools right now, to show
 * how much of the spot value a real sale pays before any fall.
 */
import { useCallback, useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { Bay, CountUp, SubTabs } from "./Bay";
import { short, Verdict } from "./kit";
import { TokenAvatar } from "./TokenAvatar";
import { WalletPick } from "./WalletPick";
import { StressIdle, TryWallets } from "./WalletIdle";
import { linesOf, usd, usePortfolio, type Line } from "./walletData";
import { useEffect } from "react";

type Lp = { positions: { token: string; symbol: string; base: string; value: number }[] };
const PRESETS = [
  { id: "eth", label: "ETH falls", s: { eth: 30, stock: 5, token: 40 } },
  { id: "wipe", label: "Small caps wiped", s: { eth: 10, stock: 0, token: 80 } },
  { id: "gap", label: "Weekend gap", s: { eth: 5, stock: 15, token: 10 } },
  { id: "crash", label: "Everything", s: { eth: 50, stock: 30, token: 70 } },
] as const;
const pct = (v: number) => `${v > 0 ? "−" : ""}${v}%`;

export function StressTest() {
  const [addr, setAddr] = useState<string | null>(null);
  const { p, err, busy } = usePortfolio(addr ? `/api/portfolio?address=${addr}` : null);
  const [s, setS] = useState<{ eth: number; stock: number; token: number }>({ eth: 30, stock: 5, token: 40 });
  const [preset, setPreset] = useState<string>("eth");
  const [lp, setLp] = useState<Lp | null>(null);
  const [exits, setExits] = useState<Record<string, number | null>>({});
  const [view, setView] = useState<"bars" | "table">("bars");
  const pick = useCallback((a: string) => setAddr(a), []);

  useEffect(() => {
    if (!addr) return;
    let off = false;
    void Promise.resolve().then(() => (setLp(null), setExits({})));
    fetch(`/api/lp?address=${addr}`)
      .then((r) => r.json())
      .then((j: Lp) => !off && setLp(j))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [addr]);

  const v = useMemo(() => (p ? linesOf(p) : null), [p]);
  const mult = useCallback((l: { kind: Line["kind"]; symbol: string }) => (l.symbol === "USDG" ? 1 : l.kind === "base" ? 1 - s.eth / 100 : l.kind === "stock" ? 1 - s.stock / 100 : 1 - s.token / 100), [s]);
  const rows = useMemo(() => {
    if (!v) return [];
    const out = v.lines.filter((l) => l.usd > 0.5).map((l) => ({ ...l, after: l.usd * mult(l), lp: false }));
    for (const x of lp?.positions ?? []) {
      const rTok = 1 - s.token / 100;
      const rBase = x.base === "USDG" ? 1 : 1 - s.eth / 100;
      out.push({ token: x.token, symbol: `${x.symbol}/${x.base} LP`, name: "Pool share", amount: 0, usd: x.value, kind: "token", after: x.value * Math.sqrt(Math.max(0, rTok * rBase)), lp: true });
    }
    return out.sort((a, b) => b.usd - a.usd);
  }, [v, lp, s, mult]);
  const before = rows.reduce((a, r) => a + r.usd, 0);
  const after = rows.reduce((a, r) => a + r.after, 0);
  const max = Math.max(1, ...rows.map((r) => r.usd));

  const runExit = async () => {
    const top = rows.filter((r) => !r.lp && r.kind !== "base").slice(0, 4);
    for (const r of top) {
      try {
        const q = (await fetch(`/api/quote?from=${r.token}&to=USDG&amount=${Number(r.amount.toPrecision(8))}`).then((x) => x.json())) as { routes?: { amountOut: string | null }[]; best: number | null; to?: { decimals: number } };
        const b = q.best !== null && q.routes ? q.routes[q.best] : null;
        setExits((e) => ({ ...e, [r.token]: b?.amountOut && q.to ? Number(b.amountOut) / 10 ** q.to.decimals : null }));
      } catch {
        setExits((e) => ({ ...e, [r.token]: null }));
      }
    }
  };

  return (
    <Bay
      tone="amber"
      kicker="Before it happens, not after"
      title="Stress test a wallet"
      busy={busy}
      right={v ? <SubTabs label="View" value={view} onChange={setView} tabs={[{ id: "bars", label: "Bars" }, { id: "table", label: "Table" }]} /> : undefined}
      foot={<span>Spot values from each token&apos;s ETH pool. A real sale pays less in a thin pool: run the exit check.</span>}
    >
      <WalletPick onPick={pick} busy={busy} cta="Load the wallet" />
      {!addr && <TryWallets onPick={pick} />}
      {err && <p className="mx-5 mt-3 rounded-xl border border-flesh/40 bg-flesh/10 px-4 py-3 text-[13px] text-text">{err}</p>}
      {v && before > 0 && (
        <div className="mx-5 mt-4">
          <Verdict
            kicker={`${short(addr ?? "")} · after the fall you set`}
            tone={after / before < 0.5 ? "bad" : after / before < 0.8 ? "caution" : "good"}
            value={`${(((after - before) / before) * 100).toFixed(0)}%`}
            valueLabel={`${usd(after)} left of ${usd(before)}`}
            facts={[
              ["ETH and WETH", pct(s.eth)],
              ["Stock tokens", pct(s.stock)],
              ["Other tokens", pct(s.token)],
              ["Holdings", rows.length],
            ]}
          >
            {`If prices fall as set below, this wallet keeps ${usd(after)} of ${usd(before)}. ${rows[0] ? `${rows[0].symbol} carries the most of the loss.` : ""}`}
          </Verdict>
        </div>
      )}

      <div className="mt-4 grid border-t border-(--bay-edge) lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-4 border-b border-(--bay-edge) bg-[color-mix(in_srgb,var(--bay-bg2)_60%,transparent)] px-5 py-5 lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((x) => (
              <button key={x.id} type="button" onClick={() => (setS({ ...x.s }), setPreset(x.id))} aria-pressed={preset === x.id} className="bay-ghost justify-start py-2!">
                {x.label}
              </button>
            ))}
          </div>
          {(
            [
              ["eth", "ETH and WETH", 90],
              ["stock", "Stock tokens", 60],
              ["token", "Other tokens", 95],
            ] as const
          ).map(([k, label, mx]) => (
            <label key={k} className="block">
              <span className="flex justify-between text-[12px] text-muted">
                {label}
                <span className="font-mono text-(--bay-acc)">{pct(s[k])}</span>
              </span>
              <input type="range" min={0} max={mx} step={5} value={s[k]} onChange={(e) => (setS({ ...s, [k]: Number(e.target.value) }), setPreset("custom"))} className="mt-1 w-full" />
            </label>
          ))}
          <p className="text-[12px] text-muted">USDG holds at one dollar. LP falls by the square root of its pair&apos;s move.</p>
          {v && (
            <div className="rounded-xl bg-(--bay-bg) p-3">
              <p className="text-[12px] text-muted">After the fall</p>
              <p className="font-mono text-[24px] text-text">
                <CountUp value={after} fmt={usd} />
              </p>
              <p className={cx("font-mono text-[13px]", after < before ? "text-flesh" : "text-muted")}>{`${usd(after - before)} · ${before ? (((after - before) / before) * 100).toFixed(1) : "0"}%`}</p>
              <p className="mt-1 text-[12px] text-muted">{`from ${usd(before)} now`}</p>
            </div>
          )}
        </aside>

        <div key={view} className="pane-in min-w-0 px-5 py-5">
          {!addr && <StressIdle s={s} />}
          {addr && !v && !err && <p className="caret py-14 text-center font-mono text-[13px] text-muted">Scanning transfers for {short(addr)}</p>}
          {v && rows.length === 0 && <p className="py-14 text-center text-[13px] text-muted">Nothing with a price in this wallet.</p>}
          {v && rows.length > 0 && view === "bars" && (
            <ul className="space-y-2.5">
              {rows.slice(0, 14).map((r, i) => (
                <li key={r.token + r.symbol} className="grid grid-cols-[auto_8rem_1fr_9rem] items-center gap-3 text-[12.5px]">
                  <TokenAvatar address={r.token} symbol={r.symbol} size={22} stock={r.kind === "stock"} />
                  <span className="truncate text-text">{r.symbol}</span>
                  <span className="relative h-4 overflow-hidden rounded-md bg-(--bay-edge)">
                    <span className="absolute inset-y-0 left-0 rounded-md bg-[color-mix(in_srgb,var(--flesh)_45%,transparent)]" style={{ width: `${(r.usd / max) * 100}%` }} />
                    <span className="bar-grow absolute inset-y-0 left-0 rounded-md bg-(--bay-acc)" style={{ width: `${(r.after / max) * 100}%`, animationDelay: `${i * 0.04}s`, transition: "width .35s" }} />
                    {exits[r.token] != null && <span title="What a full sale pays now" className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${Math.min(100, (exits[r.token]! / max) * 100)}%` }} />}
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="text-text">{usd(r.after)}</span>
                    <span className="ml-1.5 text-[12px] text-muted">{usd(r.usd)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {v && rows.length > 0 && view === "table" && (
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="text-[12px] text-muted">
                  {["Asset", "Now", "After", "Change", "Sale pays now"].map((h, i) => (
                    <th key={h} className={cx("py-1.5 font-normal", i > 0 && "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.token + r.symbol} className="border-t border-(--bay-edge)">
                    <td className="py-1.5 text-text">{r.symbol}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted">{usd(r.usd)}</td>
                    <td className="py-1.5 text-right tabular-nums text-text">{usd(r.after)}</td>
                    <td className={cx("py-1.5 text-right tabular-nums", r.after < r.usd ? "text-flesh" : "text-muted")}>{r.usd ? `${(((r.after - r.usd) / r.usd) * 100).toFixed(1)}%` : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted">{exits[r.token] === undefined ? "—" : exits[r.token] === null ? "no route" : usd(exits[r.token]!)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {v && rows.some((r) => !r.lp && r.kind !== "base") && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-(--bay-bg2) px-4 py-3">
              <p className="flex-1 text-[12px] text-muted">The white line on a bar is what selling all of it pays right now, before any fall.</p>
              <button type="button" onClick={() => void runExit()} className="bay-btn h-9! text-[13px]!">
                Run the exit check
              </button>
            </div>
          )}
        </div>
      </div>
    </Bay>
  );
}
