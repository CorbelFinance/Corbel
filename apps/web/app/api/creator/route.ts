import { parseAddress } from "@corbel/data/chain";
import { creatorDossier, indexStatus, padsOf } from "@corbel/indexer";
import { LAUNCHPADS } from "@corbel/config";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/creator?address=<0x…> → every token this wallet launched (launchpads and pools), and what became of each:
 * still on its curve, trading, drained. From the local index only: no chain calls, so it answers at once.
 */
export async function GET(req: Request) {
  const address = parseAddress((new URL(req.url).searchParams.get("address") ?? "").trim());
  if (!address) return Response.json({ error: "Paste a wallet address (0x…)." }, { status: 400 });
  const g = await guardWait(req, "assets", 10_000);
  if ("blocked" in g) return g.blocked;
  try {
    const d = creatorDossier(address);
    if (!d) return Response.json({ error: "The index is not reachable right now. Try again in a minute." }, { status: 503 });
    const pads = padsOf(d.tokens.map((t) => t.token));
    // the launchpad by the contract the launch went through, or by the hook its first pool carries
    const padName = (contract: string | null | undefined, hooks: string | null | undefined) =>
      LAUNCHPADS.find((l) => (contract && l.contracts?.includes(contract.toLowerCase())) || (hooks && l.hooks?.includes(hooks.toLowerCase())))?.name ?? null;
    const tokens = d.tokens.map((t) => ({ ...t, pad: padName(t.pad ?? pads.get(t.token)?.pad, pads.get(t.token)?.hooks) }));
    const count = (s: string) => tokens.filter((t) => t.state === s).length;
    award(req, "creator");
    return Response.json(
      { address: address.toLowerCase(), head: indexStatus()?.high ?? null, at: Date.now(), bulk: d.bulk, total: tokens.length, trading: count("trading"), drained: count("drained"), curve: count("curve"), unknown: count("unknown"), tokens },
      { headers: { "cache-control": "public, max-age=60" } },
    );
  } finally {
    g.release();
  }
}
