"use client";

/**
 * Earn · Transparency. Every Corbel contract in one register. Live ones first, read from the chain right now:
 * address, deploy transaction, what it holds and who controls it. Then the contracts that are written and tested
 * but not deployed, each with its guarantees and the tests that prove them. One palette: leaf for live, quiet grey
 * for not deployed; nothing else is coloured.
 */
import { useEffect, useState } from "react";
import { CONTRACTS } from "@corbel/config";
import { cx } from "@corbel/ui";
import { short } from "./kit";
import { MANDATES, MANDATES_POOL, PREDICT, PREDICT_DEPLOY, PREDICT_V1 } from "@/lib/predict";

type Res = { block: string | null; predict: { address: string; usdg: number | null; codeBytes: number | null; markets: number | null }; safe: { address: string; owners: string[]; threshold: number | null; eth: number | null; usdg: number | null } };
const SCAN = "https://robinhoodchain.blockscout.com";
const PREDICT_TESTS = [
  "Survival: YES when liquidity stays",
  "A pull at one check is NO",
  "Parking liquidity at the end does not buy YES",
  "An earlier stake weighs more",
  "A one-sided market refunds",
  "No stakes after close, no double claim",
  "Price market settles from the TWAP",
  "Below the strike is NO",
  "A last-second spike does not buy YES",
  "A missed window refunds",
  "Late settlement refunds",
  "A stalled market refunds",
  "Betting closes before the window opens",
  "Fork: a live WETH/USDG market settles from the TWAP",
  "Fuzz: always solvent",
  "A fake pair is refused",
  "Same-block reserves are refused",
  "Too few checks refunds",
  "Check spam counts once",
];

/** A reading still on its way: a bar the size of the value, never a dash. */
const Skel = () => (
  <span aria-hidden className="inline-block h-3.5 w-16 rounded bg-[#181818] align-middle" />
);

function Row({ k, v, href }: { k: string; v: React.ReactNode; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-[13px] last:border-0">
      <span className="text-muted">{k}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="truncate font-mono text-text hover:text-leaf">
          {v} ↗
        </a>
      ) : (
        <span className="truncate font-mono text-text">{v}</span>
      )}
    </div>
  );
}

