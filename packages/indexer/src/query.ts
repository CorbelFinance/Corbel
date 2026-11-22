/**
 * Read side of the index, used by the web API. Opens the database read-only; if the file does not
 * exist yet, every function returns null and the API falls back to live chain scans.
 */
import { existsSync } from "node:fs";
import { DEFAULT_DB, openDb, type Db } from "./db.ts";
import { RH } from "../../data/src/trust/addresses.ts";

let db: Db | null = null;
let triedAt = 0;

function get(): Db | null {
  if (db) return db;
  if (Date.now() - triedAt < 30_000) return null;
  triedAt = Date.now();
  if (!existsSync(DEFAULT_DB)) {
    console.warn("[index] no database at", DEFAULT_DB);
    return null;
  }
  try {
    db = openDb(DEFAULT_DB, true);
  } catch (e) {
    console.error("[index] open failed", DEFAULT_DB, (e as Error).message);
    db = null;
  }
  return db;
}

export interface TokenHit {
  address: string;
  symbol: string | null;
  name: string | null;
  pools: number;
  first_block: number | null;
}

/** Tokens whose symbol matches (exact first, then prefix), most pools first. */
export function searchTicker(q: string, limit = 8): TokenHit[] | null {
  const d = get();
  if (!d) return null;
  const s = q.trim().replace(/^\$/, "");
  if (!s) return [];
  return d
    .prepare(
      `SELECT t.address, t.symbol, t.name, t.first_block,
              (SELECT COUNT(*) FROM pools p WHERE p.token0 = t.address OR p.token1 = t.address) AS pools
         FROM tokens t
        WHERE t.symbol = ? COLLATE NOCASE OR t.symbol LIKE ? COLLATE NOCASE
        ORDER BY (t.symbol = ? COLLATE NOCASE) DESC, pools DESC, t.first_block ASC
        LIMIT ?`,
    )
    .all(s, `${s}%`, s, limit) as unknown as TokenHit[];
}

/** Tokens whose name claims to be a Robinhood stock token, with their pool count. The code check happens on chain. */
export function stockCandidates(
  limit = 200,
): { address: string; symbol: string; name: string; decimals: number | null; pools: number }[] | null {
  const d = get();
  if (!d) return null;
  return d
    .prepare(
      `SELECT t.address, t.symbol, t.name, t.decimals,
              (SELECT COUNT(*) FROM pools p WHERE p.token0 = t.address OR p.token1 = t.address) AS pools
         FROM tokens t
        WHERE t.name LIKE '%Robinhood Token%' OR t.name LIKE '%Robinhood Stock%' OR t.name LIKE '%xStock%' OR t.name LIKE '%ST0x%'
        ORDER BY pools DESC
        LIMIT ?`,
    )
    .all(limit) as unknown as {
    address: string;
    symbol: string;
    name: string;
    decimals: number | null;
    pools: number;
  }[];
}

export function v4PoolsFor(token: string) {
  const d = get();
  if (!d) return undefined;
  const rows = d
    .prepare(
      `SELECT id, token0, token1, fee, tick_spacing, hooks, block, tx FROM pools WHERE kind = 'v4' AND (token1 = ? OR token0 = ?) ORDER BY block DESC LIMIT 20`,
    )
    .all(token.toLowerCase(), token.toLowerCase()) as {
    id: string;
    token0: string;
    token1: string;
    fee: number;
    tick_spacing: number;
    hooks: string;
    block: number;
    tx: string;
  }[];
  return rows.map((r) => ({
    kind: "v4" as const,
    id: r.id as `0x${string}`,
    key: {
      currency0: r.token0 as `0x${string}`,
      currency1: r.token1 as `0x${string}`,
      fee: r.fee,
      tickSpacing: r.tick_spacing,
      hooks: r.hooks as `0x${string}`,
    },
    block: r.block,
    tx: r.tx as `0x${string}`,
  }));
}

