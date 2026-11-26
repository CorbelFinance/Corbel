/**
 * Full Trust report for one token address: on-chain reads + a buy/sell simulation.
 * Results are pass / warn / fail / unknown; nothing is ever guessed into a pass.
 */
import { formatUnits, keccak256, type Address, type PublicClient } from "viem";
import { readToken, ZERO } from "../chain.ts";
import type { TrustCheck, TrustReport } from "../schemas.ts";
import { readContractFacts } from "./contract.ts";
import { BASE_DECIMALS, ISSUER_CONTROLLED, KNOWN_LOCKERS, RH, THIN_RESERVE } from "./addresses.ts";
import { ISSUERS } from "../stocks.ts";
import { readV4Lock } from "./lock.ts";
import { runHop } from "./quote.ts";
import { findV2, scanV4, type V2Pool, type V4Pool } from "./pools.ts";
import { simulateV2, simulateV4, type SimResult } from "./sim.ts";
import { readWaivers, type Waivers } from "./waivers.ts";
import { rankV4ByDepth } from "../market.ts";

export interface TrustIndex {
  /** v4 pools from the local index (faster and deeper than a live scan) */
  v4PoolsFor?(token: string): V4Pool[] | undefined;
  /** how many pools this launcher created, and how many of them are dead (index-based) */
  launcherHistory?(addr: string): { launches: number; dead: number; checked: number } | null;
  /** the wallet that created a token on a launchpad (launch watch), when the token was born there */
  launchCreator?(token: string): string | null;
  /** everything a wallet launched (launchpads and pools): how many, how many drained, how many with a known fate */
  creatorRecord?(addr: string): { total: number; drained: number; known: number; bulk: boolean } | null;
  /** sender of the pool-creation tx, from the index (V2 pairs carry no creator in their event) */
  poolLauncher?(id: string): string | null;
  /** other tokens using the same ticker */
  sameTicker?(symbol: string, exclude: string): number;
  /** the launch transaction of a launchpad token */
  launchTx?(token: string): { tx: string; pad: string; block: number } | null;
}

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(v < 0.1 ? 2 : 1)}%`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const ABILITY_TEXT: Record<string, string> = {
  mint: "mint new tokens",
  pause: "pause transfers",
  blacklist: "block wallets",
  fees: "change fees",
  limits: "change transfer limits",
  tradingGate: "switch trading on or off",
};

export async function buildReport(client: PublicClient, token: Address, query: string, index?: TrustIndex): Promise<TrustReport> {
  const t0 = Date.now();
  const [read, facts, v2, block, code] = await Promise.all([
    readToken(client, token),
    readContractFacts(client, token),
    findV2(client, token),
    client.getBlockNumber(),
    client.getCode({ address: token }).catch(() => undefined),
  ]);
  if (!read) throw new Error("not-robinhood-chain");
  const isToken = read.hasCode && read.symbol !== null && read.decimals !== null;
  // Robinhood stock tokens all run the issuer's proxy: same runtime code. A name that claims the issuer without it is a lookalike.
  const stockIssuer = !!code && code !== "0x" ? ISSUERS[keccak256(code)] : undefined;
  const stockIssued = !!stockIssuer;
  const claimsStock = /robinhood (token|stock)|xstock/i.test(read.name ?? "");

  // venues: V2 pairs (WETH deepest first, then USDG), then v4 pools whose other side we can fund
  const fundable = new Set([ZERO, RH.WETH, RH.USDG].map((a) => a.toLowerCase()));
  const deepest = (a: V2Pool, b: V2Pool) => (b.baseReserve > a.baseReserve ? 1 : b.baseReserve < a.baseReserve ? -1 : 0);
  const v2Sorted = [...v2.filter((p) => p.base === "WETH").sort(deepest), ...v2.filter((p) => p.base === "USDG").sort(deepest)];
  let v4: V4Pool[] = [];
  const v2Live = v2Sorted.some((p) => p.baseReserve >= THIN_RESERVE[p.base] / 1000n);
  if (isToken && !v2Live) v4 = index?.v4PoolsFor?.(token) ?? (await scanV4(client, token));
  const v4Usable = v4
    .filter((p) => {
      const other = p.key.currency1.toLowerCase() === token.toLowerCase() ? p.key.currency0 : p.key.currency1;
      return fundable.has(other.toLowerCase());
    })
    .sort((a, b) => b.block - a.block);
  // the deepest pools first, in dollars: anyone can open a tiny lopsided pool next to a token's real one, and a check
  // run on that pool would call a sound token a trap. Depth = the base side the pool's in-range liquidity holds now.
  if (v4Usable.length > 1) {
    const ranked = await rankV4ByDepth(client, token, v4Usable);
    v4Usable.splice(0, v4Usable.length, ...ranked.map((r) => r.pool));
  }

  let sim: SimResult | null = null;
  let usedV2: V2Pool | null = null;
  let usedV4: V4Pool | null = null;
  if (isToken) {
    // keep the most telling result: a clean round trip wins; a run that could not start never hides a revert
    const weak = (r: SimResult | null) => !r || r.stage === "unsupported" || r.stage === "call-failed";
    const take = (r: SimResult, v2p: V2Pool | null, v4p: V4Pool | null) => {
      if (r.stage === "ok" || weak(sim)) {
        sim = r;
        usedV2 = v2p;
        usedV4 = v4p;
      }
    };
    const tries: (() => Promise<void>)[] = [
      ...v2Sorted.slice(0, 2).map((p) => async () => take(await simulateV2(client, p.pair, token, p.base === "WETH" ? RH.WETH : RH.USDG, p.baseReserve), p, null)),
      ...v4Usable.slice(0, 3).map((p) => async () => take(await simulateV4(client, p.key, token), null, p)),
    ];
    for (const t of tries) {
      await t();
      if (sim && (sim as SimResult).stage === "ok") break;
    }
  }
  const simR = sim as SimResult | null;
  const wethPair = usedV2 as V2Pool | null;
  const v4Native = usedV4 as V4Pool | null;

  // launcher: sender of the pool-creation tx (v4 known from the event; v2 needs the index)
  let launcher: string | null = null;
  if (wethPair) launcher = index?.poolLauncher?.(wethPair.pair) ?? null;
  else if (v4Native) {
    try {
      launcher = (await client.getTransaction({ hash: v4Native.tx })).from;
    } catch {
      launcher = null;
    }
  }

  // exit: sell the amount a buyer would hold against the pool as it is now (no buy in front of it)
  const exitP: Promise<{ out: bigint | null; reason: string | null } | null> =
    simR?.stage === "ok" && simR.bought
      ? wethPair
        ? runHop(client, { venue: "v2", pool: wethPair.pair, from: token, to: (wethPair.base === "WETH" ? RH.WETH : RH.USDG) as Address, fee: 3000, hooked: false }, BigInt(simR.bought))
        : v4Native
          ? runHop(client, { venue: "v4", pool: v4Native.id, from: token, to: (v4Native.key.currency0.toLowerCase() === token.toLowerCase() ? v4Native.key.currency1 : v4Native.key.currency0) as Address, fee: v4Native.key.fee, hooked: false, key: v4Native.key }, BigInt(simR.bought))
          : Promise.resolve(null)
      : Promise.resolve(null);
  const lockP = v4Native ? readV4Lock(client, v4Native.id, v4Native.key.hooks, v4Native.block ?? null, block).catch(() => null) : Promise.resolve(null);
  const [exit, lock] = await Promise.all([exitP, lockP]);

  const checks: TrustCheck[] = [];
  const venueText = wethPair ? `V2 ${wethPair.base} pair ${short(wethPair.pair)}` : v4Native ? `v4 ${simR?.base ?? ""} pool ${short(v4Native.id)}`.replace("  ", " ") : null;

  // 1. honeypot
  if (!isToken) checks.push({ id: "honeypot", name: "Honeypot", result: "fail", reason: "Not a token contract." });
  else if (!simR) checks.push({ id: "honeypot", name: "Honeypot", result: "unknown", reason: "No pool against ETH, WETH or USDG found to simulate against." });
  else if (simR.stage === "ok") {
    // a sell that works but hands back a fraction is a trap too (asymmetric hook fees, one-sided liquidity)
    const loss = simR.roundTripLoss ?? 0;
    checks.push({
      id: "honeypot",
      name: "Honeypot",
      result: loss < 0.1 ? "pass" : loss < 0.5 ? "warn" : "fail",
      reason:
        loss < 0.1
          ? `Bought and sold back in a simulation on the ${venueText}.`
          : `Selling works, but buying and selling straight back loses ${pct(loss)} on the ${venueText}.`,
      metric: `−${pct(simR.roundTripLoss)} round trip`,
      value: { loss },
    });
  }
  else if (simR.stage === "sell-reverted" && wethPair && wethPair.baseReserve < THIN_RESERVE[wethPair.base] / 1000n)
    // a dust pool can't pay out a sell at all: that says nothing about the token
    checks.push({ id: "honeypot", name: "Honeypot", result: "unknown", reason: `The ${venueText} is too thin to pay out a test sell. Not a verdict on the token.` });
  else if (simR.stage === "transfer-reverted" || simR.stage === "sell-reverted")
    checks.push({ id: "honeypot", name: "Honeypot", result: "fail", reason: `Buy worked, sell reverted${simR.reason ? `: ${simR.reason}` : ""}.` });
  else if (simR.stage === "unsupported" || simR.stage === "call-failed")
    checks.push({ id: "honeypot", name: "Honeypot", result: "unknown", reason: `Simulation could not run${simR.reason ? `: ${simR.reason.replace(/\.$/, "")}` : ""}.` });
  else checks.push({ id: "honeypot", name: "Honeypot", result: "warn", reason: `Buy reverted in simulation${simR.reason ? `: ${simR.reason.replace(/\.$/, "")}` : ""}. Trading may be closed.` });

  // 1b. exit right now
  if (simR?.stage === "ok" && exit) {
    const spent = BigInt(simR.amountIn);
    const back = exit.out ?? 0n;
    const share = spent > 0n ? Number((back * 10_000n) / spent) / 10_000 : null;
    if (exit.out === null)
      checks.push({ id: "exit", name: "Exit now", result: "warn", reason: `${exit.reason ?? "A sell would pay nothing."} Holders can only sell into new buys.`, metric: "0 back", value: { share: 0 } });
    else
      checks.push({
        id: "exit",
        name: "Exit now",
        result: share !== null && share < 0.5 ? "warn" : "pass",
        reason: share !== null && share < 0.5 ? "Selling a buyer-size bag right now returns under half its cost: the pool is lopsided." : "A buyer-size bag sells into the pool as it is now.",
        metric: share === null ? undefined : `${(share * 100).toFixed(1)}% of cost back`,
        value: share === null ? undefined : { share },
      });
  } else if (simR && (simR.stage === "sell-reverted" || simR.stage === "transfer-reverted"))
    // always seven rows: a sale that reverts pays nothing back
    checks.push({ id: "exit", name: "Exit now", result: "fail", reason: "The simulated sell reverted: nothing comes back right now.", metric: "0 back", value: { share: 0 } });
  else
    // an exit that could not be measured is said, never dropped
    checks.push({
      id: "exit",
      name: "Exit now",
      result: "unknown",
      reason: !isToken ? "Not a token contract." : simR?.stage === "ok" ? "The sell back into the pool could not be quoted." : "Needs a successful simulated buy and sell.",
    });

  // 2. taxes
  if (simR && simR.buyTax !== null) {
    const worst = Math.max(simR.buyTax ?? 0, simR.sellTax ?? 0);
    checks.push({
      id: "tax",
      name: "Buy / sell tax",
      result: simR.sellTax === null ? "warn" : worst < 0.01 ? "pass" : worst < 0.1 ? "warn" : "fail",
      reason: simR.sellTax === null ? `Buy tax measured; sell could not be measured.` : worst < 0.01 ? "No transfer tax on buy or sell." : "Tokens are taken on transfer.",
      metric: `${pct(simR.buyTax)} / ${pct(simR.sellTax)}`,
      value: { buy: simR.buyTax ?? 0, ...(simR.sellTax === null ? {} : { sell: simR.sellTax }) },
    });
  } else checks.push({ id: "tax", name: "Buy / sell tax", result: "unknown", reason: "Needs a successful simulated buy." });

  // 3. owner rights
  const renounced = read.owner !== null && read.owner.toLowerCase() === ZERO;
  const risky = facts.abilities.filter((a) => a !== "tradingGate");
  const issuer = ISSUER_CONTROLLED[token.toLowerCase()];
  if (!read.hasCode) checks.push({ id: "owner", name: "Owner rights", result: "fail", reason: "No contract at this address." });
  else if (stockIssued)
    checks.push({ id: "owner", name: "Owner rights", result: "warn", reason: "Issuer stock token: the issuer can upgrade, pause or freeze it through its proxy. Expected for a stock token, not a rug signal." });
  else if (issuer && (facts.proxy || read.owner))
    checks.push({
      id: "owner",
      name: "Owner rights",
      result: "warn",
      reason: token.toLowerCase() === RH.WETH.toLowerCase()
        ? "The chain's own WETH: its code sits behind the chain operator's upgradeable proxy, as on every rollup. Not a rug signal."
        : `Issuer-controlled ${issuer}: the issuer can upgrade, freeze or mint. Expected for a regulated stablecoin, not a rug signal.`,
    });
  else if (facts.proxy) checks.push({ id: "owner", name: "Owner rights", result: "fail", reason: `Upgradeable proxy: the code can be replaced (implementation ${short(facts.implementation!)}).` });
  else if (renounced) checks.push({ id: "owner", name: "Owner rights", result: "pass", reason: risky.length ? `Ownership renounced; owner-only functions (${risky.map((a) => ABILITY_TEXT[a]).join(", ")}) are locked.` : "Ownership renounced." });
  else if (risky.length)
    checks.push({ id: "owner", name: "Owner rights", result: "fail", reason: `Owner ${read.owner ? short(read.owner) : "(no owner() function)"} can ${risky.map((a) => ABILITY_TEXT[a]).join(", ")}.` });
  else if (read.owner) checks.push({ id: "owner", name: "Owner rights", result: "warn", reason: `Owner ${short(read.owner)} is live, but no mint, pause, blacklist or fee switch was found.` });
  else checks.push({ id: "owner", name: "Owner rights", result: "pass", reason: "No owner and no admin functions found in the code." });

  // 4. liquidity
  if (wethPair) {
    const b = wethPair.lpBurned;
    const thin = wethPair.baseReserve < THIN_RESERVE[wethPair.base];
    const depth = `${new Intl.NumberFormat("en", { maximumSignificantDigits: 3 }).format(Number(formatUnits(wethPair.baseReserve, BASE_DECIMALS[wethPair.base])))} ${wethPair.base}`;
    // issuer stock tokens and issuer-run stablecoins are market-made: their LP is meant to move, so unburned LP is not a rug signal
    const issuerRun = stockIssued || !!ISSUER_CONTROLLED[token.toLowerCase()];
    const lock = b === null ? "unknown" : b >= 0.95 ? "pass" : issuerRun ? "warn" : b >= 0.5 ? "warn" : "fail";
    checks.push({
      id: "liquidity",
      name: "Liquidity lock",
      result: thin && lock === "pass" ? "warn" : lock,
      reason:
        (thin ? `Thin pool: ${depth} on the base side, any trade moves the price. ` : "") +
        (b === null ? "LP supply unreadable." : b >= 0.95 ? "LP tokens are burned: the pool can't be pulled." : issuerRun ? "Issuer token: market makers provide this liquidity and can move it; size your trade to the depth." : "Most LP tokens are held by wallets that can withdraw."),
      metric: `${pct(b)} burned · ${depth}`,
      // depth against the thin-pool line of its base asset: 1 = just at the line, 10 = ten times deeper
      value: { ...(b === null ? {} : { burned: b }), depth: Number(wethPair.baseReserve) / Number(THIN_RESERVE[wethPair.base]) },
    });
  } else if (v4Native) {
    const hooked = !/^0x0{40}$/i.test(v4Native.key.hooks);
    if (!lock || lock.positions === 0)
      checks.push({
        id: "liquidity",
        name: "Liquidity lock",
        result: "unknown",
        reason: !lock ? "Liquidity events could not be read." : lock.complete ? "No open liquidity positions in this pool." : "No positions found in the recent window; older ones were not read.",
      });
    else {
      const { burned, hook, contract, wallet } = lock.shares;
      const top = lock.topHolder!;
      // a launchpad's own locker holds the liquidity for good: that counts as locked, like burned LP
      const locker = top.kind === "contract" ? KNOWN_LOCKERS[top.address.toLowerCase()] : undefined;
      const lockedForGood = !!locker && wallet === 0 && burned + contract >= 0.95;
      const result = burned >= 0.95 || lockedForGood ? "pass" : wallet > 0.5 ? "fail" : "warn";
      if (lockedForGood) {
        checks.push({
          id: "liquidity",
          name: "Liquidity lock",
          result,
          reason: `${pct(burned + contract)} held in ${locker} ${short(top.address)}, not in a wallet${burned > 0 ? `; ${pct(burned)} of it burned` : ""}. The launchpad owns that locker, not the creator.${lock.complete ? "" : " Older events not read."}`,
          metric: `${lock.positions} position${lock.positions === 1 ? "" : "s"}`,
          value: { burned: Math.min(1, burned + contract) },
        });
      } else {
      const parts = [
        burned > 0 && `${pct(burned)} burned`,
        hook > 0 && `${pct(hook)} held by the hook ${short(v4Native.key.hooks)}`,
        contract > 0 && `${pct(contract)} in contracts`,
        wallet > 0 && `${pct(wallet)} in wallets that can withdraw`,
      ].filter(Boolean);
      checks.push({
        id: "liquidity",
        name: "Liquidity lock",
        result,
        reason:
          `${parts.join(", ")}.` +
          (hook > 0.5 && hooked ? " The hook's code decides whether that liquidity can leave." : "") +
          (top.kind === "wallet" || top.kind === "contract" ? ` Largest holder: ${top.kind} ${short(top.address)}.` : "") +
          (lock.complete ? "" : " Older events not read."),
        metric: `${lock.positions} position${lock.positions === 1 ? "" : "s"}`,
      });
      }
    }
  } else checks.push({ id: "liquidity", name: "Liquidity lock", result: "unknown", reason: "No pool found." });

  // 5. ticker
  const q = query.trim().replace(/^\$/, "").toUpperCase();
  const isAddr = /^0X[0-9A-F]{40}$/.test(q);
  const dupes = isToken && read.symbol ? (index?.sameTicker?.(read.symbol, token) ?? null) : null;
  if (!isToken) checks.push({ id: "ticker", name: "Ticker vs contract", result: "fail", reason: "No symbol() on this contract." });
  else if (stockIssued) checks.push({ id: "ticker", name: "Ticker vs contract", result: "pass", reason: `Issuer stock token (${stockIssuer}): same contract code as every token that issuer deployed.`, metric: `${stockIssuer} code` });
  else if (issuer)
    checks.push({ id: "ticker", name: "Ticker vs contract", result: "pass", reason: `The original ${read.symbol} of the chain${dupes ? `; the ${dupes} other contract${dupes > 1 ? "s" : ""} using the ticker ${dupes > 1 ? "are copies" : "is a copy"}` : ""}.`, metric: "original" });
  else if (claimsStock)
    checks.push({ id: "ticker", name: "Ticker vs contract", result: "fail", reason: `Calls itself a Robinhood stock token, but its code is not the issuer's. A lookalike.`, metric: "lookalike" });
  else if (!isAddr && read.symbol?.toUpperCase() !== q) checks.push({ id: "ticker", name: "Ticker vs contract", result: "fail", reason: `You asked for ${q}; the contract says ${read.symbol}.` });
  else if (dupes && dupes > 0)
    checks.push({ id: "ticker", name: "Ticker vs contract", result: "warn", reason: `${dupes} other contract${dupes > 1 ? "s" : ""} also ${dupes > 1 ? "use" : "uses"} ${read.symbol}. Check the address, not the ticker.`, metric: `${dupes + 1} × ${read.symbol}` });
  else checks.push({ id: "ticker", name: "Ticker vs contract", result: dupes === 0 ? "pass" : "unknown", reason: dupes === 0 ? `No other indexed contract uses ${read.symbol}.` : `Contract calls itself ${read.symbol}. Ticker index not loaded.` });

  // 6. creator: a token born on a launchpad has its creator in the launch watch; the pool's sender is then the launchpad
  const born = isToken ? (index?.launchCreator?.(token) ?? null) : null;
  const rec = born ? (index?.creatorRecord?.(born) ?? null) : null;
  const hist = launcher ? (index?.launcherHistory?.(launcher) ?? null) : null;
  if (stockIssued) checks.push({ id: "creator", name: "Creator history", result: "pass", reason: `Deployed by the issuer ${stockIssuer}: its code matches every token that issuer runs.`, metric: stockIssuer });
  else if (issuer) checks.push({ id: "creator", name: "Creator history", result: "pass", reason: `A base asset of the chain (${issuer}), deployed with it.`, metric: "base asset" });
  else if (born && rec)
    checks.push({
      id: "creator",
      name: "Creator history",
      result: rec.total <= 2 ? "pass" : rec.known > 0 && rec.drained / rec.known > 0.5 ? "fail" : rec.bulk ? "warn" : "pass",
      reason:
        `Created by ${short(born)}, through a launchpad: the pool is opened by the launchpad, not by the creator. ` +
        `That wallet launched ${rec.total} token${rec.total === 1 ? "" : "s"}; ` +
        (rec.known === 0 ? "none has a known fate yet." : `${rec.drained} of ${rec.known} with a known fate ${rec.drained === 1 ? "was" : "were"} drained.`),
      metric: `${rec.total} launch${rec.total === 1 ? "" : "es"}`,
      value: { launches: rec.total, ...(rec.known ? { drained: rec.drained / rec.known } : {}) },
    });
  else if (!launcher) checks.push({ id: "creator", name: "Creator history", result: "unknown", reason: wethPair ? "Pair is older than the local index window." : "Pool creator not found." });
  else if (!hist) checks.push({ id: "creator", name: "Creator history", result: "unknown", reason: `Launched by ${short(launcher)}. History needs the local index.` });
  else
    checks.push({
      id: "creator",
      name: "Creator history",
      result: hist.launches <= 2 ? "pass" : hist.checked > 0 && hist.dead / hist.checked > 0.5 ? "fail" : "warn",
      reason:
        `${short(launcher)} launched ${hist.launches} pool${hist.launches === 1 ? "" : "s"} in the indexed window; ` +
        (hist.checked === 0 ? "none of them has a known liveness yet." : `${hist.dead} of ${hist.checked} with known liveness ${hist.dead === 1 ? "is" : "are"} drained.`),
      metric: `${hist.launches} launch${hist.launches === 1 ? "" : "es"}`,
      value: { launches: hist.launches, ...(hist.checked ? { drained: hist.dead / hist.checked } : {}) },
    });

  // 7. launch-tax waivers: who the creator exempted in the launch transaction (a fact next to the score, not in it)
  let waivers: Waivers | undefined;
  const lt = isToken && !issuer && !stockIssued ? (index?.launchTx?.(token) ?? null) : null;
  if (lt && read.totalSupply) waivers = (await readWaivers(client, lt.tx as `0x${string}`, token, read.totalSupply).catch(() => null)) ?? undefined;

  // every result says where it was read and when; an unknown one is marked partial, never shown as a zero
  const at = Date.now(), bk = block.toString();
  const FROM: Record<TrustCheck["id"], [string, boolean]> = {
    honeypot: [`a simulated buy and sell on the ${venueText ?? "pool"}`, true],
    exit: [`a simulated sell on the ${venueText ?? "pool"}`, true],
    tax: [`a simulated buy and sell on the ${venueText ?? "pool"}`, true],
    owner: ["the contract's code and storage", true],
    liquidity: ["the pool's liquidity positions", true],
    ticker: ["Corbel's index of every token on the chain", false],
    creator: [born ? "Corbel's watch of every launchpad launch" : "Corbel's index of every pool and who opened it", false],
  };
  // always the same seven, in the same order: one that could not run is there as unknown, never left out
  const ORDER: TrustCheck["id"][] = ["honeypot", "exit", "tax", "owner", "liquidity", "ticker", "creator"];
  const NAMES: Record<TrustCheck["id"], string> = { honeypot: "Honeypot", exit: "Exit now", tax: "Buy / sell tax", owner: "Owner rights", liquidity: "Liquidity lock", ticker: "Ticker vs contract", creator: "Creator history" };
  for (const id of ORDER) if (!checks.some((c) => c.id === id)) checks.push({ id, name: NAMES[id], result: "unknown", reason: "Could not run on this contract." });
  checks.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const sourced = checks.map((c) => ({ ...c, source: { from: FROM[c.id][0], block: FROM[c.id][1] ? bk : null, at, partial: c.result === "unknown" } }));

  return {
    token,
    example: false,
    checks: sourced,
    ...(waivers ? { waivers } : {}),
    meta: { symbol: read.symbol, name: read.name, venue: venueText, pool: wethPair?.pair ?? v4Native?.id ?? null, block: block.toString(), ms: Date.now() - t0 },
  };
}
