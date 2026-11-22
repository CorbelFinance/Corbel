/**
 * Every picture, video, sound and tool model on offer, for top holders, read through lib/mediaProvider every 6 hours
 * and kept on disk so a busy service never empties the list. A model that refuses to start even with its required
 * settings filled is hidden for good, with the reason kept for the owner's panel.
 */
import { mediaAdapter, mediaOn, type AllModel, type TextModel } from "./mediaProvider";
import { keepSnap, loadSnap } from "./snapshot";

export type { AllModel };
type Snap = { at: number; media: AllModel[]; text: TextModel[] };
type Bad = { at: number; ids: Record<string, string> };
const G = globalThis as unknown as { __corbelMediaAll?: { snap: Snap | null; at: number; busy: boolean; bad: Bad } };
const box = (G.__corbelMediaAll ??= { snap: loadSnap<Snap>("media-all"), at: 0, busy: false, bad: loadSnap<Bad>("media-bad") ?? { at: 0, ids: {} } });

/** A busy or failing service is not a reason (only a 400-type refusal), nor is a missing or wrong input file. */
export function markBroken(id: string, why: string) {
  if (!id.startsWith("x:") || !/^4\d\d /.test(why) || /file|image|video|upload/i.test(why)) return;
  box.bad = { at: Date.now(), ids: { ...box.bad.ids, [id]: why.slice(0, 200) } };
  keepSnap("media-bad", box.bad);
}

async function refresh() {
  if (box.busy || !mediaOn() || Date.now() - box.at < 6 * 3600_000) return;
  box.busy = true;
  box.at = Date.now();
  try {
    const a = await mediaAdapter();
    const r = a ? await a.models() : null;
    if (r && (r.media.length || r.text.length)) {
      box.snap = { at: Date.now(), media: r.media, text: r.text };
      keepSnap("media-all", box.snap);
    } else box.at = Date.now() - 6 * 3600_000 + 10 * 60_000;
  } catch {
    box.at = Date.now() - 6 * 3600_000 + 10 * 60_000;
  } finally {
    box.busy = false;
  }
}

/** The list as read last (or from disk); the text models read it too. */
export function modelList(): Snap | null {
  void refresh();
  if (!box.snap) box.snap = loadSnap<Snap>("media-all");
  return box.snap;
}

/** Every media model for top holders, as chat models (ids start with "x:"). Empty until the list is first read. */
export function allMediaModels(): AllModel[] {
  return (modelList()?.media ?? []).filter((m) => !box.bad.ids[m.id]);
}
