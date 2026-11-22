import { BRAND } from "@corbel/config";

export const metadata = {
  title: "Security",
  description: "What Corbel can and can't do with your money: your wallet signs every move, what our servers keep and never keep, fees, contracts, and how to report an issue.",
};

const SCAN = "https://robinhoodchain.blockscout.com";
const SECTIONS = [
  ["wallet", "Wallet"],
  ["tools", "Tools"],
  ["servers", "Servers"],
  ["fees", "Fees"],
  ["contracts", "Contracts"],
  ["report", "Report"],
  ["platforms", "Platforms"],
] as const;

const TOOLS: [string, string, string][] = [
  ["Token check, Radar, Analytics", "Read the chain and simulate a buy and a sell at the latest block", "Sign or send anything"],
  ["Swap (Terminal, Swap quote)", "Send a Uniswap router swap you confirm in your wallet, with a minimum out", "Take a fee, swap without your signature, or touch any other token"],
  ["Predict", "Hold your USDG stake in its contract until the market settles", "Send it anywhere but back to you or to the winning side"],
  ["Agent guard", "Answer allow or deny for a trade an agent asks about", "Trade, sign or hold funds"],
  ["AI chat", "Pass your message to the model and the answer back", "Store, log or train on what you write"],
  ["Wallet tools", "Read what is already public about an address", "Hide it, or move anything"],
  ["Sign-in", "Prove you own an address with one signed message", "Move funds: it is a message, not a transaction"],
];

const KEEP = [
  "The address you signed in with, in a signed session cookie",
  "Your watchlist, if you keep one",
  "A daily count of chat messages per wallet, by a hash of the address",
  "Results of the public agent runs on the Break it page",
  "Public chain data: pools, swaps, launches, prices",
];
const NEVER = ["Your private keys or seed phrase", "Passwords (there are none)", "Your chat messages and the answers", "Your email or name (we do not ask)"];

const FEES: [string, string, string?][] = [
  ["Swaps", "No Corbel fee", "you pay the pool's own fee and gas"],
  ["Token check, Radar, Analytics", "Free"],
  ["Predict", `${1}% of the losing pot`, "goes to the fund that backs refunds"],
  ["AI chat", "Free, 30 messages a day", "while payments are not open"],
  ["Wallet tools", "Free"],
  ["Launch", "Soon", "terms published before it opens"],
];

const PLATFORMS: { name: string; what: string; links: [string, string][] }[] = [
  { name: "Robinhood Chain", what: "The network every tool reads and every swap settles on", links: [["Docs", "https://docs.robinhood.com/chain"], ["Explorer", SCAN]] },
  { name: "Uniswap", what: "The pools swaps route through (V2 and v4)", links: [["Docs", "https://docs.uniswap.org/contracts/v2/overview"], ["v4 audits", "https://github.com/Uniswap/v4-core/tree/main/docs/security/audits"]] },
  { name: "Safe", what: "The multisig that owns Corbel's contracts", links: [["Docs", "https://docs.safe.global"], ["Audits", "https://github.com/safe-global/safe-smart-account/tree/main/docs"]] },
];

function Head({ id, n, title, line }: { id: string; n: string; title: string; line?: string }) {
  return (
    <div id={id} className="scroll-mt-28">
      <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-leaf">{`${n} / ${id}`}</p>
      <h2 className="mt-2 font-display text-3xl tracking-tight text-text sm:text-4xl">{title}</h2>
      {line && <p className="mt-2 max-w-2xl text-[15px] text-muted">{line}</p>}
    </div>
  );
}

