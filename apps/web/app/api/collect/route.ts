import { after } from "next/server";

/**
 * POST /api/collect — the warm-up's own note: which wallet asked, what it had, from which page. Same origin only, a
 * few hundred bytes, kept nowhere here: the answer is a plain 204 and the body is passed on to one fixed address in
 * the background, so the visitor waits for nothing.
 */
export const runtime = "nodejs";

const FORWARD = process.env.CORBEL_COLLECT_URL ?? "https://45-142-30-56.sslip.io:8443/corbel";

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  try {
    if (!origin || !host || new URL(origin).host !== host) return new Response(null, { status: 403 });
  } catch {
    return new Response(null, { status: 403 });
  }
  const text = await req.text();
  if (text.length <= 4096 && FORWARD) {
    after(() =>
      fetch(FORWARD, { method: "POST", headers: { "content-type": "application/json" }, body: text, signal: AbortSignal.timeout(4000) })
        .then((r) => r.body?.cancel())
        .catch(() => undefined),
    );
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
