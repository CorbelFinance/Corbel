"use client";

/**
 * Account · alerts on the watched tokens: what changed for the worse since the last re-check (a check that got worse,
 * pool depth halved, a new lookalike ticker). The tokens are re-checked on the server every few minutes.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";

type Ev = { id: number; token: string; symbol: string; kind: "check" | "liquidity" | "ticker" | "drain"; text: string; at: number };
type Feed = { events: Ev[]; checkedAt: number | null; watching: number; everyMin: number; error?: string };
const KIND: Record<Ev["kind"], [string, string]> = { check: ["Check", "text-flesh"], liquidity: ["Liquidity", "text-flesh"], ticker: ["Lookalike", "text-amber"], drain: ["Funds left", "text-flesh"] };
const when = (t: number) => new Date(t).toISOString().slice(5, 16).replace("T", " ");

type Tg = { on: boolean; bot: string | null; linked: boolean; holder: boolean; alerts: number | null };

/** The Telegram row: link this wallet's chat with a one-time link, or unlink it. */
function TelegramRow() {
  const [t, setT] = useState<Tg | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => fetch("/api/account/telegram", { cache: "no-store" }).then((r) => r.json() as Promise<Tg>).then(setT).catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);
  if (!t) return null;
  async function link() {
    const r = await fetch("/api/account/telegram", { method: "POST" });
    const j = (await r.json()) as { url?: string | null; code?: string; error?: string };
    if (!r.ok) return setMsg(j.error ?? "No answer.");
    if (j.url) window.open(j.url, "_blank", "noopener");
    setMsg(j.url ? "Press Start in Telegram, then come back." : `Send /start ${j.code} to the bot.`);
  }
  async function unlinkIt() {
    await fetch("/api/account/telegram", { method: "DELETE" });
    void load();
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-[13px]">
      <span className="text-text">Telegram</span>
      {!t.on ? (
        <span className="text-muted">Alerts in Telegram open when the bot goes live.</span>
      ) : t.linked ? (
        <>
          <span className="text-leaf">{`Linked · ${t.alerts === null ? "every saved item" : `your first ${t.alerts} saved items`} send alerts there`}</span>
          <button type="button" onClick={() => void unlinkIt()} className="ml-auto font-mono text-[12px] text-muted hover:text-flesh">Unlink</button>
        </>
      ) : t.holder ? (
        <>
          <span className="text-muted">{`Get these alerts in a chat: ${t.alerts === null ? "every saved item" : `your first ${t.alerts} saved items`} by your tier.`}</span>
          <button type="button" onClick={() => void link()} className="ml-auto h-8 rounded-lg border border-line px-3 font-mono text-[12px] text-text hover:border-leaf">Connect Telegram</button>
        </>
      ) : (
        <span className="text-muted">Telegram alerts are for $CORBEL holders, from the Light tier up.</span>
      )}
      {msg && <span className="w-full text-[12.5px] text-muted">{msg}</span>}
    </div>
  );
}

type Hook = { url: string; fails: number; last: number | null; status: number | null } | null;

/** The webhook row: one https URL that gets a signed POST for every alert. */
function WebhookRow() {
  const [h, setH] = useState<Hook | undefined>(undefined);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/account/webhook", { cache: "no-store" }).then((r) => r.json() as Promise<{ hook?: Hook }>).then((j) => setH(j.hook ?? null)).catch(() => undefined);
  }, []);
  if (h === undefined) return null;
  async function save() {
    setErr(null);
    const r = await fetch("/api/account/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    const j = (await r.json()) as { secret?: string; hook?: Hook; error?: string };
    if (!r.ok) return setErr(j.error ?? "No answer.");
    setSecret(j.secret ?? null);
    setH(j.hook ?? null);
  }
  async function drop() {
    await fetch("/api/account/webhook", { method: "DELETE" });
    setH(null);
    setSecret(null);
  }
  return (
    <div className="border-t border-line px-4 py-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-text">Webhook</span>
        {h ? (
          <>
            <span className="min-w-0 truncate font-mono text-[12px] text-muted">{h.url}</span>
            <span className={cx("font-mono text-[12px]", h.status && h.status < 300 ? "text-leaf" : h.fails ? "text-flesh" : "text-muted")}>{h.last ? `last answer ${h.status || "none"}` : "no call yet"}</span>
            <button type="button" onClick={() => void drop()} className="ml-auto font-mono text-[12px] text-muted hover:text-flesh">Remove</button>
          </>
        ) : (
          <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => (e.preventDefault(), void save())}>
            <input value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://your-server/corbel" aria-label="Webhook URL" spellCheck={false} className="h-8 min-w-0 flex-1 border border-line bg-bg px-2 font-mono text-[12px] text-text focus:border-ui/60 focus:outline-none" />
            <button type="submit" className="h-8 rounded-lg border border-line px-3 font-mono text-[12px] text-text hover:border-leaf">Set</button>
          </form>
        )}
      </div>
      {secret && <p className="mt-2 break-all font-mono text-[12px] text-leaf">{`Secret, shown once: ${secret} · each call carries x-corbel-signature, the hex HMAC-SHA256 of the body with it.`}</p>}
      {err && <p className="mt-2 text-[12.5px] text-flesh">{err}</p>}
    </div>
  );
}

export function WatchAlerts() {
  const [f, setF] = useState<Feed | null>(null);
  useEffect(() => {
    let on = true;
    const load = () =>
      fetch("/api/account/alerts", { cache: "no-store" })
        .then((r) => r.json() as Promise<Feed>)
        .then((j) => on && setF(j))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, []);
  if (!f || f.error) return null;
  return (
    <section aria-label="Alerts" className="border-t border-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
        <span className="text-[14px] font-semibold text-text">Alerts</span>
        <span className="font-mono text-[12px] text-muted">
          {f.watching ? `${f.watching} saved item${f.watching === 1 ? "" : "s"} re-checked every ${f.everyMin} min${f.checkedAt ? ` · last ${when(f.checkedAt)} UTC` : " · first check running"}` : "Save a token to get alerts on it"}
        </span>
      </div>
      {f.events.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-muted">{f.watching ? "Nothing changed for the worse on your tokens since they were first checked." : "A token you save here is checked again every few minutes; anything that gets worse shows up in this list."}</p>
      ) : (
        <ul className="divide-y divide-line">
          {f.events.map((e) => (
            <li key={e.id} className="grid grid-cols-[6.5rem_5.5rem_1fr_auto] items-baseline gap-3 px-4 py-2.5 text-[13px]">
              <span className="font-mono text-[12px] text-muted">{when(e.at)}</span>
              <span className={cx("font-mono text-[12px] uppercase", KIND[e.kind][1])}>{KIND[e.kind][0]}</span>
              <span className="min-w-0 text-text">
                <b className="font-mono font-normal">{e.symbol}</b> · {e.text}
              </span>
              <Link href={e.kind === "drain" ? `/app/portfolio?address=${e.token}` : `/app/trust/check?q=${e.token}`} className="font-mono text-[12px] text-ui underline decoration-ui/30 underline-offset-4">
                Check →
              </Link>
            </li>
          ))}
        </ul>
      )}
      <TelegramRow />
      <WebhookRow />
    </section>
  );
}
