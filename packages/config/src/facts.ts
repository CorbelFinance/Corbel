/**
 * Every number shown on the site comes from here.
 * status:
 *   verified    shown as is, with source and date
 *   target      our own design parameter, shown with a "target" tag
 *   unverified  stated without a source attached yet: rendered as "—"
 *   needed      we do not have it at all ([FACT NEEDED]): rendered as "—"
 */
export type FactStatus = "verified" | "target" | "unverified" | "needed";

export interface Fact {
  value: string;
  label: string;
  source: string | null;
  asOf: string | null;
  status: FactStatus;
}

const u = (label: string, value: string, asOf: string | null = "2026-11"): Fact => ({
  label,
  value,
  source: null,
  asOf,
  status: "unverified",
});
const t = (label: string, value: string): Fact => ({ label, value, source: "Project design", asOf: null, status: "target" });
const n = (label: string): Fact => ({ label, value: "[FACT NEEDED]", source: null, asOf: null, status: "needed" });

export const FACTS = {
  // Chain [VERIFY]
  chainId: {
    label: "Robinhood Chain id",
    value: "4663",
    source: "eth_chainId on https://rpc.mainnet.chain.robinhood.com",
    asOf: "2026-11-12",
    status: "verified",
  },
  mainnetSince: u("Mainnet since", "1 Jul 2026", null),
  canonicalWithdraw: u("Canonical withdrawal to Ethereum", "~7 days", null),
  // Market context, from the project research doc (sources to attach)
  launchDrop: u("Drop in new launches from peak", "~88%"),
  dexVolumeDay: u("DEX volume per day", "~$684M", "2026-10-26"),
  graduationRate: u("Launches that reach a DEX pool", "~1 in 16"),
  serialTake: u("Taken by one series of 53 launches", "~$18.4M"),
  stockTokenCount: u("Stock tokens on chain", "190+"),
  weekendPremiumExample: u("Largest weekend premium seen (HIMS vs NYSE close)", "+112%"),
  morphoLltv: u("Morpho LLTV, stock tokens vs USDG", "62.5%"),
  usdgShare: u("USDG share of chain stablecoins", "~65%"),
  uniswapShare: u("Uniswap share of DEX volume", "77–86%"),
  mintBurnWindow: u("Stock token mint/burn window", "Mon 02:00 – Sat 02:00 CET/CEST", null),
  // Our targets
  launchFee: t("Launch trading fee", "1%"),
  launchFeeCreator: t("Creator share", "0.50%"),
  launchFeeReferrer: t("Referrer share", "0.20%"),
  agentLimitDelay: t("Delay before a raised agent limit applies", "1 hour"),
  referralHoldDays: t("Referral counted after", "30 days"),
  // Do not exist yet
  tvl: n("Total value locked"),
  users: n("Users"),
  lastAudit: n("Last audit"),
  contracts: n("Contract addresses"),
} satisfies Record<string, Fact>;

export type FactKey = keyof typeof FACTS;

export const isShown = (f: Fact) => f.status === "verified" || f.status === "target";

/** What a component should print. Never a raw unverified number. */
export function factText(key: FactKey): string {
  const f: Fact = FACTS[key];
  return isShown(f) ? f.value : "—";
}
