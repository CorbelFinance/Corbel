"use client";

/**
 * Predict · live markets on the CorbelPredict contract. Each survival market asks whether a V2 pool keeps at least
 * a set amount of its base token until a date. You see the two pots and the odds they imply, the early-stake bonus
 * left, the pool's reserve now against the line and the lowest one recorded, and the clock. From your own wallet:
 * stake YES or NO (USDG), record the pool's reserve during the watch window, settle after it, claim. Anyone can
 * open a market on a real pool with the form at the bottom.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { decodeFunctionResult, encodeFunctionData, parseUnits, type Hex } from "viem";
import { cx } from "@corbel/ui";
import { Bay, CountUp } from "./Bay";
import { short } from "./kit";
import { TokenAvatar } from "./TokenAvatar";
import { useLinked } from "./wallet";
import { EXPLORER, approveIfNeeded, call, niceError, ready, send } from "./walletTx";
import { PREDICT, USDG } from "@/lib/predict";
import { Pick } from "./Pick";
import { MarketResearch } from "./MarketResearch";

type Mkt = {
  id: number;
  kind: "survival" | "price";
  state: "open" | "proposed" | "settled" | "void";
  outcome: boolean;
  createdAt: number;
  closeAt: number;
  expiry: number;
  pair: string;
  minReserve: string;
  lowest: string | null;
  pokes: number;
  yesPot: string;
  noPot: string;
  pool: {
    token: string;
    symbol: string;
    base: string;
    baseSymbol: string;
    baseDecimals: number;
    reserve: string;
  } | null;
  mine: { yes: string; no: string; claimable: string } | null;
};
type Res = { contract: string; block: string; now: number; count: number; markets: Mkt[]; error?: string };
type Pool = { token: string; symbol: string; pair: string; base: string; liquidity: number };

const ABI = [
  {
    type: "function",
    name: "bet",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }, { type: "bool" }, { type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "poke",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settleSurvival",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [],
  },
  { type: "function", name: "count", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "createSurvival",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint64" },
      { type: "uint64" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const PAIR = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }],
  },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const MIN_POKES = 3;
const EARLY = 0.5;
const u6 = (v: string) => Number(v) / 1e6;
const amt = (v: string, d: number) => Number(v) / 10 ** d;
const usd = (v: number) => (v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(2)}`);
const fmt = (v: number) =>
  v >= 1e6
    ? `${(v / 1e6).toFixed(2)}M`
    : v >= 1e3
      ? `${(v / 1e3).toFixed(1)}K`
      : v >= 1
        ? v.toFixed(2)
        : v.toPrecision(3);
function left(s: number) {
  if (s <= 0) return "now";
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function phase(m: Mkt, now: number) {
  if (m.state === "settled")
    return { k: "settled", label: m.outcome ? "Settled · YES won" : "Settled · NO won" };
  if (m.state === "void") return { k: "void", label: "Refunded" };
  if (now < m.closeAt) return { k: "bet", label: "Taking stakes" };
  if (now <= m.expiry) return { k: "watch", label: "Watch window" };
  return { k: "settle", label: "Ready to settle" };
}

/**
 * The ticket: one side of one market, opened from the card's YES or NO button. Amount (quick picks or typed), what it
 * pays if that side wins as the pots stand, the early bonus, your USDG, and one button. Esc or a click outside closes.
 */
