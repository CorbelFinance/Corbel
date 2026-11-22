"use client";

/**
 * Wallet · Approvals (Shield). Which contracts may move this wallet's tokens, how much, and how risky each is; a
 * dangerous approval is revoked here with one transaction the visitor signs in their own wallet: approve(spender, 0).
 * Corbel never holds or moves anything.
 */
import { useCallback, useState } from "react";
import { encodeFunctionData, formatUnits, type Hex } from "viem";
import { cx } from "@corbel/ui";
import { Bay } from "./Bay";
import { Verdict, short } from "./kit";
import { WalletPick } from "./WalletPick";
import { useLinked } from "./wallet";
import { ERC20, EXPLORER, niceError, ready, send } from "./walletTx";

type A = { token: string; symbol: string; decimals: number; spender: string; spenderName: string | null; spenderIsContract: boolean; allowance: string; unlimited: boolean; balance: string; risk: "danger" | "caution" | "ok"; why: string };
type R = { owner: string; block: string; windows: number; fromBlock: string; approvals: A[]; ms: number; error?: string };
const SCAN = "https://robinhoodchain.blockscout.com";
const TONE = { danger: "text-flesh", caution: "text-amber", ok: "text-leaf" } as const;
const LABEL = { danger: "Danger", caution: "Check", ok: "Known" } as const;

