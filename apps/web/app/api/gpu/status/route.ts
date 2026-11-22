import { guardWait } from "@/lib/guard";
import { gpuPublic, startGpuSweep } from "@/lib/gpuRent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/gpu/status → how busy the free holder machines are: running and starting now, the most at once, rentals
 * and minutes served today, the share of today's free budget used, bookings waiting. No wallets, no provider.
 */
export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    startGpuSweep();
    return Response.json(gpuPublic(), { headers: { "cache-control": "public, max-age=10" } });
  } finally {
    g.release();
  }
}
