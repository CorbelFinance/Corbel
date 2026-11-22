import { notFound } from "next/navigation";
import { BRAND } from "@corbel/config";

type Clause = { h: string; p: string[] };
type Doc = { title: string; lede: string; updated: string; clauses: Clause[] };

const UPDATED = "19 November 2026";

const DOCS: Record<string, Doc> = {
  terms: {
    title: "Terms of use",
    lede: `These terms govern your use of ${BRAND.name}: the website, the app and the API. By using them you accept these terms.`,
    updated: UPDATED,
    clauses: [
      { h: "1. Who we are", p: [`${BRAND.name} is built and operated by ${BRAND.company}, an independent team. We are not affiliated with Robinhood, Uniswap, Morpho or any token issuer shown in the app.`] },
      { h: "2. What the service is", p: ["A set of read-only tools for Robinhood Chain: token checks, market data, quotes, analytics and simulations.", "Every figure is read from public blockchains and public market data at the moment you load it. We do not hold your funds, take custody of assets or execute trades for you."] },
      { h: "3. No advice", p: ["Nothing in the service is investment, financial, legal or tax advice. A score, a check or a quote describes the chain at one block; it is not a recommendation to buy, sell or hold anything.", "You make your own decisions and you are responsible for them."] },
      { h: "4. Simulations and data", p: ["Checks and quotes are simulations run with eth_call at the latest block. The next block can differ; an owner can change a contract after you check it.", "Third-party data (prices across venues, stock closes, token images) is shown as provided and may be late, incomplete or wrong. Each such figure is marked with its source."] },
      { h: "5. Smart contracts", p: ["Contracts we deploy are published with their addresses. They are reviewed in-house and are not externally audited. Interacting with any smart contract can lose all funds sent to it.", "Some features are marked Preview or Soon. Preview means read-only; Soon means not available."] },
      { h: "6. Your conduct", p: ["Do not use the service to break the law, to attack the service or other users, to overload it with automated requests beyond the published limits, or to misrepresent our output as an endorsement."] },
      { h: "7. Availability", p: ["We may change, pause or stop any part of the service at any time, including when a blockchain, a data source or our infrastructure is unavailable."] },
      { h: "8. Liability", p: ["The service is provided as is, without warranty of any kind. To the extent the law allows, we are not liable for any loss arising from your use of the service, including losses from trades, tokens or contracts you interact with."] },
      { h: "9. Changes", p: ["We may update these terms. The date at the top shows the current version; continuing to use the service means you accept it."] },
      { h: "10. Contact", p: [`Questions: ${BRAND.email}.`] },
    ],
  },
  privacy: {
    title: "Privacy",
    lede: "What we collect, why, and how long we keep it. The short version: almost nothing.",
    updated: UPDATED,
    clauses: [
      { h: "1. No tracking", p: ["The site loads no third-party analytics, advertising scripts or trackers. Fonts and images are served from our own domain, so your browser does not call other services while you use it.", "We count page views and clicks ourselves: a random id that lives in one browser tab, the page, the label of what was clicked, and for the visit its time zone, whether it is a phone or a computer, and the site it came from. No IP, no cookie and no wallet is kept with them, and they are deleted after 30 days."] },
      { h: "2. Accounts", p: ["Signing in is optional and done by signing a message with your wallet. No email, no password, no name.", "An account stores your wallet address, your watchlist and, if you use Practice while signed in, your paper trades there, so they follow you to another device. Nothing else. Resetting Practice replaces the stored paper trades with an empty account."] },
      { h: "2a. Sign-in with Google", p: ["You can also sign in with Google. We ask Google only to confirm who you are (the openid scope): no email, no name, no contacts, no files.", "We keep a keyed hash of the account number Google gives us, so the same account is recognised next time. We cannot turn it back into your Google account, and we do not store anything else from Google. No Google script runs on our pages: the button is a plain link to Google's own sign-in page.", "Google sees that you signed in to Corbel, under its own terms. The AI tools and holder limits stay tied to wallets."] },
      { h: "3. Cookies", p: ["Cookies are set only when you sign in: one keeps you signed in (with a wallet or with Google), one is a random device mark used for fair use, and a short one holds a Google sign-in for ten minutes while you are on Google's page. See Cookies."] },
      { h: "4. Server logs", p: ["Our servers record standard request data (time, path, status) to keep the service running and to stop abuse. Rate limiting keys are derived from the connection and salted; they are not stored with your account."] },
      { h: "4a. Fair use of AI limits", p: ["Daily AI limits are per person, not per wallet. When you sign in or use the chat, we keep for 24 hours a salted hash of your IP address and of the device mark next to your wallet, and read your wallet's public token transfers. The salt changes every day, so hashes from different days cannot be matched, and the IP itself is never stored.", "Wallets that clearly belong to one person share one set of limits. Every such group is reviewed by a person before it is final."] },
      { h: "5. Blockchain data", p: ["Addresses, balances and transactions on public blockchains are public by design. Looking one up on Corbel does not make it more or less public."] },
      { h: "6. Sharing", p: ["We do not sell or share personal data. We fetch public market data from third parties on the server, without passing anything about you."] },
      {
        h: "7. AI models",
        p: [
          "When you send a prompt to a model, we pass it to the provider that runs the model and pass its answer back to you. That is the only reason your prompt leaves your browser.",
          "We do not store prompts or answers, we do not write them to our logs, and we do not use them to train anything. They are not linked to your wallet or your account.",
          "The provider that runs the model receives the prompt to produce the answer and handles it under its own terms. Do not send passwords, keys or seed phrases to any model.",
        ],
      },
      { h: "8. Writing to us", p: ["When you write to us by email or in Telegram, we read the message to answer it. It stays in that inbox or chat, which the mail or Telegram service handles under its own terms. The site itself sends and stores nothing for it."] },
      { h: "9. Your choices", p: [`To delete your account data (address and watchlist), sign out and contact ${BRAND.email}.`] },
    ],
  },
  risk: {
    title: "Risk disclosure",
    lede: "Read this before you rely on anything shown on Corbel or interact with any token or contract.",
    updated: UPDATED,
    clauses: [
      { h: "1. Tokens can go to zero", p: ["Any token can lose all of its value, quickly. New tokens are often illiquid; a price on the chart may not be a price you can sell at."] },
      { h: "2. A clean check is not a guarantee", p: ["Checks read code and simulate trades at one block. They cannot read intent. Owners, hooks and proxies can change behaviour after you check."] },
      { h: "3. Stock tokens", p: ["Stock tokens on Robinhood Chain are instruments issued by their issuers (such as Robinhood Assets (Jersey) Limited and ST0x), not shares. They can trade away from the stock, especially when the stock market is closed."] },
      { h: "4. Liquidity and slippage", p: ["Thin pools move on small trades. Your slippage limit is the only hard stop on the price you get. MEV can make a fill worse than quoted."] },
      { h: "5. Smart contract risk", p: ["Every contract can contain bugs. Corbel's contracts are reviewed in-house, not externally audited. Use small amounts."] },
      { h: "6. The chain", p: ["Robinhood Chain runs on a single sequencer. If it stops, transactions stop. Withdrawing to Ethereum through the canonical bridge takes days."] },
      { h: "7. Predictions", p: ["Prediction markets can resolve against you and stakes can be lost in full. Price markets depend on a resolver; a challenge window is the check on it."] },
    ],
  },
  cookies: {
    title: "Cookies",
    lede: "A few cookies, only if you sign in.",
    updated: UPDATED,
    clauses: [
      { h: "Session cookie", p: ["Set when you sign in with a wallet. It is signed by our server, holds your session and nothing else, and expires when the session ends.", "It is strictly necessary for the signed-in features, so no consent banner is shown."] },
      { h: "Google sign-in", p: ["Set only if you sign in with Google. One cookie holds the sign-in for ten minutes while you are on Google's page and is deleted when you come back; the other keeps you signed in for seven days. Both are signed by our server and hold no email or name."] },
      { h: "Local storage", p: ["Your browser keeps a few conveniences on your device only: recent token checks and which sidebar groups you folded. They never leave your device."] },
      { h: "Device mark", p: ["Set when you sign in: a random value that says nothing about you. It lets daily AI limits count one device once, so one person with many wallets does not take everyone else's share. Its hash is kept for 24 hours at most."] },
      { h: "No tracking cookies", p: ["No analytics, advertising or third-party cookies are set by this site."] },
    ],
  },
};

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  const d = DOCS[(await params).doc];
  return d ? { title: d.title, description: d.lede } : {};
}

