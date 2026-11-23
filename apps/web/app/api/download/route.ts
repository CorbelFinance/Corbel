import { curveLaunches, indexStatus, launchesSince } from "@corbel/indexer";
import { blocksPerSecond } from "@/lib/blockRate";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/download?set=pools|launches&days=1..30&format=csv|json → the same index our pages read, as a file.
 * pools: every pool made in the window (DEX, token, base, block, creating contract, hook, drained or not).
 * launches: every token born on a launchpad in the window (token, launchpad, block, tx, creator, pooled yet).
 * Capped at MAX rows, newest first; the file says when it was cut and up to which block it was read.
 */
const MAX = 20_000;
const SETS = ["pools", "launches"] as const;
type Set = (typeof SETS)[number];

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // a leading = + - @ would run as a formula in a spreadsheet: quote it as text
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

function csv(rows: Record<string, unknown>[], cols: string[]) {
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const set = (u.get("set") ?? "pools") as Set;
  if (!SETS.includes(set)) return Response.json({ error: "set must be pools or launches." }, { status: 400 });
  const days = Math.min(30, Math.max(1, Math.round(Number(u.get("days") ?? 1)) || 1));
  const format = u.get("format") === "json" ? "json" : "csv";
  const g = await guardWait(req, "launches");
  if ("blocked" in g) return g.blocked;
  try {
    const st = indexStatus();
    if (!st?.high) return Response.json({ error: "The index is not available yet." }, { status: 503 });
    const bps = await blocksPerSecond();
    const from = Math.max(st.low ?? 0, Math.round(st.high - days * 86_400 * bps));
    let rows: Record<string, unknown>[];
    let cols: string[];
    if (set === "pools") {
      cols = ["block", "pool", "kind", "token", "symbol", "name", "base", "pad", "hook", "drained"];
      rows = (launchesSince(from, MAX) ?? []).map((r) => ({ ...r, drained: r.dead === null ? "" : r.dead === 1 ? "yes" : "no" }));
    } else {
      cols = ["block", "token", "symbol", "name", "pad", "creator", "tx", "pooled"];
      rows = curveLaunches(from, MAX).map((r) => ({ ...r, pooled: r.pooled ? "yes" : "no" }));
    }
    const meta = { set, days, fromBlock: from, toBlock: st.high, rows: rows.length, cut: rows.length >= MAX, at: new Date().toISOString() };
    const name = `corbel-${set}-${days}d-${st.high}.${format}`;
    const headers = { "content-disposition": `attachment; filename="${name}"`, "cache-control": "public, max-age=300" };
    award(req, "data");
    if (format === "json") return Response.json({ ...meta, rows }, { headers });
    return new Response(csv(rows, cols), { headers: { ...headers, "content-type": "text/csv; charset=utf-8" } });
  } finally {
    g.release();
  }
}
