/**
 * Pictures, film, sound and the full text model set come from an outside service behind one small interface. The
 * implementation is a module on the server (MEDIA_ADAPTER: an absolute path to it). Without it these parts stay off.
 */
import { pathToFileURL } from "node:url";
import type { MediaModel } from "./mediaCatalog";

export type UpFile = Record<string, unknown> & { url?: string; type?: "image" | "video" | "first_frame" | "last_frame" };
export type AllModel = MediaModel & { needs: "image" | "video" | null; tool: boolean };
export type TextModel = { id: string; name: string; maker: string; ctx: number; kind: "text"; pin: number; pout: number; top: true };
export type MediaStatus = { state: "working" } | { state: "done"; file: string; type: string } | { state: "failed"; why: string };
export type MediaFile = { status: number; headers: Record<string, string>; body: ReadableStream<Uint8Array> };

export type MediaAdapter = {
  /** Every model on offer: media (ids "x:…") and text. */
  models(): Promise<{ media: AllModel[]; text: TextModel[] }>;
  upload(bytes: Uint8Array, name: string, mime: string, modelType: string): Promise<UpFile | null>;
  /** Starts a job and returns its reference. */
  start(kind: "image" | "video" | "audio", ai: string, type: string, prompt: string, options: Record<string, string | number>, files: UpFile[]): Promise<string>;
  status(job: string): Promise<MediaStatus>;
  file(ref: string): Promise<MediaFile>;
  /** Yields the answer in pieces as it grows. */
  askText(id: string, prompt: string, signal: AbortSignal): AsyncGenerator<string>;
};

let cached: { path: string; p: Promise<MediaAdapter | null> } | null = null;

export const mediaOn = () => !!process.env.MEDIA_ADAPTER;

export function mediaAdapter(): Promise<MediaAdapter | null> {
  const path = process.env.MEDIA_ADAPTER;
  if (!path) return Promise.resolve(null);
  if (cached?.path !== path) {
    const p = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(path).href)
      .then((m: { default?: MediaAdapter } & MediaAdapter) => m.default ?? m)
      .catch(() => null);
    cached = { path, p };
  }
  return cached.p;
}
