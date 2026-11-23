import { AI_ACCESS, ROAD_ITEMS, TOKEN, hasFull } from "@corbel/config";
import { HolderCard } from "@/components/site/HolderCard";
import { TokenLive } from "@/components/site/TokenLive";

export const metadata = {
  title: "$CORBEL",
  description: "What holding $CORBEL gives today, what comes next, the team's locks read live from the chain, and everything we never promise.",
};

const SCAN = "https://robinhoodchain.blockscout.com";
const SECTIONS = [
  ["facts", "Facts"],
  ["today", "Today"],
  ["card", "Your card"],
  ["next", "Next"],
  ["locks", "Locks"],
  ["never", "Never"],
] as const;

const NEVER = [
  ["No yield", "Holding pays nothing out. Perks are access and lower prices inside Corbel."],
  ["No payouts", "No revenue, stock tokens or coins are sent to holders."],
  ["No price talk", "We never say where the price goes, and never ask anyone to buy."],
  ["No burn pitch", "Burns only take coins spent on Corbel. They are never a reason to hold."],
  ["No buyback pitch", "A buyback only uses revenue already earned, by a rule published before it runs."],
] as const;

function Head({ id, n, title, line }: { id: string; n: string; title: string; line?: string }) {
  return (
    <div id={id} className="scroll-mt-28">
      <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-leaf">{`${n} / ${id}`}</p>
      <h2 className="mt-2 font-display text-3xl tracking-tight text-text sm:text-4xl">{title}</h2>
      {line && <p className="mt-2 max-w-2xl text-[15px] text-muted">{line}</p>}
    </div>
  );
}

