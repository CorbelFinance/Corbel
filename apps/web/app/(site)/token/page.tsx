import { AI_ACCESS, CREDITS_MARKUP, ROAD_ITEMS, TOKEN, hasFull } from "@corbel/config";

const pct = (v: number) => `${+(v * 100).toFixed(1)}%`;
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
  ["use", "Use it"],
  ["card", "Your card"],
  ["next", "Next"],
  ["locks", "Locks"],
  ["never", "Never"],
] as const;

const USE = [
  ["Top-up bonus", "More Credits for every dollar", `Top up Credits in USDG and your tier adds a bonus on top: ${AI_ACCESS.tiers.map((t) => `${t.name} +${pct(t.topUpBonus)}`).join(", ")}. Set by what you held through the week.`, "/app/ai/credits", "Open Credits"],
  ["Lower prices", "Less markup on everything", `Models, pictures, video and GPU time cost list price plus a markup that falls with your tier: ${pct(CREDITS_MARKUP)} without one, ${AI_ACCESS.tiers.filter((t) => t.markup < CREDITS_MARKUP).map((t) => (t.markup ? `${t.name} ${pct(t.markup)}` : `${t.name} none`)).join(", ")}.`, "/app/ai/models", "See the prices"],
  ["Fee Burn", "Fees that burn by contract", "A tenth of every new trading fee buys $CORBEL and burns it, up to once an hour, until 24 December. No owner, no withdraw.", "https://robinhoodchain.blockscout.com/address/0x8e649485F2800Ec9CB8f1382C6B27c5Cb7782F98", "Open the contract"],
] as const;

const NEVER = [
  ["No yield", "Holding pays nothing out. Perks are access and lower prices inside Corbel."],
  ["No payouts", "No revenue, stock tokens or coins are sent to holders."],
  ["No price talk", "We never say where the price goes, and never ask anyone to buy."],
  ["No burn pitch", "Burns follow rules written in contracts and in this page. We never say a burn moves the price."],
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
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-[#242424] bg-[#0f0f0f] p-5">
            <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">Signed in</p>
            <p className="mt-2 font-display text-2xl tracking-tight text-text">No coins needed</p>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">Sign in with your wallet: one message, no gas.</p>
            <ul className="mt-3 space-y-1 font-mono text-[12.5px] text-muted">
              <li>25 chat messages a day · 3 images · 1 video</li>
              <li>Before you sign and the drain alarm on 1 wallet</li>
              <li>{`Credits at ${pct(CREDITS_MARKUP)} over list price`}</li>
            </ul>
          </div>
          {AI_ACCESS.tiers.map((t) => (
            <div key={t.id} className={`rounded-2xl border bg-[#0f0f0f] p-5 ${hasFull(t) ? "border-leaf/40" : "border-[#242424]"}`}>
              <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-leaf">{t.name}</p>
              <p className="mt-2 font-display text-2xl tracking-tight text-text">{`From ${t.minCoins.toLocaleString("en-US")} $CORBEL`}</p>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">{t.models}</p>
              <ul className="mt-3 space-y-1 font-mono text-[12.5px] text-muted">
                <li>{`${t.text} chat messages a day · ${t.image} images · ${t.video} videos`}</li>
                <li>{t.markup ? `Credits at ${+(t.markup * 100).toFixed(1)}% over list price` : "Credits at list price, no markup"}</li>
                <li>{`+${Math.round(t.topUpBonus * 100)}% on every Credits top-up`}</li>
                <li>{`Drain alarm on ${t.drain === null ? "any number of" : t.drain} wallets`}</li>
                <li>{t.gpuMinutes ? `${t.gpuMinutes} free GPU minutes a day` : "No free GPU time"}</li>
                <li>{`${t.apiBoost}× API limits · ${t.alerts === null ? "alerts on any number of tokens" : `alerts on ${t.alerts} tokens`}`}</li>
                <li className="text-text">{t.extra}</li>
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-muted">{`Free GPU time runs within a shared daily budget for all holders. Tiers changed on 26 November 2026: ${AI_ACCESS.tiers.map((t) => `${t.name} from ${t.minCoins.toLocaleString("en-US")}`).join(", ")}, and what Light gave before is free to every signed-in wallet. Markup and the top-up bonus apply as Credits open.`}</p>
      </section>

      <section className="mt-16">
        <Head id="card" n="03" title="Your holder card" line="Your tier, the balance that sets it, and how far the next tier is. Save it as an image for X: it never shows your address." />
        <div className="mt-6">
          <HolderCard />
        </div>
      </section>

      <section className="mt-16">
        <Head id="use" n="04" title="What holding saves you" line="Holding lowers what you pay inside Corbel and adds to every top-up. It is a service, never a payout, and nothing drips to a wallet just for holding." />
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {USE.map(([k, title, line, href, label]) => (
            <div key={k} className="rounded-2xl border border-[#242424] bg-[#0f0f0f] p-5">
              <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-leaf">{k}</p>
              <p className="mt-2 font-display text-xl text-text">{title}</p>
              <p className="mt-2 text-[14px] text-muted">{line}</p>
              <a href={href} className="mt-4 inline-flex text-[13.5px] text-leaf underline-offset-4 hover:underline">
                {label}
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <Head id="next" n="05" title="What comes next" line="From the public roadmap. Building means we work on it now; planned comes after." />
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
        <Head id="locks" n="06" title="The team's locks" line="Coins the team locked on HoodLock cannot move before their lock ends. The total above is read from the locker contract." />
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={`${SCAN}/address/${TOKEN.locker}`} className="rounded-xl border border-[#242424] bg-[#0f0f0f] px-4 py-3 text-[14px] text-text hover:border-leaf">Locker contract ↗</a>
          {TOKEN.lockProofs.map((l) => (
            <a key={l.id} href={l.href} className="rounded-xl border border-[#242424] bg-[#0f0f0f] px-4 py-3 text-[14px] text-text hover:border-leaf">{`Lock #${l.id} proof ↗`}</a>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <Head id="never" n="07" title="What we never promise" line="Demand has to come from use. These hold whatever the market does." />
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
