/**
 * The loader's scene in its own thread. The page hands over its canvas (OffscreenCanvas) and the mono font's file;
 * from then on the scene draws here, so the page starting up (hydration, effects, the first frames of the other
 * scenes) can no longer stop it. Messages: init, resize, seen, hidden, stop.
 */
import { runNet, type NetCtl, type Story } from "./netCore";

type Face = { family: string; src: string; desc: FontFaceDescriptors };
type Init = { type: "init"; canvas: OffscreenCanvas; story: Story; still: boolean; phone: boolean; dpr: number; fam: string; faces: Face[]; w: number; h: number };
type Msg = Init | { type: "resize"; w: number; h: number } | { type: "seen"; on: boolean } | { type: "hidden"; on: boolean } | { type: "stop" };

const scope = self as unknown as { fonts?: FontFaceSet; onmessage: ((e: MessageEvent<Msg>) => void) | null; close: () => void };
const raf: (f: (now: number) => void) => number =
  typeof requestAnimationFrame === "function" ? (f) => requestAnimationFrame(f) : (f) => setTimeout(() => f(performance.now()), 16) as unknown as number;
const caf: (id: number) => void = typeof cancelAnimationFrame === "function" ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);

let ctl: NetCtl | null = null;
let hidden = false;

scope.onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") {
    const set = scope.fonts;
    const loads = m.faces.map((f) => {
      try {
        const ff = new FontFace(f.family, f.src, f.desc);
        set?.add(ff);
        return ff.load();
      } catch {
        return Promise.resolve(null);
      }
    });
    const loaded = Promise.all(loads);
    ctl = runNet({
      cv: m.canvas,
      story: m.story,
      still: m.still,
      phone: m.phone,
      dpr: m.dpr,
      // without the face here the scene draws in the system mono font rather than wait
      fam: set && m.faces.length ? m.fam : "",
      mk: () => new OffscreenCanvas(1, 1),
      fontCheck: (fam) => !set || set.check(`16px ${fam}`),
      fontLoad: () => loaded,
      covered: () => false,
      hidden: () => hidden,
      raf,
      caf,
    });
    ctl.resize(m.w, m.h);
  } else if (m.type === "resize") ctl?.resize(m.w, m.h);
  else if (m.type === "seen") ctl?.seen(m.on);
  else if (m.type === "hidden") hidden = m.on;
  else if (m.type === "stop") {
    ctl?.stop();
    ctl = null;
    scope.close();
  }
};