export function Transparency() {
  const [r, setR] = useState<Res | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/transparency")
      .then((x) => x.json())
      .then((j: Res) => setR(j))
      .catch(() => undefined);
  }, []);
  const designed = CONTRACTS.filter((c) => c.name !== "MandateLab" && c.name !== "CorbelMandates");
  const tests = designed.reduce((a, c) => a + c.tests.length, 0) + PREDICT_TESTS.length;

  return (
    <div className="space-y-6">
      {/* the headline figures */}
      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {(
          [
            ["Live on mainnet", "3", "Predict, the mandate factory and the project Safe"],
            ["Written and tested", String(designed.length), "deployed once each layer opens"],
            ["Tests passing", String(tests), "unit, fuzz and fork tests"],
            ["External audit", "none yet", "reviewed in-house; stake small"],
          ] as const
        ).map(([k, v, s], i) => (
          <div key={k} className="bg-[#0f0f0f] p-5">
            <p className="text-[12px] text-muted">{k}</p>
            <p className={cx("mt-1.5 font-display text-4xl leading-none", i === 0 ? "text-leaf" : i === 3 ? "text-muted" : "text-text")}>{v}</p>
            <p className="mt-2 text-[12px] text-muted">{s}</p>
          </div>
        ))}
      </div>

      {/* live contracts */}
      <section className="overflow-hidden rounded-2xl border border-leaf/30 bg-[#0f0f0f]">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <span className="h-2 w-2 rounded-full bg-leaf shadow-[0_0_8px_var(--leaf)]" />
          <h2 className="text-[15px] font-semibold text-text">Live on Robinhood Chain</h2>
          <span className="ml-auto font-mono text-[12px] text-muted">{r?.block ? `read at block ${Number(r.block).toLocaleString("en")}` : "reading the chain"}</span>
        </header>
        <div className="grid gap-px bg-line">
          <div className="grid gap-x-10 gap-y-4 bg-[#0f0f0f] p-5 lg:grid-cols-2">
            <div>
            <p className="text-[16px] font-semibold text-text">CorbelPredict</p>
            <p className="mt-1 text-[13px] text-muted">YES/NO markets in USDG, settled from the chain alone: survival markets by the pool&apos;s lowest reserve, price markets by the pool&apos;s own time-weighted average price. No resolver: nobody proposes or rules on an outcome. The first Predict contract, which had a resolver, is retired.</p>
            <div className="mt-4">
              <Row k="Address" v={short(PREDICT)} href={`${SCAN}/address/${PREDICT}`} />
              <Row k="First contract (retired)" v={short(PREDICT_V1)} href={`${SCAN}/address/${PREDICT_V1}`} />
              <Row k="Deployed in" v={`block ${PREDICT_DEPLOY.block.toLocaleString("en")}`} href={`${SCAN}/tx/${PREDICT_DEPLOY.tx}`} />
              <Row k="Markets opened" v={!r ? <Skel /> : r.predict.markets == null ? "not read" : r.predict.markets === 0 ? "0, none opened yet" : r.predict.markets} />
              <Row k="USDG held for stakes" v={!r ? <Skel /> : r.predict.usdg != null ? r.predict.usdg.toFixed(2) : "not read"} />
              <Row k="Bytecode" v={!r ? <Skel /> : r.predict.codeBytes ? `${r.predict.codeBytes.toLocaleString("en")} bytes` : "not read"} />
              <Row k="Pause, upgrade, withdraw" v="none in the code" />
              <Row k="Resolver" v="none: every market settles from the chain" />
            </div>
            </div>
            <div className="rounded-xl bg-[#0d0d0d] p-4">
              <p className="flex items-baseline justify-between text-[13px] text-text">
                The tests that prove it
                <span className="font-mono text-[12px] text-leaf">{`${PREDICT_TESTS.length} passing`}</span>
              </p>
              <ul className="mt-3 grid gap-x-4 gap-y-1.5 font-mono text-[12px] sm:grid-cols-2">
                {PREDICT_TESTS.map((x) => (
                  <li key={x} className="flex gap-2 text-[#c9d6cf]">
                    <span className="text-leaf">✓</span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="bg-[#0f0f0f] p-5">
            <p className="text-[16px] font-semibold text-text">CorbelMandates</p>
            <p className="mt-1 text-[13px] text-muted">The factory for agent mandates. Every pool a trade touches must be one the owner approved (rule 06), after a report showed an agent could route the owner&apos;s money through a pool it made, and the owner can replace a bonded agent at any time. Mandates on the three earlier factories are retired.</p>
            <div className="mt-4 grid gap-x-8 lg:grid-cols-2">
              <div>
                <Row k="Factory" v={short(MANDATES_POOL.factory)} href={`${SCAN}/address/${MANDATES_POOL.factory}`} />
                <Row k="Live mandate" v={short(MANDATES_POOL.mandate)} href={`${SCAN}/address/${MANDATES_POOL.mandate}`} />
                <Row k="Deployed in" v={`block ${MANDATES_POOL.block.toLocaleString("en")}`} />
                <Row k="First factory (retired)" v={short(MANDATES.factory)} href={`${SCAN}/address/${MANDATES.factory}`} />
              </div>
              <div>
                <Row k="Trade through a pool the owner never approved" v={`refused, bond slashed ${20}%`} href={`${SCAN}/tx/${MANDATES_POOL.refused}`} />
                <Row k="Same trade after the owner approved the pool" v="traded" href={`${SCAN}/tx/${MANDATES_POOL.traded}`} />
                <Row k="Owner replaces a bonded agent" v="bond back to the agent" href={`${SCAN}/tx/${MANDATES_POOL.revoked}`} />
                <Row k="Owner can take the bond" v="no: only a broken rule moves it" />
              </div>
            </div>
          </div>
          <div className="grid gap-x-10 gap-y-4 bg-[#0f0f0f] p-5 lg:grid-cols-2">
            <div>
            <p className="text-[16px] font-semibold text-text">Project Safe</p>
            <p className="mt-1 text-[13px] text-muted">The multisig that owns Corbel&apos;s contracts and treasury. No single key can move anything.</p>
            <div className="mt-4">
              <Row k="Address" v={short(r?.safe.address ?? "0xcAEC58545DbCEF852ac834577Cd029CD3301741b")} href={`${SCAN}/address/0xcAEC58545DbCEF852ac834577Cd029CD3301741b`} />
              <Row k="Signatures needed" v={!r ? <Skel /> : r.safe.threshold != null ? `${r.safe.threshold} of ${r.safe.owners.length}` : "not read"} />
              <Row k="ETH" v={!r ? <Skel /> : r.safe.eth != null ? r.safe.eth.toFixed(4) : "not read"} />
              <Row k="USDG" v={!r ? <Skel /> : r.safe.usdg != null ? r.safe.usdg.toFixed(2) : "not read"} />
            </div>
            </div>
            <div className="rounded-xl bg-[#0d0d0d] p-4">
              <p className="text-[13px] text-text">Who signs</p>
              <p className="mt-1 text-[12px] text-muted">{r?.safe.threshold != null ? `Any ${r.safe.threshold} of these ${r.safe.owners.length} keys must sign before the Safe moves funds or changes a contract it owns.` : "Reading the signers from the Safe."}</p>
            {r && r.safe.owners.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {r.safe.owners.map((o, i) => (
                  <li key={o} className="flex items-center justify-between rounded-lg bg-[#141414] px-3 py-2 font-mono text-[12px]">
                    <span className="text-muted">{`Signer ${i + 1}`}</span>
                    <a href={`${SCAN}/address/${o}`} target="_blank" rel="noreferrer" className="text-text hover:text-leaf">
                      {short(o)} ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
            </div>
          </div>
        </div>
      </section>

      {/* written and tested, not deployed */}
      <section className="overflow-hidden rounded-2xl border border-line bg-[#0f0f0f]">
        <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <span className="h-2 w-2 rounded-full border border-[#5d6b64]" />
          <h2 className="text-[15px] font-semibold text-text">Written and tested, not deployed yet</h2>
        </header>
        <ul className="divide-y divide-line">
          {designed.map((c) => (
            <li key={c.name}>
              <button type="button" onClick={() => setOpen(open === c.name ? null : c.name)} aria-expanded={open === c.name} className="grid w-full grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-[#141414]">
                <span className="font-mono text-[13px] text-text">{c.name}</span>
                <span className="truncate text-[13px] text-muted">{c.role}</span>
                <span className="font-mono text-[12px] text-muted">{`${c.tests.length} tests ${open === c.name ? "▴" : "▾"}`}</span>
              </button>
              {open === c.name && (
                <div className="pane-in grid gap-6 bg-[#0d0d0d] px-5 pb-5 pt-2 lg:grid-cols-2">
                  <div>
                    <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Guarantees</p>
                    <ul className="mt-2 space-y-1.5 text-[13px]">
                      {c.guarantees.map((g) => (
                        <li key={g} className="text-text">
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Tests</p>
                    <ul className="mt-2 space-y-1 font-mono text-[12px]">
                      {c.tests.map((x) => (
                        <li key={x.name} className="flex gap-2 text-text">
                          <span className="text-leaf">✓</span>
                          <span className="flex-1">{x.name}</span>
                          <span className="text-[12px] uppercase text-muted">{x.kind}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
