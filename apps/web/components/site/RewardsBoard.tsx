"use client";

/**
 * /rewards · the reward season: the pool and how it is split (podium and two drawn winners, with the countdown to the
 * week's end), how it works in four steps, your points and nickname, this week's board, the points each tool gives
 * (one table, coloured by the roadmap block the tool belongs to, filterable, with today's use against the daily cap)
 * and why the payout can be trusted (pool locked on HoodLock, a contract with no withdraw, roots from the project's
 * multisig, the draw from a future block hash, unclaimed coins burned, team wallets out).
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { cx } from "@corbel/ui";
import { encodeFunctionData, formatEther, parseAbi, type Hex } from "viem";
import { useSession } from "@/components/app/session";
import { useLinked } from "@/components/app/wallet";
import { ready, send } from "@/components/app/walletTx";

const DROP = parseAbi(["function claim(uint256 round, address wallet, uint256 amount, bytes32[] proof)"]);

type Row = { rank: number; id?: string; wallet: string; nick: string | null; tier: string | null; pts: number; actions: number; estimate: number; eligible: boolean };
type Act = { id: string; block: string; label: string; pts: number; cap: number; soon?: boolean; onchain?: boolean; holders?: boolean };
type R = {
  week: string;
  endsAt: number;
  season: { claimDays?: number; poolCoins: number; podium: number[]; pointsShare: number; drawShare: number; drawWinners: number; minPoints: number };
  drop: string | null;
  lock: string | null;
  next: { coins: number; lock: string } | null;
  actions: Act[];
  blocks: { id: string; label: string; tone: string }[];
  mult: Record<string, number>;
  reports: { id: string; label: string; pts: number; week: number }[];
  social: { x: string | null; telegram: string | null };
  minTxs: number;
  board: Row[];
  eligible: number;
  me: { id?: string; pts: number; rank: number | null; mult: number; nick: string | null; live: boolean; wallet: string; today: Record<string, number>; claim: { week: string; round: number; amount: string; proof: Hex[]; claimed: boolean; drop: string } | null } | null;
};
const SCAN = "https://robinhoodchain.blockscout.com/address/";
const big = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M` : v >= 1e3 ? `${Math.round(v / 1e3).toLocaleString("en-US")}K` : String(Math.round(v)));
const tone = (t: string) => ({ ["--tone" as string]: t }) as CSSProperties;
const GOLD = "#e8c46a", SILVER = "#c9d2cf", BRONZE = "#cf8a5a", DRAW = "#8d72e8";
const PLACE = [GOLD, SILVER, BRONZE];
/** How much a step takes, from the action itself: a click, a deeper tool, a one-time setup, or a transaction. */
const effortOf = (a: Act): [number, string] => (a.onchain ? [4, "On chain"] : a.cap === 1 ? [3, "One-time"] : a.pts >= 5 ? [2, "Deeper"] : [1, "Quick"]);
const TIER_NAME: Record<string, string> = { none: "No tier", light: "Light", plus: "Plus", full: "Full", core: "Core" };

function useLeft(end: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor(end - now / 1000));
  return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60] as const;
}

function Countdown({ end }: { end: number }) {
  const [d, h, m, s] = useLeft(end);
  return (
    <div className="flex items-end gap-2" aria-label="Time left this week">
      {[
        [d, "days"],
        [h, "hrs"],
        [m, "min"],
        [s, "sec"],
      ].map(([v, k]) => (
        <div key={k as string} className="w-[3.6rem] rounded-xl border border-[#262626] bg-[#0b0b0b] py-2 text-center">
          <p className="font-mono text-[22px] leading-none tabular-nums text-text">{String(v).padStart(2, "0")}</p>
          <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">{k}</p>
        </div>
      ))}
    </div>
  );
}

/** People read "Week 1 · 23–29 Nov", never the calendar's ISO week ("2026-W48"), which stays internal. */
const SEASON_START = "2026-W48";
const mondayOf = (week: string) => {
  const [y, w] = week.split("-W").map(Number) as [number, number];
  const jan4 = Date.UTC(y, 0, 4);
  return jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86_400_000 + (w - 1) * 7 * 86_400_000;
};
const weekName = (week: string) => {
  const m = mondayOf(week), n = Math.round((m - mondayOf(SEASON_START)) / (7 * 86_400_000)) + 1;
  const d = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const a = d(m), b = d(m + 6 * 86_400_000);
  return `Week ${n} · ${a.split(" ")[1] === b.split(" ")[1] ? `${a.split(" ")[0]}–${b}` : `${a} – ${b}`}`;
};