/** Pools launched by an address. `dead`: drained V2 pairs, out of `checked` pools whose liveness is known (V2, and v4 with liquidity in range). */
export function launcherHistory(addr: string) {
  const d = get();
  if (!d) return null;
  const r = d
    .prepare(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN dead = 1 THEN 1 ELSE 0 END) AS dead, SUM(CASE WHEN dead IS NOT NULL THEN 1 ELSE 0 END) AS checked FROM pools WHERE launcher = ?`,
    )
    .get(addr.toLowerCase()) as { n: number; dead: number | null; checked: number | null };
  return { launches: r.n, dead: r.dead ?? 0, checked: r.checked ?? 0 };
}

/** The wallet that created a launchpad token (from the launch watch), or null for a token not born on a launchpad. */
export function launchCreator(token: string): string | null {
  const d = get();
  if (!d) return null;
  try {
    const r = d.prepare(`SELECT creator FROM launches WHERE token = ? LIMIT 1`).get(token.toLowerCase()) as { creator: string | null } | undefined;
    return r?.creator ? r.creator.toLowerCase() : null;
  } catch {
    return null; // an index made before the launch watch
  }
}

/** What a wallet launched and what became of it, for the token check. */
export function creatorRecord(addr: string): { total: number; drained: number; known: number; bulk: boolean } | null {
  const d = creatorDossier(addr);
  if (!d) return null;
  const drained = d.tokens.filter((t) => t.state === "drained").length;
  const trading = d.tokens.filter((t) => t.state === "trading").length;
  return { total: d.tokens.length, drained, known: drained + trading, bulk: d.bulk };
}

/** Sender of the transaction that created this pool (V2 pair address or v4 pool id), if indexed. */
export function poolLauncher(id: string): string | null {
  const d = get();
  if (!d) return null;
  const r = d.prepare(`SELECT launcher FROM pools WHERE id = ?`).get(id.toLowerCase()) as
    { launcher: string | null } | undefined;
  return r?.launcher ?? null;
}

export function sameTicker(symbol: string, exclude: string) {
  const d = get();
  if (!d) return 0;
  const r = d
    .prepare(`SELECT COUNT(*) AS n FROM tokens WHERE symbol = ? COLLATE NOCASE AND address <> ?`)
    .get(symbol, exclude.toLowerCase()) as { n: number };
  return r.n;
}

export function indexStatus() {
  const d = get();
  if (!d) return null;
  const p = Object.fromEntries(
    (d.prepare(`SELECT key, value FROM progress`).all() as { key: string; value: number }[]).map((r) => [
      r.key,
      r.value,
    ]),
  );
  const c = d
    .prepare(
      `SELECT (SELECT COUNT(*) FROM pools) AS pools, (SELECT COUNT(*) FROM tokens) AS tokens, (SELECT MAX(block) FROM pools) AS newest`,
    )
    .get() as { pools: number; tokens: number; newest: number | null };
  // a window is written before its progress mark moves: never report a head below the newest stored pool
  const high = Math.max(p.high ?? 0, c.newest ?? 0) || null;
  return { pools: c.pools, tokens: c.tokens, low: p.low ?? null, high };
}

const NATIVE = "0x0000000000000000000000000000000000000000";
const BASES: Record<string, "ETH" | "WETH" | "USDG"> = {
  [NATIVE]: "ETH",
  [RH.WETH]: "WETH",
  [RH.USDG]: "USDG",
};

export interface RadarRow {
  pool: string;
  kind: "v2" | "v4";
  token: string;
  symbol: string | null;
  name: string | null;
  base: "ETH" | "WETH" | "USDG" | null;
  hooked: boolean;
  block: number;
  launcher: string | null;
  launches: number;
  dead: 0 | 1 | null;
  /** the contract the creating transaction called, and the pool's hook (v4), to tell the launchpad */
  pad: string | null;
  hook: string | null;
}

/** Newest pools first. `base` is null when neither side is ETH, WETH or USDG. */
export function recentPools(
  opts: { limit?: number; kind?: "v2" | "v4"; before?: number } = {},
): RadarRow[] | null {
  const d = get();
  if (!d) return null;
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = d
    .prepare(
      `SELECT p.id, p.kind, p.token0, p.token1, p.hooks, p.block, p.launcher, p.dead, ${hasPad(d) ? "p.pad" : "NULL AS pad"},
              (SELECT COUNT(*) FROM pools q WHERE q.launcher = p.launcher) AS launches
         FROM pools p
        WHERE (? IS NULL OR p.kind = ?) AND (? IS NULL OR p.block < ?)
        ORDER BY p.block DESC
        LIMIT ?`,
    )
    .all(opts.kind ?? null, opts.kind ?? null, opts.before ?? null, opts.before ?? null, limit) as {
    id: string;
    kind: "v2" | "v4";
    token0: string;
    token1: string;
    hooks: string | null;
    block: number;
    launcher: string | null;
    dead: 0 | 1 | null;
    launches: number;
    pad: string | null;
  }[];
  const meta = d.prepare(`SELECT symbol, name FROM tokens WHERE address = ?`);
  return rows.map((r) => {
    const tokenIs0 = r.token0 in BASES && !(r.token1 in BASES) ? false : !(r.token0 in BASES);
    const token = tokenIs0 ? r.token0 : r.token1;
    const other = tokenIs0 ? r.token1 : r.token0;
    const m = meta.get(token) as { symbol: string | null; name: string | null } | undefined;
    return {
      pool: r.id,
      kind: r.kind,
      token,
      symbol: m?.symbol ?? null,
      name: m?.name ?? null,
      base: BASES[other] ?? null,
      hooked: !!r.hooks && r.hooks !== NATIVE,
      block: r.block,
      launcher: r.launcher,
      launches: r.launcher ? r.launches : 0,
      dead: r.dead,
      pad: r.pad || null,
      hook: r.hooks && r.hooks !== NATIVE ? r.hooks : null,
    };
  });
}

const padCol = new WeakMap<object, boolean>();
/** Whether this index has the pad column (indexes made before it do not). */
function hasPad(d: NonNullable<ReturnType<typeof get>>) {
  if (!padCol.has(d)) padCol.set(d, (d.prepare(`PRAGMA table_info(pools)`).all() as { name: string }[]).some((c) => c.name === "pad"));
  return padCol.get(d)!;
}

/** The base assets by lower-case address (pool rows store addresses in lower case). */
const BASE_LC = new Map(Object.entries(BASES).map(([k, v]) => [k.toLowerCase(), v]));

export interface LaunchRow {
  pool: string;
  kind: "v2" | "v4";
  token: string;
  symbol: string | null;
  name: string | null;
  base: "ETH" | "WETH" | "USDG" | null;
  block: number;
  dead: 0 | 1 | null;
  pad: string | null;
  hook: string | null;
}

/**
 * Every pool made since `fromBlock`, newest first, with its token's name and what made it (creating contract and
 * hook), so launches can be grouped by launchpad. Capped at `limit` rows.
 */
export function launchesSince(fromBlock: number, limit = 6000): LaunchRow[] | null {
  const d = get();
  if (!d) return null;
  const rows = d
    .prepare(
      `SELECT p.id, p.kind, p.token0, p.token1, p.hooks, p.block, p.dead, ${hasPad(d) ? "p.pad" : "NULL AS pad"}, t0.symbol AS s0, t0.name AS n0, t0.first_block AS f0, t1.symbol AS s1, t1.name AS n1, t1.first_block AS f1
         FROM pools p LEFT JOIN tokens t0 ON t0.address = p.token0 LEFT JOIN tokens t1 ON t1.address = p.token1
        WHERE p.block >= ? ORDER BY p.block DESC LIMIT ?`,
    )
    .all(fromBlock, Math.min(Math.max(limit, 1), 20000)) as {
    id: string;
    kind: "v2" | "v4";
    token0: string;
    token1: string;
    hooks: string | null;
    block: number;
    dead: 0 | 1 | null;
    pad: string | null;
    s0: string | null;
    n0: string | null;
    s1: string | null;
    n1: string | null;
    f0: number | null;
    f1: number | null;
  }[];
  const out: LaunchRow[] = [];
  for (const r of rows) {
    const b0 = BASE_LC.has(r.token0.toLowerCase()), b1 = BASE_LC.has(r.token1.toLowerCase());
    if (b0 && b1) continue; // two base assets: not a launch
    // the launched token is the side that is not a base asset; with no base on either side, the younger token
    const first = b1 ? true : b0 ? false : (r.f0 ?? 0) >= (r.f1 ?? 0);
    out.push({
      pool: r.id,
      kind: r.kind,
      token: first ? r.token0 : r.token1,
      symbol: first ? r.s0 : r.s1,
      name: first ? r.n0 : r.n1,
      base: BASE_LC.get((first ? r.token1 : r.token0).toLowerCase()) ?? null,
      block: r.block,
      dead: r.dead,
      pad: r.pad || null,
      hook: r.hooks && r.hooks !== NATIVE ? r.hooks : null,
    });
  }
  return out;
}

/** Pools created since a block, by kind (for the radar header). */
export function poolsSince(block: number) {
  const d = get();
  if (!d) return null;
  return d.prepare(`SELECT kind, COUNT(*) AS n FROM pools WHERE block >= ? GROUP BY kind`).all(block) as {
    kind: "v2" | "v4";
    n: number;
  }[];
}

/** v4 pools whose two currencies are exactly a and b (either order). Pools with liquidity in range first. */
export function v4PoolsBetween(a: string, b: string) {
  const d = get();
  if (!d) return undefined;
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  const rows = d
    .prepare(
      `SELECT id, token0, token1, fee, tick_spacing, hooks, dead FROM pools
        WHERE kind = 'v4' AND ((token0 = ? AND token1 = ?) OR (token0 = ? AND token1 = ?))
        ORDER BY (dead = 0) DESC, block DESC LIMIT 8`,
    )
    .all(x, y, y, x) as {
    id: string;
    token0: string;
    token1: string;
    fee: number;
    tick_spacing: number;
    hooks: string;
    dead: number | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    key: {
      currency0: r.token0 as `0x${string}`,
      currency1: r.token1 as `0x${string}`,
      fee: r.fee,
      tickSpacing: r.tick_spacing,
      hooks: r.hooks as `0x${string}`,
    },
    live: r.dead === 0 ? true : null,
  }));
}

/** Symbol, name and decimals of one indexed token. */
export function tokenMeta(address: string) {
  const d = get();
  if (!d) return null;
  return (
    (d
      .prepare(`SELECT address, symbol, name, decimals FROM tokens WHERE address = ?`)
      .get(address.toLowerCase()) as
      { address: string; symbol: string | null; name: string | null; decimals: number | null } | undefined) ??
    null
  );
}

/** Launch analytics over the whole index window. Block heights become hours at ~4 blocks per second. */
export function launchStats() {
  const d = get();
  if (!d) return null;
  const st = indexStatus()!;
  const head = st.high ?? 0;
  const BPH = 14_400;
  const hourly = d
    .prepare(
      `SELECT CAST((? - block) / ? AS INTEGER) AS h, kind, COUNT(*) AS n FROM pools WHERE block > ? GROUP BY h, kind`,
    )
    .all(head, BPH, head - 48 * BPH) as { h: number; kind: "v2" | "v4"; n: number }[];
  const hours = Array.from({ length: 48 }, (_, i) => ({ ago: i, v2: 0, v4: 0 }));
  for (const r of hourly) if (r.h >= 0 && r.h < 48) hours[r.h]![r.kind] = r.n;

  const rows = d.prepare(`SELECT kind, token0, token1, hooks, launcher, dead, block FROM pools`).all() as {
    kind: "v2" | "v4";
    token0: string;
    token1: string;
    hooks: string | null;
    launcher: string | null;
    dead: number | null;
    block: number;
  }[];
  const base = (r: { token0: string; token1: string }) => {
    const s = new Set([r.token0, r.token1]);
    return s.has(NATIVE) ? "ETH" : s.has(RH.WETH) ? "WETH" : s.has(RH.USDG) ? "USDG" : "other";
  };
  const venue = new Map<string, number>();
  const hooks = new Map<string, number>();
  const byLauncher = new Map<string, { n: number; dead: number; known: number; last: number }>();
  let v2Known = 0,
    v2Dead = 0,
    v4Known = 0;
  for (const r of rows) {
    const hooked = !!r.hooks && r.hooks !== NATIVE;
    const v = `${r.kind === "v2" ? "V2" : "v4"} · ${base(r)}${hooked ? " · hook" : ""}`;
    venue.set(v, (venue.get(v) ?? 0) + 1);
    if (hooked) hooks.set(r.hooks!, (hooks.get(r.hooks!) ?? 0) + 1);
    if (r.kind === "v2" && r.dead !== null) {
      v2Known++;
      if (r.dead === 1) v2Dead++;
    }
    if (r.kind === "v4" && r.dead === 0) v4Known++;
    if (r.launcher) {
      const l = byLauncher.get(r.launcher) ?? { n: 0, dead: 0, known: 0, last: 0 };
      l.n++;
      if (r.dead !== null) l.known++;
      if (r.dead === 1) l.dead++;
      l.last = Math.max(l.last, r.block);
      byLauncher.set(r.launcher, l);
    }
  }
  const buckets = [
    { label: "1 launch", min: 1, max: 1, pools: 0, wallets: 0 },
    { label: "2–5", min: 2, max: 5, pools: 0, wallets: 0 },
    { label: "6–20", min: 6, max: 20, pools: 0, wallets: 0 },
    { label: "21–100", min: 21, max: 100, pools: 0, wallets: 0 },
    { label: "100+", min: 101, max: Infinity, pools: 0, wallets: 0 },
  ];
  for (const l of byLauncher.values()) {
    const b = buckets.find((x) => l.n >= x.min && l.n <= x.max)!;
    b.pools += l.n;
    b.wallets++;
  }
  const top = [...byLauncher.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 12)
    .map(([address, l]) => ({ address, ...l }));
  return {
    head,
    low: st.low,
    pools: rows.length,
    launchers: byLauncher.size,
    hours,
    venues: [...venue.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n),
    concentration: buckets.map(({ label, pools, wallets }) => ({ label, pools, wallets })),
    topLaunchers: top,
    topHooks: [...hooks.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([address, n]) => ({ address, n })),
    liveness: { v2Known, v2Dead, v4Live: v4Known },
  };
}

/**
 * Pools by id (v4 pool id or V2 pair address, lower case) → the traded token, its base and metadata.
 * Base = WETH, USDG or native ETH; a pool of two other tokens reports token1 as the base.
 */
export function poolsTokens(ids: string[]) {
  const d = get();
  if (!d || !ids.length) return null;
  const bases = new Set([RH.WETH, RH.USDG, RH.NATIVE].map((a) => a.toLowerCase()));
  const out = new Map<
    string,
    {
      token: string;
      base: string;
      kind: string;
      symbol: string | null;
      name: string | null;
      block: number;
      launcher: string | null;
    }
  >();
  const q = d.prepare(
    `SELECT p.id, p.kind, p.token0, p.token1, p.block, p.launcher, t.symbol, t.name FROM pools p LEFT JOIN tokens t ON t.address = (CASE WHEN p.token0 IN (?, ?, ?) THEN p.token1 ELSE p.token0 END) WHERE p.id = ?`,
  );
  for (const id of ids) {
    const r = q.get(RH.WETH, RH.USDG, RH.NATIVE, id.toLowerCase()) as
      | {
          id: string;
          kind: string;
          token0: string;
          token1: string;
          block: number;
          launcher: string | null;
          symbol: string | null;
          name: string | null;
        }
      | undefined;
    if (!r) continue;
    const tokenIs1 = bases.has(r.token0);
    out.set(id.toLowerCase(), {
      token: tokenIs1 ? r.token1 : r.token0,
      base: tokenIs1 ? r.token0 : r.token1,
      kind: r.kind,
      symbol: r.symbol,
      name: r.name,
      block: r.block,
      launcher: r.launcher,
    });
  }
  return out;
}

/** A token's pools in the index: V2 pair addresses, its first pool's block and that pool's launcher. */
export function tokenPools(token: string) {
  const d = get();
  if (!d) return null;
  const rows = d
    .prepare(`SELECT id, kind, block, launcher FROM pools WHERE token0 = ? OR token1 = ? ORDER BY block ASC`)
    .all(token, token) as { id: string; kind: string; block: number; launcher: string | null }[];
  if (!rows.length)
    return { pools: [] as string[], firstBlock: null as number | null, launcher: null as string | null };
  return {
    pools: rows.filter((r) => r.kind === "v2").map((r) => r.id),
    firstBlock: rows[0]!.block,
    launcher: rows[0]!.launcher,
  };
}

/** The launchpad (the contract its first pool was created through) of each of these tokens, if indexed. */
/** For each token, how its first indexed pool was made: the contract the creating transaction called, and the hook. */
export function padsOf(tokens: string[]): Map<string, { pad: string | null; hooks: string | null }> {
  const d = get();
  const out = new Map<string, { pad: string | null; hooks: string | null }>();
  if (!d || !tokens.length) return out;
  let q;
  try {
    q = d.prepare(`SELECT pad, hooks FROM pools WHERE (token0 = ? OR token1 = ?) ORDER BY block ASC LIMIT 1`);
  } catch {
    return out; // an index made before the pad column
  }
  for (const t of tokens) {
    const r = q.get(t.toLowerCase(), t.toLowerCase()) as { pad: string | null; hooks: string | null } | undefined;
    if (r) out.set(t.toLowerCase(), { pad: r.pad || null, hooks: r.hooks });
  }
  return out;
}

/** Launchpads by the pools made through them: count, made in the last day, and how many are drained. */
export function padStats(dayBlock: number, limit = 40) {
  const d = get();
  if (!d) return null;
  try {
    return d
      .prepare(
        `SELECT pad, COUNT(*) AS pools, SUM(CASE WHEN block >= ? THEN 1 ELSE 0 END) AS day, SUM(CASE WHEN dead = 1 THEN 1 ELSE 0 END) AS dead, SUM(CASE WHEN dead IS NOT NULL THEN 1 ELSE 0 END) AS checked FROM pools WHERE pad IS NOT NULL AND pad != '' GROUP BY pad ORDER BY pools DESC LIMIT ?`,
      )
      .all(dayBlock, limit) as {
      pad: string;
      pools: number;
      day: number;
      dead: number | null;
      checked: number | null;
    }[];
  } catch {
    return null; // an index made before the pad column
  }
}

/** Who made the token's first indexed pool, through what, and at which block. */
export function tokenOrigin(token: string) {
  const d = get();
  if (!d) return null;
  const t = token.toLowerCase();
  const cols = (d.prepare(`PRAGMA table_info(pools)`).all() as { name: string }[]).some(
    (c) => c.name === "pad",
  )
    ? "pad"
    : "NULL AS pad";
  return (
    (d
      .prepare(
        `SELECT id, launcher, ${cols}, via, block FROM pools WHERE (token0 = ? OR token1 = ?) AND launcher IS NOT NULL ORDER BY block ASC LIMIT 1`,
      )
      .get(t, t) as
      { id: string; launcher: string; pad: string | null; via: string | null; block: number } | undefined) ??
    null
  );
}

/** The block of a launcher's latest pool, and how many it made in all. */
export function launcherLast(addr: string) {
  const d = get();
  if (!d) return null;
  return (
    (d
      .prepare(`SELECT MAX(block) AS last, COUNT(*) AS n FROM pools WHERE launcher = ?`)
      .get(addr.toLowerCase()) as { last: number | null; n: number }) ?? null
  );
}


export interface CurveLaunch {
  token: string;
  pad: string;
  block: number;
  tx: string;
  creator: string | null;
  symbol: string | null;
  name: string | null;
  /** it has a pool now (graduated to a DEX), or is still selling on its launchpad */
  pooled: boolean;
}

/** Tokens born on launchpads since a block, newest first (the launch watch table; empty on an index without it). */
export function curveLaunches(fromBlock: number, limit = 3000): CurveLaunch[] {
  const d = get();
  if (!d) return [];
  try {
    return (
      d
        .prepare(
          `SELECT l.token, l.pad, l.block, l.tx, l.creator, l.symbol, l.name,
                  EXISTS(SELECT 1 FROM pools p WHERE p.token0 = l.token OR p.token1 = l.token) AS pooled
             FROM launches l WHERE l.block >= ? ORDER BY l.block DESC LIMIT ?`,
        )
        .all(fromBlock, limit) as (Omit<CurveLaunch, "pooled"> & { pooled: number })[]
    ).map((r) => ({ ...r, pooled: !!r.pooled }));
  } catch {
    return []; // an index made before the launch watch
  }
}

export interface DossierToken {
  token: string;
  symbol: string | null;
  name: string | null;
  /** the launchpad it was born on, when it came from one */
  pad: string | null;
  /** block it was born (launch) or first got a pool */
  block: number;
  /** pools this wallet opened for the token */
  pools: number;
  /** "trading" | "drained" (a pool emptied or left as dust) | "curve" (still on its launchpad) | "unknown" */
  state: "trading" | "drained" | "curve" | "unknown";
}

/**
 * Everything one wallet created on Robinhood Chain that the index holds: tokens it launched on a launchpad and pools
 * it opened, merged by token, each with what became of it. `bulk` marks a wallet that makes pools for many tokens (a
 * launchpad's migrator or a market maker), not a person.
 */
export function creatorDossier(addr: string, limit = 500): { tokens: DossierToken[]; launches: number; pools: number; bulk: boolean } | null {
  const d = get();
  if (!d) return null;
  const a = addr.toLowerCase();
  const by = new Map<string, DossierToken>();
  let launches: { token: string; pad: string; block: number; symbol: string | null; name: string | null }[] = [];
  try {
    launches = d.prepare(`SELECT token, pad, block, symbol, name FROM launches WHERE creator = ? ORDER BY block DESC LIMIT ?`).all(a, limit) as typeof launches;
  } catch {
    // an index made before the launch watch
  }
  for (const l of launches) by.set(l.token, { token: l.token, symbol: l.symbol, name: l.name, pad: l.pad, block: l.block, pools: 0, state: "curve" });
  const pools = d
    .prepare(`SELECT p.token0, p.token1, p.block, p.dead FROM pools p WHERE p.launcher = ? ORDER BY p.block DESC LIMIT ?`)
    .all(a, limit * 2) as { token0: string; token1: string; block: number; dead: number | null }[];
  const BASES = new Set(["0x0000000000000000000000000000000000000000", "0x0bd7d308f8e1639fab988df18a8011f41eacad73", "0x5fc5360d0400a0fd4f2af552add042d716f1d168"]);
  for (const p of pools) {
    const t = BASES.has(p.token0) ? p.token1 : p.token0;
    const cur = by.get(t) ?? { token: t, symbol: null, name: null, pad: null, block: p.block, pools: 0, state: "unknown" as const };
    cur.pools += 1;
    cur.block = Math.min(cur.block, p.block);
    by.set(t, cur);
  }
  // what became of each token: any pool trading → trading; all known pools drained → drained
  const live = d.prepare(`SELECT SUM(CASE WHEN dead = 0 THEN 1 ELSE 0 END) AS alive, SUM(CASE WHEN dead = 1 THEN 1 ELSE 0 END) AS drained, COUNT(*) AS n FROM pools WHERE token0 = ? OR token1 = ?`);
  const meta = d.prepare(`SELECT symbol, name FROM tokens WHERE address = ?`);
  for (const t of by.values()) {
    const s = live.get(t.token, t.token) as { alive: number | null; drained: number | null; n: number };
    if (s.n > 0) {
      t.state = (s.alive ?? 0) > 0 ? "trading" : (s.drained ?? 0) > 0 ? "drained" : "unknown";
    }
    if (!t.symbol) {
      const m = meta.get(t.token) as { symbol: string | null; name: string | null } | undefined;
      t.symbol = m?.symbol ?? null;
      t.name = t.name ?? m?.name ?? null;
    }
  }
  const tokens = [...by.values()].sort((x, y) => y.block - x.block).slice(0, limit);
  return { tokens, launches: launches.length, pools: pools.length, bulk: pools.length > 50 && launches.length === 0 };
}

export type PulseEvent = { kind: "launch" | "listed" | "drained"; token: string; symbol: string | null; pad: string | null; block: number };

/**
 * The chain right now, for the landing's live tape: newest launches on a launchpad, launches that just got a DEX pool,
 * pools found drained, and running counts. From the index only: no chain calls.
 */
export function pulse(limit = 24): { events: PulseEvent[]; counts: { launches: number; launches24h: number; pools: number; drained: number; checked: number }; head: number | null } | null {
  const d = get();
  if (!d) return null;
  const st = indexStatus();
  const head = st?.high ?? null;
  let launches: { token: string; pad: string; block: number; symbol: string | null }[] = [];
  let total = 0, day = 0;
  const isLaunch = (() => {
    try {
      const q = d.prepare("SELECT pad, symbol, block FROM launches WHERE token = ?");
      launches = d.prepare("SELECT token, pad, block, symbol FROM launches ORDER BY block DESC LIMIT ?").all(limit) as typeof launches;
      total = (d.prepare("SELECT COUNT(*) AS n FROM launches").get() as { n: number }).n;
      // about 9.5 blocks a second on Robinhood Chain: a day is ~820k blocks
      day = head ? (d.prepare("SELECT COUNT(*) AS n FROM launches WHERE block > ?").get(head - 820_000) as { n: number }).n : 0;
      return (t: string) => q.get(t) as { pad: string; symbol: string | null; block: number } | undefined;
    } catch {
      return () => undefined; // an index made before the launch watch
    }
  })();
  const sym = d.prepare("SELECT symbol FROM tokens WHERE address = ?");
  const symbolOf = (t: string) => ((sym.get(t) as { symbol: string | null } | undefined)?.symbol ?? null);
  const events: PulseEvent[] = launches.map((l) => ({ kind: "launch", token: l.token, symbol: l.symbol, pad: l.pad, block: l.block }));
  // a launch that later got its own DEX pool: it left the curve
  const fresh = d.prepare("SELECT token0, token1, block FROM pools ORDER BY block DESC LIMIT 400").all() as { token0: string; token1: string; block: number }[];
  let listed = 0;
  for (const p of fresh) {
    if (listed >= Math.ceil(limit / 2)) break;
    for (const t of [p.token0, p.token1]) {
      const l = isLaunch(t);
      if (l && p.block > l.block) {
        events.push({ kind: "listed", token: t, symbol: l.symbol ?? symbolOf(t), pad: l.pad, block: p.block });
        listed++;
        break;
      }
    }
  }
  const BASE = new Set([NATIVE, RH.WETH, RH.USDG]);
  let drained = 0, checked = 0;
  try {
    // the liveness pass marks many pools in one go: keep the newest ones that have a name, a few at a time
    const rows = d.prepare("SELECT token0, token1, checked_at FROM pools WHERE dead = 1 AND checked_at IS NOT NULL ORDER BY checked_at DESC, block DESC LIMIT 200").all() as { token0: string; token1: string; checked_at: number }[];
    const seen = new Set<string>();
    for (const r of rows) {
      const t = BASE.has(r.token0) ? r.token1 : r.token0;
      const name = isLaunch(t)?.symbol ?? symbolOf(t);
      if (!name || seen.has(t)) continue;
      seen.add(t);
      events.push({ kind: "drained", token: t, symbol: name, pad: isLaunch(t)?.pad ?? null, block: r.checked_at });
      if (seen.size >= 6) break;
    }
    // tracked = pools seen funded (alive or drained later); a pool never funded is empty, not drained
    const c = d.prepare("SELECT SUM(dead = 1) AS drained, SUM(dead IS NOT NULL) AS checked FROM pools").get() as { drained: number | null; checked: number | null };
    drained = c.drained ?? 0;
    checked = c.checked ?? 0;
  } catch {
    // an index made before the liveness pass
  }
  events.sort((a, b) => b.block - a.block);
  return { events: events.slice(0, limit * 2), counts: { launches: total, launches24h: day, pools: st?.pools ?? 0, drained, checked }, head };
}

export type StudyGroup = { id: string; label: string; n: number; drained: number; rate: number; lo: number; hi: number };

/** 95% Wilson interval for k of n. */
function wilson(k: number, n: number) {
  if (!n) return { lo: 0, hi: 0 };
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (c - m) / d), hi: Math.min(1, (c + m) / d) };
}

/**
 * Does a signal the token check reads at launch time tell which launches get drained? For every launchpad launch whose
 * fate is known (its pools were read alive or drained), each signal is computed only from what was on chain BEFORE that
 * launch's block: the creator's earlier launches, earlier pools found drained before the launch, a ticker used before.
 * Then the drained share of launches with the signal is compared with those without. Index only, no chain calls.
 */
export function signalStudy(): { groups: StudyGroup[]; known: number; launches: number; fromBlock: number | null; toBlock: number | null } | null {
  const d = get();
  if (!d) return null;
  let launches: { token: string; block: number; creator: string | null; symbol: string | null }[];
  try {
    launches = d.prepare("SELECT token, block, creator, symbol FROM launches ORDER BY block ASC").all() as typeof launches;
  } catch {
    return null;
  }
  let pools: { token0: string; token1: string; dead: number | null; checked_at: number | null }[] = [];
  try {
    pools = d.prepare("SELECT token0, token1, dead, checked_at FROM pools").all() as typeof pools;
  } catch {
    return null;
  }
  // a token's fate: drained if any of its pools was found drained, alive if all read pools are alive
  const fate = new Map<string, { dead: boolean; at: number | null; read: boolean }>();
  for (const p of pools) {
    for (const t of [p.token0, p.token1]) {
      if (p.dead == null) continue;
      const f = fate.get(t) ?? { dead: false, at: null, read: false };
      f.read = true;
      if (p.dead === 1) {
        f.dead = true;
        f.at = f.at == null ? p.checked_at : Math.min(f.at, p.checked_at ?? f.at);
      }
      fate.set(t, f);
    }
  }
  const byCreator = new Map<string, { block: number; token: string }[]>();
  const tickers = new Map<string, number>();
  const rows: { drained: boolean; priorLaunches: number; priorDrained: number; reused: boolean; fresh: boolean }[] = [];
  for (const l of launches) {
    const prior = l.creator ? (byCreator.get(l.creator) ?? []) : [];
    // only drains already found before this launch count: no look into the future
    const priorDrained = prior.filter((x) => {
      const f = fate.get(x.token);
      return f?.dead && f.at != null && f.at < l.block;
    }).length;
    const sym = (l.symbol ?? "").trim().toUpperCase();
    const reused = !!sym && (tickers.get(sym) ?? Infinity) < l.block;
    const f = fate.get(l.token);
    if (f?.read) rows.push({ drained: f.dead, priorLaunches: prior.length, priorDrained, reused, fresh: prior.length === 0 });
    if (l.creator) byCreator.set(l.creator, [...prior, { block: l.block, token: l.token }]);
    if (sym && !tickers.has(sym)) tickers.set(sym, l.block);
  }
  const group = (id: string, label: string, pick: (r: (typeof rows)[number]) => boolean): StudyGroup => {
    const g = rows.filter(pick), k = g.filter((r) => r.drained).length;
    const w = wilson(k, g.length);
    return { id, label, n: g.length, drained: k, rate: g.length ? k / g.length : 0, lo: w.lo, hi: w.hi };
  };
  return {
    known: rows.length,
    launches: launches.length,
    fromBlock: launches[0]?.block ?? null,
    toBlock: launches.at(-1)?.block ?? null,
    groups: [
      group("all", "Every launch with a known fate", () => true),
      group("drainer", "Creator already had a launch found drained", (r) => r.priorDrained > 0),
      group("clean", "Creator launched before, none found drained", (r) => r.priorLaunches > 0 && r.priorDrained === 0),
      group("serial", "Creator launched 5 or more tokens before", (r) => r.priorLaunches >= 5),
      group("first", "Creator's first launch", (r) => r.fresh),
      group("copy", "Ticker already used by an earlier launch", (r) => r.reused),
      group("unique", "Ticker not used before", (r) => !r.reused),
    ],
  };
}

/**
 * The same question for every DEX pool whose fate is known (read alive or drained): does the launcher's record, as it
 * stood when the pool was created, tell which pools get drained? Signals use only pools created and found drained
 * BEFORE this pool's block. This is the creator check of the token check, measured.
 */
export const STUDY_MIN_DRAINS = 50;

export function poolStudy(): { groups: StudyGroup[]; known: number; pools: number; drained: number; ready: boolean } | null {
  const d = get();
  if (!d) return null;
  let rows: { token0: string; token1: string; block: number; launcher: string | null; dead: number | null; checked_at: number | null; hooks: string | null }[];
  try {
    rows = d.prepare("SELECT token0, token1, block, launcher, dead, checked_at, hooks FROM pools ORDER BY block ASC").all() as typeof rows;
  } catch {
    return null;
  }
  const BASE = new Set([NATIVE, RH.WETH, RH.USDG]);
  const hist = new Map<string, { block: number; dead: number | null; at: number | null }[]>();
  const firstTicker = new Map<string, number>();
  const sym = d.prepare("SELECT symbol FROM tokens WHERE address = ?");
  const out: { drained: boolean; prior: number; priorDrained: number; reused: boolean }[] = [];
  for (const p of rows) {
    const prior = p.launcher ? (hist.get(p.launcher) ?? []) : [];
    const priorDrained = prior.filter((x) => x.dead === 1 && x.at != null && x.at < p.block).length;
    const t = BASE.has(p.token0) ? p.token1 : p.token0;
    const s = ((sym.get(t) as { symbol: string | null } | undefined)?.symbol ?? "").trim().toUpperCase();
    const reused = !!s && (firstTicker.get(s) ?? Infinity) < p.block;
    if (p.dead != null) out.push({ drained: p.dead === 1, prior: prior.length, priorDrained, reused });
    if (p.launcher) hist.set(p.launcher, [...prior, { block: p.block, dead: p.dead, at: p.checked_at }]);
    if (s && !firstTicker.has(s)) firstTicker.set(s, p.block);
  }
  const group = (id: string, label: string, pick: (r: (typeof out)[number]) => boolean): StudyGroup => {
    const g = out.filter(pick), k = g.filter((r) => r.drained).length;
    const w = wilson(k, g.length);
    return { id, label, n: g.length, drained: k, rate: g.length ? k / g.length : 0, lo: w.lo, hi: w.hi };
  };
  const drainedAll = out.filter((r) => r.drained).length;
  return {
    known: out.length,
    pools: rows.length,
    drained: drainedAll,
    ready: drainedAll >= STUDY_MIN_DRAINS,
    groups: [
      group("all", "Every pool with a known fate", () => true),
      group("drainer", "Launcher had a pool found drained before", (r) => r.priorDrained > 0),
      group("drainer3", "Launcher had 3 or more found drained before", (r) => r.priorDrained >= 3),
      group("clean", "Launcher opened pools before, none found drained", (r) => r.prior > 0 && r.priorDrained === 0),
      group("first", "Launcher's first pool", (r) => r.prior === 0),
      group("copy", "Ticker already used by an earlier pool", (r) => r.reused),
      group("unique", "Ticker not used before", (r) => !r.reused),
    ],
  };
}

export type LeagueRow = { id: string; name: string; rule: string; picked: number; known: number; drained: number; survived: number; rate: number; lo: number; hi: number };

/**
 * Survival league: rules a buyer could follow, run on paper over every DEX pool created in the last `days` days. Each
 * rule decides take-or-skip from what was on chain when the pool was created (the launcher's earlier pools and drains
 * found before that block, the ticker's earlier use, whether the token came off a launchpad). Scored by how many of the
 * pools it took were later found drained: lower is better. Survival only: a pool that survived is not a profit.
 */
export function survivalLeague(days = 7): { rows: LeagueRow[]; fromBlock: number; toBlock: number; pools: number; drained: number; tracked: number; ready: boolean } | null {
  const d = get();
  if (!d) return null;
  const head = indexStatus()?.high;
  if (!head) return null;
  const from = head - Math.round(days * 86_400 * 9.5);
  let rows: { token0: string; token1: string; block: number; launcher: string | null; dead: number | null; checked_at: number | null }[];
  try {
    rows = d.prepare("SELECT token0, token1, block, launcher, dead, checked_at FROM pools ORDER BY block ASC").all() as typeof rows;
  } catch {
    return null;
  }
  let launched = new Set<string>();
  try {
    launched = new Set((d.prepare("SELECT token FROM launches").all() as { token: string }[]).map((r) => r.token));
  } catch {
    // no launch watch in this index
  }
  const BASE = new Set([NATIVE, RH.WETH, RH.USDG]);
  const sym = d.prepare("SELECT symbol FROM tokens WHERE address = ?");
  const hist = new Map<string, { dead: number | null; at: number | null }[]>();
  const firstTicker = new Map<string, number>();
  type P = { dead: boolean | null; prior: number; priorDrained: number; reused: boolean; pad: boolean };
  const window: P[] = [];
  for (const p of rows) {
    const prior = p.launcher ? (hist.get(p.launcher) ?? []) : [];
    const t = BASE.has(p.token0) ? p.token1 : p.token0;
    const s = ((sym.get(t) as { symbol: string | null } | undefined)?.symbol ?? "").trim().toUpperCase();
    if (p.block >= from)
      window.push({ dead: p.dead == null ? null : p.dead === 1, prior: prior.length, priorDrained: prior.filter((x) => x.dead === 1 && x.at != null && x.at < p.block).length, reused: !!s && (firstTicker.get(s) ?? Infinity) < p.block, pad: launched.has(t) });
    if (p.launcher) hist.set(p.launcher, [...prior, { dead: p.dead, at: p.checked_at }]);
    if (s && !firstTicker.has(s)) firstTicker.set(s, p.block);
  }
  const RULES: { id: string; name: string; rule: string; take: (p: P) => boolean }[] = [
    { id: "all", name: "Buy everything", rule: "Takes every new pool: the baseline.", take: () => true },
    { id: "skipfirst", name: "Skip first pools", rule: "Only launchers who opened a pool before.", take: (p) => p.prior > 0 },
    { id: "clean", name: "Clean record", rule: "Launchers with earlier pools and none found drained.", take: (p) => p.prior > 0 && p.priorDrained === 0 },
    { id: "pad", name: "Launchpad graduates", rule: "Only tokens that came off a launchpad curve.", take: (p) => p.pad },
    { id: "newticker", name: "New tickers only", rule: "Skips any ticker used before.", take: (p) => !p.reused },
    { id: "firsts", name: "First pools only", rule: "Only a launcher's very first pool: the opposite bet.", take: (p) => p.prior === 0 },
  ];
  const out = RULES.map((r) => {
    const picked = window.filter(r.take);
    const known = picked.filter((p) => p.dead != null);
    const drained = known.filter((p) => p.dead).length;
    const w = wilson(drained, known.length);
    return { id: r.id, name: r.name, rule: r.rule, picked: picked.length, known: known.length, drained, survived: known.length - drained, rate: known.length ? drained / known.length : 0, lo: w.lo, hi: w.hi };
  });
  const tracked = window.filter((p) => p.dead != null).length, drained = window.filter((p) => p.dead).length;
  return { rows: out, fromBlock: from, toBlock: head, pools: window.length, drained, tracked, ready: drained >= STUDY_MIN_DRAINS };
}

/**
 * What became of the launches the index knows (Pons, Launchhood and the rest): did the token reach a pool, and is that
 * pool still trading or was its liquidity pulled. A launch is "drained" only when every pool of its token is marked
 * dead by the liveness rule; one pool checked live counts it as trading; pools not checked yet stay "unchecked". Whole history and the last 7 days, per launch pad.
 */
export function launchOutcomes() {
  const d = get();
  if (!d) return null;
  const head = indexStatus()?.high ?? 0;
  const BPH = 14_400;
  const pools = d.prepare(`SELECT token0, token1, dead FROM pools`).all() as { token0: string; token1: string; dead: number | null }[];
  // per token: how many pools, how many of them dead
  const byToken = new Map<string, { n: number; dead: number; unknown: number }>();
  for (const p of pools)
    for (const t of [p.token0.toLowerCase(), p.token1.toLowerCase()]) {
      const s = byToken.get(t) ?? { n: 0, dead: 0, unknown: 0 };
      s.n++;
      if (p.dead === 1) s.dead++;
      else if (p.dead == null) s.unknown++;
      byToken.set(t, s);
    }
  const launches = d.prepare(`SELECT token, pad, block FROM launches`).all() as { token: string; pad: string; block: number }[];
  type Row = { pad: string; total: number; noPool: number; trading: number; drained: number; unchecked: number };
  const blank = (pad: string): Row => ({ pad, total: 0, noPool: 0, trading: 0, drained: 0, unchecked: 0 });
  const all = new Map<string, Row>(), week = new Map<string, Row>();
  const add = (m: Map<string, Row>, pad: string, k: keyof Omit<Row, "pad" | "total">) => {
    const r = m.get(pad) ?? blank(pad);
    r.total++;
    r[k]++;
    m.set(pad, r);
  };
  for (const l of launches) {
    const s = byToken.get(l.token.toLowerCase());
    // a pool the liveness rule has not looked at yet is "unchecked", never counted as trading
    const k = !s ? "noPool" : s.dead === s.n ? "drained" : s.n - s.dead - s.unknown > 0 ? "trading" : "unchecked";
    add(all, l.pad, k);
    if (head - l.block <= 7 * 24 * BPH) add(week, l.pad, k);
  }
  const sum = (m: Map<string, Row>) => [...m.values()].reduce((a, r) => ({ ...a, total: a.total + r.total, noPool: a.noPool + r.noPool, trading: a.trading + r.trading, drained: a.drained + r.drained, unchecked: a.unchecked + r.unchecked }), blank("all"));
  const sort = (m: Map<string, Row>) => [...m.values()].sort((a, b) => b.total - a.total);
  return { head, launches: launches.length, all: { total: sum(all), pads: sort(all) }, week: { total: sum(week), pads: sort(week) } };
}
