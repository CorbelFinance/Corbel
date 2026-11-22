import { Numbers } from "@/components/site/Numbers";

export const metadata = { title: "Analytics", description: "Corbel in numbers, live: new pools by the hour, swaps and big swaps of the last day, Predict stakes, agent decisions and AI models." };

export default function Analytics() {
  return (
    <main className="mx-auto max-w-page px-4 pb-28 pt-28 sm:px-6 sm:pt-36 lg:px-10 xl:px-14">
      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
        <h1 className="font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">Corbel in numbers.</h1>
        <p className="text-[15px] text-muted">Read live from Robinhood Chain and the app, each time you open the page. Chain figures link to their block or transaction. Times are UTC.</p>
      </header>
      <Numbers />
    </main>
  );
}
