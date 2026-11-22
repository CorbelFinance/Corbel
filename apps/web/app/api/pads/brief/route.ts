import { DIRECT_PAD, LAUNCHPADS, launchpadOf } from "@corbel/config";
import { curveLaunches, indexStatus, launchesSince } from "@corbel/indexer";
import { availReady, briefModel } from "@/lib/compute";
import { guardWait } from "@/lib/guard";
import { curveProgress } from "@/lib/curve";
import { LOGO_DIR, padCurve } from "@/lib/padArt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/pads/brief → the launch watch agent. Every ten minutes it reads the last 24 hours of launches from our own
 * index, works out the facts by rule (launches per launchpad, creators launching again and again, tickers that copy
 * the chain's money, names launched many times over, pools already drained), and has a small model write them up in
 * four short lines. The model only rewords the facts it is handed; if it is not available, the rules write the lines.
 */
const BPS = 4;
const MONEY = new Set(["USDG", "USDC", "USDT", "ETH", "WETH", "CBBTC", "BTC", "WBTC"]);
type Flag = { kind: "serial" | "lookalike" | "clone" | "drained"; title: string; note: string; token?: string; creator?: string; pad?: string };
type Near = { token: string; symbol: string | null; pad: string; sold: number; ago: number };
type Brief = { at: number; head: number; by: "agent" | "rules"; lines: string[]; flags: Flag[]; near: Near[]; onCurve: number; counts: { hour: number; day: number; pads: number; drained: number }; byPad: { name: string; day: number; hour: number }[] };
const G = globalThis as unknown as { __corbelBrief?: { at: number; body: Brief; busy: boolean } };
const padName = (id: string) => LAUNCHPADS.find((x) => x.id === id)?.name ?? (id === DIRECT_PAD.id ? DIRECT_PAD.name : "an unlabelled contract");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Closest to graduating: the launchpad's own progress where it publishes one, our chain reading for the others. */
function nearList(): { near: Near[]; onCurve: number } {
  const own = padCurve(LOGO_DIR);
  const seen = new Set(own.map((x) => x.token));
  const cp = curveProgress().rows;
  const ours = cp.filter((x) => !seen.has(x.token.toLowerCase()) && x.pad !== "pons");
  const all: Near[] = [
    ...own.map((x) => ({ token: x.token, symbol: x.symbol, pad: "Pons", sold: x.progress, ago: 0 })),
    ...ours.map((x) => ({ token: x.token, symbol: x.symbol, pad: padName(x.pad), sold: x.sold, ago: x.ago })),
  ].filter((x) => x.sold >= 0.05);
  all.sort((a, b) => b.sold - a.sold);
  return { near: all.slice(0, 8), onCurve: Math.max(cp.length, own.length) };
}
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function facts() {
  const st = indexStatus();
  if (!st?.high) return null;
  const head = st.high, day = head - 86_400 * BPS, hour = head - 3600 * BPS;
  const curve = curveLaunches(day, 6000);
  const pools = launchesSince(day, 8000) ?? [];
  const byPad = new Map<string, { day: number; hour: number }>();
  const bump = (id: string, block: number) => {
    const p = byPad.get(id) ?? { day: 0, hour: 0 };
    p.day++;
    if (block >= hour) p.hour++;
    byPad.set(id, p);
  };
  const seen = new Set<string>();
  for (const r of curve) {
    seen.add(r.token.toLowerCase());
    bump(r.pad, r.block);
  }
  let drained = 0;
  const drainedPad = new Map<string, number>();
  for (const r of pools) {
    const id = launchpadOf(r.pad, r.hook) ?? "other";
    if (!seen.has(r.token.toLowerCase())) bump(id, r.block);
    seen.add(r.token.toLowerCase());
    if (r.dead === 1) {
      drained++;
      drainedPad.set(id, (drainedPad.get(id) ?? 0) + 1);
    }
  }
  // creators who launched again and again in a day
  const byCreator = new Map<string, { n: number; pad: string; last: string; syms: string[] }>();
  for (const r of curve) {
    if (!r.creator) continue;
    const k = r.creator.toLowerCase();
    const c = byCreator.get(k) ?? { n: 0, pad: r.pad, last: r.token, syms: [] };
    c.n++;
    if (r.symbol && c.syms.length < 4) c.syms.push(r.symbol);
    byCreator.set(k, c);
  }
  const serial = [...byCreator.entries()].filter(([, c]) => c.n >= 3).sort((a, b) => b[1].n - a[1].n);
  // the same ticker launched many times over
  const bySym = new Map<string, number>();
  for (const r of curve) if (r.symbol) bySym.set(r.symbol.toUpperCase(), (bySym.get(r.symbol.toUpperCase()) ?? 0) + 1);
  const clones = [...bySym.entries()].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]);
  const lookSeen = new Set<string>();
  const looks = [...curve, ...pools].filter((r) => MONEY.has((r.symbol ?? "").toUpperCase()) && !lookSeen.has(r.token.toLowerCase()) && !!lookSeen.add(r.token.toLowerCase()));

  const flags: Flag[] = [];
  for (const [who, c] of serial.slice(0, 6))
    flags.push({ kind: "serial", creator: who, token: c.last, pad: padName(c.pad), title: `${short(who)} launched ${c.n} tokens`, note: `${c.syms.join(", ")}${c.n > c.syms.length ? "…" : ""} on ${padName(c.pad)}` });
  for (const r of looks.slice(0, 4)) flags.push({ kind: "lookalike", token: r.token, title: `${r.symbol} is not the real ${r.symbol}`, note: `A new token at ${short(r.token)} took a money ticker` });
  for (const [s, n] of clones.slice(0, 4)) flags.push({ kind: "clone", title: `${s} launched ${n} times`, note: "Same ticker, different contracts: check the address, not the name" });
  const total = [...byPad.values()].reduce((a, p) => a + p.day, 0);
  const lastHour = [...byPad.values()].reduce((a, p) => a + p.hour, 0);
  const pads = [...byPad.entries()].sort((a, b) => b[1].day - a[1].day);
  const topDrain = [...drainedPad.entries()].sort((a, b) => b[1] - a[1])[0];
  if (drained) flags.push({ kind: "drained", title: `${drained} new pools already drained`, note: topDrain ? `Most of them on ${padName(topDrain[0])}` : "" });
  // tokens still on a curve, most sold first: the ones about to graduate to a pool
  const { near, onCurve } = nearList();
  return { head, total, lastHour, pads, serial, clones, looks, drained, topDrain, flags, near, onCurve };
}

