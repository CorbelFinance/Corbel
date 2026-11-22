/**
 * GPU machines behind one small interface. The implementation is a module on the server (GPU_ADAPTER: an absolute
 * path to it). Without it the GPUs stay closed.
 */
import { pathToFileURL } from "node:url";

/** One machine as the rest of the code sees it. */
export type GpuMachine = { id: string; name?: string; running: boolean; hourly?: number };

export type GpuProvider = {
  /** app: what the machine opens to (config GPU_FREE.apps); the module picks the image and port for it. */
  create(o: { gpu: string; name: string; password: string; image: string; diskGb: number; app: string }): Promise<GpuMachine>;
  get(id: string): Promise<GpuMachine | null>;
  list(): Promise<GpuMachine[]>;
  stop(id: string): Promise<void>;
  /** The notebook on the machine answers (the provider calls a machine running before it does). */
  ready(id: string, app: string, password: string): Promise<boolean>;
  /** The provider's price list of GPU types, per hour (for the AI & GPUs page). */
  prices?(): Promise<{ id: string; name: string; vram: number; secure: number | null; community: number | null; lowest: number | null }[]>;
};

let cached: { path: string; p: Promise<GpuProvider | null> } | null = null;

export function gpuProvider(): Promise<GpuProvider | null> {
  const path = process.env.GPU_ADAPTER;
  if (!path) return Promise.resolve(null);
  if (cached?.path !== path) {
    const p = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(path).href)
      .then((m: { default?: GpuProvider } & GpuProvider) => m.default ?? m)
      .catch(() => null);
    cached = { path, p };
  }
  return cached.p;
}