export default function Token() {
  const next = ROAD_ITEMS.filter((i) => i.block === "token");
  return (
    <main className="mx-auto max-w-page px-4 pb-28 pt-28 sm:px-6 sm:pt-36 lg:px-10 xl:px-14">
      <header className="relative overflow-hidden rounded-[28px] border border-[#242424] bg-[radial-gradient(70%_120%_at_0%_0%,rgba(111,231,168,0.12),transparent_60%),#0d0d0d] p-6 sm:p-10">
        <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-leaf">$CORBEL</p>
        <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.95] tracking-tight sm:text-6xl">What holding gives, and what it never promises.</h1>
        <p className="mt-5 max-w-2xl text-[16px] text-muted">One token, on Robinhood Chain only. Holding opens more of Corbel. Every figure on this page is read from the chain.</p>
        <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-[#2a2a2a] px-3 py-1 text-[12.5px] text-text transition-colors hover:border-leaf">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section className="mt-16">
        <Head id="facts" n="01" title="The contract" line="The only $CORBEL. Any other contract with this name, on any chain, is not ours." />
        <div className="mt-6 rounded-2xl border border-[#242424] bg-[#0f0f0f] p-5">
          <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">Contract · Robinhood Chain</p>
          <p className="mt-2 break-all font-mono text-[15px] text-text">{TOKEN.contract}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-[14px]">
            <a href={TOKEN.explorer} className="text-leaf underline underline-offset-4">Explorer ↗</a>
            <a href={`/app/trust/check?q=${TOKEN.contract}`} className="text-leaf underline underline-offset-4">Run our token check on it</a>
            <a href={TOKEN.buy} className="text-leaf underline underline-offset-4">Where it launched ↗</a>
          </div>
        </div>
        <div className="mt-4">
          <TokenLive />
        </div>
        <div className="mt-6 rounded-2xl border border-[#242424] bg-[#0f0f0f] p-5">
          <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">Embed a live check badge</p>
          <p className="mt-2 text-[14px] text-muted">Any site can show a token&apos;s live Corbel score. Swap in the token address.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- the badge is the thing being shown */}
          <img src={`/api/badge?token=${TOKEN.contract}`} alt="Corbel check badge for $CORBEL" width={280} height={56} className="mt-4" />
          <pre className="mt-4 overflow-x-auto rounded-xl border border-[#242424] bg-[#0b0b0b] p-4 font-mono text-[12.5px] leading-relaxed text-[#c9d4cf]">{`<a href="https://corbel.finance/app/trust/check?q=${TOKEN.contract}">
  <img src="https://corbel.finance/api/badge?token=${TOKEN.contract}" alt="Corbel check">
</a>`}</pre>
        </div>
      </section>

      <section className="mt-16">
        <Head id="today" n="02" title="What holding gives today" line={`Your tier is set by the lowest balance you held over the last ${AI_ACCESS.holdDays} days, plus the coins you locked on HoodLock. Coins passed between wallets or borrowed for a minute do not count.`} />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {AI_ACCESS.tiers.map((t) => (
            <div key={t.id} className={`rounded-2xl border bg-[#0f0f0f] p-5 ${hasFull(t) ? "border-leaf/40" : "border-[#242424]"}`}>
              <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-leaf">{t.name}</p>
              <p className="mt-2 font-display text-2xl tracking-tight text-text">{`From ${t.minCoins.toLocaleString("en-US")} $CORBEL`}</p>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">{t.models}</p>
              <ul className="mt-3 space-y-1 font-mono text-[12.5px] text-muted">
                <li>{`${t.text} chat messages a day · ${t.image} images · ${t.video} videos`}</li>
                <li>{t.markup ? `Credits at ${Math.round(t.markup * 100)}% over list price` : "Credits at list price, no markup"}</li>
                <li>{t.gpuMinutes ? `${t.gpuMinutes} free GPU minutes a day` : "No free GPU time"}</li>
                <li>{`${t.apiBoost}× API limits · ${t.alerts === null ? "alerts on any number of tokens" : `alerts on ${t.alerts} tokens`}`}</li>
                <li className="text-text">{t.extra}</li>
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-muted">{`Free GPU time runs within a shared daily budget for all holders. The thresholds for ${AI_ACCESS.tiers.filter((t) => t.id === "plus" || t.id === "core").map((t) => t.name).join(" and ")} are new; markup and alerts apply as Credits and alerts open.`}</p>
      </section>

      <section className="mt-16">
        <Head id="card" n="03" title="Your holder card" line="Your tier, the balance that sets it, and how far the next tier is. Save it as an image for X: it never shows your address." />
        <div className="mt-6">
          <HolderCard />
        </div>
      </section>

      <section className="mt-16">
        <Head id="next" n="04" title="What comes next" line="From the public roadmap. Building means we work on it now; planned comes after." />
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {next.map((i) => (
            <li key={i.title} className={i.stage === "next" ? "rounded-2xl border border-[#2a2440] bg-[linear-gradient(160deg,#15121e,#0f0f0f)] p-5" : "rounded-2xl border border-dashed border-[#2b2b2b] p-5"}>
              <p className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold text-text">{i.title}</span>
                <span className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-muted">{i.stage === "next" ? "Building" : i.stage === "live" ? "Live" : "Planned"}</span>
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{i.line}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <Head id="locks" n="05" title="The team's locks" line="Coins the team locked on HoodLock cannot move before their lock ends. The total above is read from the locker contract." />
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={`${SCAN}/address/${TOKEN.locker}`} className="rounded-xl border border-[#242424] bg-[#0f0f0f] px-4 py-3 text-[14px] text-text hover:border-leaf">Locker contract ↗</a>
          {TOKEN.lockProofs.map((l) => (
            <a key={l.id} href={l.href} className="rounded-xl border border-[#242424] bg-[#0f0f0f] px-4 py-3 text-[14px] text-text hover:border-leaf">{`Lock #${l.id} proof ↗`}</a>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <Head id="never" n="06" title="What we never promise" line="Demand has to come from use. These hold whatever the market does." />
        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424] sm:grid-cols-2 lg:grid-cols-5">
          {NEVER.map(([k, v]) => (
            <div key={k} className="bg-[#0f0f0f] p-5">
              <p className="text-[15px] font-semibold text-text">{k}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{v}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