function Ticket({
  m,
  side0,
  now,
  me,
  onClose,
  onDone,
  draft,
}: {
  m: Mkt;
  side0: "yes" | "no";
  now: number;
  me: { address: string; rdns?: string } | null;
  onClose: () => void;
  onDone: () => void;
  draft?: Pool;
}) {
  const [side, setSide] = useState(side0);
  const [stake, setStake] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const [bal, setBal] = useState<number | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => {
    if (!me) return;
    let off = false;
    fetch(`/api/balance?address=${me.address}&token=${USDG}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ amount: number }>) : null))
      .then((j) => !off && j && setBal(j.amount))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [me]);
  const y = u6(m.yesPot),
    n = u6(m.noPot),
    pot = y + n;
  const s = Number(stake) || 0;
  const win = side === "yes" ? y : n,
    lose = side === "yes" ? n : y;
  const pay = s > 0 ? s + (s / (win + s)) * lose * 0.99 : 0;
  const bonus =
    m.closeAt > m.createdAt ? EARLY * Math.max(0, (m.closeAt - now) / (m.closeAt - m.createdAt)) : 0;
  const chance = pot ? (side === "yes" ? y : n) / pot : 0.5;
  const d = m.pool?.baseDecimals ?? 18;
  const go = async () => {
    if (!me) return setMsg({ ok: false, text: "Connect a wallet first (top right)." });
    setBusy(true);
    setMsg(null);
    try {
      const a = parseUnits(stake || "0", 6);
      if (a <= 0n) throw new Error("Type an amount above zero.");
      const prov = await ready(me.rdns);
      let id = BigInt(m.id);
      if (draft) {
        // no market on this pool yet: open it (half of today's reserve, stakes close in 2 days, watched 5 more), then stake
        const base = draft.base === "USDG" ? USDG : WETH;
        const [r, t0, c] = await Promise.all([
          call(prov, draft.pair, encodeFunctionData({ abi: PAIR, functionName: "getReserves" })),
          call(prov, draft.pair, encodeFunctionData({ abi: PAIR, functionName: "token0" })),
          call(prov, PREDICT, encodeFunctionData({ abi: ABI, functionName: "count" })),
        ]);
        const [r0, r1] = decodeFunctionResult({ abi: PAIR, functionName: "getReserves", data: r });
        const baseIs0 =
          decodeFunctionResult({ abi: PAIR, functionName: "token0", data: t0 }).toLowerCase() ===
          base.toLowerCase();
        const min = (baseIs0 ? r0 : r1) / 2n;
        if (min <= 0n) throw new Error("This pool holds no base token right now.");
        id = decodeFunctionResult({ abi: ABI, functionName: "count", data: c });
        const t = BigInt(Math.floor(Date.now() / 1000));
        await send(
          prov,
          me.address,
          PREDICT,
          encodeFunctionData({
            abi: ABI,
            functionName: "createSurvival",
            args: [draft.pair as Hex, base as Hex, min, t + 2n * 86400n, t + 7n * 86400n],
          }),
          "Opening the market",
        );
      }
      await approveIfNeeded(prov, me.address, USDG, PREDICT, a);
      const tx = await send(
        prov,
        me.address,
        PREDICT,
        encodeFunctionData({ abi: ABI, functionName: "bet", args: [id, side === "yes", a] }),
        "The stake",
      );
      setMsg({ ok: true, text: `Staked ${s} USDG on ${side.toUpperCase()}.`, tx });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: niceError(e, "The stake did not go through.") });
    } finally {
      setBusy(false);
    }
  };
  const tone = side === "yes" ? "leaf" : "flesh";
  return createPortal(
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-[#020403]/70 p-4 backdrop-blur-md"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Stake ${side.toUpperCase()} on market ${m.id}`}
        className="pane-in w-full max-w-md overflow-hidden rounded-3xl border border-line bg-[#0e0e0e] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
      >
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          {m.pool && <TokenAvatar address={m.pool.token} symbol={m.pool.symbol} size={36} />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] text-muted">
              {m.pool ? `Will ${m.pool.symbol}/${m.pool.baseSymbol} keep its liquidity?` : `Market #${m.id}`}
            </span>
            <span className="block text-[16px] font-semibold">
              <span
                className={side === "yes" ? "text-leaf" : "text-flesh"}
              >{`Stake ${side.toUpperCase()}`}</span>
              <span className="text-muted">
                {draft
                  ? ` · keeps half its ${draft.base} for 7 days`
                  : m.pool
                    ? ` · line ${fmt(amt(m.minReserve, d))} ${m.pool.baseSymbol}`
                    : ""}
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-xl border border-line text-muted hover:border-ui/60 hover:text-text"
          >
            ×
          </button>
        </header>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#090909] p-1">
            {(["yes", "no"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSide(k)}
                aria-pressed={side === k}
                className={cx(
                  "rounded-xl py-2.5 text-[14px] font-semibold transition-colors",
                  side === k
                    ? k === "yes"
                      ? "bg-ui text-[#0b0b0b]"
                      : "bg-flesh text-[#1a0508]"
                    : "text-muted hover:text-text",
                )}
              >
                {k === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
          <label className="block rounded-2xl border border-line bg-[#090909] p-4 focus-within:border-ui/60">
            <span className="flex justify-between text-[12.5px] text-muted">
              You stake
              <span className="font-mono">
                {bal == null
                  ? me
                    ? "…"
                    : "no wallet"
                  : `${bal.toLocaleString("en", { maximumFractionDigits: 2 })} USDG`}
              </span>
            </span>
            <span className="mt-2 flex items-center gap-3">
              <span className="rounded-full bg-[#1f1f1f] px-3 py-1 font-mono text-[13px] text-text">
                USDG
              </span>
              <input
                autoFocus
                value={stake}
                onChange={(e) => setStake(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                aria-label="Stake in USDG"
                className="min-w-0 flex-1 bg-transparent text-right font-display text-[34px] tabular-nums text-text outline-none"
              />
            </span>
          </label>
          <div className="flex gap-1.5">
            {[5, 10, 25, 50, 100].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setStake(String(v))}
                className={cx(
                  "flex-1 rounded-lg border py-1.5 font-mono text-[12.5px] transition-colors",
                  Number(stake) === v ? "border-leaf text-text" : "border-line text-muted hover:text-text",
                )}
              >
                {v}
              </button>
            ))}
            {bal != null && bal > 0 && (
              <button
                type="button"
                onClick={() => setStake(String(Math.floor(bal * 100) / 100))}
                className="flex-1 rounded-lg border border-line py-1.5 font-mono text-[12.5px] text-muted hover:text-text"
              >
                Max
              </button>
            )}
          </div>
          <dl className="space-y-1.5 text-[13px]">
            {(
              [
                ["Chance as the pots stand", `${Math.round(chance * 100)}%`],
                ["Paid if it wins", s > 0 ? `${pay.toFixed(2)} USDG` : "—"],
                ["That is", s > 0 ? `${(pay / s).toFixed(2)}×` : "—"],
                ["Early bonus now", `+${Math.round(bonus * 100)}% weight`],
              ] as const
            ).map(([k, v], i) => (
              <div key={k} className="flex justify-between">
                <dt className="text-muted">{k}</dt>
                <dd className={cx("font-mono", i === 1 ? `text-${tone}` : "text-text")}>{v}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            disabled={busy}
            onClick={() => void go()}
            className={cx(
              "h-14 w-full rounded-2xl text-[16px] font-semibold transition-[filter] hover:brightness-110 disabled:opacity-60",
              side === "yes" ? "bg-ui text-[#0b0b0b]" : "bg-flesh text-[#1a0508]",
            )}
          >
            {busy
              ? "Confirm in your wallet…"
              : !me
                ? "Connect a wallet to stake"
                : s > 0
                  ? `${draft ? "Open the market and stake" : "Stake"} ${s} USDG on ${side.toUpperCase()}`
                  : "Enter an amount"}
          </button>
          {msg && (
            <p className={cx("text-[12.5px]", msg.ok ? "text-leaf" : "text-flesh")}>
              {msg.text}{" "}
              {msg.tx && (
                <a href={EXPLORER + msg.tx} target="_blank" rel="noreferrer" className="underline">
                  tx ↗
                </a>
              )}
            </p>
          )}
          {m.pool && <MarketResearch token={m.pool.token} cushion={draft ? 2 : null} />}
          <p className="text-[12px] text-[#7d8a83]">{`Pots move until stakes close; the payout is your share of the losing pot after the ${1}% fee. The chain settles it: nobody proposes or rules on the outcome.`}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DraftCard({
  pool,
  now,
  me,
  onDone,
}: {
  pool: Pool;
  now: number;
  me: { address: string; rdns?: string } | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState<"yes" | "no" | null>(null);
  const t = now;
  const m: Mkt = {
    id: -1,
    kind: "survival",
    state: "open",
    outcome: false,
    createdAt: t,
    closeAt: t + 2 * 86400,
    expiry: t + 7 * 86400,
    pair: pool.pair,
    minReserve: "0",
    lowest: null,
    pokes: 0,
    yesPot: "0",
    noPot: "0",
    pool: {
      token: pool.token,
      symbol: pool.symbol,
      base: pool.base === "USDG" ? USDG : WETH,
      baseSymbol: pool.base,
      baseDecimals: pool.base === "USDG" ? 6 : 18,
      reserve: "0",
    },
    mine: null,
  };
  return (
    <article className="tile-in flex flex-col overflow-hidden rounded-2xl border border-(--bay-edge) bg-(--bay-bg2) transition-colors hover:border-ui/60">
      <header className="flex items-start gap-3 px-4 pt-4">
        <TokenAvatar address={pool.token} symbol={pool.symbol} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-semibold leading-snug text-text">{`Will ${pool.symbol}/${pool.base} keep half its ${pool.base} for 7 days?`}</span>
          <span className="mt-0.5 block text-[12px] text-muted">{`${usd(pool.liquidity)} in the pool · no stakes yet`}</span>
        </span>
        <span className="shrink-0 rounded-full bg-[#9b86e4]/15 px-2.5 py-1 text-[12px] text-[#9b86e4]">
          new
        </span>
      </header>
      <div className="grid grid-cols-2 gap-2 px-4 pt-4">
        <button
          type="button"
          onClick={() => setOpen("yes")}
          className="rounded-xl border border-leaf/30 bg-leaf/10 py-3 text-center transition-colors hover:bg-leaf/20"
        >
          <span className="block text-[16px] font-semibold text-leaf">Yes</span>
          <span className="block font-mono text-[12px] text-leaf/80">be the first</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen("no")}
          className="rounded-xl border border-flesh/30 bg-flesh/10 py-3 text-center transition-colors hover:bg-flesh/20"
        >
          <span className="block text-[16px] font-semibold text-flesh">No</span>
          <span className="block font-mono text-[12px] text-flesh/80">be the first</span>
        </button>
      </div>
      <p className="mt-auto px-4 py-3 text-[12px] text-muted">
        First stake opens the market on chain, then stakes, from your wallet.
      </p>
      {open && (
        <Ticket
          m={m}
          side0={open}
          now={t}
          me={me}
          draft={pool}
          onClose={() => setOpen(null)}
          onDone={onDone}
        />
      )}
    </article>
  );
}

function Card({
  m,
  now,
  me,
  onDone,
}: {
  m: Mkt;
  now: number;
  me: { address: string; rdns?: string } | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState<"yes" | "no" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const yes = u6(m.yesPot),
    no = u6(m.noPot),
    pot = yes + no;
  const p = phase(m, now);
  const d = m.pool?.baseDecimals ?? 18;
  const line = amt(m.minReserve, d),
    res = m.pool ? amt(m.pool.reserve, d) : 0,
    low = m.lowest ? amt(m.lowest, d) : null;
  const scale = Math.max(res, line, low ?? 0) * 1.15 || 1;
  const claim = m.mine ? u6(m.mine.claimable) : 0;
  // what 1 USDG pays on each side as the pots stand (pari-mutuel, after the 1% fee)
  const mult = (w: number, l: number) => 1 + (l * 0.99) / (w + 1);

  const act = async (
    what: string,
    fn: (p: Awaited<ReturnType<typeof ready>>, from: string) => Promise<string>,
  ) => {
    if (!me) return setMsg({ ok: false, text: "Connect a wallet first (top right)." });
    setBusy(what);
    setMsg(null);
    try {
      const prov = await ready(me.rdns);
      const tx = await fn(prov, me.address);
      setMsg({ ok: true, text: `${what}: done.`, tx });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: niceError(e, `${what} did not go through.`) });
    } finally {
      setBusy(null);
    }
  };
  const one = (what: string, fn: "poke" | "settleSurvival" | "claim") =>
    act(what, (prov, from) =>
      send(
        prov,
        from,
        PREDICT,
        encodeFunctionData({ abi: ABI, functionName: fn, args: [BigInt(m.id)] }),
        what,
      ),
    );

  return (
    <article className="tile-in flex flex-col overflow-hidden rounded-2xl border border-(--bay-edge) bg-(--bay-bg2) transition-colors hover:border-ui/60">
      <header className="flex items-start gap-3 px-4 pt-4">
        {m.pool && <TokenAvatar address={m.pool.token} symbol={m.pool.symbol} size={40} />}
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-semibold leading-snug text-text">
            {m.pool
              ? `Will ${m.pool.symbol}/${m.pool.baseSymbol} keep ${fmt(line)} ${m.pool.baseSymbol}?`
              : `Price market #${m.id}`}
          </span>
          <span className="mt-0.5 block text-[12px] text-muted">{`${p.k === "bet" ? `stakes close in ${left(m.closeAt - now)}` : p.k === "watch" ? `watching, ends in ${left(m.expiry - now)}` : p.label} · ${usd(pot)} in the pot`}</span>
        </span>
        <span
          className={cx(
            "shrink-0 rounded-full px-2.5 py-1 text-[12px]",
            p.k === "bet"
              ? "bg-leaf/15 text-leaf"
              : p.k === "watch"
                ? "bg-[#f2c46d]/15 text-[#f2c46d]"
                : p.k === "settle"
                  ? "bg-[#ff9a5c]/15 text-[#ff9a5c]"
                  : "bg-[#2a2f3a] text-muted",
          )}
        >
          {p.label}
        </span>
      </header>

      {/* two clicks: a side here, the amount in the ticket */}
      {p.k === "bet" ? (
        <div className="grid grid-cols-2 gap-2 px-4 pt-4">
          <button
            type="button"
            onClick={() => setOpen("yes")}
            className="rounded-xl border border-leaf/30 bg-leaf/10 py-3 text-center transition-colors hover:bg-leaf/20"
          >
            <span className="block text-[16px] font-semibold text-leaf">{`Yes ${pot ? Math.round((yes / pot) * 100) : 50}%`}</span>
            <span className="block font-mono text-[12px] text-leaf/80">{`pays ${mult(yes, no).toFixed(2)}×`}</span>
          </button>
          <button
            type="button"
            onClick={() => setOpen("no")}
            className="rounded-xl border border-flesh/30 bg-flesh/10 py-3 text-center transition-colors hover:bg-flesh/20"
          >
            <span className="block text-[16px] font-semibold text-flesh">{`No ${pot ? Math.round((no / pot) * 100) : 50}%`}</span>
            <span className="block font-mono text-[12px] text-flesh/80">{`pays ${mult(no, yes).toFixed(2)}×`}</span>
          </button>
        </div>
      ) : (
        <div className="px-4 pt-4">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-[#2a1517]">
            <span className="h-full bg-leaf" style={{ width: `${pot ? (yes / pot) * 100 : 50}%` }} />
          </div>
          <p className="mt-1 flex justify-between font-mono text-[12px]">
            <span className="text-leaf">{`YES ${usd(yes)}`}</span>
            <span className="text-flesh">{`NO ${usd(no)}`}</span>
          </p>
        </div>
      )}

      {/* the pool against its line, small */}
      {m.pool && (
        <div className="px-4 pt-3">
          <div className="relative h-5 rounded-md bg-(--bay-bg)">
            <span
              className="absolute inset-y-1 left-1 rounded bg-[color-mix(in_srgb,var(--bay-acc)_35%,transparent)]"
              style={{ width: `calc(${(res / scale) * 100}% - 4px)` }}
            />
            {low !== null && (
              <span
                title="Lowest recorded"
                className="absolute inset-y-0 w-0.5 bg-[#ff6b6b]"
                style={{ left: `${(low / scale) * 100}%` }}
              />
            )}
            <span
              title="The line"
              className="absolute -inset-y-1 w-0.5 bg-text"
              style={{ left: `${(line / scale) * 100}%` }}
            />
          </div>
          <p className="mt-1 flex justify-between font-mono text-[12px] text-muted">
            <span>{`${fmt(res)} ${m.pool.baseSymbol} now · line ${fmt(line)}`}</span>
            <span>{`${m.pokes} of ${MIN_POKES} checks`}</span>
          </p>
        </div>
      )}

      {m.mine && (Number(m.mine.yes) > 0 || Number(m.mine.no) > 0 || claim > 0) && (
        <p className="mx-4 mt-3 rounded-lg border border-(--bay-edge) px-3 py-2 font-mono text-[12px] text-text">{`Yours: YES ${usd(u6(m.mine.yes))} · NO ${usd(u6(m.mine.no))}${claim > 0 ? ` · claimable ${usd(claim)}` : ""}`}</p>
      )}

      <div className="mt-auto px-4 py-4">
        {p.k === "watch" && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void one("Record the reserve", "poke")}
            className="bay-btn h-10! w-full text-[13px]!"
          >
            {busy ?? "Record the pool's reserve now"}
          </button>
        )}
        {p.k === "settle" && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void one("Settle", "settleSurvival")}
            className="bay-btn h-10! w-full text-[13px]!"
          >
            {busy ?? "Settle this market"}
          </button>
        )}
        {claim > 0 && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void one("Claim", "claim")}
            className="bay-btn mt-2 h-10! w-full bg-leaf! text-[13px]!"
          >
            {busy ?? `Claim ${usd(claim)}`}
          </button>
        )}
        {msg && (
          <p className={cx("mt-2 text-[12px]", msg.ok ? "text-leaf" : "text-flesh")}>
            {msg.text}{" "}
            {msg.tx && (
              <a href={EXPLORER + msg.tx} target="_blank" rel="noreferrer" className="underline">
                tx ↗
              </a>
            )}
          </p>
        )}
      </div>
      {open && <Ticket m={m} side0={open} now={now} me={me} onClose={() => setOpen(null)} onDone={onDone} />}
    </article>
  );
}

function Create({ me, onDone }: { me: { address: string; rdns?: string } | null; onDone: () => void }) {
  const [pools, setPools] = useState<Pool[]>([]);
  const [pick, setPick] = useState<string>("");
  const [keep, setKeep] = useState(50);
  const [close, setClose] = useState(2);
  const [watch, setWatch] = useState(5);
  const [reserve, setReserve] = useState<{ v: number; d: number; sym: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  useEffect(() => {
    fetch("/api/earn")
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((j: { rows?: Pool[] } | null) => {
        const rows = (j?.rows ?? []).filter((r) => r.pair && (r.base === "WETH" || r.base === "USDG"));
        setPools(rows);
        if (rows[0]) setPick((x) => x || rows[0]!.pair);
      })
      .catch(() => undefined);
  }, []);
  const pool = pools.find((x) => x.pair === pick);
  useEffect(() => {
    if (!pool) return;
    let off = false;
    // the pool's base reserve now: half the liquidity in dollars, in base units
    fetch(`/api/market?token=${pool.token}&w=4`)
      .then((r) => r.json())
      .then((j: { reserves?: { base: number } | null; pool?: { id: string } }) => {
        // only when the market read is this very pair; otherwise the line is read from the pair at creation
        if (off || !j.reserves || j.pool?.id.toLowerCase() !== pool.pair.toLowerCase())
          return setReserve(null);
        setReserve({ v: j.reserves.base, d: pool.base === "USDG" ? 6 : 18, sym: pool.base });
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [pool]);
  const line = reserve ? reserve.v * (keep / 100) : 0;
  const create = async () => {
    if (!me) return setMsg({ ok: false, text: "Connect a wallet first (top right)." });
    if (!pool) return setMsg({ ok: false, text: "Pick a pool first." });
    setBusy(true);
    setMsg(null);
    try {
      const prov = await ready(me.rdns);
      const now = Math.floor(Date.now() / 1000);
      const closeAt = BigInt(now + close * 86400);
      const expiry = closeAt + BigInt(watch * 86400);
      const base = pool.base === "USDG" ? USDG : WETH;
      // the line from the pair's own reserve at this block, so it is exact
      const [r, t0] = await Promise.all([
        call(prov, pool.pair, encodeFunctionData({ abi: PAIR, functionName: "getReserves" })),
        call(prov, pool.pair, encodeFunctionData({ abi: PAIR, functionName: "token0" })),
      ]);
      const [r0, r1] = decodeFunctionResult({ abi: PAIR, functionName: "getReserves", data: r });
      const baseIs0 =
        decodeFunctionResult({ abi: PAIR, functionName: "token0", data: t0 }).toLowerCase() ===
        base.toLowerCase();
      const min = ((baseIs0 ? r0 : r1) * BigInt(keep)) / 100n;
      if (min <= 0n) throw new Error("This pool holds no base token right now.");
      const tx = await send(
        prov,
        me.address,
        PREDICT,
        encodeFunctionData({
          abi: ABI,
          functionName: "createSurvival",
          args: [pool.pair as Hex, base as Hex, min, closeAt, expiry],
        }),
        "Creating the market",
      );
      setMsg({ ok: true, text: "Market created.", tx });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: niceError(e, "The market was not created.") });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-[12px] text-muted">Pool</span>
        <Pick
          label="Pool"
          className="mt-1"
          value={pick}
          onChange={setPick}
          options={pools.map((x) => ({
            value: x.pair,
            label: `${x.symbol}/${x.base}`,
            hint: `${usd(x.liquidity)} liquidity`,
          }))}
        />
      </label>
      {(
        [
          ["Line: share of today's reserve it must keep", keep, setKeep, 10, 95, 5, (v: number) => `${v}%`],
          ["Stakes close in", close, setClose, 1, 14, 1, (v: number) => `${v}d`],
          ["Then watch for", watch, setWatch, 1, 30, 1, (v: number) => `${v}d`],
        ] as const
      ).map(([k, v, set, lo, hi, st, f]) => (
        <label key={k} className="block">
          <span className="flex justify-between text-[12px] text-muted">
            {k}
            <span className="font-mono text-(--bay-acc)">{f(v)}</span>
          </span>
          <input
            type="range"
            min={lo}
            max={hi}
            step={st}
            value={v}
            onChange={(e) => set(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
      ))}
      <p className="rounded-xl bg-(--bay-bg2) px-3 py-2 text-[12.5px] text-text">
        {pool
          ? reserve
            ? `Will ${pool.symbol}/${pool.base} keep ${fmt(line)} ${pool.base} (now ${fmt(reserve.v)}) through ${close + watch} days?`
            : `Will ${pool.symbol}/${pool.base} keep ${keep}% of today's ${pool.base} through ${close + watch} days? The exact line is read from the pool when you open it.`
          : "Reading the pools…"}
      </p>
      <button type="button" disabled={busy || !pool} onClick={() => void create()} className="bay-btn w-full">
        {busy ? "Confirm in your wallet…" : "Open this market"}
      </button>
      {msg && (
        <p className={cx("text-[12px]", msg.ok ? "text-leaf" : "text-flesh")}>
          {msg.text}{" "}
          {msg.tx && (
            <a href={EXPLORER + msg.tx} target="_blank" rel="noreferrer" className="underline">
              tx ↗
            </a>
          )}
        </p>
      )}
      <p className="text-[12px] text-muted">
        Costs only gas. Anyone can then stake YES or NO, and anyone can record the pool during the watch
        window.
      </p>
    </div>
  );
}

/** Beside a market: where it is in its life, and what a stake would pay if it wins. */

export function PredictLive() {
  const { linked } = useLinked();
  const me = linked && linked.via === "wallet" ? { address: linked.address, rdns: linked.rdns } : null;
  const [res, setRes] = useState<Res | null>(null);
  const [tab, setTab] = useState<"open" | "done" | "mine">("open");
  const [sort, setSort] = useState<"staked" | "new" | "closing" | "depth">("staked");
  const [topic, setTopic] = useState<"all" | "stocks" | "launch">("all");
  // stock tokens, so a market can be filed under its topic
  const [stockSet, setStockSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch("/api/trending")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (j: { stocks?: { token: string }[] } | null) =>
          j?.stocks && setStockSet(new Set(j.stocks.map((s) => s.token.toLowerCase()))),
      )
      .catch(() => undefined);
  }, []);
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState(0);
  const load = useCallback(() => {
    fetch(`/api/predict${me ? `?who=${me.address}` : ""}`)
      .then((r) => r.json())
      .then((j: Res) => setRes(j))
      .catch(() => undefined);
  }, [me?.address]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void Promise.resolve().then(load);
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load, tick]);
  useEffect(() => {
    const t = setInterval(() => setClock((c) => c + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const now = (res?.now ?? 0) + clock;
  const isStock = (token?: string) => !!token && stockSet.has(token.toLowerCase());
  const inTopic = (token?: string) =>
    topic === "all" || (topic === "stocks" ? isStock(token) : !isStock(token));
  const pot = (m: Mkt) => u6(m.yesPot) + u6(m.noPot);
  const total = (res?.markets ?? []).reduce((s, m) => s + u6(m.yesPot) + u6(m.noPot), 0);
  const [pools, setPools] = useState<Pool[]>([]);
  useEffect(() => {
    fetch("/api/earn")
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((j: { rows?: Pool[] } | null) =>
        setPools((j?.rows ?? []).filter((r) => r.pair && (r.base === "WETH" || r.base === "USDG"))),
      )
      .catch(() => undefined);
  }, []);
  const taken = new Set(
    (res?.markets ?? []).filter((m) => m.state === "open").map((m) => m.pair.toLowerCase()),
  );
  const allDrafts = pools.filter((x) => !taken.has(x.pair.toLowerCase()));
  const depth = (pair: string) =>
    pools.find((x) => x.pair.toLowerCase() === pair.toLowerCase())?.liquidity ?? 0;
  const list = (res?.markets ?? [])
    .filter((m) =>
      tab === "open"
        ? m.state === "open" || m.state === "proposed"
        : tab === "done"
          ? m.state === "settled" || m.state === "void"
          : !!m.mine && (m.mine.yes !== "0" || m.mine.no !== "0" || m.mine.claimable !== "0"),
    )
    .filter((m) => inTopic(m.pool?.token))
    .sort((a, b) =>
      sort === "staked"
        ? pot(b) - pot(a)
        : sort === "new"
          ? b.createdAt - a.createdAt
          : sort === "closing"
            ? a.closeAt - b.closeAt
            : depth(b.pair) - depth(a.pair),
    );
  const drafts =
    tab === "open" ? allDrafts.filter((x) => inTopic(x.token)).sort((a, b) => b.liquidity - a.liquidity) : [];
  const openN = (res?.markets ?? []).filter((m) => m.state === "open").length;

  return (
    <div className="space-y-4">
      <Bay
        tone="moss"
        kicker={res ? `On chain · block ${Number(res.block).toLocaleString("en")}` : "Reading the contract"}
        title="Live markets"
        busy={!res}
        right={<span className="font-mono text-[12px] text-muted">{`${openN} open`}</span>}
        foot={
          <span>
            {"Contract "}
            <a
              href={`https://robinhoodchain.blockscout.com/address/${PREDICT}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui"
            >
              {short(PREDICT)}
            </a>
            {". Not audited yet: stake small. "}
            <Link href="/docs/predict" className="text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
              How settlement works
            </Link>
          </span>
        }
      >
        <div className="mx-5 grid grid-cols-3 gap-2">
          {[
            ["Markets on chain", res?.count ?? 0, (n: number) => String(Math.round(n))],
            ["Pools ready for a market", allDrafts.length, (n: number) => String(Math.round(n))],
            ["Staked in all", total, usd],
          ].map(([k, v, f]) => (
            <div key={k as string} className="rounded-xl bg-(--bay-bg2) px-3 py-2.5">
              <p className="text-[12px] text-muted">{k as string}</p>
              <p className="mt-0.5 font-mono text-[19px] text-text">
                <CountUp value={v as number} fmt={f as (n: number) => string} />
              </p>
            </div>
          ))}
        </div>
        {/* status, sort and topic, as on a market board */}
        <div className="mx-5 mt-3 space-y-2.5 rounded-2xl border border-(--bay-edge) bg-(--bay-bg2) px-4 py-3">
          {(
            [
              [
                "Status",
                tab,
                setTab,
                [
                  ["open", "Live"],
                  ["done", "Settled"],
                  ["mine", "My stakes"],
                ],
              ],
              [
                "Sort",
                sort,
                setSort,
                [
                  ["staked", "Most staked"],
                  ["new", "Newest"],
                  ["closing", "Closing soon"],
                  ["depth", "Deepest pool"],
                ],
              ],
              [
                "Topic",
                topic,
                setTopic,
                [
                  ["all", "All topics"],
                  ["stocks", "Stocks"],
                  ["launch", "Launch tokens"],
                ],
              ],
            ] as [string, string, (v: never) => void, [string, string][]][]
          ).map(([label, value, set, opts]) => (
            <div key={label} className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 font-medium text-[12px] uppercase tracking-[0.12em] text-muted">
                {label}
              </span>
              {opts.map(([id, l]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={value === id}
                  onClick={() => set(id as never)}
                  className={cx(
                    "rounded-full border px-3 py-1 text-[12.5px] transition-colors",
                    value === id
                      ? "border-leaf/60 bg-leaf/10 text-leaf"
                      : "border-line text-muted hover:text-text",
                  )}
                >
                  {l}
                </button>
              ))}
              {label === "Topic" && (
                <a
                  href="#rounds"
                  className="rounded-full border border-dashed border-line px-3 py-1 text-[12.5px] text-muted hover:text-text"
                >
                  Up or down · soon
                </a>
              )}
            </div>
          ))}
        </div>
        <p className="mx-5 mt-3 font-mono text-[12px] text-muted">{`${list.length + drafts.length} ${list.length + drafts.length === 1 ? "market" : "markets"}`}</p>
        <div
          key={`${tab}-${sort}-${topic}`}
          className="pane-in grid gap-3 px-5 py-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {res?.error && <p className="text-[13px] text-flesh">{res.error}</p>}
          {res && !list.length && !drafts.length && (
            <p className="col-span-full py-10 text-center text-[13px] text-muted">
              {tab === "done"
                ? "Nothing settled yet."
                : tab === "mine"
                  ? me
                    ? "No stakes from this wallet yet."
                    : "Connect a wallet to see your stakes."
                  : "Nothing under this topic yet."}
            </p>
          )}
          {list.map((m) => (
            <Card key={m.id} m={m} now={now} me={me} onDone={() => setTick((x) => x + 1)} />
          ))}
          {drafts.map((x) => (
            <DraftCard key={x.pair} pool={x} now={now} me={me} onDone={() => setTick((n) => n + 1)} />
          ))}
        </div>
      </Bay>
      <Bay tone="violet" kicker="Your own line and dates" title="Open a custom market">
        <div className="px-5 pb-5">
          <Create me={me} onDone={() => setTick((x) => x + 1)} />
        </div>
      </Bay>
    </div>
  );
}