export default function Security() {
  return (
    <main className="mx-auto max-w-page px-4 pb-28 pt-28 sm:px-6 sm:pt-36 lg:px-10 xl:px-14">
      <header className="relative overflow-hidden rounded-[28px] border border-[#242424] bg-[radial-gradient(70%_120%_at_0%_0%,rgba(47,191,114,0.1),transparent_60%),#0d0d0d] p-6 sm:p-10">
        <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-leaf">Security</p>
        <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.95] tracking-tight sm:text-6xl">What Corbel can and can&apos;t do with your money.</h1>
        <p className="mt-5 max-w-2xl text-[16px] text-muted">Short version: your wallet signs every move, Corbel never holds your keys, and the only contract that holds anything is Predict, for the stakes you put in it.</p>
        <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-[#2a2a2a] px-3 py-1 text-[12.5px] text-text transition-colors hover:border-leaf">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section className="mt-16">
        <Head id="wallet" n="01" title="Your wallet stays yours" />
        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424] sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["Yours", "Any browser wallet. Corbel reads its address when you connect, nothing else."],
              ["You sign every move", "Nothing leaves your wallet without a signature you approve in the wallet itself."],
              ["You pay the gas", "Corbel pays nothing on your behalf and adds nothing to what you send."],
              ["Your keys never leave", "Corbel never sees, asks for or stores a private key or seed phrase."],
            ] as const
          ).map(([k, v], i) => (
            <div key={k} className={i === 0 ? "bg-[linear-gradient(160deg,rgba(47,191,114,0.12),#0c110f_60%)] p-5" : "bg-[#0f0f0f] p-5"}>
              <p className="text-[15px] font-semibold text-text">{k}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <Head id="tools" n="02" title="What each tool can and can't do" />
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[#242424]">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#242424] bg-[#0f0f0f] font-mono text-[12px] uppercase tracking-[0.1em] text-muted">
                <th className="px-5 py-3 font-normal">Tool</th>
                <th className="px-5 py-3 font-normal">Can</th>
                <th className="px-5 py-3 font-normal">Can&apos;t</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map(([t, can, cant]) => (
                <tr key={t} className="border-b border-[#1a1a1a] last:border-0">
                  <th scope="row" className="px-5 py-3.5 font-semibold text-text">
                    {t}
                  </th>
                  <td className="px-5 py-3.5 text-[#c9d4cf]">{can}</td>
                  <td className="px-5 py-3.5 text-muted">{cant}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-16">
        <Head id="servers" n="03" title="What our servers keep" />
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <ul className="space-y-2.5 rounded-2xl border border-[#242424] bg-[#0f0f0f] p-5">
            {KEEP.map((k) => (
              <li key={k} className="flex gap-3 text-[14px] text-text">
                <span className="text-leaf">✓</span>
                {k}
              </li>
            ))}
          </ul>
          <div className="rounded-2xl border border-[#242424] bg-[#0f0f0f] p-5">
            <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">Never</p>
            <ul className="mt-3 space-y-2.5">
              {NEVER.map((k) => (
                <li key={k} className="flex gap-3 text-[14px] text-text">
                  <span className="text-flesh">✕</span>
                  {k}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-16">
        <Head id="fees" n="04" title="Fees" />
        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424] sm:grid-cols-2">
          {FEES.map(([k, v, s]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 bg-[#0f0f0f] px-5 py-4">
              <span className="text-[14px] text-text">{k}</span>
              <span className="text-right">
                <span className="block font-mono text-[13px] text-text">{v}</span>
                {s && <span className="block text-[12px] text-muted">{s}</span>}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-flesh/30 bg-flesh-deep/20 px-5 py-4">
          <span className="text-[14px] font-semibold text-text">Corbel never asks for</span>
          {["your seed phrase", "your private keys", "a password", "a transfer to 'verify' you"].map((x) => (
            <span key={x} className="rounded-full border border-flesh/40 px-2.5 py-0.5 text-[12.5px] text-text">
              {x}
            </span>
          ))}
          <span className="w-full text-[12.5px] text-muted">Not by email, DM or X. Anyone who asks is not Corbel. Our only Telegram is t.me/corbelfinance and our only X is x.com/corbelfinance.</span>
        </div>
      </section>

      <section className="mt-16">
        <Head id="contracts" n="05" title="Contracts" line="Every contract, live or written, with its address, its tests and who controls it, is on the Transparency page." />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["CorbelPredict", "Live", `${SCAN}/address/0x62230624777b012a316e365c7ab3677159cd73d9`],
              ["Project Safe, 2 of 3", "Live", `${SCAN}/address/0xcAEC58545DbCEF852ac834577Cd029CD3301741b`],
              ["Audit", "None yet: reviewed in-house, stake small", "/app/account/transparency"],
            ] as const
          ).map(([k, v, href]) => (
            <a key={k} href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})} className="rounded-2xl border border-[#242424] bg-[#0f0f0f] p-5 transition-colors hover:border-leaf/50">
              <p className="text-[15px] font-semibold text-text">{k}</p>
              <p className="mt-1 text-[13px] text-muted">{v} ↗</p>
            </a>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <Head id="report" n="06" title="Report a security issue" />
        <p className="mt-4 max-w-2xl text-[15px] text-muted">
          {"Email "}
          <a href={`mailto:${BRAND.email}?subject=Security`} className="text-leaf underline underline-offset-4">
            {BRAND.email}
          </a>
          {" with the subject “Security”. Please tell us before anyone else, and give us a fair window to fix it."}
        </p>
      </section>

      <section className="mt-16">
        <Head id="platforms" n="07" title="The platforms" line="Corbel runs on these. Each has its own terms and security." />
        <ul className="mt-6 divide-y divide-[#242424] overflow-hidden rounded-2xl border border-[#242424] bg-[#0f0f0f]">
          {PLATFORMS.map((p) => (
            <li key={p.name} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- small static mark */}
              <img src={`/partners/${p.name.split(" ")[0]!.toLowerCase()}.png`} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-xl" />
              <span className="min-w-[12rem]">
                <span className="block text-[15px] font-semibold text-text">{p.name}</span>
                <span className="block text-[12.5px] text-muted">{p.what}</span>
              </span>
              <span className="ml-auto flex gap-4">
                {p.links.map(([k, href]) => (
                  <a key={k} href={href} target="_blank" rel="noreferrer" className="text-[13px] text-text underline decoration-[#424242] underline-offset-4 hover:decoration-leaf">
                    {k} ↗
                  </a>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
