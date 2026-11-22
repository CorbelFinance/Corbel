import { createHash } from "node:crypto";
import { session } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { mediaFile } from "@/lib/mediaUpstream";
import { mediaDb } from "@/lib/mediaStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/media/file?id=… → the finished picture, video or sound, streamed through this site so the browser never
 * learns where it was made. Only the wallet that asked for it can open it.
 */
const TYPES: Record<string, string> = { image: "image/png", video: "video/mp4", audio: "audio/mpeg" };

export async function GET(req: Request) {
  const g = await guardWait(req, "assets");
  if ("blocked" in g) return g.blocked;
  try {
    const s = session(req);
    if (!s) return new Response("Sign in with your wallet.", { status: 401 });
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const d = mediaDb();
    const job = d?.prepare("SELECT who, kind, file, type FROM jobs WHERE id = ?").get(id) as { who: string; kind: string; file: string | null; type: string | null } | undefined;
    const me = createHash("sha256").update(`corbel-media:${s.address.toLowerCase()}`).digest("hex").slice(0, 32);
    if (!job?.file || job.who !== me) return new Response("Not found.", { status: 404 });
    const r = await mediaFile(job.file).catch(() => null);
    if (!r || r.status >= 300) return new Response("The file is not ready.", { status: 502 });
    const type = r.headers["content-type"]?.split(";")[0] || TYPES[job.kind] || "application/octet-stream";
    const ext = type.split("/")[1]?.replace("jpeg", "jpg").replace("mpeg", "mp3") ?? "bin";
    return new Response(r.body, {
      headers: {
        "content-type": type,
        ...(r.headers["content-length"] ? { "content-length": r.headers["content-length"] } : {}),
        "cache-control": "private, max-age=86400",
        "content-disposition": `inline; filename="corbel-${id.slice(0, 8)}.${ext}"`,
      },
    });
  } finally {
    g.release();
  }
}
