"use client";

import { useEffect, useState } from "react";
import { Label, cx } from "@corbel/ui";
import { Instrument, Led } from "./kit";
import { useSession } from "./session";

const ENDPOINTS = [
  {
    path: "/api/token?q=",
    arg: "0x0ad3b612c5988e4257a0aab6f2713a3a5371d111",
    what: "Trust report for a token address, or candidates for a ticker.",
  },
  {
    path: "/api/quote?from=ETH&to=USDG&amount=",
    arg: "0.05",
    what: "Every route simulated at the latest block: amount out, gas, impact.",
  },
  {
    path: "/api/radar?limit=",
    arg: "5",
    what: "Newest pools from the index. Filters: kind=v2|v4, before=<block>.",
  },
  { path: "/api/launches", arg: "", what: "Launch analytics for the indexed week." },
  {
    path: "/api/portfolio?address=",
    arg: "0x6446340895dc6caf9ee8763f6b0e6e5d78d376ca",
    what: "Tokens an address received this week, balances, spot value.",
  },
  {
    path: "/api/wallet?address=",
    arg: "0x6446340895dc6caf9ee8763f6b0e6e5d78d376ca",
    what: "ETH, WETH and USDG balances of any address.",
  },
  { path: "/api/stocks", arg: "", what: "Issuer stock tokens with a simulated price and depth, plus lookalikes." },
  { path: "/api/mandate?log", arg: "", what: "What the mandate contract decided in recent Break it runs." },
  { path: "/api/assets?q=", arg: "PEPE", what: "Ticker search over the index, for pickers." },
  { path: "/api/net", arg: "", what: "Latest block, or null when the chain is unreachable." },
] as const;

/** Live console for our read-only endpoints, then the holder's API keys. */
export function TrustApi() {
  return (
    <div className="space-y-6">
      <Console />
      <Keys />
    </div>
  );
}

