import Link from "next/link";

export const metadata = {
  title: "Why Corbel exists",
  description: "The Corbel thesis: on a chain where anyone can launch a token in a minute, people need to read the chain before they buy, trade at a price they can check, and hand agents a budget a contract enforces.",
};

const SECTIONS: { n: string; h: string; p: string[] }[] = [
  {
    n: "01",
    h: "A chain where anyone can launch in a minute",
    p: [
      "Robinhood Chain made launching a token as easy as filling in a form. Hundreds of tokens appear every day, on launchpads and in pools opened by anyone. That openness is the point of a public chain, and it is also the problem: most buyers cannot tell a working project from a trap before they sign.",
      "Corbel reads every pool and every launch on the chain, and follows each pool that was funded to see whether its liquidity stays or is pulled. What that record shows about creators, tickers and launchpads, measured without hindsight, is published on the accuracy page as it builds up.",
    ],
  },
  {
    n: "02",
    h: "What Corbel is",
    p: [
      "Corbel is one non-custodial application for Robinhood Chain. It checks a token before you buy it, quotes every route at the latest block before you swap, shows what pools pay before you provide liquidity, gives AI agents a budget a contract enforces, and puts AI models in the same place. Every transaction is signed in the user's own wallet; Corbel never holds funds.",
    ],
  },
  {
    n: "03",
    h: "Read the chain, not the story",
    p: [
      "A website, a roadmap and a follower count are claims. Bytecode, liquidity positions, transfer taxes and a creator's record are facts that anyone can read. The token check simulates a buy and a sell against the live pool, measures the tax actually charged, reads owner powers from the code, finds who holds the liquidity and looks up everything the creator launched before. It answers in plain words and shows the block it read.",
    ],
  },
  {
    n: "04",
    h: "Rules in code, not promises",
    p: [
      "Delegating trades to an AI agent is only safe if its limits hold when nobody is watching. A Corbel mandate is a contract: the agent posts a bond, and every trade is checked against the owner's rules for assets, size, daily budget, price, pools and hours. A trade that breaks a rule is not executed and part of the bond is paid to the owner; repeated violations freeze the agent. The owner can replace the agent at any time.",
      "The same principle runs through Predict, where markets settle from the pool's own data with no resolver, and through the launch contract, where the pool cannot be touched before the sale graduates.",
    ],
  },
  {
    n: "05",
    h: "Evidence over activity",
    p: [
      "We publish what we can prove and say plainly what we cannot. Every change made on chain links to its transaction. The code is public and the live contracts are verified, so the bytecode can be matched to the source. When an outside review found real problems, we fixed them in public the same day and recorded the review in the changelog.",
      "The accuracy page measures the signals our own check reads against what later happened, and shows the results that go against us as plainly as the ones that hold. A tool that asks for trust should be the first to be measured.",
    ],
  },
  {
    n: "06",
    h: "Practice before risk",
    p: [
      "Most people learn to trade with real money and pay for every lesson. In Corbel, anyone can trade on paper at real prices without a wallet. Those practice trades teach a personal agent: it drafts the rules a mandate would enforce from how its owner trades, and replays the owner's own trades through them. Teach, check, then deploy.",
    ],
  },
  {
    n: "07",
    h: "Where it goes next",
    p: [
      "From token checks to project checks: comparing what a team claims with its repository and its deployed contracts. From one chain to more, starting with Elysium. Orders that wait for a price, from an escrow contract already written and tested. An external audit before larger amounts are allowed.",
      "The $CORBEL token gives access to parts of the application, starting with the AI chat for holders. It has a fixed supply and no owner. Naming the token is not a promise of its value.",
    ],
  },
];

export default function ThesisPage() {
  return (
    <main className="mx-auto max-w-page px-4 pb-28 pt-28 sm:px-6 sm:pt-36 lg:px-10 xl:px-14">
      <header className="max-w-4xl">
        <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-leaf">The Corbel thesis</p>
        <h1 className="mt-4 font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">Know before you sign.</h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-muted">
          Why Corbel exists, what it stands on, and where it is going. Written for users, partners and anyone deciding whether to trust a tool with their decisions.
        </p>
      </header>

      <div className="mt-16 grid gap-12 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Sections" className="hidden lg:block">
          <ol className="sticky top-32 space-y-2 text-[13px]">
            {SECTIONS.map((s) => (
              <li key={s.n}>
                <a href={`#s${s.n}`} className="flex gap-3 text-muted hover:text-text">
                  <span className="font-mono text-[12px] text-[#6f7a74]">{s.n}</span>
                  {s.h}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="max-w-3xl space-y-14">
          {SECTIONS.map((s) => (
            <section key={s.n} id={`s${s.n}`} className="scroll-mt-32 border-t border-line pt-8">
              <p className="font-mono text-[12px] text-leaf">{s.n}</p>
              <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">{s.h}</h2>
              <div className="mt-5 space-y-4 text-[16px] leading-[1.75] text-[#c9d1cb]">
                {s.p.map((p) => (
                  <p key={p.slice(0, 24)}>{p}</p>
                ))}
              </div>
            </section>
          ))}
          <section className="flex flex-wrap gap-3 border-t border-line pt-8">
            <Link href="/accuracy" className="ibtn inline-flex h-11 items-center px-5">See the evidence</Link>
            <Link href="/app/trust/check" className="ibtn-ghost inline-flex h-11 items-center px-5">Check a token</Link>
            <Link href="/changelog" className="ibtn-ghost inline-flex h-11 items-center px-5">Read the changelog</Link>
          </section>
          <p className="text-[12.5px] text-muted">Not financial advice. The contracts are not audited yet; the site says what is live and what is not.</p>
        </article>
      </div>
    </main>
  );
}
