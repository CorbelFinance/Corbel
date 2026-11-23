"use client";

/**
 * Owner's panel: what the checker found on its last pass (every three minutes), what generation cost today against
 * the budget, how far the pool record has filled, and the chain head. Opens only for wallets listed in ADMIN_WALLETS;
 * anyone else sees the sign-in and then nothing. Refreshes every 30 s.
 */
import { useCallback, useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Verdict, short } from "./kit";
import { useSession } from "./session";
import { AdminInbox, AdminLimits, AdminPeople, AdminSignups, type Inbox, type LimitRow, type Signups, type Stats } from "./AdminPeople";

type Tok = { token: string; symbol: string | null; ours: number | null; second: number | null; holders: number | null; agree: boolean | null; why: string | null };
type A = {
  address: string;
  at: number;
  release: string | null;
  uptime: number;
  head: string | null;
  xcheck: { at: number; ms: number; eth: { ours: number | null; median: number | null; sources: number; agree: boolean | null }; node: { ours: number | null; second: number | null; lag: number | null; eth: number | null; agree: boolean | null } | null; tokens: Tok[] } | null;
  media: { on: boolean; routed: boolean; budget: number; limits: Record<string, number>; spend: { day: string; tokens: number }[]; today: { kind: string; n: number; wallets: number }[]; jobs24h: number };
  earn: { pair: string; symbol: string; liquidity: number; days: number }[];
  stats: Stats | null;
  signups: Signups;
  rewards: { week: string; signedIn: number; signedInNoPoints: number; wallets: number; people: number; refused: Record<string, number>; problems: { wallet: string; issue: string }[] } | null;
  support: Inbox;
  limits: LimitRow[];
};

/** Points for a checked bug report or idea: wallet, kind, what was reported. Every grant is logged with the admin. */
function GrantDesk() {
  const [kinds, setKinds] = useState<Record<string, { label: string; pts: number }>>({});
  const [list, setList] = useState<{ wallet: string; kind: string; pts: number; note: string; at: number }[]>([]);
  const [kind, setKind] = useState("broken");
  const [wallet, setWallet] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/grant", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (setKinds(j.kinds ?? {}), setList(j.grants ?? [])))
      .catch(() => undefined);
  }, []);
  async function send() {
    setMsg(null);
    const r = await fetch("/api/admin/grant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: wallet.trim(), kind, note }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; grants?: typeof list };
    if (!r.ok) return setMsg(j.error ?? "Not added.");
    setMsg(`Added ${kinds[kind]?.pts ?? ""} points.`);
    setList(j.grants ?? []);
    setWallet("");
    setNote("");
  }
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-[14px] font-semibold text-text">Report points</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(kinds).map(([k, v]) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={cx("rounded-full border px-3 py-1 text-[12.5px]", kind === k ? "border-leaf bg-leaf/10 text-leaf" : "border-line text-muted hover:text-text")}>{`${v.label.split(":")[0]} · ${v.pts}`}</button>
        ))}
      </div>
      <form onSubmit={(e) => (e.preventDefault(), void send())} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x… wallet to credit" className="h-10 rounded-lg border border-line bg-[#0b0b0b] px-3 font-mono text-[13px] text-text outline-none focus:border-leaf" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was reported (kept in the log)" maxLength={300} className="h-10 rounded-lg border border-line bg-[#0b0b0b] px-3 text-[13px] text-text outline-none focus:border-leaf" />
        <button type="submit" className="h-10 rounded-lg bg-leaf px-4 text-[14px] font-semibold text-[#0b0b0b]">Add points</button>
      </form>
      {msg && <p className="mt-2 text-[12.5px] text-muted">{msg}</p>}
      {list.length > 0 && (
        <ul className="mt-3 space-y-1 font-mono text-[12px] text-muted">
          {list.slice(0, 12).map((g) => <li key={g.at}>{`${new Date(g.at).toISOString().slice(0, 16).replace("T", " ")} · ${g.wallet.slice(0, 8)}… · ${g.kind} +${g.pts} · ${g.note}`}</li>)}
        </ul>
      )}
    </div>
  );
}

