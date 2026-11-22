"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Instrument, Led, Readout, fmtNum, short } from "./kit";
import { useLinked } from "./wallet";

type Wallet = {
  address: string;
  block: string;
  isContract: boolean;
  txCount: number;
  balances: { symbol: string; raw: string; value: string }[];
  launches: { launches: number; dead: number; checked: number } | null;
};

/** Account → Dashboard: the linked address (or any pasted one) at the latest block. Reads only /api/wallet. */
export function WalletWatch() {
  const { linked, link } = useLinked();
  const [q, setQ] = useState("");
  const [w, setW] = useState<Wallet | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = useCallback(async (v: string) => {
    const a = v.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return setErr("Paste a 0x address, 42 characters.");
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/wallet?address=${a}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error((j as { error: string }).error);
      setW(j as Wallet);
    } catch (e) {
      setErr((e as Error).message || "No answer. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  // follow the address linked in the header (wallet or watch)
  useEffect(() => {
    if (!linked) return;
    void Promise.resolve().then(() => {
      setQ(linked.address);
      void read(linked.address);
    });
  }, [linked, read]);

  return (
    <Instrument
      code="A-01"
      title="Address"
      busy={busy}
      status={<Led tone={err ? "bad" : w ? "on" : "off"} label={w ? `Block #${Number(w.block).toLocaleString("en")}` : linked ? "Reading" : "Not linked"} />}
      foot={
        w && (
          <>
            <span>{w.isContract ? "Contract" : "Wallet"} · nothing signed or sent</span>
            <Link href="/app/portfolio" className="text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
              Full portfolio →
            </Link>
          </>
        )
      }
    >
      <form
        className="border-b border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^0x[0-9a-fA-F]{40}$/.test(q.trim()) && q.trim().toLowerCase() !== linked?.address.toLowerCase()) link({ address: q.trim(), via: "watch" });
          else void read(q);
        }}
      >
        <label htmlFor="watch" className="sr-only">
          Address to read
        </label>
        <div className="ifield h-12">
          <input id="watch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="0x… any address on Robinhood Chain" spellCheck={false} autoComplete="off" className="px-4 font-mono text-sm text-text placeholder:text-muted" />
          <button type="submit" disabled={busy} className="ibtn px-6">
            {busy ? "Reading…" : "Read"}
          </button>
        </div>
        {err && <p className="mt-3 text-sm text-flesh">{err}</p>}
      </form>

      {w ? (
        <>
          <div className="grid grid-cols-3 gap-px bg-line">
            {w.balances.map((b) => (
              <Readout key={b.symbol} label={b.symbol} value={fmtNum(Number(b.value))} dim={b.raw === "0"} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
            <Readout label="Address" value={<span className="font-mono text-base">{short(w.address)}</span>} />
            <Readout label="Transactions sent" value={w.txCount.toLocaleString("en")} />
            <Readout label="Pools launched" value={w.launches?.launches ?? "—"} sub={w.launches?.checked ? `${w.launches.dead} drained of ${w.launches.checked} known` : undefined} tone={w.launches && w.launches.launches > 5 ? "bad" : undefined} />
            <Readout label="Type" value={w.isContract ? "Contract" : "Wallet"} />
          </div>
          {w.isContract && (
            <p className="border-t border-line px-4 py-3 text-sm text-muted">
              This is a contract.{" "}
              <Link href={`/app/trust/check?q=${w.address}`} className="text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
                Run a Trust check on it →
              </Link>
            </p>
          )}
        </>
      ) : (
        <p className="px-4 py-6 text-sm text-muted">Link a wallet at the top, or paste any address. Balances are read at the latest block.</p>
      )}
    </Instrument>
  );
}
