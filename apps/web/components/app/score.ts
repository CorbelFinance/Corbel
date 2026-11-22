/**
 * Corbel Score: one number for a token report, and four parts that explain it. The top is 90, not 100: checks on
 * the code show a token is not a trap, they cannot show the team will deliver, so no token gets a perfect score.
 * Each check scores pass 100, caution 60, unknown 50, fail 0. Parts are weighted averages; the total is scaled to
 * the 90 ceiling, then hard caps stop a single fatal finding from being averaged away (cannot sell: at most 10).
 */
export type Result = "pass" | "warn" | "fail" | "unknown";
export type Check = { id: string; name: string; result: Result; reason: string; metric?: string; value?: Record<string, number> };
/** Who holds the token (from the holders read): shares of supply outside pools and burn, 0..1. */
export type HoldersIn = { top10: number; insiders: number; creator: number; holders: number; largest?: number };
/** The token's market across every venue on the chain: liquidity in USD. */
export type MarketIn = { liquidity: number };

const PTS: Record<Result, number> = { pass: 100, warn: 60, unknown: 50, fail: 0 };
const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * One check on 0..100. A measured number decides when there is one, so two tokens with the same pass/warn
 * read differently; without it the result's fixed points are used.
 *   honeypot  round-trip loss above the 0.6% that pool fees cost: each 1% lost takes 4 points
 *   exit      share of cost a buyer-size bag gets back right now, as is
 *   tax       buy + sell tax: each 1% takes 4 points
 *   liquidity 60% depth (log scale against the thin-pool line: at the line 50, ten times deeper 100) + 40% LP burned;
 *             when the market across venues is known, its USD depth replaces the one pool (see score)
 *   creator   result, then 3 points off for every launch beyond the second, 40 off when most of them were drained
 */
function points(c: Check): number {
  const v = c.value;
  if (!v || c.result === "fail" || c.result === "unknown") return PTS[c.result];
  switch (c.id) {
    case "honeypot": return v.loss === undefined ? PTS[c.result] : clamp(100 - Math.max(0, v.loss - 0.006) * 400);
    case "exit": return v.share === undefined ? PTS[c.result] : clamp(v.share * 100);
    case "tax": return clamp(100 - ((v.buy ?? 0) + (v.sell ?? 0)) * 400);
    case "liquidity": {
      const depth = v.depth === undefined ? PTS[c.result] : clamp(50 + Math.log10(Math.max(1e-6, v.depth)) * 50);
      return v.burned === undefined ? depth : clamp(0.6 * depth + 0.4 * v.burned * 100);
    }
    case "creator": return clamp(PTS[c.result] - Math.max(0, (v.launches ?? 0) - 2) * 3 - ((v.drained ?? 0) > 0.5 ? 40 : 0));
    default: return PTS[c.result];
  }
}

/**
 * Holders on 0..100, the way a buyer reads a cap table: the top ten outside pools above 20% of supply cost 1.2
 * points per percent, insiders (creator, snipers, bundles) 1.5 per percent, the creator above 5% another 1 per
 * percent, and a thin crowd (under 200 holders) up to 20.
 */
/** The score's input from a full holders read (the /api/holders body); null when the read is partial. */
export function briefOf(d: { complete?: boolean; holders?: number; summary?: { top10: number; insiders: number; creator: number }; top?: { share: number; tags: string[] }[] } | null | undefined): HoldersIn | null {
  if (!d?.complete || !d.summary) return null;
  const people = (d.top ?? []).filter((x) => !x.tags.includes("pool") && !x.tags.includes("burn") && !x.tags.includes("contract"));
  return { top10: d.summary.top10, insiders: d.summary.insiders, creator: d.summary.creator, holders: d.holders ?? 0, largest: people[0]?.share ?? 0 };
}

export function holdersPoints(h: HoldersIn): number {
  let s = 100;
  s -= Math.max(0, h.top10 - 0.2) * 120;
  s -= h.insiders * 150;
  s -= Math.max(0, h.creator - 0.05) * 100;
  s -= h.holders < 50 ? 20 : h.holders < 200 ? 10 : 0;
  return Math.round(clamp(s));
}

export const PARTS = [
  { id: "exit", label: "Exit", checks: { honeypot: 3, exit: 2, tax: 2 }, weight: 0.35 },
  { id: "holders", label: "Holders", checks: {}, weight: 0.2 },
  { id: "control", label: "Control", checks: { owner: 2, ticker: 1 }, weight: 0.2 },
  { id: "liquidity", label: "Liquidity", checks: { liquidity: 1 }, weight: 0.15 },
  { id: "origin", label: "Origin", checks: { creator: 1 }, weight: 0.1 },
] as const;

/** Caps that apply whatever the average says. */
const CAPS: { id: string; result: Result; max: number; why: string }[] = [
  { id: "honeypot", result: "fail", max: 10, why: "it cannot be sold back" },
  { id: "ticker", result: "fail", max: 25, why: "it copies another token's name" },
  { id: "tax", result: "fail", max: 30, why: "a transfer tax takes part of every trade" },
  { id: "exit", result: "fail", max: 35, why: "a sale returns a fraction of the cost" },
];

