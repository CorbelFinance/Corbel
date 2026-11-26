/**
 * Linked wallets: one person with many wallets shares one limit. Design:
 *  - on-chain signals, read from the Corbel token's own transfer logs: coins sent between wallets we saw, one sender
 *    feeding several of them, several of them sending to one place, buys of near-equal size minutes apart, and (when
 *    an explorer key is set) a shared first gas funder;
 *  - traffic signals: a salted hash of the visitor's IP and a device mark, kept 24 hours, the salt changing every day
 *    so hashes never join across days; the IP itself is never stored. A signal counts only on a mass pattern (4+
 *    wallets on one IP or device in a day, 10+ for an anonymity-network exit, which many people share);
 *  - a group needs 3+ wallets and 2+ kinds of signal to share one limit; traffic alone only marks it suspect (text
 *    only until reviewed); one on-chain kind alone only puts it on watch;
 *  - a model writes a short opinion on doubtful groups for the owner; the owner decides in the admin panel, and every
 *    decision is logged.
 * The linker runs every 15 minutes in the server process.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { getClient } from "@corbel/data/chain";
import { store } from "./store";
import { briefModel, modelsReady } from "./compute";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const EVERY = 15 * 60_000;
const IP_MASS = 4, ANON_MASS = 10, DEV_MASS = 4;
const PATTERN_WINDOW_S = 600, PATTERN_SPREAD = 0.03, PATTERN_MIN = 3;

export const sybilDb = () =>
  store(
    "sybil",
    `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS seen (addr TEXT PRIMARY KEY, first INTEGER NOT NULL, last INTEGER NOT NULL);
     CREATE TABLE IF NOT EXISTS traffic (day TEXT NOT NULL, addr TEXT NOT NULL, kind TEXT NOT NULL, h TEXT NOT NULL, anon INTEGER NOT NULL, PRIMARY KEY (day, addr, kind, h));
     CREATE TABLE IF NOT EXISTS xfer (tx TEXT NOT NULL, li INTEGER NOT NULL, block INTEGER NOT NULL, src TEXT NOT NULL, dst TEXT NOT NULL, val REAL NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (tx, li));
     CREATE INDEX IF NOT EXISTS xfer_dst ON xfer (dst);
     CREATE INDEX IF NOT EXISTS xfer_src ON xfer (src);
     CREATE TABLE IF NOT EXISTS code (addr TEXT PRIMARY KEY, contract INTEGER NOT NULL);
     CREATE TABLE IF NOT EXISTS wallet (addr TEXT PRIMARY KEY, nonce INTEGER, funder TEXT, at INTEGER NOT NULL);
     CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, members TEXT NOT NULL, links TEXT NOT NULL, signals TEXT NOT NULL, state TEXT NOT NULL, updated INTEGER NOT NULL, review TEXT, reviewed INTEGER);
     CREATE TABLE IF NOT EXISTS member (addr TEXT PRIMARY KEY, gid TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS rules (addr TEXT PRIMARY KEY, rule TEXT NOT NULL, ref TEXT, at INTEGER NOT NULL);
     CREATE TABLE IF NOT EXISTS decisions (at INTEGER NOT NULL, gid TEXT NOT NULL, action TEXT NOT NULL, who TEXT NOT NULL, note TEXT);
     CREATE TABLE IF NOT EXISTS cost (day TEXT NOT NULL, who TEXT NOT NULL, tier TEXT NOT NULL, tokens REAL NOT NULL, PRIMARY KEY (day, who, tier));`,
  );

const db = sybilDb;
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const lc = (a: string) => a.toLowerCase();
const kvGet = (k: string) => (db()?.prepare("SELECT v FROM kv WHERE k = ?").get(k) as { v: string } | undefined)?.v ?? null;
const kvSet = (k: string, v: string) => db()?.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, v);

// ---------------------------------------------------------------- traffic

/** The day's salt: a secret kept on disk, mixed with the date, so a hash from one day never matches the next. */
function salt(d: string) {
  let s = kvGet("secret");
  if (!s) kvSet("secret", (s = randomBytes(32).toString("hex")));
  return createHmac("sha256", s).update(d).digest("hex");
}
const H = (d: string, v: string) => createHash("sha256").update(salt(d) + v).digest("hex").slice(0, 20);

