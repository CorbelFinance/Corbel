"use client";

/**
 * Compute · GPUs. Every GPU type with its hourly rate (secure cloud and community hosts), the price per second
 * and per GB of memory, and a fit finder: tell it the model size and precision and it lights the GPUs that hold
 * it and the cheapest of them. Renting opens with payments; the prices are live now.
 */
import { useMemo, useState } from "react";
import { cx } from "@corbel/ui";
import { CountUp, SubTabs } from "../app/Bay";
import { money, useCatalog, type Gpu } from "./data";

const VRAM = [
  { id: "0", label: "Any" },
  { id: "24", label: "24 GB+" },
  { id: "48", label: "48 GB+" },
  { id: "80", label: "80 GB+" },
  { id: "140", label: "140 GB+" },
] as const;
const PREC = [
  { id: "16", label: "FP16" },
  { id: "8", label: "8-bit" },
  { id: "4", label: "4-bit" },
] as const;
const low = (g: Gpu) => Math.min(g.community ?? 1e9, g.secure ?? 1e9);

export function Gpus() {
  const { rows, at } = useCatalog<Gpu>("gpus");
  const [vram, setVram] = useState<(typeof VRAM)[number]["id"]>("0");
  const [params, setParams] = useState(8);
  const [prec, setPrec] = useState<(typeof PREC)[number]["id"]>("16");
  const [cloud, setCloud] = useState<"low" | "secure">("low");
  // weights at the chosen precision, plus a fifth for the cache and activations
  const need = Math.ceil(((params * Number(prec)) / 8) * 1.2);
  const list = useMemo(
    () =>
      (rows ?? [])
        .filter((g) => g.vram >= Number(vram))
        .sort((a, b) => (cloud === "low" ? low(a) - low(b) : (a.secure ?? 1e9) - (b.secure ?? 1e9))),
    [rows, vram, cloud],
  );
  const fits = list.filter((g) => g.vram >= need);
  const best = fits[0];
  const price = (g: Gpu) => (cloud === "low" ? low(g) : (g.secure ?? low(g)));
  const max = Math.max(1, ...list.map(price));

  // hourly renting of any GPU opens with Credits: until then the market is shown blurred under a Soon plate
  return (
    <div className="relative max-h-[560px] overflow-hidden rounded-[24px]">
      <div
        inert
        aria-hidden
        className="compute pointer-events-none grid select-none gap-4 [filter:blur(5px)] opacity-60 xl:grid-cols-[22rem_minmax(0,1fr)]"
      >
        <aside className="space-y-4 xl:sticky xl:top-[150px] xl:self-start">
          <section className="cmp-stage card-in relative overflow-hidden rounded-[24px] border border-[#3a2418] p-5">
            <span aria-hidden className="cmp-glow" />
            <p className="relative font-mono text-[12px] text-[#ff9a5c]">Fit finder</p>
            <h2 className="relative mt-1 text-[18px] font-semibold text-text">Which GPU runs my model?</h2>
            <label className="relative mt-4 block">
              <span className="flex justify-between text-[12px] text-muted">
                Model size
                <span className="font-mono text-[#ffcfae]">{`${params}B parameters`}</span>
              </span>
              <input
                type="range"
                min={1}
                max={405}
                step={1}
                value={params}
                onChange={(e) => setParams(Number(e.target.value))}
                className="mt-1 w-full accent-[#ff9a5c]"
              />
            </label>
            <div className="relative mt-2 flex flex-wrap gap-1.5">
              {[3, 8, 14, 32, 70, 120, 235].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setParams(p)}
                  aria-pressed={params === p}
                  className={cx(
                    "rounded-lg px-2 py-1 font-mono text-[12px]",
                    params === p ? "bg-[#ff9a5c] text-[#1a0d06]" : "bg-[#1d130e] text-[#e9d6c8]",
                  )}
                >
                  {`${p}B`}
                </button>
              ))}
            </div>
            <div className="relative mt-3 flex items-center justify-between">
              <span className="text-[12px] text-muted">Precision</span>
              <div className="compute-tabs">
                <SubTabs label="Precision" value={prec} onChange={setPrec} tabs={PREC} />
              </div>
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[#1c130e] px-3 py-2">
                <p className="text-[12px] text-muted">Memory it needs</p>
                <p className="font-mono text-[20px] text-text">
                  <CountUp value={need} fmt={(n) => `${Math.round(n)} GB`} />
                </p>
              </div>
              <div className="rounded-xl bg-[#1c130e] px-3 py-2">
                <p className="text-[12px] text-muted">Cheapest that fits</p>
                <p className="truncate font-mono text-[15px] text-[#6fe7a8]">
                  {best ? `${best.name}` : need > 192 ? "Needs 2+ GPUs" : "—"}
                </p>
                <p className="font-mono text-[12px] text-muted">{best ? `${money(price(best))}/h` : ""}</p>
              </div>
            </div>
            <p className="relative mt-3 text-[12px] text-muted">
              Weights at this precision plus a fifth for the cache. Long contexts need more.
            </p>
          </section>
          <section className="rounded-[24px] border border-[#2e1f17] bg-[#110c0a] p-5 text-[12.5px]">
            {[
              ["Billed by the second", "Pay for the seconds it runs. Stop it and the bill stops."],
              ["One balance", "The same credits pay for models and GPUs."],
              ["Your disk is yours", "Data on an instance ends with it. Keep copies elsewhere."],
            ].map(([k, v]) => (
              <p key={k} className="mb-2 last:mb-0">
                <span className="block text-text">{k}</span>
                <span className="text-muted">{v}</span>
              </p>
            ))}
          </section>
        </aside>

        <section className="rounded-[24px] border border-[#2e1f17] bg-[#0f0a08]">
          <header className="flex flex-wrap items-center gap-3 px-5 py-4">
            <h2 className="text-[16px] font-semibold text-text">GPU market</h2>
            <span className="text-[12px] text-muted">
              {rows ? `${list.length} types · rates refresh every 10 minutes` : "Reading rates…"}
            </span>
            <div className="compute-tabs ml-auto flex flex-wrap gap-2">
              <SubTabs label="Memory" value={vram} onChange={setVram} tabs={VRAM} />
              <SubTabs
                label="Hosts"
                value={cloud}
                onChange={setCloud}
                tabs={[
                  { id: "low", label: "Lowest" },
                  { id: "secure", label: "Secure cloud" },
                ]}
              />
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-y border-[#2e1f17] text-[12px] text-muted">
                  {["GPU", "Memory", "Per hour", "", "Per second", "Per GB-hour", ""].map((h, i) => (
                    <th
                      key={i}
                      className={cx("px-5 py-2 font-normal", (i === 2 || i === 4 || i === 5) && "text-right")}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((g, i) => {
                  const fit = g.vram >= need;
                  const p = price(g);
                  return (
                    <tr
                      key={g.id}
                      className={cx(
                        "border-b border-[#1d140f] transition-colors hover:bg-[#160f0b]",
                        fit && best?.id === g.id && "bg-[#6fe7a8]/[0.05]",
                      )}
                    >
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-2">
                          <i
                            className={cx(
                              "h-2 w-2 rounded-full",
                              fit ? "bg-[#6fe7a8] shadow-[0_0_8px_#6fe7a8]" : "bg-[#3a2a20]",
                            )}
                            title={fit ? "Holds the model" : "Too small for the model"}
                          />
                          <span className="text-text">{g.name}</span>
                          {best?.id === g.id && (
                            <span className="rounded-full bg-[#6fe7a8]/15 px-2 text-[12px] text-[#6fe7a8]">
                              best fit
                            </span>
                          )}
                          {i === 0 && (
                            <span className="rounded-full bg-[#ff9a5c]/15 px-2 text-[12px] text-[#ff9a5c]">
                              lowest price
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 font-mono text-[#f2c46d]">{`${g.vram} GB`}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-text">{money(p)}</td>
                      <td className="w-40 px-2 py-2.5">
                        <span className="block h-1.5 overflow-hidden rounded-full bg-[#1c130e]">
                          <span
                            className="bar-grow block h-full rounded-full bg-[#ff9a5c]"
                            style={{
                              width: `${(p / max) * 100}%`,
                              animationDelay: `${Math.min(i, 30) * 0.02}s`,
                            }}
                          />
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-[12px] text-muted">{`$${(p / 3600).toFixed(6)}`}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-[12px] text-muted">{`$${(p / g.vram).toFixed(3)}`}</td>
                      <td className="px-5 py-2.5 text-right">
                        <span
                          className="rounded-lg border border-[#2e1f17] px-2.5 py-1 text-[12px] text-muted"
                          title="Renting opens with payments"
                        >
                          Rent · soon
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[12px] text-muted">
            {at
              ? `Hourly rates read ${new Date(at).toISOString().slice(11, 16)} UTC. Availability is checked when you rent.`
              : ""}
          </p>
        </section>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-2xl border border-[#3a2418] bg-[#0d0907] px-6 py-5 text-center">
          <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#ff9a5c]">Soon</p>
          <p className="mt-1 text-[16px] font-semibold text-text">Any GPU by the hour</p>
          <p className="mt-1 max-w-[26rem] text-[13px] text-[#d8c2b4]">
            The full market opens with Credits. Free machines for holders already work above.
          </p>
        </div>
      </div>
    </div>
  );
}
