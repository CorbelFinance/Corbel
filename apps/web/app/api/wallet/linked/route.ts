import { isAddress } from "viem";
import { session } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { sybilDb } from "@/lib/sybil";
import { tierOf } from "@/lib/tiers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/wallet/linked?a=0x… → the wallets one address is tied to on chain: who sent it $CORBEL and whom it sent
 * $CORBEL to (two steps out at most), and which wallet first paid its gas when that is known. Chain data only: the
 * traffic signals the linker keeps for limits never leave the server. For holders from the Plus tier.
 */
const ORDER = ["light", "plus", "full", "core"];
const MAX_NODES = 30;
type Edge = { src: string; dst: string; total: number; count: number; last: number };

export async function GET(req: Request) {
  const s = session(req);
  if (!s) return Response.json({ error: "Sign in with your wallet first." }, { status: 401 });
  const t = tierOf(s.address);
  if (!t || ORDER.indexOf(t.id) < ORDER.indexOf("plus")) return Response.json({ error: "The linked-wallet map opens from the Plus tier." }, { status: 403 });
  const a = (new URL(req.url).searchParams.get("a") ?? "").trim().toLowerCase();
  if (!isAddress(a)) return Response.json({ error: "Paste a 0x address." }, { status: 400 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    const d = sybilDb();
    if (!d) return Response.json({ error: "The map is not open right now." }, { status: 503 });
    const pairs = d.prepare(
      "SELECT src, dst, SUM(val) AS total, COUNT(*) AS count, MAX(at) AS last FROM xfer WHERE src = ? OR dst = ? GROUP BY src, dst ORDER BY total DESC LIMIT 60",
    );
    const nodes = new Set<string>([a]);
    const edges = new Map<string, Edge>();
    const add = (e: Edge) => {
      if (e.src === e.dst || e.total <= 0) return;
      if (!nodes.has(e.src) || !nodes.has(e.dst)) {
        if (nodes.size >= MAX_NODES) return;
        nodes.add(e.src);
        nodes.add(e.dst);
      }
      edges.set(`${e.src}>${e.dst}`, e);
    };
    const first = pairs.all(a, a) as Edge[];
    for (const e of first) add(e);
    // one more step from the wallets it dealt with most, so a cluster shows its shape
    for (const n of first.map((e) => (e.src === a ? e.dst : e.src)).slice(0, 6)) for (const e of pairs.all(n, n) as Edge[]) add(e);
    const funders = d.prepare("SELECT addr, funder FROM wallet WHERE addr = ?");
    const fund = new Map<string, string>();
    for (const n of nodes) {
      const r = funders.get(n) as { addr: string; funder: string | null } | undefined;
      if (r?.funder) fund.set(n, r.funder.toLowerCase());
    }
    const contract = d.prepare("SELECT contract FROM code WHERE addr = ?");
    const out = [...nodes].map((n) => {
      const c = contract.get(n) as { contract: number } | undefined;
      const inflow = [...edges.values()].filter((e) => e.dst === n).reduce((x, e) => x + e.total, 0);
      const outflow = [...edges.values()].filter((e) => e.src === n).reduce((x, e) => x + e.total, 0);
      return { address: n, center: n === a, contract: c ? !!c.contract : null, funder: fund.get(n) ?? null, inflow, outflow };
    });
    // wallets in the map that share a first gas funder: the strongest hint that one person runs them
    const byFunder = new Map<string, string[]>();
    for (const [n, f] of fund) (byFunder.get(f) ?? byFunder.set(f, []).get(f)!).push(n);
    const shared = [...byFunder.entries()].filter(([, ws]) => ws.length > 1).map(([funder, wallets]) => ({ funder, wallets }));
    return Response.json({ address: a, nodes: out, edges: [...edges.values()], sharedFunders: shared }, { headers: { "cache-control": "no-store" } });
  } finally {
    g.release();
  }
}
