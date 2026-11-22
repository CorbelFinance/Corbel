/**
 * The full text model set for top holders, read through lib/mediaProvider with the media models. A model that fails
 * to answer is hidden for good (kept on disk).
 */
import { modelList } from "./mediaAll";
import { mediaAdapter, type TextModel } from "./mediaProvider";
import { keepSnap, loadSnap } from "./snapshot";

export type { TextModel };
type Bad = { at: number; ids: Record<string, string> };
const G = globalThis as unknown as { __corbelTextAll?: { bad: Bad } };
const box = (G.__corbelTextAll ??= { bad: loadSnap<Bad>("text-bad") ?? { at: 0, ids: {} } });

export function allTextModels(): TextModel[] {
  return (modelList()?.text ?? []).filter((m) => !box.bad.ids[m.id]);
}

export const textModel = (id: string) => allTextModels().find((m) => m.id === id) ?? null;

/** Asks a text model and yields the answer in pieces as it grows. Throws with a plain reason when it fails. */
export async function* askText(id: string, prompt: string, signal: AbortSignal): AsyncGenerator<string> {
  const a = await mediaAdapter();
  if (!a) throw new Error("This model is not open right now.");
  try {
    yield* a.askText(id, prompt, signal);
  } catch (e) {
    if (!signal.aborted) {
      box.bad = { at: Date.now(), ids: { ...box.bad.ids, [id]: (e instanceof Error ? e.message : "error").slice(0, 200) } };
      keepSnap("text-bad", box.bad);
    }
    throw e;
  }
}