/** The board, checkable: the public log's head hash, its size and the viewer's own number in it. */
function BoardProof({ week, myId }: { week: string; myId: string | null }) {
  const [l, setL] = useState<{ count: number; head: string; events: { at: number }[] } | null>(null);
  useEffect(() => {
    fetch(`/api/rewards/log?week=${week}`, { cache: "no-store" })
      .then((x) => x.json())
      .then(setL)
      .catch(() => undefined);
  }, [week]);
  const [a, setA] = useState<{ at: string; tx: string; rows: number } | null>(null);
  useEffect(() => {
    fetch("/api/rewards/anchors", { cache: "no-store" })
      .then((x) => x.json())
      .then((j) => setA(j.anchors?.[0] ?? null))
      .catch(() => undefined);
  }, []);
  const last = l?.events.at(-1)?.at;
  return (
    <section aria-label="Check the board yourself" className="rounded-2xl border border-[#222] bg-[#0f0f0f] p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[18px] font-semibold text-text">Check the board yourself</p>
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          <a href={`/api/rewards/log?week=${week}`} className="rounded-full border border-[#2a2a2a] px-3 py-1 text-text hover:border-leaf">The points log ↗</a>
          <a href="/rewards-log-verify.mjs" className="rounded-full border border-[#2a2a2a] px-3 py-1 text-text hover:border-leaf">The check script ↗</a>
        </div>
      </div>
      <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted">Every point is a row in a public log: when, for which action, how many, and the transaction for swaps and revokes. Each row is sealed with the hash of the one before it, so no row can be changed, added or removed later without breaking every hash after it. The script recomputes the chain and adds up the board from the log.</p>
      <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-[#222] bg-[#222] sm:grid-cols-3">
        <div className="bg-[#0b0b0b] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Rows this week</p>
          <p className="mt-1 font-mono text-[22px] text-text">{l ? l.count.toLocaleString("en-US") : "…"}</p>
          <p className="font-mono text-[11.5px] text-muted">{last ? `last ${new Date(last).toISOString().slice(0, 16).replace("T", " ")} UTC` : "none yet"}</p>
        </div>
        <div className="bg-[#0b0b0b] p-4 sm:col-span-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Head of the chain · keep it to check later</p>
          <p className="mt-1 break-all font-mono text-[13px] text-leaf">{l?.head ?? "…"}</p>
          <p className="mt-1 font-mono text-[11.5px] text-muted">{myId ? `Your number in the log: ${myId}` : "Sign in to see your own number in the log."}</p>
        </div>
      </div>
      {a && (
        <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
          {`Written on Robinhood Chain every hour, so even we can't rewrite the past. Last: ${a.at.replace("T", " ").replace("Z", " UTC")}, ${a.rows.toLocaleString("en-US")} rows, `}
          <a href={`https://robinhoodchain.blockscout.com/tx/${a.tx}`} target="_blank" rel="noreferrer" className="text-leaf underline underline-offset-4">see the transaction ↗</a>
          {". Its input holds the head hash of that hour."}
        </p>
      )}
    </section>
  );
}

export function RewardsBoard() {
  const auth = useSession();
  const { linked } = useLinked();
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [r, setR] = useState<R | null>(null);
  const [nick, setNick] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  const [byPts, setByPts] = useState(false);
  const load = useCallback(() => {
    fetch("/api/rewards", { cache: "no-store" })
      .then((x) => x.json() as Promise<R>)
      .then((j) => (setR(j), setNick(j.me?.nick ?? "")))
      .catch(() => undefined);
  }, []);
  useEffect(() => load(), [load, auth.address]);
  const toneOf = useMemo(() => Object.fromEntries((r?.blocks ?? []).map((b) => [b.id, b])), [r]);
  if (!r) return <p className="text-[14px] text-muted">Reading this week…</p>;

  async function claim() {
    const c = r?.me?.claim;
    if (!c || !linked?.address) return;
    setClaimMsg("Confirm in your wallet…");
    try {
      const p = await ready(linked.rdns);
      const data = encodeFunctionData({ abi: DROP, functionName: "claim", args: [BigInt(c.round), linked.address as Hex, BigInt(c.amount), c.proof] });
      const hash = await send(p, linked.address, c.drop, data, "The claim");
      setClaimMsg(`Claimed. Transaction ${hash.slice(0, 10)}…`);
      load();
    } catch (e) {
      setClaimMsg((e as Error).message?.split("\n")[0] ?? "The wallet did not sign.");
    }
  }

  async function saveNick() {
    setMsg(null);
    const x = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nick }) });
    const j = (await x.json()) as { error?: string };
    setMsg(x.ok ? "Saved." : (j.error ?? "Not saved."));
    load();
  }

  const s = r.season, pool = s.poolCoins, draw = (pool * s.drawShare) / s.drawWinners;
  const prizes = [
    { k: "1st place", v: pool * s.podium[0]!, c: GOLD, how: "Most points" },
    { k: "2nd place", v: pool * s.podium[1]!, c: SILVER, how: "Second most" },
    { k: "3rd place", v: pool * s.podium[2]!, c: BRONZE, how: "Third most" },
    ...Array.from({ length: s.drawWinners }, (_, i) => ({ k: `Drawn winner ${i + 1}`, v: draw, c: DRAW, how: `Anyone with ${s.minPoints}+ points` })),
  ];
  const topPrize = Math.max(...prizes.map((p) => p.v));
  const order = (id: string) => r.blocks.findIndex((b) => b.id === id);
  const acts = r.actions.filter((a) => !only || a.block === only).sort((a, b) => order(a.block) - order(b.block) || a.pts - b.pts);
  const rows = byPts ? [...acts].sort((a, b) => b.pts * b.cap - a.pts * a.cap) : acts;
  const myMult = r.me?.mult ?? 1;
  const progress = r.me ? Math.min(1, r.me.pts / s.minPoints) : 0;
  const card = "rounded-2xl border border-[#222] bg-[#0f0f0f]";

  return (
    <div className="space-y-12">
      {/* the pool: total, countdown, the five prizes as bars, one strip with the whole split */}
      <section aria-label="The pool" className={cx(card, "relative overflow-hidden p-6 sm:p-8")}>
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_100%_0%,rgba(232,196,106,0.08),transparent_60%),radial-gradient(50%_70%_at_0%_100%,rgba(141,114,232,0.08),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">{`Pool · ${weekName(r.week)}`}</p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 font-display text-5xl leading-none tracking-tight text-text sm:text-7xl">
              {pool.toLocaleString("en-US")}
              <span className="font-mono text-[15px] tracking-normal text-leaf">$CORBEL</span>
            </p>
            <p className="mt-3 text-[14px] text-muted">{`Five winners: three by points, ${s.drawWinners === 2 ? "two" : s.drawWinners} drawn by a block hash.`}</p>
          </div>
          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Week ends Monday 00:00 UTC</p>
            <Countdown end={r.endsAt} />
          </div>
        </div>

        <div className="relative mt-8 grid grid-cols-5 items-end gap-2 sm:gap-4">
          {prizes.map((p, i) => (
            <div key={p.k} className="flex flex-col items-stretch">
              <p className="font-mono text-[13px] tabular-nums sm:text-[15px]" style={{ color: p.c }}>{big(p.v)}</p>
              <div
                className={cx("mt-2 rounded-t-lg border-x border-t", i >= 3 && "border-dashed")}
                style={{ height: `${Math.round(40 + (p.v / topPrize) * 110)}px`, borderColor: `${p.c}66`, background: `linear-gradient(180deg, ${p.c}33, ${p.c}08)` }}
              />
              <div className="border-t pt-2" style={{ borderColor: p.c }}>
                <p className="text-[12.5px] font-medium text-text sm:text-[13.5px]">{p.k}</p>
                <p className="hidden text-[12px] text-muted sm:block">{p.how}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-6 flex h-2 overflow-hidden rounded-full" aria-hidden>
          {prizes.map((p) => (
            <i key={p.k} className="h-full border-r border-[#0f0f0f] last:border-0" style={{ width: `${(p.v / pool) * 100}%`, background: p.c }} />
          ))}
        </div>

        <ul className="relative mt-6 flex flex-wrap gap-2 text-[12.5px]">
          <li>
            {r.lock ? (
              <a href={r.lock} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-leaf/40 bg-leaf/10 px-3 py-1.5 text-leaf">
                <i className="h-1.5 w-1.5 rounded-full bg-leaf" /> Locked on HoodLock · see the lock ↗
              </a>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-[#2a2a2a] px-3 py-1.5 text-muted">
                <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e8c46a]" /> HoodLock lock link posted here
              </span>
            )}
          </li>
          {r.next && (
            <li>
              <a href={r.next.lock} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-[#8d72e8]/50 bg-[#8d72e8]/10 px-3 py-1.5 text-[#c4b5fd]">
                <i className="h-1.5 w-1.5 rounded-full bg-[#8d72e8]" />
                {`Next week: ${r.next.coins.toLocaleString("en-US")} $CORBEL, already locked ↗`}
              </a>
            </li>
          )}
          <li className="inline-flex items-center gap-2 rounded-full border border-[#2a2a2a] px-3 py-1.5 text-text">{`Paid to the winner's own wallet`}</li>
          <li className="inline-flex items-center gap-2 rounded-full border border-[#2a2a2a] px-3 py-1.5 text-text">{`Unclaimed after ${s.claimDays ?? 14} days: burned`}</li>
        </ul>
      </section>

      {/* how it works in four steps */}
      <section aria-label="How it works">
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-[#222] bg-[#222] sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Sign in", "With your wallet at the top right. One message, no gas, no coins needed."],
            ["Use the tools", `Every tool below earns points, up to a daily cap. Holders earn up to ×${Math.max(...Object.values(r.mult))}.`],
            ["Week closes", `Monday 00:00 UTC. Top 3 win; ${s.drawWinners} more are drawn from everyone with ${s.minPoints}+ points.`],
            ["Coins arrive", "Sent to the winner's wallet by the reward contract. You can also claim it yourself."],
          ].map(([k, v], i) => (
            <li key={k} className="bg-[#0f0f0f] p-5">
              <p className="font-mono text-[12px] text-leaf">{`0${i + 1}`}</p>
              <p className="mt-2 text-[16px] font-semibold text-text">{k}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{v}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* you */}
      <section aria-label="You" className={cx(card, "p-6")}>
        {!r.me ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[17px] font-semibold text-text">You are not signed in</p>
              <p className="mt-1 text-[14px] text-muted">Sign in with your wallet at the top right (one message, no gas) and every tool you use earns points.</p>
            </div>
            <p className="font-mono text-[12px] text-muted">{`Holders: ${Object.entries(r.mult).filter(([k]) => k !== "none").map(([k, v]) => `${TIER_NAME[k] ?? k} ×${v}`).join(" · ")}`}</p>
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div>
              <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-leaf">{`Your points · ${weekName(r.week)}`}</p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="font-display text-6xl leading-none tracking-tight text-text">{r.me.pts.toLocaleString("en-US")}</p>
                <p className="text-[14px] text-muted">points</p>
                <span className="rounded-full border border-[#2a2a2a] px-2.5 py-1 font-mono text-[12px] text-text">{r.me.rank ? `#${r.me.rank} on the board` : "not on the board yet"}</span>
                <span className="rounded-full border border-leaf/40 bg-leaf/10 px-2.5 py-1 font-mono text-[12px] text-leaf">{`×${myMult} tier bonus`}</span>
              </div>
              <div className="mt-5">
                <div className="flex justify-between font-mono text-[12px] text-muted">
                  <span>Entry to the draw</span>
                  <span>{`${Math.min(r.me.pts, s.minPoints)} / ${s.minPoints}`}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#1c1c1c]">
                  <i className="block h-full rounded-full bg-leaf transition-[width] duration-700" style={{ width: `${progress * 100}%` }} />
                </div>
                <p className={cx("mt-2 text-[13.5px]", r.me.live && r.me.pts >= s.minPoints ? "text-leaf" : "text-muted")}>
                  {!r.me.live ? `To be paid, a wallet needs at least ${r.minTxs} transactions on Robinhood Chain.` : r.me.pts >= s.minPoints ? "You are in this week's draw. Climb into the top 3 for a podium prize." : `${Math.ceil(s.minPoints - r.me.pts)} more points to enter this week's draw.`}
                </p>
              </div>
              {r.me.claim && (
                <div className="mt-5 rounded-xl border border-leaf/50 bg-leaf/[0.06] p-4">
                  <p className="text-[14px] text-text">{`You won ${Number(formatEther(BigInt(r.me.claim.amount))).toLocaleString("en-US")} $CORBEL in ${weekName(r.me.claim.week)}.`}</p>
                  {r.me.claim.claimed ? (
                    <p className="mt-1 text-[13px] text-leaf">Paid. The coins are in your wallet.</p>
                  ) : (
                    <button type="button" onClick={() => void claim()} className="mt-2 h-10 rounded-xl bg-leaf px-5 text-[14px] font-semibold text-[#0b0b0b]">Claim to your wallet</button>
                  )}
                  {claimMsg && <p className="mt-2 text-[12.5px] text-muted">{claimMsg}</p>}
                </div>
              )}
            </div>
            <form onSubmit={(e) => (e.preventDefault(), void saveNick())} className="space-y-2 self-start rounded-xl border border-[#222] bg-[#0b0b0b] p-4">
              <label htmlFor="nick" className="block text-[14px] font-medium text-text">Your name on the board</label>
              <div className="flex gap-2">
                <input id="nick" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} placeholder="nickname" className="h-10 min-w-0 flex-1 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] px-3 font-mono text-[13px] text-text outline-none focus:border-leaf" />
                <button type="submit" className="h-10 rounded-xl bg-leaf px-4 text-[14px] font-semibold text-[#0b0b0b]">Save</button>
              </div>
              <p className="text-[12.5px] text-muted">{msg ?? "3 to 20 letters, digits, dots, dashes or underscores. Empty shows your short address. Changes once a day."}</p>
            </form>
          </div>
        )}
      </section>

      {/* the board */}
      <section aria-label="This week's board" className={cx(card, "overflow-hidden")}>
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#222] px-6 py-4">
          <p className="text-[18px] font-semibold text-text">{`Board · ${weekName(r.week)}`}</p>
          <span className="font-mono text-[12px] text-muted">{`${r.board.length} ${r.board.length === 1 ? "person" : "people"} · ${r.eligible} in the draw`}</span>
        </header>
        {r.board.length === 0 ? (
          <p className="px-6 py-6 text-[14px] text-muted">No points yet this week. Use any tool while signed in and you are on the board.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-[#222] text-[12px] text-muted">
                  {["#", "Who", "Tier", "Points", "Prize if the week ended now"].map((h) => (
                    <th key={h} scope="col" className="px-6 py-2.5 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.board.map((b) => {
                  // medals go to the first three wallets that can actually be paid, not to the raw top three
                  const place = b.eligible ? r.board.filter((x) => x.eligible).indexOf(b) : -1;
                  const c = place >= 0 ? PLACE[place] : undefined;
                  return (
                    <tr key={`${b.rank}${b.wallet}`} className="border-b border-[#1c1c1c] last:border-0" style={c ? { background: `linear-gradient(90deg, ${c}14, transparent 60%)` } : undefined}>
                      <td className="px-6 py-3">
                        {c ? <span className="grid h-7 w-7 place-items-center rounded-full font-mono text-[13px] font-semibold text-[#0b0b0b]" style={{ background: c }} title={`${place + 1}${["st", "nd", "rd"][place]} place prize`}>{b.rank}</span> : <span className="pl-2 font-mono text-muted">{b.rank}</span>}
                      </td>
                      <td className="px-6 py-3 text-text">{b.nick ?? <span className="font-mono">{b.wallet}</span>}</td>
                      <td className="px-6 py-3 font-mono text-[13px] text-muted">{b.tier ?? "—"}</td>
                      <td className="px-6 py-3 font-mono tabular-nums text-text">{b.pts.toLocaleString("en-US")}</td>
                      <td className="px-6 py-3 font-mono tabular-nums">{b.estimate ? <span style={{ color: c ?? undefined }}>{`${big(b.estimate)} $CORBEL`}</span> : b.eligible ? <span className="text-[#a996ef]">in the draw</span> : b.pts >= s.minPoints ? <span className="text-muted">{`needs ${r.minTxs} transactions on chain`}</span> : <span className="text-muted">{`${Math.ceil(s.minPoints - b.pts)} pts to the draw`}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <BoardProof week={r.week} myId={r.me?.id ?? null} />

      {/* points per tool: one table, coloured by roadmap block */}
      <section aria-label="Points per tool" className={cx(card, "overflow-hidden")}>
        <header className="border-b border-[#222] px-6 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[18px] font-semibold text-text">Points for each tool</p>
            <div className="flex gap-1 rounded-full border border-[#2a2a2a] p-0.5 font-mono text-[12px]">
              {[
                [false, "By layer"],
                [true, "Most points"],
              ].map(([v, k]) => (
                <button key={k as string} type="button" onClick={() => setByPts(v as boolean)} className={cx("rounded-full px-3 py-1", byPts === v ? "bg-[#1f1f1f] text-text" : "text-muted hover:text-text")}>{k as string}</button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setOnly(null)} className={cx("rounded-full border px-3 py-1 text-[12.5px]", !only ? "border-text text-text" : "border-[#2a2a2a] text-muted hover:text-text")}>{`All · ${r.actions.length}`}</button>
            {r.blocks.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setOnly(only === b.id ? null : b.id)}
                style={tone(b.tone)}
                className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] transition-colors", only === b.id ? "border-[var(--tone)] bg-[color-mix(in_srgb,var(--tone)_14%,transparent)] text-text" : "border-[#2a2a2a] text-muted hover:border-[var(--tone)] hover:text-text")}
              >
                <i className="h-2 w-2 rounded-full bg-[var(--tone)]" />
                {b.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[12px] text-muted">
            <span>Holders earn more:</span>
            {Object.entries(r.mult).map(([k, v]) => (
              <span key={k} className={cx("rounded-md border px-2 py-0.5", v === myMult && r.me ? "border-leaf/50 text-leaf" : "border-[#262626] text-text")}>{`${TIER_NAME[k] ?? k} ×${v}`}</span>
            ))}
          </div>
        </header>
        <ul className="sm:hidden">
          {rows.map((a) => {
            const b = toneOf[a.block];
            const used = r.me?.today[a.id] ?? 0;
            return (
              <li key={a.id} style={tone(b?.tone ?? "#6fe7a8")} className="relative flex items-center gap-3 border-b border-[#1a1a1a] py-3 pl-5 pr-4 last:border-0">
                <i aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--tone)]" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--tone)]">{b?.label ?? a.block}</p>
                  <p className="mt-0.5 text-[14px] text-text">{a.label}</p>
                  {(a.onchain || a.soon || a.holders || r.me) && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em]">
                      {a.onchain && <span className="rounded border border-[#2f2f2f] px-1.5 py-px text-muted">on chain</span>}
                      {a.holders && <span className="rounded border border-leaf/40 bg-leaf/10 px-1.5 py-px text-leaf">holders</span>}
                      {a.soon && <span className="rounded border border-[#8d72e8]/50 bg-[#8d72e8]/10 px-1.5 py-px text-[#a996ef]">soon</span>}
                      {r.me && !a.soon && <span className="normal-case tracking-normal text-muted">{`today ${used}/${a.cap}`}</span>}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[18px] leading-none tabular-nums text-[var(--tone)]">{a.pts}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted">{`${a.cap}× a day`}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[760px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-[#222] text-[12px] text-muted">
                <th scope="col" className="py-2.5 pl-6 pr-3 font-normal">Layer</th>
                <th scope="col" className="px-3 py-2.5 font-normal">Action</th>
                <th scope="col" className="px-3 py-2.5 font-normal">Effort</th>
                <th scope="col" className="px-3 py-2.5 text-right font-normal">Points</th>
                <th scope="col" className="px-3 py-2.5 text-right font-normal">Times a day</th>
                <th scope="col" className="px-3 py-2.5 text-right font-normal">{r.me ? `Max a day ×${myMult}` : "Max a day"}</th>
                <th scope="col" className="py-2.5 pl-3 pr-6 font-normal">{r.me ? "Today" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => {
                const b = toneOf[a.block];
                const used = r.me?.today[a.id] ?? 0;
                const first = !byPts && (i === 0 || rows[i - 1]!.block !== a.block);
                return (
                  <tr key={a.id} style={tone(b?.tone ?? "#6fe7a8")} className={cx("group border-b border-[#1a1a1a] last:border-0 hover:bg-[color-mix(in_srgb,var(--tone)_5%,transparent)]", a.soon && "opacity-80")}>
                    <td className="relative py-2.5 pl-6 pr-3">
                      <i aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--tone)]" style={{ opacity: first || byPts ? 1 : 0.55 }} />
                      <span className={cx("inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--tone)]", !first && !byPts && "opacity-0 group-hover:opacity-60")}>{b?.label ?? a.block}</span>
                    </td>
                    <td className="px-3 py-2.5 text-text">
                      <span>{a.label}</span>
                                            {a.holders && <span className="ml-2 rounded border border-leaf/40 bg-leaf/10 px-1.5 py-px font-mono text-[10.5px] uppercase tracking-[0.06em] text-leaf">holders</span>}
                      {a.soon && <span className="ml-2 rounded border border-[#8d72e8]/50 bg-[#8d72e8]/10 px-1.5 py-px font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#a996ef]">soon</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="flex gap-0.5" aria-hidden>
                          {[1, 2, 3, 4].map((k) => <i key={k} className="h-2.5 w-1.5 rounded-sm" style={{ background: k <= effortOf(a)[0] ? "var(--tone)" : "#262626" }} />)}
                        </span>
                        <span className="font-mono text-[11.5px] text-muted">{effortOf(a)[1]}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--tone)]">{a.pts}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted">{`${a.cap}×`}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text">{(a.pts * a.cap * myMult).toLocaleString("en-US")}</td>
                    <td className="py-2.5 pl-3 pr-6">
                      {r.me && !a.soon && (
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[#1c1c1c]">
                            <i className="block h-full rounded-full bg-[var(--tone)]" style={{ width: `${Math.min(100, (used / a.cap) * 100)}%` }} />
                          </span>
                          <span className="font-mono text-[11.5px] tabular-nums text-muted">{`${used}/${a.cap}`}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-[#222] px-6 py-3 text-[12.5px] text-muted">Quick reads earn little, deeper tools more, one-time setups more again; transactions earn the most and count only once read back from the chain. Caps reset at 00:00 UTC. Actions marked “soon” start counting the day they open.</p>
      </section>

      {/* the draw, step by step */}
      <section aria-label="How the draw works" className={cx(card, "p-6 sm:p-8")}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[18px] font-semibold text-text">How the draw works</p>
          <span className="rounded-full border border-[#8d72e8]/50 bg-[#8d72e8]/10 px-3 py-1 font-mono text-[12px] text-[#c4b5fd]">{`${s.drawWinners} prizes of ${big(draw)} $CORBEL`}</span>
        </div>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted">You don&apos;t need to be in the top three to win. Two more prizes go to random wallets, picked in a way nobody can steer or know in advance, us included.</p>
        <ol className="mt-6 grid gap-px overflow-hidden rounded-xl border border-[#222] bg-[#222] md:grid-cols-4">
          {[
            ["Who is in", `Everyone with ${s.minPoints}+ points this week. The top three are out: they already won. Team wallets never take part.`],
            ["The seed", "When the week closes on Monday 00:00 UTC, we take the first Robinhood Chain block made after that moment. Its hash is a long random number that did not exist while the week ran."],
            ["The pick", "Everyone in the draw is listed in board order. The hash, run through a public formula, gives a number; that number points at the first winner. The same is done again for the second."],
            ["Check it", "The list, the block and its hash are published. Run our open script and you get the same two winners; any change on our side would show at once."],
          ].map(([k, v], i) => (
            <li key={k} className="bg-[#0f0f0f] p-5">
              <p className="font-mono text-[12px] text-[#a996ef]">{`0${i + 1}`}</p>
              <p className="mt-2 text-[15px] font-semibold text-text">{k}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{v}</p>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2 text-[12.5px]">
          <a href="/rewards-verify.mjs" className="rounded-full border border-[#2a2a2a] px-3 py-1 text-text hover:border-[#8d72e8]">The draw script ↗</a>
          <a href={`/api/rewards/list?week=${r.week}`} className="rounded-full border border-[#2a2a2a] px-3 py-1 text-text hover:border-[#8d72e8]">The frozen list (after the week) ↗</a>
        </div>
      </section>

      {/* bug reports and ideas, credited by hand */}
      <section aria-label="Reports" className={cx(card, "grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]")}>
        <div>
          <p className="text-[18px] font-semibold text-text">Find a bug, bring an idea</p>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">Send what you found with your wallet address in a direct message. We check it, and the points land on your score within a day. The first report of a problem earns; each grant is logged.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {r.social.x && <a href={r.social.x} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-xl border border-[#2a2a2a] px-4 text-[14px] text-text hover:border-leaf">DM us on X ↗</a>}
            {r.social.telegram && <a href={r.social.telegram} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-xl border border-[#2a2a2a] px-4 text-[14px] text-text hover:border-leaf">Message us on Telegram ↗</a>}
          </div>
        </div>
        <ul className="divide-y divide-[#1c1c1c] self-start rounded-xl border border-[#222]">
          {r.reports.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-[14px] text-text">{x.label}</span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-[18px] leading-none tabular-nums text-leaf">{x.pts}</span>
                <span className="font-mono text-[11px] text-muted">{x.week ? `up to ${x.week} a week` : "no cap"}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* trust */}
      <section aria-label="Trust" className={cx(card, "p-6 sm:p-8")}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[18px] font-semibold text-text">Why you can trust the payout</p>
          <div className="flex flex-wrap gap-2 text-[12.5px]">
            <a href={`/api/rewards/list?week=${r.week}`} className="rounded-full border border-[#2a2a2a] px-3 py-1 text-text hover:border-leaf">Winners list (after the week) ↗</a>
            <a href="/rewards-verify.mjs" className="rounded-full border border-[#2a2a2a] px-3 py-1 text-text hover:border-leaf">Script to redo the draw ↗</a>
          </div>
        </div>
        <ol className="mt-6 grid gap-x-8 gap-y-5 md:grid-cols-2">
          {[
            ["Locked on HoodLock until payout day", <>The pool is locked on HoodLock, the same locker as our team locks, until just before the week ends. Nobody, us included, can move it during the week. {r.lock ? <a href={r.lock} target="_blank" rel="noreferrer" className="text-leaf underline underline-offset-4">See the lock ↗</a> : "The lock link is posted here."}</>],
            ["Then into a contract with no withdraw", <>On payout day the coins go into the reward contract. Its code is public and has no way to send coins back to the team. {r.drop ? <a href={SCAN + r.drop} target="_blank" rel="noreferrer" className="text-leaf underline underline-offset-4">See the contract ↗</a> : "Its address is posted here before payout."}</>],
            ["Coins can only go to the winner", "The list fixes each wallet and its amount; the project multisig puts its fingerprint (a Merkle root) on chain. Anyone may send a claim, but the contract only ever pays the wallet on the list."],
            ["The draw cannot be steered", "The two drawn winners come from the hash of the first block after the week ends. Nobody knows it in advance, and anyone can redo the draw with the script."],
            ["Unclaimed coins are burned", `Whatever is not claimed within ${s.claimDays ?? 14} days goes to the dead address, never back to us.`],
            ["The team does not play", "Team wallets earn nothing. Linked wallets count as one person, and every action has a daily cap."],
            ["Bots earn nothing for swaps", "A wallet that trades like a bot, by the same rule as Human vs bot volume, gets no points for its swaps."],
            ["Every winner is checked", "Before payout the team checks each winning wallet by hand and publishes, wallet by wallet, why it passed or not."],
          ].map(([k, v], i) => (
            <li key={k as string} className="flex gap-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-leaf/40 bg-leaf/10 font-mono text-[13px] text-leaf">{i + 1}</span>
              <div>
                <p className="text-[15px] font-medium text-text">{k}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{v}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[12.5px] text-muted">A reward for using the product. Not an investment, no price promise.</p>
      </section>
    </div>
  );
}
