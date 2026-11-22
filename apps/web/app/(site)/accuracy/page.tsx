import { Accuracy } from "@/components/site/Accuracy";

export const metadata = {
  title: "How accurate is the token check",
  description: "Does what Corbel's token check reads tell which tokens get drained? Every pool on Robinhood Chain with a known fate, measured without hindsight, with the results that go against the check shown too.",
};

export default function AccuracyPage() {
  return (
    <main className="mx-auto max-w-page px-4 pb-28 pt-28 sm:px-6 sm:pt-36 lg:px-10 xl:px-14">
      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-leaf">Evidence · recomputed every ten minutes</p>
          <h1 className="mt-4 font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">Does the check see it coming?</h1>
        </div>
        <p className="text-[15px] leading-relaxed text-muted">
          A token check is only worth what it predicts. Here we measure the signals it reads against what later happened to every pool on Robinhood Chain, using only what was known at the time, and we publish the results that go against us as plainly as the ones that hold.
        </p>
      </header>
      <div className="mt-14">
        <Accuracy />
      </div>
    </main>
  );
}
