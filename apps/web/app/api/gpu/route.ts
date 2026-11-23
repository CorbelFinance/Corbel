import { AI_ACCESS } from "@corbel/config";
import { session, sameOrigin } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { award } from "@/lib/points";
import { bookGpu, cancelBooking, freeMinutes, GPU_RULES, gpuState, setHolderCheck, startGpu, startGpuSweep, stopGpu } from "@/lib/gpuRent";

// a booked machine starts only if its wallet still has free GPU time by its tier at that hour
setHolderCheck((owner) => freeMinutes(owner) > 0);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Free GPU time by tier (Plus, Full, Core). GET → the rules, today's minutes left and the wallet's running machine.
 * POST {gpu} → starts one. DELETE → stops it. Writes only from this site's pages, only for a signed-in Full holder.
 */
const noStore = { "cache-control": "no-store" };
const first = AI_ACCESS.tiers.find((t) => t.gpuMinutes > 0)!;

export async function GET(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    startGpuSweep();
    const s = session(req);
    const isFull = !!s && freeMinutes(s.address) > 0;
    return Response.json({ signedIn: !!s, full: isFull, need: first.minCoins, holdDays: AI_ACCESS.holdDays, rules: GPU_RULES, ...gpuState(s ? s.address : null) }, { headers: noStore });
  } finally {
    g.release();
  }
}

export async function POST(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    if (!sameOrigin(req)) return Response.json({ error: "Refused." }, { status: 403 });
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet first." }, { status: 401 });
    startGpuSweep();
    const j = (await req.json().catch(() => null)) as { gpu?: unknown; at?: unknown; agree?: unknown; app?: unknown; paid?: unknown; minutes?: unknown } | null;
    // paid from Credits: any signed-in wallet; free time and bookings: Full holders only
    const paid = j?.paid === true ? { minutes: Number(j.minutes) } : null;
    if (!paid && !freeMinutes(s.address)) return Response.json({ error: `Free GPU time opens at ${first.name}: ${first.minCoins.toLocaleString("en-US")} $CORBEL held for ${AI_ACCESS.holdDays} days.` }, { status: 403 });
    const gpu = typeof j?.gpu === "string" ? j.gpu : "";
    const app = typeof j?.app === "string" ? j.app : "code";
    // the rules must be accepted with every start or booking
    const agreed = j?.agree === true;
    // with a time: book it, and the sweep starts the machine at that minute
    const e = typeof j?.at === "number" && !paid ? bookGpu(s.address, gpu, j.at, agreed, app) : await startGpu(s.address, gpu, agreed, app, paid);
    if (e) return Response.json({ error: e }, { status: 400 });
    if (!paid) award(req, "gpu");
    return Response.json(gpuState(s.address), { headers: noStore });
  } finally {
    g.release();
  }
}

export async function DELETE(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    if (!sameOrigin(req)) return Response.json({ error: "Refused." }, { status: 403 });
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in first." }, { status: 401 });
    const e = new URL(req.url).searchParams.get("booking") ? cancelBooking(s.address) : await stopGpu(s.address);
    if (e) return Response.json({ error: e }, { status: 400 });
    return Response.json(gpuState(s.address), { headers: noStore });
  } finally {
    g.release();
  }
}
