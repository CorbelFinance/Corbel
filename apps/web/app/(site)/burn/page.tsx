import { BurnLedger } from "@/components/site/BurnLedger";

export const metadata = {
  title: "$CORBEL burns",
  description: "Every $CORBEL burn, read from the chain: the Fee Burn contract, what it is allowed to do, and each burn with its transaction.",
};

const SCAN = "https://robinhoodchain.blockscout.com";
const PB = "0x8e649485F2800Ec9CB8f1382C6B27c5Cb7782F98";
const SHARE = 10;
const PENALTY = 20;
const SILENT_DAYS = 7;

const RULES = [
  ["Where the fees go", "The token's trading fees go to the Fee Burn contract instead of a team wallet. The contract splits them itself."],
  ["What it burns", `${SHARE}% of every new fee buys $CORBEL in the live pool and destroys it with the token's own burn(). The rest goes to the team in the same transaction.`],
  ["What it cannot do", "It has no owner and no withdraw. The share, the pool and the team address are fixed. Money set aside for a burn can only leave as burned $CORBEL."],
  ["Each burn carries a record", "Every burn writes the newest sealed record of our token checks in the same transaction. No record, no burn."],
  ["When we get it wrong", `A check we called clean that is then drained, or a date we committed on chain and missed, raises the share to ${PENALTY}% for a day.`],
  ["It does not need us", `If no burn happens for ${SILENT_DAYS} days, anyone can run the next one.`],
] as const;

export default function Burn() {
  return (
    <main className="mx-auto max-w-page px-4 pb-28 pt-28 sm:px-6 sm:pt-36 lg:px-10 xl:px-14">
      <header className="relative overflow-hidden rounded-[28px] border border-[#242424] bg-[radial-gradient(70%_120%_at_0%_0%,rgba(255,154,92,0.12),transparent_60%),#0d0d0d] p-6 sm:p-10">
        <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-[#ff9a5c]">$CORBEL · burns</p>
        <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.95] tracking-tight sm:text-6xl">Every burn, on chain.</h1>
        <p className="mt-5 max-w-2xl text-[16px] text-muted">How much of the billion is gone, the contract that burns it and every burn with its transaction. Nothing here is typed by hand: the page reads the chain.</p>
        <p className="mt-2 max-w-2xl text-[13px] text-muted">In its code and on the explorer the contract is named CorbelProofBurn; it is the same contract.</p>
        <div className="mt-6 flex flex-wrap gap-3 text-[14px]">
          <a href={`${SCAN}/address/${PB}`} target="_blank" rel="noreferrer" className="rounded-full border border-[#ff9a5c] px-4 py-2 font-mono text-[13px] text-text hover:bg-[#ff9a5c]/10">
            Fee Burn contract · 0x8e64…2F98
          </a>
          <a href={`https://repo.sourcify.dev/4663/${PB}`} target="_blank" rel="noreferrer" className="rounded-full border border-[#2a2a2a] px-4 py-2 text-text hover:border-leaf">
            Verified source
          </a>
          <a href="https://github.com/CorbelFinance/Corbel/blob/main/packages/contracts/src/CorbelProofBurn.sol" target="_blank" rel="noreferrer" className="rounded-full border border-[#2a2a2a] px-4 py-2 text-text hover:border-leaf">
            Code and tests
          </a>
        </div>
      </header>

      <section className="mt-12">
        <BurnLedger />
      </section>

      <section className="mt-16">
        <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-leaf">How Fee Burn works</p>
        <h2 className="mt-2 font-display text-3xl tracking-tight text-text sm:text-4xl">The rules are in the contract.</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {RULES.map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-[#242424] bg-[#0f0f0f] p-5">
              <p className="text-[15px] font-semibold text-text">{k}</p>
              <p className="mt-2 text-[14px] text-muted">{v}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-[14px] text-muted">
          It runs until 24 December 2026, then the fees go back to the team. Burns by the team wallet are bought on the open market and come on top. The contract has no external audit; its source is public and verified. We never say a burn moves the price.
        </p>
      </section>
    </main>
  );
}
