"use client";

/**
 * The app's top navigation: tasks, not layers. Each group opens a menu of tools with a one-line purpose,
 * so a visitor picks what to do ("check a token") instead of guessing which layer holds it.
 * Click or Enter opens a menu; Escape or a click outside closes it.
 */
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { blockTone, HELD, PORTFOLIO_TONE } from "@corbel/config";
import { cx } from "@corbel/ui";
import { NavIcon } from "./NavIcon";

type Item = { href: string; title: string; text: string; tag?: string };
type Group = { id: string; label: string; match: string[]; items: Item[]; soon?: boolean };

const GROUPS: Group[] = [
  {
    id: "trade",
    label: "Trade",
    match: ["/app/trade"],
    items: [
      { href: "/app/trade/terminal", title: "Terminal", text: "Trending tokens, chart, swaps and depth" },
      { href: "/app/trade/quote", title: "Swap quote", text: "Every route, simulated at the latest block" },
      { href: "/app/trade/split", title: "Sell in parts", text: "One big sell against the same sell in parts" },
      { href: "/app/trade/many", title: "Sell many", text: "Clear small holdings into ETH, one by one" },
      { href: "/app/trade/whales", title: "Big swaps", text: "Largest swaps and the wallets behind them" },
      { href: "/app/trade/orders", title: "Orders", text: "Limit, stop, DCA and TWAP" },
      { href: "/app/trade/filler", title: "Filler desk", text: "How keepers fill orders", tag: "spec" },
    ],
  },
  {
    id: "check",
    label: "Check",
    match: ["/app/trust"],
    items: [
      { href: "/app/trust/check", title: "Token check", text: "Seven checks before you buy" },
      { href: "/app/trust/radar", title: "Radar", text: "New pools, newest first" },
      { href: "/app/trust/launches", title: "Launch analytics", text: "Who launches, where, what survives" },
      { href: "/app/trust/creator", title: "Creator dossier", text: "Every token one wallet launched" },
      { href: "/app/trust/address", title: "Address", text: "Who an address is and what it moved" },
      ...(HELD.fair ? [] : [{ href: "/app/trust/fair", title: "Fair launch", text: "What a launch shows its buyers" }]),
      { href: "/app/trust/api", title: "API", text: "The same checks as a GET request" },
    ],
  },
  {
    id: "stocks",
    label: "Stocks",
    match: ["/app/stocks"],
    items: [
      { href: "/app/stocks/market", title: "Stock market", text: "Map, breadth, venues and pools" },
      { href: "/app/stocks/loan", title: "Loan calculator", text: "What a loan against a stock token can take" },
      { href: "/app/stocks/desk", title: "Stock tokens", text: "Issuer code or a lookalike", tag: "soon" },
    ],
  },
  {
    id: "predict",
    label: "Predict",
    soon: true,
    match: ["/app/predict"],
    items: [
      { href: "/app/predict", title: "Markets", text: "Will a pool keep its liquidity? Stake YES or NO" },
      { href: "/docs/predict", title: "How settlement works", text: "Stakes, timing weight, the chain as the judge" },
    ],
  },
  {
    id: "earn",
    label: "Earn",
    match: ["/app/account"],
    items: [
      { href: "/app/account/pools", title: "Pool fees", text: "What LPs earned last day, and your share" },
      { href: "/app/account/dashboard", title: "Account", text: "One balance; read any address" },
      { href: "/app/account/transparency", title: "Transparency", text: "Contracts and where funds sit" },
      { href: "/docs/earn", title: "How fees are counted", text: "Fee yield, impermanent loss, net" },
    ],
  },
  {
    id: "launch",
    label: "Launch",
    soon: true,
    match: ["/app/launch/overview", "/app/launch/dashboard"],
    items: [
      { href: "/app/launch/dashboard", title: "Creator dashboard", text: "What a fair launch shows its buyers", tag: "spec" },
      { href: "/app/launch/overview", title: "How a launch works", text: "Window, fee split, refunds" },
    ],
  },
  {
    id: "agents",
    label: "Agents",
    match: ["/app/agents"],
    items: [
      { href: "/app/agents/strategies", title: "Mandate builder", text: "Draft rules and see the worst day" },
      { href: "/app/agents/guard", title: "Guard", text: "Rules every agent trade must pass" },
      { href: "/app/agents/break", title: "Break it", text: "Attack a real mandate on live pools" },
      { href: "/app/agents/versus", title: "Versus", text: "Two agents on one market" },
      { href: "/app/agents/limits", title: "Limits", text: "What an agent can and can't change" },
      { href: "/app/agents/log", title: "Decision log", text: "What the contract decided, block by block" },
      { href: "/docs/mcp", title: "Agent tools (MCP)", text: "Checks, quotes and the radar for any agent" },
      { href: "/docs/api", title: "API", text: "Every read as a plain GET" },
    ],
  },
  {
    id: "compute",
    label: "AI & GPUs",
    match: ["/app/ai"],
    items: [
      { href: "/app/ai/chat", title: "Chat", text: "Talk to any model we run" },
      { href: "/app/ai/studio", title: "Studio", text: "Every model and GPU, priced live" },
      { href: "/app/ai/models", title: "AI models", text: "Compare providers, see the cheapest" },
      { href: "/app/ai/gpus", title: "GPUs", text: "Free holder machines, rates and the fit finder" },
      { href: "/app/ai/credits", title: "Credits", text: "One balance for all of it", tag: "soon" },
    ],
  },
  {
    id: "wallet",
    label: "Wallet",
    match: ["/app/wallet"],
    items: [
      { href: "/app/wallet/approvals", title: "Approvals", text: "Who can move your tokens" },
      ...(HELD.xray ? [] : [{ href: "/app/wallet/xray", title: "X-ray", text: "What selling it all really pays" }]),
      ...(HELD.preview ? [] : [{ href: "/app/wallet/preview", title: "Before you sign", text: "What a transaction would move" }]),
      { href: "/app/wallet/exposure", title: "Exposure", text: "How others see this wallet" },
      { href: "/app/wallet/stress", title: "Stress test", text: "Your holdings after a fall" },
      { href: "/app/wallet/paper", title: "Paper account", text: "Trade pretend USDG at real fills" },
      { href: "/app/wallet/share", title: "Share link", text: "Expiring, no address shown" },
    ],
  },
  {
    id: "shield",
    label: "Shield",
    match: ["/app/shield"],
    items: [{ href: "/app/wallet/approvals", title: "Approvals", text: "Who can move your tokens, and revoke" }],
  },
];

