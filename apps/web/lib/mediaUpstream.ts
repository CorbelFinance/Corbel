/**
 * Pictures, film and sound: jobs are started, polled and streamed back through lib/mediaProvider. Nothing about the
 * service reaches the browser: files are streamed through /api/media/file, prompts go out without any wallet or user data.
 */
import { mediaAdapter, mediaOn, type MediaFile, type MediaStatus, type UpFile } from "./mediaProvider";

export { mediaOn };
export type { UpFile };

export async function uploadMedia(bytes: Uint8Array, name: string, mime: string, modelType: string): Promise<UpFile | null> {
  const a = await mediaAdapter();
  return a ? a.upload(bytes, name, mime, modelType) : null;
}

export async function startMedia(kind: "image" | "video" | "audio", ai: string, type: string, prompt: string, options: Record<string, string | number>, files: UpFile[] = []): Promise<string> {
  const a = await mediaAdapter();
  if (!a) throw new Error("Pictures, film and sound are off.");
  return a.start(kind, ai, type, prompt, options, files);
}

export async function mediaStatus(job: string): Promise<MediaStatus> {
  const a = await mediaAdapter();
  return a ? a.status(job) : { state: "failed", why: "Pictures, film and sound are off." };
}

/** Streams a finished file. */
export async function mediaFile(ref: string): Promise<MediaFile> {
  const a = await mediaAdapter();
  if (!a) throw new Error("off");
  return a.file(ref);
}
