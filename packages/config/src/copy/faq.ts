/** {{flags}} is replaced by the live list of layer statuses. */
export type FaqTag = "Product" | "Cost" | "Access" | "Risk";

export const FAQ: {
  label: string;
  title: string;
  sub: string;
  filters: ("All" | FaqTag)[];
  items: { tag: FaqTag; q: string; a: string; link?: { label: string; href: string } }[];
} = {
  label: "10 / FAQ",
  title: "Before you begin.",
  sub: "Straight answers first. Links where the detail lives.",
  filters: ["All", "Product", "Cost", "Access", "Risk"],
  items: [
    { tag: "Product", q: "Is there a token?", a: "Yes: $CORBEL, launched on Pons on 2026-11-20. The contract is on the home page. Nothing here is an offer or a promise of price." },
    { tag: "Product", q: "Is this live?", a: "Most of it. Check, Trade, Stocks, Earn, Predict, Agents, AI & GPUs and wallet tools run on Robinhood Chain mainnet today. Launch and Shield are not open yet." },
    { tag: "Product", q: "Do I need a separate account for each tool?", a: "No. One wallet and one sign-in cover every tool." },
    { tag: "Cost", q: "What does it cost?", a: "Fees are targets until launch. Launch trading fee: {{launchFee}}." },
    {
      tag: "Product",
      q: "How is this different from a launchpad?",
      a: "Four things: a refund window, a pre-trade check, stock tools for the weekend gap, and capped cover.",
    },
    {
      tag: "Risk",
      q: "Is it audited?",
      a: "No. When a report exists, it will be linked under Transparency.",
      link: { label: "See transparency", href: "/app/account/transparency" },
    },
    { tag: "Product", q: "Can I talk to AI models here?", a: "Yes. AI & GPUs has a chat with every model we run. Try 3 messages a day without a wallet. Sign in for 30, or 50 and 150 as a holder. Nothing you write is kept.", link: { label: "Open the chat", href: "/app/ai/chat" } },
    { tag: "Risk", q: "What can I lose?", a: "Everything you put into a strategy or a launch. The Gap Fund pays only up to what it holds." },
    {
      tag: "Access",
      q: "Which network is this?",
      a: "Robinhood Chain mainnet, chain 4663. Every contract we run is listed with its address.",
      link: { label: "See the contracts", href: "/app/account/transparency" },
    },
  ],
};