function ruleLines(f: NonNullable<ReturnType<typeof facts>>) {
  const lines: string[] = [];
  const [p1, p2] = f.pads;
  lines.push(`${f.total.toLocaleString("en")} tokens launched in the last day, ${f.lastHour.toLocaleString("en")} of them in the last hour.`);
  if (p1) lines.push(`${cap(padName(p1[0]))} made ${p1[1].day} of them${p2 ? `, ${padName(p2[0])} ${p2[1].day}` : ""}.`);
  if (f.serial.length) lines.push(`${f.serial.length} creators launched three or more tokens each; the busiest made ${f.serial[0]![1].n}.`);
  else lines.push("No creator launched more than twice.");
  if (f.near[0]) lines.push(`${f.near[0].symbol ?? "A token"} on ${f.near[0].pad} has sold ${Math.round(f.near[0].sold * 100)}% of its curve: the closest to graduating.`);
  if (f.drained) lines.push(`${f.drained} new pools are already drained.`);
  else if (f.looks.length) lines.push(`${f.looks.length} new tokens copy a money ticker such as USDG or ETH.`);
  return lines.slice(0, 6);
}

async function write(f: NonNullable<ReturnType<typeof facts>>): Promise<{ by: "agent" | "rules"; lines: string[] }> {
  const rules = ruleLines(f);
  const base = process.env.AI_BASE_URL, key = process.env.AI_API_KEY;
  if (!base || !key) return { by: "rules", lines: rules };
  await availReady(6000);
  const model = briefModel();
  if (!model) return { by: "rules", lines: rules };
  const data = {
    launches_24h: f.total,
    launches_1h: f.lastHour,
    by_launchpad_24h: f.pads.slice(0, 5).map(([id, p]) => ({ launchpad: padName(id), day: p.day, hour: p.hour })),
    creators_with_3_or_more: f.serial.slice(0, 5).map(([w, c]) => ({ creator: short(w), launches: c.n, tickers: c.syms })),
    tickers_launched_4_or_more_times: f.clones.slice(0, 5).map(([s, n]) => ({ ticker: s, times: n })),
    money_ticker_copies: f.looks.length,
    drained_pools_24h: f.drained,
    tokens_still_on_a_curve: f.onCurve,
    nearest_to_graduation: f.near.slice(0, 4).map((n) => ({ ticker: n.symbol, launchpad: n.pad, share_of_curve_sold: Math.round(n.sold * 100) })),
  };
  const sys =
    "You watch token launches on a blockchain for traders. Write exactly six lines in plain English, each a full sentence under 24 words, no bullets or numbering. Use only the numbers in the JSON. Line 1: how busy launches are, today and in the last hour. Line 2: where they come from, naming the top launchpads. Line 3: the most suspicious creator pattern and why it matters. Line 4: tickers launched many times or copies of money tickers, and the risk. Line 5: how many new pools were already drained. Line 6: which token is closest to graduating from its curve to a pool, if any, and one thing to check before buying it. No advice to buy or sell, no hype, no emojis.";
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: sys }, { role: "user", content: JSON.stringify(data) }], max_tokens: 900, temperature: 0.3 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return { by: "rules", lines: rules };
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const lines = (j.choices?.[0]?.message?.content ?? "")
      .split("\n")
      .map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim())
      .filter((l) => l.length > 8)
      .slice(0, 6);
    return lines.length >= 3 ? { by: "agent", lines } : { by: "rules", lines: rules };
  } catch {
    return { by: "rules", lines: rules };
  }
}

async function build(): Promise<Brief | null> {
  const f = facts();
  if (!f) return null;
  const w = await write(f);
  const pads = f.pads.length;
  const byPad = f.pads.slice(0, 6).map(([id, p]) => ({ name: cap(padName(id)), day: p.day, hour: p.hour }));
  return { at: Date.now(), head: f.head, ...w, flags: f.flags, near: f.near, onCurve: f.onCurve, counts: { hour: f.lastHour, day: f.total, pads, drained: f.drained }, byPad };
}

export async function GET(req: Request) {
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    const c = (G.__corbelBrief ??= { at: 0, body: null as unknown as Brief, busy: false });
    const stale = Date.now() - c.at > 10 * 60_000;
    if (c.body && stale && !c.busy) {
      // answer with the last brief at once and write the next one behind it
      c.busy = true;
      void build()
        .then((b) => b && ((c.body = b), (c.at = Date.now())))
        .finally(() => (c.busy = false));
    }
    if (!c.body) {
      const b = await build();
      if (!b) return Response.json({ error: "The index is not available yet." }, { status: 503 });
      c.body = b;
      c.at = Date.now();
    }
    // the curves move faster than the brief is rewritten: attach the latest reading to every answer
    return Response.json({ ...c.body, ...nearList() });
  } finally {
    g.release();
  }
}
