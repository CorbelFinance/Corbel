import { ShipLog } from "@/components/site/ShipLog";

export const metadata = { title: "Changelog", description: "Everything that went live in Corbel, day by day, block by block: new tools, tools made better, fixes.", alternates: { types: { "application/rss+xml": "/changelog.xml" } } };

export default function Changelog() {
  return (
    <main className="mx-auto max-w-page px-4 pb-28 pt-28 sm:px-6 sm:pt-36 lg:px-10 xl:px-14">
      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
        <h1 className="font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">Shipped, day by day.</h1>
        <p className="text-[15px] text-muted">
          Everything that went live, newest first, on the UTC day it shipped. What comes next is on the{" "}
          <a href="/roadmap" className="text-text underline decoration-[#424242] underline-offset-4 hover:decoration-leaf">
            roadmap
          </a>
          . Every change made on chain links to its transaction. Follow by{" "}
          <a href="/changelog.xml" className="text-text underline decoration-[#424242] underline-offset-4 hover:decoration-leaf">
            RSS
          </a>
          .
        </p>
      </header>
      <ShipLog />
    </main>
  );
}