/** The reward week reconciled: who signed in, who earned, what was refused and why, and any wallet whose points went missing. */
function RewardsAudit({ r }: { r: A["rewards"] }) {
  if (!r) return <p className="text-[14px] text-muted">The points store is not open.</p>;
  const cells: [string, number][] = [["Signed in this week", r.signedIn], ["Signed in, no points yet", r.signedInNoPoints], ["Wallets with points", r.wallets], ["People on the board", r.people]];
  return (
    <div className="space-y-4">
      <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        {cells.map(([k, v]) => (
          <div key={k} className="bg-[#0f0f0f] px-4 py-3">
            <p className="text-[12.5px] text-muted">{k}</p>
            <p className="font-mono text-[22px] text-text">{v.toLocaleString("en-US")}</p>
          </div>
        ))}
      </div>
      <p className="font-mono text-[12.5px] text-muted">{`Week ${r.week} · refused: ${Object.entries(r.refused).map(([k, v]) => `${k} ${v}`).join(" · ") || "none"}`}</p>
      <GrantDesk />
      <div className={cx("rounded-xl border p-4", r.problems.length ? "border-flesh/50" : "border-leaf/40")}>
        <p className={cx("text-[14px] font-semibold", r.problems.length ? "text-flesh" : "text-leaf")}>{r.problems.length ? `${r.problems.length} wallets need a look` : "No lost points: every counted action is stored and every earner is on the board."}</p>
        <ul className="mt-2 space-y-1 font-mono text-[12.5px] text-text">
          {r.problems.map((p) => <li key={p.wallet + p.issue}>{`${p.wallet} · ${p.issue}`}</li>)}
        </ul>
      </div>
    </div>
  );
}

const px = (v: number | null) => (v == null ? "—" : v >= 1 ? `$${v.toLocaleString("en", { maximumFractionDigits: 2 })}` : `$${v.toPrecision(3)}`);
const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 90 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
};

