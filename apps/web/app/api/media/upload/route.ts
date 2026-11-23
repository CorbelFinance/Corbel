import { AI_ACCESS, hasFull, FULL_TIER } from "@corbel/config";
import { randomBytes } from "node:crypto";
import { session, sameOrigin } from "@/lib/auth";
import { guardWait } from "@/lib/guard";
import { allMediaModels } from "@/lib/mediaAll";
import { mediaOn, uploadMedia } from "@/lib/mediaUpstream";
import { tierOf } from "@/lib/tiers";
import { keepUpload } from "@/lib/mediaUploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/media/upload (multipart: file, model) → {id}: the picture or video a top holder's model starts from
 * (image-to-video, edits, upscalers). The file goes to the provider; only a short id comes back, and the provider's
 * file object stays here, tied to the wallet, for an hour. Nothing is kept on our disk.
 */
const MAX = { image: 20 * 1024 * 1024, video: 100 * 1024 * 1024 };
export async function POST(req: Request) {
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    if (!sameOrigin(req)) return Response.json({ error: "Wrong origin." }, { status: 403 });
    const s = session(req);
    if (!s) return Response.json({ error: "Sign in with your wallet." }, { status: 401 });
    if (!hasFull(tierOf(s.address))) return Response.json({ error: `Starting from your own file is for Full holders: ${FULL_TIER.minCoins.toLocaleString("en-US")} $CORBEL held for ${AI_ACCESS.holdDays} days.` }, { status: 403 });
    if (!mediaOn()) return Response.json({ error: "Pictures, video and sound are not open right now." }, { status: 503 });
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const model = allMediaModels().find((m) => m.id === form?.get("model"));
    if (!(file instanceof File)) return Response.json({ error: "Attach a picture or a video." }, { status: 400 });
    if (!model?.needs) return Response.json({ error: "This model does not start from a file." }, { status: 400 });
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!kind) return Response.json({ error: "Only pictures (JPG, PNG, WebP) and videos (MP4, MOV, WebM) can be attached." }, { status: 415 });
    if (kind !== model.needs) return Response.json({ error: `${model.label} starts from a ${model.needs}.` }, { status: 400 });
    if (file.size > MAX[kind]) return Response.json({ error: `The ${kind} is too large: up to ${MAX[kind] / 1024 / 1024} MB.` }, { status: 413 });
    const up = await uploadMedia(new Uint8Array(await file.arrayBuffer()), file.name || `${kind}.${kind === "image" ? "png" : "mp4"}`, file.type, model.type).catch(() => null);
    if (!up) return Response.json({ error: "The file did not upload. Try again." }, { status: 502 });
    const id = randomBytes(10).toString("base64url");
    keepUpload(id, s.address, up, kind);
    return Response.json({ id, kind }, { headers: { "cache-control": "no-store" } });
  } finally {
    g.release();
  }
}