type G = { anon: Set<string>; anonAt: number; timer: ReturnType<typeof setInterval> | null; running: boolean; lastRun: number | null; lastError: string | null };
const GL = globalThis as unknown as { __corbelSybil?: G };
const st = (GL.__corbelSybil ??= { anon: new Set(), anonAt: 0, timer: null, running: false, lastRun: null, lastError: null });

/** Anonymity-network exits are shared by many people, so they need a larger crowd before they count. The list is public. */
async function exitList() {
  if (Date.now() - st.anonAt < 12 * 3600_000) return;
  st.anonAt = Date.now();
  try {
    const r = await fetch(process.env.SHARED_EXITS_URL ?? "", { signal: AbortSignal.timeout(20_000) });
    if (r.ok) st.anon = new Set((await r.text()).split(/\s+/).filter(Boolean));
  } catch {}
}

export const DEVICE_COOKIE = "corbel_dev";
export function deviceCookie(req: Request, secure: boolean): string | null {
  if (req.headers.get("cookie")?.includes(`${DEVICE_COOKIE}=`)) return null;
  return `${DEVICE_COOKIE}=${randomBytes(16).toString("hex")}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure ? "; Secure" : ""}`;
}

/** Notes that this wallet came by, from this (hashed) IP and device. Called on sign-in and on every paid use. */
export function noteVisit(req: Request, address: string) {
  const d = db();
  if (!d) return;
  const a = lc(address), now = Date.now(), today = day(now);
  d.prepare("INSERT INTO seen (addr, first, last) VALUES (?, ?, ?) ON CONFLICT(addr) DO UPDATE SET last = excluded.last").run(a, now, now);
  const name = process.env.CLIENT_IP_HEADER;
  const ip = (name && req.headers.get(name)?.split(",")[0]?.trim()) || "";
  const dev = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${DEVICE_COOKIE}=`))?.slice(DEVICE_COOKIE.length + 1) ?? "";
  const put = d.prepare("INSERT OR IGNORE INTO traffic (day, addr, kind, h, anon) VALUES (?, ?, ?, ?, ?)");
  if (ip) put.run(today, a, "ip", H(today, ip), st.anon.has(ip) ? 1 : 0);
  if (dev) put.run(today, a, "device", H(today, dev), 0);
  // 24 hours: today and yesterday, nothing older
  d.prepare("DELETE FROM traffic WHERE day < ?").run(day(now - 86_400_000));
}

// ---------------------------------------------------------------- chain reads

const token = () => (process.env.CORBEL_TOKEN ?? "").toLowerCase() || null;

/** Reads the token's transfers since the last pass (or since CORBEL_TOKEN_FROM) into the local table. */
async function syncTransfers() {
  const t = token(), client = getClient(process.env.RPC_URL);
  if (!t || !client) return 0;
  const head = Number(await client.getBlockNumber());
  let from = Number(kvGet(`xfer:${t}`) ?? process.env.CORBEL_TOKEN_FROM ?? head - 200_000);
  const decimals = Number(kvGet(`dec:${t}`) ?? (await client.readContract({ address: t as `0x${string}`, abi: [{ type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" }], functionName: "decimals" }).catch(() => 18)));
  kvSet(`dec:${t}`, String(decimals));
  const put = db()?.prepare("INSERT OR IGNORE INTO xfer (tx, li, block, src, dst, val, at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const times = new Map<number, number>();
  const timeOf = async (b: number) => {
    if (!times.has(b)) times.set(b, Number((await client.getBlock({ blockNumber: BigInt(b) })).timestamp) * 1000);
    return times.get(b)!;
  };
  let n = 0;
  for (let steps = 0; from <= head && steps < 40; steps++) {
    const to = Math.min(head, from + 9_999);
    const logs = (await client.request({ method: "eth_getLogs", params: [{ fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, address: t, topics: [TRANSFER] }] } as never)) as { topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string }[];
    if (logs.length) {
      // block times by straight line between the window's ends: exact enough for minutes-apart patterns
      const [t0, t1] = [await timeOf(from), await timeOf(to)];
      for (const l of logs) {
        const b = Number(l.blockNumber);
        const at = Math.round(t0 + ((t1 - t0) * (b - from)) / Math.max(1, to - from));
        put?.run(l.transactionHash, Number(l.logIndex), b, `0x${l.topics[1]!.slice(26)}`, `0x${l.topics[2]!.slice(26)}`, Number(BigInt(l.data)) / 10 ** decimals, at);
        n++;
      }
    }
    from = to + 1;
    kvSet(`xfer:${t}`, String(from));
  }
  return n;
}

/** True when the address holds code (a pool, router, locker, exchange contract). Cached for good. */
async function isContract(a: string) {
  const row = db()?.prepare("SELECT contract FROM code WHERE addr = ?").get(a) as { contract: number } | undefined;
  if (row) return row.contract === 1;
  const client = getClient(process.env.RPC_URL);
  const c = client ? await client.getCode({ address: a as `0x${string}` }).then((x) => !!x && x !== "0x").catch(() => null) : null;
  if (c === null) return false;
  db()?.prepare("INSERT OR REPLACE INTO code (addr, contract) VALUES (?, ?)").run(a, c ? 1 : 0);
  return c;
}

/**
 * The first wallet that sent ETH to `a`, from a node that offers a transfer-history method (TRANSFERS_RPC with
 * TRANSFERS_METHOD on the server; the method takes { toAddress, category, order, maxCount } and returns { transfers }).
 */
async function firstFunder(a: string): Promise<string | null | undefined> {
  const url = process.env.TRANSFERS_RPC, method = process.env.TRANSFERS_METHOD;
  if (!url || !method) return undefined;
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [{ toAddress: a, category: ["external"], order: "asc", maxCount: "0x5" }] }), signal: AbortSignal.timeout(15_000) });
  const j = (await r.json()) as { result?: { transfers?: { from?: string; value?: number | null }[] } };
  const first = (j.result?.transfers ?? []).find((x) => (x.value ?? 0) > 0 && x.from);
  return first?.from ? lc(first.from) : null;
}

/** Outgoing transaction count, and the first gas funder from the transfer history, else an explorer key (cached a day). */
async function walletFacts(a: string) {
  const row = db()?.prepare("SELECT nonce, funder, at FROM wallet WHERE addr = ?").get(a) as { nonce: number | null; funder: string | null; at: number } | undefined;
  if (row && Date.now() - row.at < 86_400_000) return row;
  const client = getClient(process.env.RPC_URL);
  const nonce = client ? await client.getTransactionCount({ address: a as `0x${string}` }).catch(() => null) : null;
  let funder: string | null = row?.funder ?? null;
  const key = process.env.EXPLORER_KEY ?? process.env.XCHECK_BS_KEY;
  if (!funder) funder = (await firstFunder(a).catch(() => undefined)) ?? null;
  if (!funder && key && !process.env.TRANSFERS_RPC) {
    try {
      const r = await fetch(`${process.env.EXPLORER_API_URL ?? ""}/4663/api/v2/addresses/${a}/transactions?filter=to&sort=block_number&order=asc&apikey=${key}`, { signal: AbortSignal.timeout(15_000) });
      const j = (await r.json()) as { items?: { from?: { hash?: string }; value?: string }[] };
      const first = (j.items ?? []).find((x) => BigInt(x.value ?? "0") > 0n);
      funder = first?.from?.hash ? lc(first.from.hash) : null;
    } catch {}
  }
  db()?.prepare("INSERT OR REPLACE INTO wallet (addr, nonce, funder, at) VALUES (?, ?, ?, ?)").run(a, nonce, funder, Date.now());
  return { nonce, funder, at: Date.now() };
}

// ---------------------------------------------------------------- linking

export type Link = { a: string; b: string; kind: string; detail: string };
type Rule = { addr: string; rule: string; ref: string | null };

class Union {
  p = new Map<string, string>();
  find(x: string): string {
    if (!this.p.has(x)) this.p.set(x, x);
    const r = this.p.get(x)!;
    if (r === x) return x;
    const root = this.find(r);
    this.p.set(x, root);
    return root;
  }
  join(a: string, b: string) {
    this.p.set(this.find(a), this.find(b));
  }
}

const gidOf = (members: string[]) => createHash("sha256").update([...members].sort().join(",")).digest("hex").slice(0, 10);

/** One pass: read new transfers, gather the signals among wallets seen in the last 30 days, and write the groups. */
export async function linkPass() {
  const d = db();
  if (!d || st.running) return;
  st.running = true;
  try {
    await exitList();
    await syncTransfers().catch((e) => (st.lastError = `transfers: ${e instanceof Error ? e.message.slice(0, 80) : "error"}`));
    const since = Date.now() - 30 * 86_400_000;
    const W = new Set((d.prepare("SELECT addr FROM seen WHERE last > ?").all(since) as { addr: string }[]).map((r) => r.addr));
    const rules = d.prepare("SELECT addr, rule, ref FROM rules").all() as Rule[];
    const cleared = new Set(rules.filter((r) => r.rule === "clear").map((r) => r.addr));
    const links: Link[] = [];
    const add = (a: string, b: string, kind: string, detail: string) => a !== b && !cleared.has(a) && !cleared.has(b) && links.push({ a, b, kind, detail });

    if (token() && W.size) {
      const list = [...W];
      const q = `(${list.map(() => "?").join(",")})`;
      const xs = d.prepare(`SELECT src, dst, val, at FROM xfer WHERE src IN ${q} OR dst IN ${q}`).all(...list, ...list) as { src: string; dst: string; val: number; at: number }[];
      const feeds = new Map<string, Set<string>>(), sinks = new Map<string, Set<string>>();
      const buys: { w: string; val: number; at: number }[] = [];
      for (const x of xs) {
        if (W.has(x.src) && W.has(x.dst)) add(x.src, x.dst, "direct", `${x.val.toFixed(0)} coins sent between them`);
        else if (W.has(x.dst)) {
          if (await isContract(x.src)) buys.push({ w: x.dst, val: x.val, at: x.at });
          else (feeds.get(x.src) ?? feeds.set(x.src, new Set()).get(x.src)!).add(x.dst);
        } else if (W.has(x.src) && !(await isContract(x.dst))) (sinks.get(x.dst) ?? sinks.set(x.dst, new Set()).get(x.dst)!).add(x.src);
      }
      for (const [src, ws] of feeds) if (ws.size >= 2) { const [h, ...rest] = [...ws]; for (const w of rest) add(h!, w, "sender", `both got coins from ${src.slice(0, 8)}…`); }
      for (const [dst, ws] of sinks) if (ws.size >= 2) { const [h, ...rest] = [...ws]; for (const w of rest) add(h!, w, "sink", `both sent coins to ${dst.slice(0, 8)}…`); }
      // near-equal buys minutes apart across 3+ wallets
      buys.sort((x, y) => x.at - y.at);
      for (let i = 0; i < buys.length; i++) {
        const near = buys.filter((b) => b.at >= buys[i]!.at && b.at - buys[i]!.at <= PATTERN_WINDOW_S * 1000 && Math.abs(b.val - buys[i]!.val) <= buys[i]!.val * PATTERN_SPREAD);
        const ws = [...new Set(near.map((b) => b.w))];
        if (ws.length >= PATTERN_MIN) for (const w of ws.slice(1)) add(ws[0]!, w, "pattern", `buys of ~${buys[i]!.val.toFixed(0)} coins within 10 min`);
      }
    }
    // a shared first gas funder (only with an explorer key)
    const funders = new Map<string, string[]>();
    for (const w of W) {
      const f = await walletFacts(w).catch(() => null);
      if (f?.funder && !(await isContract(f.funder))) (funders.get(f.funder) ?? funders.set(f.funder, []).get(f.funder)!).push(w);
    }
    for (const [f, ws] of funders) if (ws.length >= 2) for (const w of ws.slice(1)) add(ws[0]!, w, "funder", `gas from the same wallet ${f.slice(0, 8)}…`);
    // traffic: only a mass pattern counts
    const tr = d.prepare("SELECT kind, h, MAX(anon) AS anon, GROUP_CONCAT(addr) AS addrs FROM traffic GROUP BY kind, h").all() as { kind: string; h: string; anon: number; addrs: string }[];
    for (const r of tr) {
      const ws = [...new Set(r.addrs.split(","))].filter((w) => W.has(w));
      const need = r.kind === "device" ? DEV_MASS : r.anon ? ANON_MASS : IP_MASS;
      if (ws.length >= need) for (const w of ws.slice(1)) add(ws[0]!, w, r.kind, `${ws.length} wallets on one ${r.kind === "device" ? "device" : r.anon ? "shared exit" : "IP"} in a day`);
    }

    // groups: union of everything linked, plus groups the owner pinned by hand
    const u = new Union();
    for (const l of links) u.join(l.a, l.b);
    const pins = rules.filter((r) => r.rule === "pin");
    for (const p of pins) u.join(p.addr, `pin:${p.ref}`);
    const comps = new Map<string, string[]>();
    for (const x of new Set([...links.flatMap((l) => [l.a, l.b]), ...pins.map((p) => p.addr)])) (comps.get(u.find(x)) ?? comps.set(u.find(x), []).get(u.find(x))!).push(x);
    const pinnedState = new Map(pins.map((p) => [p.ref!, true]));
    d.exec("BEGIN");
    try {
      d.exec("DELETE FROM member");
      const keep = new Set<string>();
      for (const [, members] of comps) {
        const pinRef = pins.find((p) => members.includes(p.addr))?.ref ?? null;
        if (members.length < 3 && !pinRef) continue;
        const ls = links.filter((l) => members.includes(l.a));
        const kinds = [...new Set(ls.map((l) => l.kind))];
        const chain = kinds.filter((k) => k !== "ip" && k !== "device");
        const state = pinRef && pinnedState.get(pinRef) ? "confirmed" : kinds.length >= 2 && chain.length >= 1 ? "linked" : chain.length === 0 ? "suspect" : "watch";
        const id = pinRef ?? gidOf(members);
        keep.add(id);
        const old = d.prepare("SELECT members, review, reviewed FROM groups WHERE id = ?").get(id) as { members: string; review: string | null; reviewed: number | null } | undefined;
        const same = old?.members === JSON.stringify([...members].sort());
        d.prepare("INSERT OR REPLACE INTO groups (id, members, links, signals, state, updated, review, reviewed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, JSON.stringify([...members].sort()), JSON.stringify(ls.slice(0, 200)), JSON.stringify(kinds), state, Date.now(), same ? old!.review : null, same ? old!.reviewed : null);
        for (const m of members) d.prepare("INSERT OR REPLACE INTO member (addr, gid) VALUES (?, ?)").run(m, id);
      }
      const ids = [...keep];
      d.prepare(`DELETE FROM groups WHERE id NOT IN (${ids.map(() => "?").join(",") || "''"})`).run(...ids);
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    }
    st.lastRun = Date.now();
    st.lastError = null;
    void review().catch(() => undefined);
  } catch (e) {
    st.lastError = e instanceof Error ? e.message.slice(0, 120) : "error";
  } finally {
    st.running = false;
  }
}

// ---------------------------------------------------------------- the model's opinion

let reviewing = false;
/** Asks a model about groups that changed since their last opinion. The opinion is advice; the owner decides. */
async function review() {
  const d = db();
  if (!d || reviewing) return;
  reviewing = true;
  try {
    await modelsReady().catch(() => undefined);
    const base = process.env.AI_BASE_URL, key = process.env.AI_API_KEY, model = briefModel();
    if (!base || !key || !model) return;
    const due = d.prepare("SELECT id, members, links, signals, state FROM groups WHERE state != 'confirmed' AND (reviewed IS NULL OR reviewed < updated - 3600000) LIMIT 5").all() as { id: string; members: string; links: string; signals: string; state: string }[];
    for (const g of due) {
      const members = JSON.parse(g.members) as string[];
      const facts = members.map((m) => {
        const w = d.prepare("SELECT nonce FROM wallet WHERE addr = ?").get(m) as { nonce: number | null } | undefined;
        const ins = d.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(val),0) AS v FROM xfer WHERE dst = ?").get(m) as { n: number; v: number };
        return `${m.slice(0, 10)}…: ${w?.nonce ?? "?"} sent transactions, ${ins.n} coin inflows totalling ${ins.v.toFixed(0)}`;
      });
      const prompt = `You review whether a group of wallets on a token-gated AI service is one person farming free limits. Answer JSON only: {"verdict":"farm"|"unclear"|"not farm","why":["<short reason>", ...]}.
Signals are found by code; a shared exchange withdrawal address or a big public anonymity-network exit can link honest people, so be careful.
GROUP ${g.id}, ${members.length} wallets, state ${g.state}, signal kinds: ${g.signals}
WALLETS
${facts.join("\n")}
LINKS
${(JSON.parse(g.links) as Link[]).slice(0, 60).map((l) => `${l.a.slice(0, 10)}… - ${l.b.slice(0, 10)}…: ${l.kind}, ${l.detail}`).join("\n")}`;
      const r = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 1500, temperature: 0 }), signal: AbortSignal.timeout(120_000) }).catch(() => null);
      const j = (await r?.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
      const txt = j?.choices?.[0]?.message?.content ?? "";
      let out: { verdict?: string; why?: string[] } | null = null;
      try {
        out = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
      } catch {}
      if (out?.verdict) d.prepare("UPDATE groups SET review = ?, reviewed = ? WHERE id = ?").run(JSON.stringify({ verdict: out.verdict, why: (out.why ?? []).slice(0, 6) }), Date.now(), g.id);
    }
  } finally {
    reviewing = false;
  }
}

// ---------------------------------------------------------------- what the limits use

export type GroupState = "linked" | "confirmed" | "suspect" | "watch";
/** The key a wallet's limits are counted under: its group's when the group shares one limit, else its own. */
export function limitKey(address: string): { key: string; state: GroupState | null; gid: string | null } {
  const d = db(), a = lc(address);
  const m = d?.prepare("SELECT g.id, g.state FROM member m JOIN groups g ON g.id = m.gid WHERE m.addr = ?").get(a) as { id: string; state: GroupState } | undefined;
  if (m && (m.state === "linked" || m.state === "confirmed")) return { key: `g:${m.id}`, state: m.state, gid: m.id };
  return { key: a, state: m?.state ?? null, gid: m?.id ?? null };
}

export function noteCost(key: string, tier: string, tokens: number) {
  db()?.prepare("INSERT INTO cost (day, who, tier, tokens) VALUES (?, ?, ?, ?) ON CONFLICT(day, who, tier) DO UPDATE SET tokens = tokens + excluded.tokens").run(day(), key, tier, tokens);
}
export const costToday = (key: string) => ((db()?.prepare("SELECT COALESCE(SUM(tokens),0) AS t FROM cost WHERE day = ? AND who = ?").get(day(), key) as { t: number } | undefined)?.t ?? 0);
export const costTier = (tier: string) => ((db()?.prepare("SELECT COALESCE(SUM(tokens),0) AS t FROM cost WHERE day = ? AND tier = ?").get(day(), tier) as { t: number } | undefined)?.t ?? 0);

// ---------------------------------------------------------------- the owner's panel

export function sybilReport() {
  const d = db();
  if (!d) return null;
  const groups = (d.prepare("SELECT id, members, links, signals, state, updated, review FROM groups ORDER BY updated DESC LIMIT 200").all() as { id: string; members: string; links: string; signals: string; state: string; updated: number; review: string | null }[]).map((g) => {
    const members = JSON.parse(g.members) as string[];
    const key = g.state === "linked" || g.state === "confirmed" ? `g:${g.id}` : null;
    const tokens = key ? costToday(key) : members.reduce((s, m) => s + costToday(m), 0);
    return { id: g.id, members, links: JSON.parse(g.links) as Link[], signals: JSON.parse(g.signals) as string[], state: g.state, updated: g.updated, review: g.review ? (JSON.parse(g.review) as { verdict: string; why: string[] }) : null, tokensToday: Math.round(tokens * 10) / 10 };
  });
  const today = day();
  const wallets24 = (d.prepare("SELECT COUNT(DISTINCT addr) AS n FROM traffic WHERE day >= ?").get(day(Date.now() - 86_400_000)) as { n: number }).n;
  const anonShare = (d.prepare("SELECT COUNT(DISTINCT addr) AS n FROM traffic WHERE anon = 1 AND day = ?").get(today) as { n: number }).n;
  return {
    lastRun: st.lastRun,
    lastError: st.lastError,
    token: token(),
    explorer: !!(process.env.EXPLORER_KEY ?? process.env.XCHECK_BS_KEY),
    seen30d: (d.prepare("SELECT COUNT(*) AS n FROM seen WHERE last > ?").get(Date.now() - 30 * 86_400_000) as { n: number }).n,
    wallets24,
    anon24: anonShare,
    transfers: (d.prepare("SELECT COUNT(*) AS n FROM xfer").get() as { n: number }).n,
    groups,
    decisions: d.prepare("SELECT at, gid, action, who, note FROM decisions ORDER BY at DESC LIMIT 100").all() as { at: number; gid: string; action: string; who: string; note: string | null }[],
  };
}

/** The owner's decision on a group: confirm (share one limit for good), clear (never link these wallets), split one
 * wallet out, or merge two groups. Logged with who decided and why. */
export function decide(admin: string, action: string, gid: string, note: string, opts: { addr?: string; into?: string }): string | null {
  const d = db();
  if (!d) return "The record is not open.";
  const g = d.prepare("SELECT members FROM groups WHERE id = ?").get(gid) as { members: string } | undefined;
  if (!g) return "No such group.";
  const members = JSON.parse(g.members) as string[];
  const rule = d.prepare("INSERT OR REPLACE INTO rules (addr, rule, ref, at) VALUES (?, ?, ?, ?)");
  if (action === "confirm") for (const m of members) rule.run(m, "pin", gid, Date.now());
  else if (action === "clear") for (const m of members) rule.run(m, "clear", gid, Date.now());
  else if (action === "split") {
    if (!opts.addr || !members.includes(lc(opts.addr))) return "That wallet is not in this group.";
    rule.run(lc(opts.addr), "clear", gid, Date.now());
  } else if (action === "merge") {
    const other = opts.into ? (d.prepare("SELECT members FROM groups WHERE id = ?").get(opts.into) as { members: string } | undefined) : undefined;
    if (!other) return "No group to merge into.";
    for (const m of [...members, ...(JSON.parse(other.members) as string[])]) rule.run(m, "pin", opts.into!, Date.now());
  } else if (action === "reset") d.prepare(`DELETE FROM rules WHERE addr IN (${members.map(() => "?").join(",")})`).run(...members);
  else return "Unknown action.";
  d.prepare("INSERT INTO decisions (at, gid, action, who, note) VALUES (?, ?, ?, ?, ?)").run(Date.now(), gid, action, lc(admin), note.slice(0, 300) || null);
  void linkPass();
  return null;
}

/** Starts the 15-minute linker once per server process. */
export function startLinker() {
  if (st.timer || process.env.CHAIN_READS === "0") return;
  st.timer = setInterval(() => void linkPass(), EVERY);
  st.timer.unref?.();
  setTimeout(() => void linkPass(), 20_000).unref?.();
}
