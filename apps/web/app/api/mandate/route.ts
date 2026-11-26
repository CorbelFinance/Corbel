import { SCENARIOS, describeScenario, getClient, redact, runMandateLab } from "@corbel/data/chain";
import { guardWait } from "@/lib/guard";
import { readLog, recordRun } from "@/lib/labLog";
import { award } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/mandate            → the scenarios
 * GET /api/mandate?log       → the decision log: what the contract decided in recent runs
 * GET /api/mandate?s=<id>     → run one: a real CorbelMandate deployed inside an eth_call, a real bond,
 *                               the agent's attempt against live pools. Nothing is sent. Cached 20 s.
 */
const cache = new Map<string, { at: number; body: unknown }>();

async function handle(req: Request) {
  const u = new URL(req.url).searchParams;
  if (u.get("log") !== null) return (award(req, "log"), Response.json(readLog() ?? { entries: [], totals: null }));
  const id = u.get("s");
  if (!id) return Response.json({ scenarios: SCENARIOS.map(describeScenario) });
  if (!SCENARIOS.some((s) => s.id === id)) return Response.json({ error: "Unknown scenario." }, { status: 400 });
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 20_000) return Response.json(hit.body);
  const client = getClient(process.env.RPC_URL);
  if (!client) return Response.json({ error: "Chain reads are paused. Try again later." }, { status: 503 });
  try {
    const body = await runMandateLab(client, id);
    cache.set(id, { at: Date.now(), body });
    try {
      recordRun(body);
    } catch {
      /* the log is best effort; the run itself already succeeded */
    }
    return Response.json(body);
  } catch (e) {
    console.error("[api/mandate]", redact(e));
    return Response.json({ error: "The chain did not answer. Try again in a moment." }, { status: 502 });
  }
}

export async function GET(req: Request) {
  // the log and the scenario list are cheap reads; only a run (?s=) is an expensive simulation
  const u = new URL(req.url);
  const g = await guardWait(req, u.searchParams.has("s") ? "mandate" : "account");
  if ("blocked" in g) return g.blocked;
  try {
    const res = await handle(req);
    if (res.ok && u.searchParams.has("s")) award(req, "agents");
    return res;
  } finally {
    g.release();
  }
}