export function AdminPanel() {
  const auth = useSession();
  const [d, setD] = useState<A | null>(null);
  const [state, setState] = useState<"loading" | "signin" | "denied" | "ok">("loading");
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"doubt" | "all">("doubt");
  const [tab, setTab] = useState<"people" | "signins" | "rewards" | "support" | "limits" | "checks">("people");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin", { cache: "no-store" }).catch(() => null);
    if (!r) return;
    if (r.status === 401) return setState("signin");
    if (r.status === 404) return setState("denied");
    if (r.ok) {
      setD((await r.json()) as A);
      setState("ok");
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load, auth.address]);

  const signIn = async () => {
    setErr(null);
    const eth = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<unknown> } }).ethereum;
    if (!eth) return setErr("No wallet found in this browser.");
    const [a] = ((await eth.request({ method: "eth_requestAccounts" }).catch(() => [])) as string[]) ?? [];
    if (!a) return setErr("The wallet did not share an address.");
    const e = await auth.signIn(a);
    if (e) setErr(e);
    else void load();
  };

  if (state === "loading") return <p className="caret mt-16 text-center font-mono text-[13px] text-muted">Checking access</p>;
  if (state !== "ok" || !d)
    return (
      <section className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-[#0e0e0e] p-8 text-center">
        <h1 className="font-display text-3xl tracking-tight text-text">{state === "denied" ? "Not this wallet." : "Owner panel"}</h1>
        <p className="mt-3 text-[14px] text-muted">{state === "denied" ? "This address has no access. Switch to the owner's wallet and sign in again." : "Sign in with the owner's wallet. It is a message, not a transaction."}</p>
        <button type="button" onClick={() => void signIn()} className="mt-6 h-11 rounded-xl bg-ui px-6 text-[14px] font-semibold text-[#0b0b0b]">
          Sign in with wallet
        </button>
        {err && <p className="mt-3 text-[13px] text-flesh">{err}</p>}
      </section>
    );

  const x = d.xcheck;
  const doubt = x?.tokens.filter((t) => t.agree === false) ?? [];
  const okN = x?.tokens.filter((t) => t.agree === true).length ?? 0;
  const ethGap = x?.eth.ours && x.eth.median ? (x.eth.ours - x.eth.median) / x.eth.median : null;
  const tone = !x ? "caution" : x.eth.agree === false || x.node?.agree === false ? "bad" : doubt.length ? "caution" : "good";
  const spentToday = d.media.spend.find((s) => s.day === new Date().toISOString().slice(0, 10))?.tokens ?? 0;
  const rows = (filter === "doubt" ? doubt : x?.tokens ?? []).slice(0, 80);
  const maxSpend = Math.max(d.media.budget, ...d.media.spend.map((s) => s.tokens));

  const tabs = (
    <div role="tablist" aria-label="Owner panel" className="flex w-fit gap-1 rounded-xl border border-line p-[3px]">
      {([["people", "People"], ["signins", "Sign-ins"], ["rewards", "Rewards"], ["support", "Support"], ["limits", "Limits"], ["checks", "Checks"]] as const).map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("rounded-lg px-4 py-1.5 text-[14px]", tab === id ? "bg-[#202020] font-semibold text-text" : "text-muted hover:text-text")}>
          {label}
          {id === "support" && d.support.open > 0 && <span className="ml-2 rounded-full bg-leaf/20 px-1.5 text-[12px] text-leaf">{d.support.open}</span>}
          {id === "checks" && doubt.length > 0 && <span className="ml-2 rounded-full bg-amber/20 px-1.5 text-[12px] text-amber">{doubt.length}</span>}
        </button>
      ))}
    </div>
  );
  if (tab !== "checks")
    return (
      <div className="space-y-4">
        {tabs}
        {tab === "people" ? <AdminPeople s={d.stats} /> : tab === "signins" ? <AdminSignups s={d.signups} /> : tab === "rewards" ? <RewardsAudit r={d.rewards} /> : tab === "support" ? <AdminInbox s={d.support} onChanged={() => void load()} /> : <AdminLimits rows={d.limits} onSaved={() => void load()} />}
      </div>
    );

  return (
    <div className="space-y-4">
      {tabs}
      <Verdict
        kicker={`Checker · ${x ? `last pass ${ago(x.at)}` : "first pass in a few minutes"}`}
        tone={tone}
        value={x ? `${okN}/${x.tokens.length}` : "—"}
        valueLabel="tokens confirmed by a second source"
        facts={[
          ["ETH ours", px(x?.eth.ours ?? null)],
          ["Outside median", x?.eth.median ? `${px(x.eth.median)} · ${x.eth.sources} sources` : null],
          ["Gap", ethGap == null ? null : `${(ethGap * 100).toFixed(2)}%`],
          ["Block", d.head ? Number(d.head).toLocaleString("en") : null],
          ["Second node", x?.node ? (x.node.lag == null ? "no answer" : x.node.lag > 0 ? `ours ${x.node.lag} blocks behind` : "in step") : null],
          ["Release", d.release],
          ["Up", `${Math.round(d.uptime / 60)} min`],
        ]}
      >
        {!x
          ? "The checker has not finished its first pass yet."
          : x.node?.agree === false
            ? "The main node is behind or reads a different price than the second node. Live figures may be stale."
          : x.eth.agree === false
            ? "The chain's ETH price disagrees with outside quotes. Every dollar figure on the site is off until this is fixed."
            : doubt.length
              ? `${doubt.length} listed token${doubt.length > 1 ? "s are" : " is"} in doubt and kept out of headline figures. The ETH price agrees.`
              : "Every figure the checker can compare agrees with a second source."}
      </Verdict>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* the tokens, as a ledger */}
        <section className="overflow-hidden rounded-2xl border border-line bg-[#0f0f0f]">
          <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
            <h2 className="text-[15px] font-semibold text-text">Tokens checked</h2>
            <span className="text-[13px] text-muted">{`${doubt.length} in doubt · ${okN} confirmed · ${(x?.tokens.length ?? 0) - doubt.length - okN} no second reading`}</span>
            <span className="ml-auto flex gap-1 rounded-xl border border-line p-[3px]">
              {(["doubt", "all"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cx("rounded-lg px-3 py-1 text-[13px]", filter === f ? "bg-[#202020] text-text" : "text-muted hover:text-text")}>
                  {f === "doubt" ? "In doubt" : "All"}
                </button>
              ))}
            </span>
          </header>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-muted">
                    <th className="px-5 py-2 font-medium">Token</th>
                    <th className="px-3 py-2 text-right font-medium">Ours</th>
                    <th className="px-3 py-2 text-right font-medium">Second</th>
                    <th className="px-3 py-2 text-right font-medium">Holders</th>
                    <th className="px-5 py-2 font-medium">Finding</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.token} className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-2.5">
                        <a href={`/app/trade/terminal?token=${t.token}`} className="text-text hover:underline">
                          {t.symbol ?? "?"}
                        </a>
                        <span className="ml-2 font-mono text-[12px] text-muted">{short(t.token)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-text">{px(t.ours)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">{px(t.second)}</td>
                      <td className={cx("px-3 py-2.5 text-right tabular-nums", t.holders != null && t.holders < 50 ? "text-amber" : "text-text")}>{t.holders?.toLocaleString("en") ?? "—"}</td>
                      <td className={cx("px-5 py-2.5", t.agree === false ? "text-amber" : t.agree ? "text-leaf" : "text-muted")}>{t.why ?? (t.agree ? "agrees" : "no second reading")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-8 text-[14px] text-muted">{filter === "doubt" ? "Nothing in doubt on the last pass." : "No tokens checked yet."}</p>
          )}
        </section>

        <div className="space-y-4">
          {/* generation: spend against the daily budget, as bars */}
          <section className="rounded-2xl border border-[#ff9a5c]/30 bg-[#0f0f0f] p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-text">Generation</h2>
              <span className={cx("text-[12px]", d.media.on ? "text-leaf" : "text-flesh")}>{d.media.on ? "open" : "closed"}</span>
            </div>
            <p className="mt-3 font-display text-[40px] leading-none tabular-nums text-[#ff9a5c]">
              {spentToday.toFixed(1)}
              <span className="ml-2 text-[15px] text-muted">{`of ${d.media.budget} tokens today`}</span>
            </p>
            <div className="mt-4 flex h-16 items-end gap-1" aria-label="Tokens spent per day, last 14 days">
              {[...d.media.spend].reverse().map((s) => (
                <span key={s.day} title={`${s.day}: ${s.tokens.toFixed(1)}`} className="flex-1 rounded-t bg-[#ff9a5c]/70" style={{ height: `${Math.max(4, (s.tokens / maxSpend) * 100)}%` }} />
              ))}
              {!d.media.spend.length && <span className="text-[13px] text-muted">No spend recorded yet.</span>}
            </div>
            <ul className="mt-4 space-y-1.5 text-[13.5px]">
              {(["image", "video", "audio"] as const).map((k) => {
                const t = d.media.today.find((r) => r.kind === k);
                return (
                  <li key={k} className="flex justify-between gap-3">
                    <span className="capitalize text-muted">{k}</span>
                    <span className="tabular-nums text-text">{`${t?.n ?? 0} today · ${t?.wallets ?? 0} wallets · limit ${d.media.limits[k]}/wallet`}</span>
                  </li>
                );
              })}
              <li className="flex justify-between gap-3 border-t border-line pt-1.5">
                <span className="text-muted">Jobs, 24 h</span>
                <span className="tabular-nums text-text">{d.media.jobs24h}</span>
              </li>
            </ul>
          </section>

          {/* the pool record: how many of thirty days each pool has */}
          <section className="rounded-2xl border border-line bg-[#0f0f0f] p-5">
            <h2 className="text-[15px] font-semibold text-text">Pool record</h2>
            <p className="mt-1 text-[13px] text-muted">Days rebuilt from the chain, of 30.</p>
            <ul className="mt-3 space-y-2">
              {d.earn.slice(0, 12).map((r) => (
                <li key={r.pair} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-[13px]">
                  <span className="truncate text-text">{r.symbol}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-[#181818]">
                    <span className="block h-full rounded-full bg-leaf" style={{ width: `${(Math.min(30, r.days) / 30) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-muted">{r.days}</span>
                </li>
              ))}
              {!d.earn.length && <li className="text-[13px] text-muted">The pool list is still loading.</li>}
            </ul>
          </section>
          <p className="px-1 text-[12px] text-muted">{`Signed in as ${short(d.address)} · refreshed ${ago(d.at)}`}</p>
        </div>
      </div>
    </div>
  );
}