/** Live tools first: a tool not open yet (soon, plan, spec) sits at the end of its group, and a group that is not
 * open yet sits at the bottom of the menu. */
const ready = (it: Item) => (it.tag ? 1 : 0);
export const NAV_GROUPS: Group[] = GROUPS.map((g) => ({ ...g, items: [...g.items].sort((a, b) => ready(a) - ready(b)) })).sort((a, b) => (a.soon ? 1 : 0) - (b.soon ? 1 : 0));

export function AppNav() {
  const path = usePathname() ?? "";
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  return (
    <nav ref={root} aria-label="App sections" className="relative mx-auto max-w-page px-4 sm:px-6 lg:px-10 xl:px-14">
      <ul className="-mb-px flex gap-0.5 overflow-x-auto [scrollbar-width:none] md:overflow-visible">
        <li className="shrink-0">
          <a href="/app/overview" aria-current={path.startsWith("/app/overview") ? "page" : undefined} className={cx("my-1.5 flex h-9 items-center rounded-xl px-2 text-[13px] font-medium transition-colors md:px-1 lg:px-3.5 lg:text-[14px]", path.startsWith("/app/overview") ? "bg-[#202020] text-text" : "text-muted hover:text-text")}>
            <NavIcon id="overview" className="hidden h-[18px] w-[18px] md:block lg:hidden" />
            <span className="md:sr-only lg:not-sr-only">Overview</span>
          </a>
        </li>
        {/* groups not open yet stay out of the menu; they are listed once, in the sidebar's Soon group */}
        {NAV_GROUPS.filter((g) => !g.soon).map((g) => {
          const active = g.match.some((m) => path.startsWith(m)) || g.items.some((i) => path.startsWith(i.href));
          const isOpen = open === g.id;
          return (
            <li key={g.id} className="shrink-0 md:relative">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`nav-${g.id}`}
                onClick={() => setOpen(isOpen ? null : g.id)}
                style={{ color: blockTone(g.id) }}
                className={cx("my-1.5 flex h-9 items-center gap-1 rounded-xl px-2 text-[13px] font-medium transition-colors lg:gap-1.5 lg:px-3.5 lg:text-[14px]", !blockTone(g.id) && (active ? "text-text" : "text-muted hover:text-text"), g.id === "compute" && active && "bg-[#2a1a10]", g.id !== "compute" && active && "bg-[#202020]")}
              >
                {g.label}
                <span aria-hidden className={cx("text-[12px] transition-transform", isOpen && "rotate-180")}>
                  ▾
                </span>
              </button>
              {isOpen && (
                <div id={`nav-${g.id}`} className="fixed inset-x-4 top-[100px] z-50 md:absolute md:inset-x-auto md:left-0 md:top-full md:mt-1 md:w-[22rem]">
                <div className="inst shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]">
                  <span aria-hidden className="inst-sq tl" />
                  <span aria-hidden className="inst-sq tr" />
                  <span aria-hidden className="inst-sq bl" />
                  <span aria-hidden className="inst-sq br" />
                  <ul className="py-1">
                    {g.items.map((it) => (
                      <li key={it.href}>
                        <a href={it.href} aria-current={path.startsWith(it.href) ? "page" : undefined} className={cx("group block px-4 py-2.5 transition-colors hover:bg-leaf/[0.06]", path.startsWith(it.href) && "bg-leaf/[0.06]")}>
                          <span className="flex items-center gap-2 text-[14px] text-text">
                            {it.title}
                            {it.tag && <span className="border border-line px-1.5 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{it.tag}</span>}
                            <span aria-hidden className="ml-auto text-leaf opacity-0 transition-opacity group-hover:opacity-100">
                              →
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[12px] text-muted">{it.text}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
                </div>
              )}
            </li>
          );
        })}
        <li className="shrink-0">
          <a href="/app/portfolio" aria-current={path.startsWith("/app/portfolio") ? "page" : undefined} className={cx("my-1.5 flex h-9 items-center rounded-xl px-2 text-[13px] font-medium transition-colors lg:px-3.5 lg:text-[14px]", path.startsWith("/app/portfolio") && "bg-[#202020]")} style={{ color: PORTFOLIO_TONE }}>
            Portfolio
          </a>
        </li>
      </ul>
    </nav>
  );
}
