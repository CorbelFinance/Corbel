"use client";

/**
 * Check · Address: paste any address and see what it is and what it did over the last two days, from the chain.
 * A wallet, a smart-account wallet (EIP-7702) or a contract; a likely relay (many transactions sent, almost no tokens
 * of its own moved: a DEX shows it "selling" other people's coins); token moves per token, through contracts (pools,
 * routers) or wallets; the first token transfer in; and the addresses it exchanged tokens with most.
 */
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument, Readout } from "./kit";

type Kind = "wallet" | "smart-wallet" | "contract";
type R = {
  address: string;
  kind: Kind;
  delegate: string | null;
  txCount: number;
  relay: boolean;
  window: { from: string; to: string; days: number; partial?: boolean };
  moves: number;
  tokens: { token: string; symbol: string; in: number; out: number; viaContracts: number; viaWallets: number; transfers: number }[];
  firstIn: { from: string; token: string; symbol: string; amount: number; block: string; tx: string } | null;
  counterparties: { address: string; kind: Kind; transfers: number }[];
  holds?: { eth: number; tokens: { token: string; symbol: string; amount: number }[] };
  error?: string;
};
const SCAN = "https://robinhoodchain.blockscout.com";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const num = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M` : v >= 1e3 ? `${(v / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 })}K` : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
// the real base tokens: anything else wearing their ticker is a copy
const REAL: Record<string, string> = { USDG: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", WETH: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", CORBEL: "0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1" };
const KIND: Record<Kind, string> = { wallet: "Wallet", "smart-wallet": "Smart-account wallet", contract: "Contract" };

export function AddressCheck() {
  const [q, setQ] = useState("");
  const [r, setR] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);

  // a link like ?a=0x… (from a counterparty row) opens with that address read
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("a");
    if (a && /^0x[0-9a-fA-F]{40}$/.test(a)) {
      setQ(a);
      void check(undefined, a);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function check(e?: React.FormEvent, given?: string) {
    e?.preventDefault();
    const a = (given ?? q).trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return setR({ error: "Paste a full address: 0x and 40 characters." } as R);
    setBusy(true);
    setR(null);
    try {
      const x = await fetch(`/api/address?a=${a}`);
      setR((await x.json()) as R);
    } catch {
      setR({ error: "No answer. Try again." } as R);
    } finally {
      setBusy(false);
    }
  }

  const verdict = !r || r.error ? null : r.relay
    ? { tone: "caution", text: "A relay: it sends transactions for smart wallets and moves almost no tokens of its own. A DEX can show it buying or selling coins it never held." }
    : r.kind === "contract"
      ? { tone: "plain", text: "A contract: a pool, router, token or app. Open it on the explorer to see its code." }
      : r.kind === "smart-wallet"
        ? { tone: "plain", text: "A person's wallet with a smart account turned on (EIP-7702). It counts as a wallet, not a contract." }
        : { tone: "plain", text: "A plain wallet." };

  return (
    <Instrument code="C-08" title="Check any address" foot={<span>{r && !r.error ? `${r.window.partial ? "A very busy address: only its newest blocks are read," : `Token moves over the last ${r.window.days} days,`} blocks ${Number(r.window.from).toLocaleString("en-US")}–${Number(r.window.to).toLocaleString("en-US")}. ETH sent directly leaves no log and is not counted.` : "Read from the chain. A read takes up to a minute."}</span>}>
      <form onSubmit={check} className="flex flex-wrap gap-2 px-4 py-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="0x… any wallet or contract" spellCheck={false} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-[#0b0b0b] px-3 font-mono text-[13.5px] text-text outline-none focus:border-leaf" />
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-leaf px-5 text-[14px] font-semibold text-[#0b0b0b] disabled:opacity-60">{busy ? "Reading…" : "Check"}</button>
      </form>
      {busy && <p className="caret px-4 pb-5 font-mono text-[13px] text-muted">Reading two days of transfers</p>}
      {r?.error && <p className="px-4 pb-5 text-[14px] text-flesh">{r.error}</p>}
      {r && !r.error && verdict && (
        <div className="space-y-px bg-line">
          <div className="bg-bg px-4 py-4">
            <p className="font-mono text-[12px] text-muted">
              <a href={`${SCAN}/address/${r.address}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{r.address} ↗</a>
            </p>
            <p className={cx("mt-2 text-[15px]", verdict.tone === "caution" ? "text-amber" : "text-text")}>{verdict.text}</p>
            {r.delegate && <p className="mt-1 font-mono text-[12px] text-muted">{`Smart account code from ${short(r.delegate)}`}</p>}
          </div>
          <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
            <Readout label="Kind" value={r.relay ? "Relay" : KIND[r.kind]} tone={r.relay ? undefined : undefined} />
            <Readout label="Transactions sent" value={r.txCount.toLocaleString("en-US")} sub="all time" />
            <Readout label="Token moves" value={r.moves.toLocaleString("en-US")} sub={r.window.partial ? "newest blocks only" : `last ${r.window.days} days`} />
            <Readout label="Tokens touched" value={String(r.tokens.length)} sub={r.tokens.length >= 12 ? "top 12 shown" : "in the window"} />
          </div>
          {r.holds && (
            <div className="bg-bg px-4 py-4">
              <p className="text-[12px] uppercase tracking-[0.08em] text-muted">{`Holds now · block ${Number(r.window.to).toLocaleString("en-US")}`}</p>
              <ul className="mt-3 flex flex-wrap gap-2 text-[13.5px]">
                <li className="rounded-xl border border-line px-3 py-1.5"><span className="font-mono tabular-nums text-text">{num(r.holds.eth)}</span><span className="ml-1.5 text-muted">ETH</span></li>
                {r.holds.tokens.map((t) => (
                  <li key={t.token} className="rounded-xl border border-line px-3 py-1.5">
                    <span className="font-mono tabular-nums text-text">{num(t.amount)}</span>
                    <a href={`/app/trust/check?q=${t.token}`} className="ml-1.5 text-muted underline-offset-4 hover:underline">{t.symbol}</a>
                    {REAL[t.symbol.toUpperCase()] && REAL[t.symbol.toUpperCase()] !== t.token && <span className="ml-1.5 font-mono text-[10.5px] uppercase text-amber">copy</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-muted">Tokens it moved in the window and still has. Older holdings it never moved lately are not listed.</p>
            </div>
          )}
          {r.firstIn && (
            <div className="bg-bg px-4 py-3 text-[14px] text-muted">
              {"First token in: "}
              <span className="text-text">{`${num(r.firstIn.amount)} ${r.firstIn.symbol}`}</span>
              {" from "}
              <a href={`${SCAN}/address/${r.firstIn.from}`} target="_blank" rel="noreferrer" className="font-mono text-text underline-offset-4 hover:underline">{short(r.firstIn.from)}</a>
              {" · "}
              <a href={`${SCAN}/tx/${r.firstIn.tx}`} target="_blank" rel="noreferrer" className="font-mono underline-offset-4 hover:underline">{`block ${Number(r.firstIn.block).toLocaleString("en-US")} ↗`}</a>
            </div>
          )}
          {r.tokens.length > 0 && (
            <div className="overflow-x-auto bg-bg">
              <table className="w-full min-w-[620px] border-collapse text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line text-[12px] uppercase tracking-[0.08em] text-muted">
                    {["Token", "In", "Out", "Through pools and routers", "With wallets"].map((h, i) => (
                      <th key={h} scope="col" className={cx("px-4 py-2.5 font-normal", i > 0 && "text-right")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.tokens.map((t) => (
                    <tr key={t.token + t.in + t.out} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-2.5 font-semibold text-text">
                        <a href={`/app/trust/check?q=${t.token}`} className="underline-offset-4 hover:underline">{t.symbol}</a>
                        <span className="ml-2 font-mono text-[12px] font-normal text-muted">{short(t.token)}</span>
                        {REAL[t.symbol.toUpperCase()] && REAL[t.symbol.toUpperCase()] !== t.token && <span className="ml-2 rounded border border-amber/50 bg-amber/10 px-1.5 py-px font-mono text-[10.5px] font-normal uppercase tracking-[0.06em] text-amber">{`not the real ${t.symbol}`}</span>}
                      </th>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-leaf">{t.in ? num(t.in) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-flesh">{t.out ? num(t.out) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text">{t.viaContracts}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text">{t.viaWallets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.counterparties.length > 0 && (
            <div className="bg-bg px-4 py-4">
              <p className="text-[12px] uppercase tracking-[0.08em] text-muted">Moves tokens with most</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {r.counterparties.map((c) => (
                  <li key={c.address} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-[13.5px]">
                    <a href={`/app/trust/address?a=${c.address}`} onClick={(e) => (e.preventDefault(), setQ(c.address), void check(undefined, c.address), window.history.replaceState(null, "", `?a=${c.address}`))} className="font-mono text-text underline-offset-4 hover:underline">{short(c.address)}</a>
                    <span className="text-muted">{KIND[c.kind]}</span>
                    <span className="font-mono tabular-nums text-text">{`${c.transfers}×`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Instrument>
  );
}
