import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/rewards/anchors → the on-chain anchors: once an hour the head of the public points log and the newest
 * verdict root are written into one Robinhood Chain transaction (data = "corbel-anchor v1|points:…|verdicts:…"),
 * newest first. Anyone can open each transaction and read the same hashes from its input.
 */
export async function GET() {
  const f = join(dirname(process.env.CORBEL_DB ?? "data/corbel.db"), "anchors.json");
  const all = existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as { at: string; tx: string; block: number; points: string; rows: number; week: string; verdicts: string; from: string }[]) : [];
  return Response.json({ wallet: all.at(-1)?.from ?? null, anchors: all.slice(-200).reverse() }, { headers: { "cache-control": "public, max-age=60" } });
}