export default async function Legal({ params }: { params: Promise<{ doc: string }> }) {
  const slug = (await params).doc;
  const d = DOCS[slug];
  if (!d) notFound();
  return (
    <div className="mx-auto max-w-page px-4 pb-24 pt-28 sm:px-6 sm:pt-36 lg:px-10 xl:px-14">
      <div className="grid gap-12 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-leaf">Legal</p>
          <nav aria-label="Legal" className="mt-4 space-y-1">
            {Object.entries(DOCS).map(([k, v]) => (
              <a key={k} href={`/legal/${k}`} aria-current={k === slug ? "page" : undefined} className={k === slug ? "block rounded-lg bg-[#161616] px-3 py-2 text-text" : "block rounded-lg px-3 py-2 text-muted hover:text-text"}>
                {v.title}
              </a>
            ))}
          </nav>
          <div className="mt-8 rounded-xl border border-line p-4 text-[13px] text-muted">
            <p className="text-text">{BRAND.company}</p>
            <p className="mt-1">{BRAND.email}</p>
          </div>
        </aside>
        <article className="max-w-3xl">
          <h1 className="font-display text-5xl tracking-tight sm:text-6xl">{d.title}</h1>
          <p className="mt-5 text-xl leading-relaxed text-muted">{d.lede}</p>
          <p className="mt-6 inline-flex rounded-full border border-line px-3 py-1 font-mono text-[12px] uppercase tracking-[0.1em] text-muted">Last updated · {d.updated}</p>
          <div className="mt-12 divide-y divide-line border-y border-line">
            {d.clauses.map((c) => (
              <section key={c.h} className="grid gap-3 py-7 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-8">
                <h2 className="text-[17px] font-medium text-text">{c.h}</h2>
                <div className="space-y-3 text-[16px] leading-relaxed text-muted">
                  {c.p.map((x) => (
                    <p key={x}>{x}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