/** Live console for our read-only endpoints. Requests go to this site only. */
function Console() {
  const [i, setI] = useState(0);
  const [arg, setArg] = useState<string>(ENDPOINTS[0].arg);
  const [out, setOut] = useState<{ status: number; ms: number; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const ep = ENDPOINTS[i]!;
  const url = `${ep.path}${ep.arg || arg ? encodeURIComponent(arg.trim()) : ""}`;

  async function send() {
    setBusy(true);
    const t = performance.now();
    try {
      const r = await fetch(url, { cache: "no-store" });
      const text = await r.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* not JSON: show as is */
      }
      setOut({ status: r.status, ms: Math.round(performance.now() - t), body });
    } catch {
      setOut({ status: 0, ms: Math.round(performance.now() - t), body: "No answer. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Instrument
      code="X-01"
      title="API console"
      busy={busy}
      status={
        <Led
          tone={out ? (out.status >= 200 && out.status < 300 ? "on" : "bad") : "off"}
          label={out ? `${out.status || "—"} · ${out.ms} ms` : "Same origin"}
        />
      }
      foot={<span>Every endpoint is GET and answers JSON. Holders send a key in the x-api-key header for higher limits.</span>}
    >
      <div className="grid gap-px bg-line lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="bg-bg">
          <ul className="divide-y divide-line">
            {ENDPOINTS.map((e, n) => (
              <li key={e.path}>
                <button
                  type="button"
                  aria-pressed={i === n}
                  onClick={() => {
                    setI(n);
                    setArg(e.arg);
                    setOut(null);
                  }}
                  className={cx(
                    "block w-full px-5 py-4 text-left",
                    i === n
                      ? "bg-[color-mix(in_oklab,var(--leaf)_8%,transparent)]"
                      : "hover:bg-[color-mix(in_oklab,var(--leaf)_4%,transparent)]",
                  )}
                >
                  <span className={cx("font-mono text-xs", i === n ? "text-leaf" : "text-text")}>
                    GET {e.path.replace(/\?.*$/, "")}
                  </span>
                  <span className="mt-1 block text-sm text-muted">{e.what}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 bg-bg p-5">
          <Label>Request</Label>
          <form
            className="mt-3 flex flex-col gap-px bg-line sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <span className="bg-bg px-3 py-3 font-mono text-xs text-muted">GET {ep.path}</span>
            {ep.arg !== "" && (
              <>
                <label htmlFor="api-arg" className="sr-only">
                  Parameter
                </label>
                <input
                  id="api-arg"
                  value={arg}
                  onChange={(e) => setArg(e.target.value)}
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-bg px-3 py-3 font-mono text-xs text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-leaf"
                />
              </>
            )}
            <button
              type="submit"
              disabled={busy}
              className="bg-leaf px-5 py-3 font-medium text-xs uppercase tracking-[0.08em] text-bg disabled:opacity-60 sm:ml-auto"
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </form>
          <div className="mt-6 flex items-center justify-between">
            <Label>Response</Label>
            {out && (
              <span
                className={cx(
                  "font-mono text-[12px]",
                  out.status >= 200 && out.status < 300 ? "text-leaf" : "text-flesh",
                )}
              >
                {out.status || "—"} · {out.ms} ms
              </span>
            )}
          </div>
          <pre className="mt-3 max-h-[28rem] overflow-auto border border-line p-4 font-mono text-xs leading-relaxed text-muted">
            {out ? out.body : "Press Send. The answer is live chain data."}
          </pre>
        </div>
      </div>
    </Instrument>
  );
}


type KeyRow = { id: string; label: string; tail: string; created: number; last: number | null; usesToday: number };
type KeysState = { signedIn: boolean; holder: boolean; need: number; holdDays: number; limits: { maxKeys: number; boost: number; perDay: number }; keys: KeyRow[] };

/** API keys for holders: make one (shown once), see today's use, revoke. */
function Keys() {
  const auth = useSession();
  const [st, setSt] = useState<KeysState | null>(null);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/keys", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: KeysState) => setSt(j))
      .catch(() => setSt(null));
  }, [auth.address]);

  async function call(method: "POST" | "DELETE", url: string, body?: unknown) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = (await r.json()) as { key?: string; keys?: KeyRow[]; error?: string };
      if (!r.ok) return setErr(j.error ?? "Something went wrong.");
      if (j.key) setFresh(j.key);
      if (j.keys && st) setSt({ ...st, keys: j.keys });
    } catch {
      setErr("No answer. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const lim = st?.limits;
  const signedIn = !!auth.address && !!st?.signedIn;
  const can = signedIn && !!st?.holder;
  return (
    <Instrument
      code="X-02"
      title="API keys"
      busy={busy}
      status={<Led tone={can ? "on" : "off"} label={can ? `${st?.keys.length ?? 0} of ${lim?.maxKeys ?? "—"} keys` : "For holders"} />}
      foot={<span>Only a hash of each key is stored. A key is shown once; if you lose it, revoke it and make a new one.</span>}
    >
      <div className="grid gap-px bg-line md:grid-cols-3">
        {[
          ["Without a key", "Per-minute limits per visitor"],
          ["With a key", lim ? `${lim.boost}× those limits` : "—"],
          ["Daily cap per key", lim ? `${lim.perDay.toLocaleString("en-US")} requests` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="bg-bg px-5 py-4">
            <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{k}</p>
            <p className="mt-2 text-lg text-text">{v}</p>
          </div>
        ))}
      </div>
      <div className="bg-bg p-5">
        {!signedIn ? (
          <p className="text-sm text-muted">Keys are for $CORBEL holders. Sign in with your wallet from the top bar.</p>
        ) : !st?.holder ? (
          <p className="text-sm text-muted">{`Keys open at ${st?.need.toLocaleString("en-US")} $CORBEL, counted by the lowest balance of the last ${st?.holdDays} days. The console above works without one.`}</p>
        ) : (
          <>
            <form
              className="flex flex-col gap-px bg-line sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                void call("POST", "/api/keys", { label });
              }}
            >
              <label htmlFor="key-label" className="sr-only">Key name</label>
              <input id="key-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name it, e.g. my bot" maxLength={32} className="min-w-0 flex-1 bg-bg px-3 py-3 font-mono text-xs text-text placeholder:text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-leaf" />
              <button type="submit" disabled={busy || (st?.keys.length ?? 0) >= (lim?.maxKeys ?? 0)} className="bg-leaf px-5 py-3 font-medium text-xs uppercase tracking-[0.08em] text-bg disabled:opacity-50">
                Make a key
              </button>
            </form>
            {fresh && (
              <div className="mt-4 border border-leaf p-4">
                <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-leaf">Your new key · copy it now, it is not shown again</p>
                <div className="mt-3 flex items-center gap-3">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-text">{fresh}</code>
                  <button type="button" className="ibtn-ghost h-8 shrink-0" onClick={() => void navigator.clipboard?.writeText(fresh)}>Copy</button>
                </div>
                <pre className="mt-3 overflow-auto border border-line p-3 font-mono text-[11px] text-muted">{`curl -H "x-api-key: ${fresh.slice(0, 8)}…" "https://corbel.finance/api/token?q=0x…"`}</pre>
              </div>
            )}
            {err && <p className="mt-3 text-sm text-flesh">{err}</p>}
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {(st?.keys ?? []).length === 0 && <li className="py-4 text-sm text-muted">No keys yet.</li>}
              {(st?.keys ?? []).map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
                  <span className="min-w-32 text-sm text-text">{k.label}</span>
                  <span className="font-mono text-xs text-muted">ck_…{k.tail}</span>
                  <span className="font-mono text-xs text-muted">{k.usesToday.toLocaleString("en-US")} today</span>
                  <span className="font-mono text-xs text-muted">{k.last ? `last used ${new Date(k.last).toISOString().slice(0, 16).replace("T", " ")} UTC` : "never used"}</span>
                  <button type="button" disabled={busy} className="ibtn-ghost ml-auto h-8" onClick={() => void call("DELETE", `/api/keys?id=${k.id}`)}>Revoke</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Instrument>
  );
}
