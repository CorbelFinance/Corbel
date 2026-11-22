"use client";

/**
 * Home · done on mainnet. Left: the transactions that prove each part works, each one a link to the explorer, laid out
 * as a ledger in the order they happened. Right: one live number per part of the app, read from the same APIs the app
 * uses (launches today, stock tokens and venues, decisions of the mandate contract, pools with 30 days of history).
 * Numbers that cannot be read show a dash; nothing here is typed in by hand.
 */
import { useEffect, useState } from "react";
import { Label, Section } from "@corbel/ui";

const TX = "https://robinhoodchain.blockscout.com/tx/";
const ADDR = "https://robinhoodchain.blockscout.com/address/";
const LEDGER = [
  { part: "Agents", what: "Trade through a pool the owner never approved: refused, bond slashed", hash: "0xffbc4d37dc2f4d9a97fc8d93532b227f7307994b1cff597d758e3dd6f63a66b2", bad: true },
  { part: "Agents", what: "Same trade after the owner approved the pool: traded", hash: "0xa3d349505cb872a9ac63c9c49c4919a5927a0b1c33c6578f25f31fa4fd49a411", bad: false },
  { part: "Agents", what: "Owner replaces a bonded agent: bond back to it", hash: "0xb624936c903bcffe89b0263ffbd981718e6455083575d33f3045dd1b3f7ef4ea", bad: false },
  { part: "Agents", what: "Mandate trade inside the rules: traded", hash: "0x4123e918c4bf8c69e8269c0ede8f283ab9c302f1ca78b359d6c6ca7c41ccd5d3", bad: false },
  { part: "Agents", what: "Trade over the cap: refused, bond slashed", hash: "0x43b9712c227200e39313221ea5e4a3feae0f21fc3ea25f9efbeac8c645ff703e", bad: true },
  { part: "Agents", what: "Agent posts its bond", hash: "0x48a4a71da52e47ceabd7fc92a08f139fb3106c417b305dd6004b947d4da21943", bad: false },
  { part: "Terminal", what: "Buy from the terminal's own ticket", hash: "0x49134c335fc036ed9508f5c239e4483ed837daf1a550f79fb23046e0542c2a08", bad: false },
  { part: "Swap", what: "Swap on Corbel's quote from the live site", hash: "0x64a441c3a5b99c05c71d2111883405bf877989905b909a390dd8b61b7362aebf", bad: false },
  { part: "Predict", what: "Survival market opened (still open)", hash: "0x480675d2daadfdb0ff1e320a6337f44d1d2f52772eee55996b7d67690ce1760b", bad: false },
  { part: "Predict", what: "Stake on YES", hash: "0x511547f81bf945d7726d46045fbe884fdcf26898659dfb58829e9fc0bf7058b5", bad: false },
];
const CONTRACTS = [
  { name: "CorbelPredict", addr: "0x62230624777b012a316e365c7ab3677159cd73d9" },
  { name: "CorbelMandates", addr: "0x5d4e2ac56fa803e2f9a6403853f6f69acc24de04" },
  { name: "Safe, 2 of 3", addr: "0xcAEC58545DbCEF852ac834577Cd029CD3301741b" },
];

type Num = { k: string; v: string | null; sub: string; href: string };
const n0 = (v: number) => v.toLocaleString("en");
const get = <T,>(u: string) =>
  fetch(u)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);

export function OnChain() {
  const [nums, setNums] = useState<Num[]>([
    { k: "Check", v: null, sub: "tokens launched today, each one watched", href: "/app/trust/radar" },
    { k: "Stocks", v: null, sub: "stock tokens across venues", href: "/app/stocks/market" },
    { k: "Agents", v: null, sub: "decisions by the mandate contract", href: "/app/agents/log" },
    { k: "Earn", v: null, sub: "pools with a fee history", href: "/app/account/pools" },
  ]);
  useEffect(() => {
    let off = false;
    const set = (i: number, v: string | null, sub?: string) => !off && setNums((s) => s.map((x, j) => (j === i ? { ...x, v, ...(sub ? { sub } : {}) } : x)));
    void get<{ counts?: { day: number } }>("/api/pads/brief").then((j) => set(0, j?.counts ? n0(j.counts.day) : "—"));
    void get<{ totals?: { stocks: number; venues: number } }>("/api/stockmarket").then((j) => set(1, j?.totals ? n0(j.totals.stocks) : "—", j?.totals ? `stock tokens on ${j.totals.venues} venues` : undefined));
    void get<{ totals?: { runs: number; stopped: number } | null }>("/api/mandate?log").then((j) => set(2, j?.totals ? n0(j.totals.runs) : "—", j?.totals ? `decisions, ${j.totals.stopped} stopped by a rule` : undefined));
    void get<{ rows?: unknown[] }>("/api/earn").then((j) => set(3, j?.rows ? n0(j.rows.length) : "—"));
    return () => {
      off = true;
    };
  }, []);

  return (
    <Section id="onchain" nav="On chain" className="border-t border-line py-24 sm:py-32">
      <div className="grid gap-6 lg:grid-cols-12">
        <Label className="lg:col-span-3">06 / ON CHAIN</Label>
        <h2 className="font-display text-4xl lg:col-span-9">Done on mainnet, not promised.</h2>
      </div>
      <div className="mt-14 grid gap-12 lg:grid-cols-12">
        {/* the ledger */}
        <div className="lg:col-span-7">
          <ol className="border-t border-line">
            {LEDGER.map((t) => (
              <li key={t.hash} className="work-row work-row-mid relative grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-line px-3 py-3.5">
                <span aria-hidden className="work-fill">
                  {Array.from({ length: 28 }, (_, k) => (
                    <span key={k} style={{ ["--k" as string]: k, ["--d" as string]: Math.abs(k - 13.5) }} />
                  ))}
                </span>
                <span className="relative font-mono text-[12px] uppercase tracking-[0.08em]">{t.part}</span>
                <span className={t.bad ? "work-bad relative text-flesh transition-colors duration-300" : "relative text-text"}>{t.what}</span>
                <a href={`${TX}${t.hash}`} target="_blank" rel="noreferrer" className="work-addr relative font-mono text-[12px] text-leaf underline underline-offset-2 transition-colors duration-300">
                  {`${t.hash.slice(0, 8)}…${t.hash.slice(-4)}`}
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[12px] text-muted">
            {CONTRACTS.map((c) => (
              <a key={c.addr} href={`${ADDR}${c.addr}`} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-text">
                {`${c.name} ${c.addr.slice(0, 6)}…${c.addr.slice(-4)}`}
              </a>
            ))}
          </p>
        </div>
        {/* one live number per part of the app */}
        <dl className="grid gap-px self-start bg-line sm:grid-cols-2 lg:col-span-5">
          {nums.map((x) => (
            <div key={x.k} className="bg-bg p-5">
              <dt className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{x.k}</dt>
              <dd>
                <a href={x.href} className="mt-2 block font-display text-[2.6rem] leading-none tabular-nums text-text hover:text-leaf">
                  {x.v ?? <span className="text-[#303030]">···</span>}
                </a>
                <span className="mt-2 block text-[13px] text-muted">{x.sub}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