/** The highest score any token can get. */
export const CEILING = 90;

/** Tags for a total on the 0 to 90 scale (a part, on 0 to 100, is tagged with `partLabel`). */
export function label(n: number) {
  return n >= 72 ? "CLEAN" : n >= 54 ? "OK" : n >= 36 ? "SKETCHY" : n >= 18 ? "RISKY" : "TRAP";
}
export function partLabel(n: number) {
  return n >= 80 ? "CLEAN" : n >= 60 ? "OK" : n >= 40 ? "SKETCHY" : n >= 20 ? "RISKY" : "TRAP";
}

/**
 * The Corbel score. Parts are weighted averages of their checks (measured where possible); a part with no data
 * is left out and the rest are re-weighted, so a missing read never counts as a pass. Issuer stocks and base
 * assets are custodied by design, so their holders part is not read against them. Hard caps follow.
 */
export function score(checks: Check[], holders?: HoldersIn | null, market?: MarketIn | null) {
  const by = new Map(checks.map((c) => [c.id, c]));
  const custodied = /issuer|base asset/i.test(by.get("creator")?.metric ?? "") || by.get("creator")?.reason.includes("Deployed by the issuer") || false;
  const parts = PARTS.map((p) => {
    if (p.id === "holders") {
      if (!holders || custodied) return null;
      const n = holdersPoints(holders);
      return { id: p.id, label: p.label, score: n, tag: partLabel(n) };
    }
    let sum = 0, w = 0;
    for (const [id, wt] of Object.entries(p.checks) as [string, number][]) {
      const c = by.get(id);
      // an exit that could not be measured is shown as a row but weighs nothing: it must never lift a honeypot's score
      if (!c || (id === "exit" && c.result === "unknown")) continue;
      // liquidity: the USD depth across every venue is the measure when known ($1K = 0, $1M = 100, log scale),
      // with the LP lock of the measured pool as 30%; one thin pool never stands for a token traded elsewhere
      const depth = market && market.liquidity > 0 ? clamp(((Math.log10(market.liquidity) - 3) / 3) * 100) : null;
      const pts = id !== "liquidity" || depth === null
        ? points(c)
        : c.result === "fail"
          ? Math.min(40, 0.7 * depth) // the pool can be pulled: depth counts, but never as a safe pool
          : clamp(0.7 * depth + 0.3 * (c.value?.burned !== undefined ? c.value.burned * 100 : PTS[c.result]));
      sum += pts * wt;
      w += wt;
    }
    if (!w) return null;
    const n = Math.round(sum / w);
    return { id: p.id, label: p.label, score: n, tag: partLabel(n) };
  });
  const used: number[] = parts.map((x, i) => (x ? PARTS[i]!.weight : 0));
  const wsum = used.reduce((a, b) => a + b, 0) || 1;
  let total = Math.round((parts.reduce((s, x, i) => s + (x ? x.score * used[i]! : 0), 0) / wsum) * (CEILING / 100));
  const capped: string[] = [];
  for (const c of CAPS) {
    if (by.get(c.id)?.result === c.result && total > c.max) {
      total = c.max;
      capped.push(c.why);
    }
  }
  // what was measured caps too: a sale that returns under half the cost, or a round trip that loses a quarter, is a trap
  const share = by.get("exit")?.value?.share, loss = by.get("honeypot")?.value?.loss;
  if (share !== undefined && share < 0.5 && total > 35) (total = 35), capped.push(`a sale returns ${Math.round(share * 100)}% of the cost`);
  if (loss !== undefined && loss > 0.25 && total > 30) (total = 30), capped.push(`a buy and sell back loses ${Math.round(loss * 100)}%`);
  if (holders && !custodied && (holders.largest ?? 0) > 0.5 && total > 25) {
    total = 25;
    capped.push(`one wallet holds ${Math.round((holders.largest ?? 0) * 100)}% of the supply`);
  }
  // the one-line why: the worst findings, in plain words
  const bad = checks.filter((c) => c.result === "fail").map((c) => c.reason);
  const warn = checks.filter((c) => c.result === "warn").map((c) => c.reason);
  const why = capped.length ? `Capped: ${capped.join("; ")}.` : bad[0] ?? warn[0] ?? "Nothing failed on the live pool.";
  return { total, tag: label(total), parts: parts.filter((x): x is NonNullable<typeof x> => !!x), why };
}

/** A post-ready line, like a bot reply: score, parts, the one-line why. */
export function shareLine(symbol: string, s: ReturnType<typeof score>) {
  return `$${symbol} · CORBEL ${s.total}/${CEILING} · ${s.parts.map((p) => `${p.label.toUpperCase()}: ${p.tag} ${p.score}`).join(" · ")}\n${s.why}\nRead from the live chain, nothing signed. Not advice.`;
}