const amount = (raw: string, dec: number) => {
  const v = Number(formatUnits(BigInt(raw), dec));
  return v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

export function Approvals() {
  const { linked } = useLinked();
  const [addr, setAddr] = useState<string | null>(null);
  const [r, setR] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tx, setTx] = useState<Record<string, { state: "busy" | "done" | "error"; msg?: string; hash?: string }>>({});

  const load = useCallback(async (a: string, fresh = false) => {
    setAddr(a);
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/approvals?address=${a}${fresh ? "&fresh=1" : ""}`, { cache: "no-store" });
      const j = (await res.json()) as R;
      if (!res.ok || j.error) return setErr(j.error ?? "The chain did not answer.");
      setR(j);
    } catch {
      setErr("No answer. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const mine = !!linked && linked.via === "wallet" && !!addr && linked.address.toLowerCase() === addr.toLowerCase();

  async function revoke(a: A) {
    const k = `${a.token}:${a.spender}`;
    setTx((x) => ({ ...x, [k]: { state: "busy" } }));
    try {
      const p = await ready(linked?.rdns);
      const data = encodeFunctionData({ abi: ERC20, functionName: "approve", args: [a.spender as Hex, 0n] }) as Hex;
      // send() waits for the block and throws when the revoke reverts
      const hash = await send(p, linked!.address, a.token, data, "The revoke");
      setTx((x) => ({ ...x, [k]: { state: "done", hash } }));
      if (addr) void load(addr, true);
    } catch (e) {
      setTx((x) => ({ ...x, [k]: { state: "error", msg: niceError(e, "The wallet did not sign.") } }));
    }
  }

  const n = r?.approvals.length ?? 0;
  const danger = r?.approvals.filter((x) => x.risk === "danger").length ?? 0;
  const caution = r?.approvals.filter((x) => x.risk === "caution").length ?? 0;
  return (
    <div className="space-y-4">
      <Bay
        tone="violet"
        kicker="Shield · read-only until you sign"
        title="Who can move this wallet's tokens"
        busy={busy}
        foot={<span>{r ? `Approvals signed in the last ${r.windows} log windows (from block ${Number(r.fromBlock).toLocaleString("en-US")}), plus the routers most wallets approve. Older ones to other contracts may not show.` : "Reads Robinhood Chain only. Nothing is signed unless you press Revoke on your own wallet."}</span>}
      >
        <div className="py-4">
          <WalletPick onPick={(a) => void load(a)} busy={busy} cta="Check approvals" />
          {err && <p className="mx-5 mt-3 text-[13px] text-flesh">{err}</p>}
        </div>
      </Bay>

      {!r && (
        <section aria-label="How approvals are judged" className="overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
          <header className="border-b border-line px-5 py-3.5">
            <p className="text-[15px] font-semibold text-text">How each approval is judged</p>
            <p className="text-[13px] text-muted">Every live approval of the wallet lands in one of three rows, read from the chain, never guessed.</p>
          </header>
          <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              ["danger", "The spender is a plain wallet, not a contract", "A person can take the tokens whenever they like. Revoke first.", "approve → wallet 0x…"],
              ["caution", "Unlimited to a contract few wallets use", "Unknown code may take all of the token later. Revoke if you no longer use it.", "approve → contract, ∞"],
              ["ok", "A router or contract many wallets approve", "Expected for trading. Kept unless you want a clean slate.", "approve → known router"],
            ].map(([k, rule, act, sig]) => (
              <div key={k} className="space-y-2 px-5 py-4">
                <p className={cx("font-mono text-[13px]", TONE[k as keyof typeof TONE])}>{LABEL[k as keyof typeof LABEL]}</p>
                <p className="text-[14px] text-text">{rule}</p>
                <p className="text-[13.5px] text-muted">{act}</p>
                <p className="font-mono text-[12.5px] text-muted">{sig}</p>
              </div>
            ))}
          </div>
          <p className="border-t border-line px-5 py-3 text-[13.5px] text-muted">
            Revoke sends one transaction from your own wallet: <span className="font-mono text-text">approve(spender, 0)</span>. The page only reads until you press it.
          </p>
        </section>
      )}

      {r && (
        <Verdict
          kicker={danger ? "Act now" : caution ? "Worth a look" : "Nothing risky found"}
          tone={danger ? "bad" : caution ? "caution" : "good"}
          value={danger + caution}
          valueLabel={`risky of ${n} live approvals`}
          facts={[
            ["Danger", String(danger)],
            ["Check", String(caution)],
            ["Known contracts", String(n - danger - caution)],
            ["Read in", `${(r.ms / 1000).toFixed(1)} s`],
          ]}
        >
          {danger
            ? "A person, not a contract, can take some of these tokens. Revoke those first."
            : caution
              ? "Some unknown contracts can take all of a token. If you do not use them, revoke."
              : n
                ? "Every approval goes to a contract many wallets use."
                : "This wallet has no live token approvals in the window read."}
        </Verdict>
      )}

      {r && n > 0 && (
        <section className="overflow-hidden rounded-2xl border border-line bg-[#0e0e0e]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.08em] text-muted">
                  {["Risk", "Token", "Spender", "May take", "You hold", ""].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.approvals.map((a) => {
                  const k = `${a.token}:${a.spender}`;
                  const t = tx[k];
                  return (
                    <tr key={k} className="border-b border-line/60 align-top">
                      <td className="px-4 py-3">
                        <span className={cx("font-mono text-[12px] uppercase tracking-[0.08em]", TONE[a.risk])}>{LABEL[a.risk]}</span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={`${SCAN}/token/${a.token}`} target="_blank" rel="noreferrer" className="font-mono text-text hover:underline">{a.symbol}</a>
                      </td>
                      <td className="px-4 py-3">
                        <a href={`${SCAN}/address/${a.spender}`} target="_blank" rel="noreferrer" className="font-mono text-text hover:underline">{a.spenderName ?? short(a.spender)} ↗</a>
                        <p className="mt-1 max-w-[22rem] text-[12.5px] text-muted">{a.why}</p>
                      </td>
                      <td className={cx("px-4 py-3 font-mono", a.unlimited ? "text-amber" : "text-text")}>{a.unlimited ? "Everything" : amount(a.allowance, a.decimals)}</td>
                      <td className="px-4 py-3 font-mono text-text">{amount(a.balance, a.decimals)}</td>
                      <td className="px-4 py-3 text-right">
                        {mine ? (
                          t?.state === "done" ? (
                            <a href={EXPLORER + t.hash} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-leaf underline underline-offset-4">Revoked ↗</a>
                          ) : (
                            <>
                              <button type="button" disabled={t?.state === "busy"} onClick={() => void revoke(a)} className={cx("h-9 rounded-lg border px-4 text-[13px] font-semibold disabled:opacity-50", a.risk === "ok" ? "border-line text-muted hover:text-text" : "border-flesh/60 text-flesh hover:bg-flesh/10")}>
                                {t?.state === "busy" ? "Confirm in wallet…" : "Revoke"}
                              </button>
                              {t?.state === "error" && <p className="mt-1 text-[12px] text-flesh">{t.msg}</p>}
                            </>
                          )
                        ) : (
                          <span className="text-[12px] text-muted">Connect this wallet to revoke</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-3 text-[12.5px] text-muted">Revoke sends approve(spender, 0) on that token from your wallet. It costs a little gas and moves no tokens.</p>
        </section>
      )}
    </div>
  );
}
