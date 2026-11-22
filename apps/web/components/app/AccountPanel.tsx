"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Idle, Instrument, Led, Seg, short } from "./kit";
import { useSession } from "./session";
import { SignInRow, useLinked } from "./wallet";
import { setWatch, useWatch } from "./WatchButton";

type Live = { verdict?: { pass: number; warn: number; fail: number }; price?: number | null; eth?: string; usdg?: string; err?: boolean };

type Item = { kind: "token" | "address"; value: string; label: string; added: number };
const KINDS = [
  { id: "token", label: "Token" },
  { id: "address", label: "Address" },
] as const;

/** Account → Dashboard: who is signed in, and their watchlist. Sign-in is one wallet message, never a transaction. */
export function AccountPanel() {
  const { linked } = useLinked();
  const auth = useSession();
  const items = useWatch() as Item[] | null;
  const setItems = setWatch;
  const [live, setLive] = useState<Record<string, Live>>({});
  const [kind, setKind] = useState<"token" | "address">("token");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // live readings for each saved item, three at a time (the API is rate-limited per visitor)
  useEffect(() => {
    if (!items?.length) return;
    let alive = true;
    const todo = items.filter((it) => !live[it.value]);
    const one = async (it: Item) => {
      const v: Live = {};
      try {
        if (it.kind === "token") {
          const tr = await fetch(`/api/token?q=${it.value}`);
          if (tr.ok) {
            const j = (await tr.json()) as { checks?: { result: string }[] };
            const c = j.checks ?? [];
            v.verdict = { pass: c.filter((x) => x.result === "pass").length, warn: c.filter((x) => x.result === "warn").length, fail: c.filter((x) => x.result === "fail").length };
          }
          const q = await fetch(`/api/quote?from=${it.value}&to=USDG&amount=1`);
          if (q.ok) {
            const j = (await q.json()) as { best: number | null; routes: { amountOut: string | null }[] };
            v.price = j.best !== null && j.routes[j.best]?.amountOut ? Number(j.routes[j.best]!.amountOut) / 1e6 : null;
          }
        } else {
          const wr = await fetch(`/api/wallet?address=${it.value}`);
          if (wr.ok) {
            const j = (await wr.json()) as { balances?: { symbol: string; value: string }[] };
            v.eth = j.balances?.find((b) => b.symbol === "ETH")?.value;
            v.usdg = j.balances?.find((b) => b.symbol === "USDG")?.value;
          }
        }
      } catch {
        v.err = true;
      }
      if (alive) setLive((m) => ({ ...m, [it.value]: v }));
    };
    void (async () => {
      for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(one));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only new items need a reading
  }, [items]);

  const add = async () => {
    setErr(null);
    const r = await fetch("/api/account/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, value: value.trim(), label }) });
    const j = (await r.json()) as { items?: Item[]; error?: string };
    if (!r.ok) return setErr(j.error ?? "Could not add it.");
    setItems(j.items ?? []);
    setValue("");
    setLabel("");
  };
  const remove = async (v: string) => {
    const r = await fetch(`/api/account/watch?value=${v}`, { method: "DELETE" });
    if (r.ok) setItems(((await r.json()) as { items: Item[] }).items);
    else setItems(items);
  };

  const signedIn = !!auth.address;

  return (
    <Instrument
      code="A-00"
      tone="moss"
      title="Saved tokens and wallets"
      status={<Led tone={signedIn ? "on" : "off"} live={signedIn} label={signedIn ? `Signed in · ${short(auth.address!)}` : linked?.via === "wallet" ? `Connected · ${short(linked.address)} · sign once to open` : "No wallet connected"} />}
      foot={<span>Sign-in proves you hold the address: one message, no gas, nothing moves. Only the address and your list are stored.</span>}
    >
      {!auth.ready ? (
        <Idle className="min-h-24">Checking the session…</Idle>
      ) : !signedIn ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
          <p className="min-w-0 flex-1 text-[13.5px] text-muted">
            <span className="text-text">Save tokens and wallets to follow them on any device.</span> Sign in with one wallet message: no gas, nothing moves.
          </p>
          {linked?.via === "wallet" ? <SignInRow address={linked.address} rdns={linked.rdns} /> : <span className="font-mono text-[12px] text-muted">Link a wallet at the top right to sign in</span>}
        </div>
      ) : (
        <div>
          <form
            className="grid gap-3 border-b border-line p-4 sm:grid-cols-[auto_1fr_12rem_auto] sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Seg label="What to watch" value={kind} options={KINDS} onChange={setKind} />
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0x… contract or wallet" spellCheck={false} autoComplete="off" aria-label="Address to watch" className="h-10 border border-line bg-bg px-3 font-mono text-xs text-text placeholder:text-muted focus:border-ui/60 focus:outline-none" />
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" maxLength={40} aria-label="Label" className="h-10 border border-line bg-bg px-3 text-sm text-text placeholder:text-muted focus:border-ui/60 focus:outline-none" />
            <button type="submit" className="ibtn h-10 px-5">
              Add
            </button>
          </form>
          {err && <p className="border-b border-line bg-flesh-deep/50 px-4 py-2.5 text-sm text-text">{err}</p>}
          {items === null ? (
            <Idle className="min-h-24">Loading your list…</Idle>
          ) : items.length === 0 ? (
            <Idle className="min-h-24">Nothing saved yet. Add a token to check it later, or a wallet to follow.</Idle>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((it) => (
                <li key={it.value} className="irow grid grid-cols-[4.5rem_1fr_auto_auto] items-center gap-3 px-4 py-3 text-sm sm:grid-cols-[4.5rem_1fr_13rem_auto_auto]">
                  <span className={cx("font-medium text-[12px] uppercase tracking-[0.08em]", it.kind === "token" ? "text-leaf" : "text-text")}>{it.kind}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-text">{it.label || short(it.value)}</span>
                    <span className="block font-mono text-[12px] text-muted">{it.value}</span>
                  </span>
                  <span className="col-span-4 col-start-2 text-[12px] tabular-nums sm:col-span-1 sm:col-start-auto">
                    {(() => {
                      const l = live[it.value];
                      if (!l) return <span className="text-muted">reading…</span>;
                      if (l.err) return <span className="text-muted">no answer</span>;
                      if (it.kind === "address") return <span className="text-text">ETH {Number(l.eth ?? 0).toLocaleString("en", { maximumFractionDigits: 4 })} · USDG {Number(l.usdg ?? 0).toLocaleString("en", { maximumFractionDigits: 2 })}</span>;
                      return (
                        <span className="flex flex-wrap items-center gap-x-3">
                          {l.verdict && (
                            <span>
                              <span className="text-leaf">✓{l.verdict.pass}</span> <span className="text-text">▲{l.verdict.warn}</span> <span className={l.verdict.fail ? "text-flesh" : "text-muted"}>✕{l.verdict.fail}</span>
                            </span>
                          )}
                          <span className="text-text">{l.price != null ? `${l.price.toLocaleString("en", { maximumSignificantDigits: 6 })} USDG` : "no route"}</span>
                        </span>
                      );
                    })()}
                  </span>
                  <Link href={it.kind === "token" ? `/app/trust/check?q=${it.value}` : `/app/portfolio?address=${it.value}`} className="font-medium text-[12px] uppercase tracking-[0.08em] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                    {it.kind === "token" ? "Check →" : "Open →"}
                  </Link>
                  <button type="button" onClick={() => void remove(it.value)} className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted hover:text-flesh" aria-label={`Remove ${it.label || it.value}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between border-t border-line px-4 py-3">
            <span className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{items ? `${items.length} / 50 saved` : ""}</span>
            <button type="button" className="ibtn-ghost h-8" onClick={() => void auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </Instrument>
  );
}
