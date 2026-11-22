import { PredictRounds } from "@/components/app/PredictRounds";

export const metadata = { title: "Predict · soon", description: "Markets the chain settles: whether a pool keeps its liquidity, and short up or down rounds. Opening soon." };

export default function PredictPage() {
  return (
    <section aria-labelledby="tab-title" className="mt-9">
      <p className="font-medium text-[12px] uppercase tracking-[0.12em] text-leaf">[007] Predict</p>
      <h1 id="tab-title" className="mt-3 flex items-center gap-3 font-display text-4xl tracking-tight sm:text-5xl">
        Predict
        <span className="rounded-full border border-line px-3 py-1 font-mono text-[12px] tracking-normal text-muted">soon</span>
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        Markets the chain settles, with nobody voting: whether a pool keeps its liquidity, and short up or down rounds on a price. Not open yet. Below is a preview with the live price; nothing here takes a stake.
      </p>
      <h2 id="rounds" className="mt-12 scroll-mt-24 font-display text-3xl tracking-tight">
        Rounds: up or down in minutes
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] text-muted">Short rounds on a price, settled by the pool&apos;s own price average.</p>
      <div className="mt-6">
        <PredictRounds />
      </div>
    </section>
  );
}
