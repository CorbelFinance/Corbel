"use client";

/**
 * Compute · Credits. One balance for models and GPUs. A credit pays for one dollar of compute at the listed price;
 * it is bought with USDG, ETH or stock tokens on Robinhood Chain, unused credits go back as USDG, and every charge
 * gets a receipt on chain. The calculator shows, at today's live prices, what a deposit buys. Payments open later:
 * the buy button says so.
 */
import { useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { CountUp, SubTabs } from "../app/Bay";
import { leadPicks, Monogram, makerName, money, useCatalog, type Gpu, type Model } from "./data";

const REPLY = { in: "2K", out: "800" };
const PAY = [
  { id: "USDG", label: "USDG" },
  { id: "ETH", label: "ETH" },
  { id: "STOCK", label: "Stock token" },
  { id: "TOKEN", label: "Corbel token" },
] as const;

export function Credits() {
  const { rows: models } = useCatalog<Model>("models");
  const { rows: gpus } = useCatalog<Gpu>("gpus");
  const [pay, setPay] = useState<(typeof PAY)[number]["id"]>("USDG");
  const [amt, setAmt] = useState(50);
  const credits = amt;

  // what the deposit buys today, from live list prices: a reply is 2K tokens in and 800 out
  const buys = useMemo(() => {
    if (!models) return [];
    const reply = (m: Model) => (m.pin * 2000 + m.pout * 800) / 1e6;
    const lead = (k: Model["kind"], n: number) => leadPicks(models, (x) => (x.kind === k || (k === "text" && x.kind === "vision")) && (x.pin > 0 || !!x.pimg), n);
    const rows: { k: string; maker: string; unit: string; n: number }[] = [];
    for (const m of lead("text", 4)) if (reply(m) > 0) rows.push({ k: m.name, maker: m.maker, unit: "replies", n: credits / reply(m) });
    for (const m of lead("image", 2)) if (m.pimg) rows.push({ k: m.name, maker: m.maker, unit: "images", n: credits / m.pimg });
    for (const g of (gpus ?? []).filter((x) => [24, 80].includes(x.vram)).slice(0, 2)) {
      const p = Math.min(g.community ?? 1e9, g.secure ?? 1e9);
      rows.push({ k: g.name, maker: "gpu", unit: "GPU hours", n: credits / p });
    }
    return rows;
  }, [models, gpus, credits]);

  return (
    <div className="compute grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-4">
        <section className="cmp-stage card-in relative overflow-hidden rounded-[28px] border border-[#3a2418] p-6 sm:p-8">
          <span aria-hidden className="cmp-glow" />
          <p className="relative font-mono text-[12px] text-[#ff9a5c]">AI credits</p>
          <h2 className="relative mt-1 max-w-xl font-display text-3xl tracking-tight text-text sm:text-4xl">One credit is one dollar of compute.</h2>
          <p className="relative mt-2 max-w-xl text-[14px] text-[#d8c2b4]">Every model and every GPU on Corbel is paid from the same credits, at the listed price. No subscriptions, no seats.</p>
          <div className="relative mt-6 grid gap-3 sm:grid-cols-4">
            {[
              ["Buy", "With USDG, ETH or a stock token on Robinhood Chain."],
              ["Spend", "Each reply, image or GPU second takes its listed price."],
              ["Prove", "Every charge gets a receipt you can check on chain."],
              ["Leave", "Unused credits go back to your wallet as USDG."],
            ].map(([k, v], i) => (
              <div key={k} className="tile-in rounded-2xl border border-[#3a2418] bg-[#140d0a]/90 p-4" style={{ animationDelay: `${i * 0.06}s` }}>
                <p className="font-mono text-[12px] text-[#ff9a5c]">{`0${i + 1}`}</p>
                <p className="mt-1 text-[14px] font-semibold text-text">{k}</p>
                <p className="mt-1 text-[12px] text-muted">{v}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-[#2e1f17] bg-[#0f0a08] p-5">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-[16px] font-semibold text-text">{`What ${credits} credits buy today`}</h2>
            <span className="text-[12px] text-muted">{`Live list prices. A reply here is ${REPLY.in} tokens in and ${REPLY.out} out.`}</span>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {buys.map((b, i) => (
              <li key={b.k + b.unit} className="tile-in flex items-center gap-3 rounded-2xl border border-[#2e1f17] bg-[#110c0a] px-4 py-3" style={{ animationDelay: `${i * 0.04}s` }}>
                {b.maker === "gpu" ? <span className="grid h-[34px] w-[34px] place-items-center rounded-xl bg-[#2a1b13] font-mono text-[12px] text-[#f2c46d]">GPU</span> : <Monogram maker={b.maker} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-text">{b.k}</span>
                  <span className="block text-[12px] text-muted">{b.maker === "gpu" ? "rented by the second" : makerName(b.maker)}</span>
                </span>
                <span className="text-right">
                  <span className="block font-mono text-[18px] text-[#ffcfae]">
                    <CountUp value={b.n} fmt={(n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n >= 10 ? Math.round(n).toLocaleString("en") : n.toFixed(1))} />
                  </span>
                  <span className="block text-[12px] text-muted">{b.unit}</span>
                </span>
              </li>
            ))}
            {!models && <li className="col-span-2 py-10 text-center text-[13px] text-muted">Reading live prices…</li>}
          </ul>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-[150px] xl:self-start">
        <section className="rounded-[24px] border border-[#3a2418] bg-[#120c0a] p-5">
          <p className="text-[12px] text-muted">Your balance</p>
          <p className="mt-1 font-mono text-[34px] text-text">0.00</p>
          <p className="text-[12px] text-muted">credits</p>
          <div className="compute-tabs mt-5">
            <SubTabs label="Pay with" value={pay} onChange={setPay} tabs={PAY} />
          </div>
          <label className="mt-4 block">
            <span className="flex justify-between text-[12px] text-muted">
              Deposit
              <span className="font-mono text-[#ffcfae]">{money(amt)}</span>
            </span>
            <input type="range" min={5} max={1000} step={5} value={amt} onChange={(e) => setAmt(Number(e.target.value))} className="mt-1 w-full accent-[#ff9a5c]" />
          </label>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[10, 50, 100, 500].map((x) => (
              <button key={x} type="button" onClick={() => setAmt(x)} className={cx("rounded-lg py-1.5 font-mono text-[12px]", amt === x ? "bg-[#ff9a5c] text-[#1a0d06]" : "bg-[#1d130e] text-[#e9d6c8]")}>
                {money(x)}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-[#1c130e] px-4 py-3">
            <p className="text-[12px] text-muted">You get</p>
            <p className="font-mono text-[24px] text-text">
              <CountUp value={credits} fmt={(n) => n.toFixed(2)} />
              <span className="ml-1.5 text-[12px] text-muted">credits</span>
            </p>
            <p className="text-[12px] text-muted">{pay === "TOKEN" ? "Holders of the Corbel token get a lower credit price, set at launch." : "One credit per dollar deposited."}</p>
          </div>
          <button type="button" disabled className="mt-4 w-full cursor-not-allowed rounded-2xl bg-[#3a2418] py-3 text-[14px] font-semibold text-[#d8c2b4]">
            Payments open soon
          </button>
          <p className="mt-2 text-[12px] text-muted">The credits contract is not deployed yet. Nothing here takes money.</p>
        </section>
        <section className="rounded-[24px] border border-[#2e1f17] bg-[#110c0a] p-5 text-[12.5px]">
          <p className="text-text">For agents</p>
          <p className="mt-1 text-muted">An agent can spend credits under a mandate: a daily cap, only the models you list, every charge logged. The same Guard that checks its trades checks its spending.</p>
        </section>
      </aside>
    </div>
  );
}
