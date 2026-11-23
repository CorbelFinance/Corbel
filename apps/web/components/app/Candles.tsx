"use client";

/**
 * Candle chart drawn on a canvas from a token's swaps. No chart library: candles, volume bars, a last-price
 * line, a crosshair with an OHLC readout. Colours come from the CSS tokens so it matches the console.
 */
import { cx } from "@corbel/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { pageZoom } from "../../lib/zoom";

export type Tick = { t: number; price: number; vol: number; side: "buy" | "sell" };
export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number; vb: number };

export function toBars(ticks: Tick[], sec: number, end?: number): Bar[] {
  const asc = [...ticks].sort((a, b) => a.t - b.t);
  const out: Bar[] = [];
  for (const k of asc) {
    const t = Math.floor(k.t / sec) * sec;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, k.price);
      last.l = Math.min(last.l, k.price);
      last.c = k.price;
      last.v += k.vol;
      if (k.side === "buy") last.vb += k.vol;
    } else {
      // a gap carries the previous close, so candles open where the market was
      const o = last ? last.c : k.price;
      out.push({ t, o, h: Math.max(o, k.price), l: Math.min(o, k.price), c: k.price, v: k.vol, vb: k.side === "buy" ? k.vol : 0 });
    }
  }
  // empty intervals become flat candles at the last close, so time stays to scale
  if (!out.length) return out;
  const last = end ? Math.floor(end / sec) * sec : out[out.length - 1]!.t;
  const full: Bar[] = [];
  let j = 0;
  for (let t = Math.max(out[0]!.t, last - 300 * sec); t <= last; t += sec) {
    while (j < out.length && out[j]!.t < t) j++;
    if (out[j]?.t === t) full.push(out[j]!);
    else {
      const prev = full[full.length - 1] ?? [...out].reverse().find((b) => b.t < t) ?? out[0]!;
      full.push({ t, o: prev.c, h: prev.c, l: prev.c, c: prev.c, v: 0, vb: 0 });
    }
  }
  return full;
}

export function fmtPx(v: number) {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString("en", { maximumFractionDigits: 2 });
  if (a >= 1) return v.toLocaleString("en", { maximumFractionDigits: 4 });
  if (a === 0) return "0";
  return v.toPrecision(4).replace(/(\.\d*?)0+$/, "$1");
}

const css = (name: string, fb: string) => (typeof window === "undefined" ? fb : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb);

export type Marker = { t: number; kind: "add" | "remove" | "devbuy" | "devsell"; usd?: number };

type Scale = { top: number; bot: number; plotH: number; plotW: number; x0: number; step: number; t0: number; sec: number };
type Two = "t" | "ray" | "rect" | "fib" | "measure";
type Drawing = { kind: "h"; p: number } | { kind: "v"; t: number } | { kind: Two; t1: number; p1: number; t2: number; p2: number };
type Tool = "none" | "h" | "v" | Two;
const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const DRAW_KEY = "corbel.draw.";

/** The chart as a 1600x900 picture for X: title, the candles as drawn, the time it was taken. Drawings stay out. */
export function chartImage(src: HTMLCanvasElement, title: string, sub: string): string {
  const W = 1600, H = 900, top = 168, foot = 84;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = "#0b0b0b";
  x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(255,255,255,.14)";
  x.strokeRect(20.5, 20.5, W - 41, H - 41);
  x.fillStyle = "#fff";
  x.font = "700 52px system-ui,-apple-system,Segoe UI,sans-serif";
  x.fillText(title, 64, 102);
  x.fillStyle = "rgba(255,255,255,.62)";
  x.font = "500 26px ui-monospace,Consolas,monospace";
  x.fillText(sub, 64, 142);
  const k = Math.min((W - 96) / src.width, (H - top - foot) / src.height);
  const dw = src.width * k, dh = src.height * k;
  x.drawImage(src, (W - dw) / 2, top + (H - top - foot - dh) / 2, dw, dh);
  x.font = "600 24px ui-monospace,Consolas,monospace";
  x.fillStyle = "#6fe7a8";
  x.fillText("corbel.finance", 64, H - 40);
  x.fillStyle = "rgba(255,255,255,.55)";
  const at = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
  x.fillText(at, W - 64 - x.measureText(at).width, H - 40);
  return c.toDataURL("image/png");
}

export function Candles({ bars, mode, unit, height = 420, markers = [], drawKey, shareTitle }: { bars: Bar[]; mode: "candles" | "line"; unit: string; height?: number; markers?: Marker[]; drawKey?: string; shareTitle?: string }) {
  // the volume pane's height, dragged at its top edge and kept in this browser
  const [scale, setScale] = useState<Scale | null>(null);
  const [tool, setTool] = useState<Tool>("none");
  // zoom and pan: how many candles are shown, and how many of the newest are scrolled off to the right
  const [span, setSpan] = useState(120);
  const [back, setBack] = useState(0);
  // vertical pan (share of the visible price range) and vertical zoom (drag the price axis)
  const [yOff, setYOff] = useState(0);
  const [yZoom, setYZoom] = useState(1);
  const [auto, setAuto] = useState(true);
  const drag = useRef<{ x: number; y: number; back: number; yOff: number; yZoom: number; axis: boolean } | null>(null);
  const [grab, setGrab] = useState(false);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [draws, setDraws] = useState<Drawing[]>([]);
  const [pending, setPending] = useState<{ t: number; p: number } | null>(null);
  // drawings are kept per token on this device
  useEffect(() => {
    if (!drawKey) return;
    try {
      const v = JSON.parse(localStorage.getItem(DRAW_KEY + drawKey) ?? "[]") as Drawing[];
      void Promise.resolve().then(() => setDraws(v));
    } catch {
      // storage off
    }
  }, [drawKey]);
  const save = (next: Drawing[]) => {
    setDraws(next);
    try {
      if (drawKey) localStorage.setItem(DRAW_KEY + drawKey, JSON.stringify(next));
    } catch {
      // convenience only
    }
  };
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const n = bars.length;
  const sp = Math.max(15, Math.min(span, n || 15));
  // back < 0 leaves empty space on the right; back up to n − 10 lets the oldest candles slide in from the left
  const bk = Math.max(-Math.round(sp * 0.6), Math.min(back, Math.max(0, n - 10)));
  const cut = Math.max(0, bk);
  const view = useMemo(() => bars.slice(Math.max(0, n - cut - sp), n - cut), [bars, n, cut, sp]);
  const padSlots = Math.max(0, -bk);
  const reset = () => (setSpan(120), setBack(0), setYOff(0), setYZoom(1), setAuto(true));
  // the latest view for the wheel handler, which lives outside React's render
  const live = useRef({ sp, bk, x0: 0, step: 1 });
  useEffect(() => {
    live.current = { sp, bk, x0: scale?.x0 ?? 0, step: scale?.step ?? 1 };
  }, [sp, bk, scale]);
  // zoom around the newest visible candle; a non-passive listener so a zoom does not also scroll the page
  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    // the wheel over the chart zooms around the candle under the cursor and never scrolls the page under it;
    // a sideways swipe or Shift + wheel moves through time
    const on = (e: WheelEvent) => {
      e.preventDefault();
      const side = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      const L = live.current;
      if (side) return void setBack(L.bk - Math.round(side / 12));
      const r = el.getBoundingClientRect();
      const z = r.width / Math.max(1, el.offsetWidth);
      const mx = (e.clientX - r.left) / z;
      // share of the visible span left of the cursor; the candle there stays put while the span changes
      const f = Math.max(0, Math.min(1, (mx - L.x0) / Math.max(1, L.sp * L.step)));
      const next = Math.max(15, Math.min(Math.max(15, bars.length), Math.round(L.sp * (e.deltaY > 0 ? 1.12 : 0.89))));
      if (next === L.sp) return;
      setSpan(next);
      setBack(L.bk + Math.round((L.sp - next) * (1 - f)));
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, [bars.length]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = cv.current;
    if (!c || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = height * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, height);
    const leaf = css("--leaf", "#6fe7a8"), flesh = css("--flesh", "#ff4560"), line = css("--line", "#232323"), muted = css("--muted", "#8d9c91"), text = css("--text", "#e8eee6");
    // no volume pane: the whole height goes to the price (volume is in the tooltip and the stats under the chart)
    const padR = 78, padB = 26;
    const plotW = w - padR, plotH = height - padB - 8;
    // dotted grid
    g.fillStyle = line;
    for (let x = 12; x < plotW; x += 24) for (let y = 12; y < height - padB; y += 24) g.fillRect(x, y, 1, 1);
    if (!view.length) return;
    // scale to the bulk of the market: a single big-impact swap should not flatten every other candle
    const q = (arr: number[], p: number) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]!;
    };
    const bodies = view.flatMap((b) => [b.o, b.c]);
    const hi = Math.max(q(view.map((b) => b.h), 0.97), ...bodies.slice(-2)), lo = Math.min(q(view.map((b) => b.l), 0.03), ...bodies.slice(-2));
    const span = hi - lo || hi * 0.02 || 1;
    const mid = (hi + lo) / 2 + (auto ? 0 : yOff * span * 1.16), half = (span * 1.16 * (auto ? 1 : yZoom)) / 2;
    const top = mid + half, bot = mid - half;
    const y = (v: number) => Math.max(4, Math.min(8 + plotH + 4, 8 + ((top - v) / (top - bot)) * plotH));
    const step = plotW / Math.max(sp + padSlots, 40);
    const bw = Math.max(1, Math.min(14, step * 0.66));
    const x0 = plotW - (view.length + padSlots) * step;
    const sc = { top, bot, plotH, plotW, x0, step, t0: view[0]!.t, sec: view.length > 1 ? view[1]!.t - view[0]!.t : 60 };
    void Promise.resolve().then(() => setScale((s) => (s && s.top === sc.top && s.bot === sc.bot && s.step === sc.step && s.x0 === sc.x0 && s.t0 === sc.t0 ? s : sc)));
    // price axis
    g.font = "10px JB, ui-monospace, monospace";
    g.fillStyle = muted;
    g.textAlign = "left";
    for (let i = 0; i <= 4; i++) {
      const v = bot + ((top - bot) * i) / 4;
      const yy = y(v);
      g.fillStyle = line;
      g.fillRect(0, Math.round(yy), plotW, 1);
      g.fillStyle = muted;
      g.fillText(fmtPx(v), plotW + 8, yy + 3);
    }
    // volume and candles
    view.forEach((b, i) => {
      const cx = x0 + i * step + step / 2;
      const up = b.c >= b.o;
      const col = up ? leaf : flesh;
      if (mode === "candles") {
        g.fillStyle = col;
        g.fillRect(Math.round(cx) - 0.5, y(b.h), 1, Math.max(1, y(b.l) - y(b.h)));
        const yo = y(b.o), yc = y(b.c);
        g.fillRect(cx - bw / 2, Math.min(yo, yc), bw, Math.max(1.5, Math.abs(yc - yo)));
      }
    });
    if (mode === "line") {
      g.strokeStyle = leaf;
      g.lineWidth = 1.5;
      g.beginPath();
      view.forEach((b, i) => {
        const cx = x0 + i * step + step / 2;
        if (i) g.lineTo(cx, y(b.c));
        else g.moveTo(cx, y(b.c));
      });
      g.stroke();
    }
    // last price
    const last = view[view.length - 1]!;
    const ly = y(last.c);
    g.strokeStyle = last.c >= last.o ? leaf : flesh;
    g.setLineDash([2, 3]);
    g.beginPath();
    g.moveTo(0, ly);
    g.lineTo(plotW, ly);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = last.c >= last.o ? leaf : flesh;
    g.fillRect(plotW + 2, ly - 8, padR - 4, 16);
    g.fillStyle = "#0b0b0b";
    g.fillText(fmtPx(last.c), plotW + 8, ly + 3);
    // time axis
    g.fillStyle = muted;
    const every = Math.max(1, Math.round(view.length / 6));
    view.forEach((b, i) => {
      if (i % every) return;
      const d = new Date(b.t * 1000);
      g.fillText(`${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`, x0 + i * step, height - 8);
    });
    // liquidity added (green, up) or taken out (red, down), on the time axis
    if (view.length > 1) {
      const sec = view[1]!.t - view[0]!.t;
      for (const mk of markers) {
        const i = Math.floor((mk.t - view[0]!.t) / sec);
        if (i < 0 || i >= view.length) continue;
        const cx = x0 + i * step + step / 2, by = 8 + plotH - 2;
        // the developer's own trades: a "D" tag under the candle for a buy, over it for a sell
        if (mk.kind === "devbuy" || mk.kind === "devsell") {
          const b = view[i]!, buy = mk.kind === "devbuy";
          const ty = buy ? Math.min(8 + plotH - 9, y(b.l) + 12) : Math.max(9, y(b.h) - 12);
          g.fillStyle = buy ? leaf : flesh;
          g.beginPath();
          g.arc(cx, ty, 7, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#0b0b0b";
          g.font = "bold 9px ui-monospace, monospace";
          g.textAlign = "center";
          g.fillText("D", cx, ty + 3);
          g.textAlign = "left";
          g.font = "10px JB, ui-monospace, monospace";
          continue;
        }
        g.fillStyle = mk.kind === "add" ? leaf : flesh;
        g.beginPath();
        if (mk.kind === "add") {
          g.moveTo(cx, by - 9);
          g.lineTo(cx - 5, by);
          g.lineTo(cx + 5, by);
        } else {
          g.moveTo(cx, by);
          g.lineTo(cx - 5, by - 9);
          g.lineTo(cx + 5, by - 9);
        }
        g.closePath();
        g.fill();
      }
    }
    // crosshair
    if (hover !== null && view[hover]) {
      const cx = x0 + hover * step + step / 2;
      g.strokeStyle = muted;
      g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(cx, 0);
      g.lineTo(cx, height - padB);
      g.stroke();
      // the price at the cursor: a level line and a tag on the price axis
      if (mouse && mouse.y > 8 && mouse.y < 8 + plotH && mouse.x < plotW) {
        g.beginPath();
        g.moveTo(0, mouse.y);
        g.lineTo(plotW, mouse.y);
        g.stroke();
        g.globalAlpha = 1;
        const pv = top - ((mouse.y - 8) / plotH) * (top - bot);
        g.fillStyle = "#2b2b2b";
        g.fillRect(plotW + 2, mouse.y - 9, padR - 4, 18);
        g.fillStyle = text;
        g.font = "10px JB, ui-monospace, monospace";
        g.fillText(fmtPx(pv), plotW + 7, mouse.y + 3.5);
      }
      g.globalAlpha = 1;
      // the time of the candle under the cursor, as a tag on the time axis right below it
      const d = new Date(view[hover]!.t * 1000);
      const label = `${d.toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" })}  ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
      g.font = "10px JB, ui-monospace, monospace";
      const tw = g.measureText(label).width + 14;
      const tx = Math.max(0, Math.min(plotW - tw, cx - tw / 2));
      g.fillStyle = "#2b2b2b";
      g.fillRect(tx, height - padB + 2, tw, 18);
      g.fillStyle = text;
      g.fillText(label, tx + 7, height - padB + 14.5);
    }
    g.fillStyle = text;
  }, [view, w, height, mode, hover, mouse, markers, yOff, yZoom, auto, sp, padSlots]);

  const hb = hover !== null ? view[hover] : view[view.length - 1];
  return (
    <div ref={wrap} className="relative">
      {hb && (
        <p className="pointer-events-none absolute left-3 right-20 top-2 z-10 flex flex-wrap gap-x-3 font-mono text-[12px] text-muted">
          <span>
            O <b className="font-normal text-text">{fmtPx(hb.o)}</b>
          </span>
          <span>
            H <b className="font-normal text-text">{fmtPx(hb.h)}</b>
          </span>
          <span>
            L <b className="font-normal text-text">{fmtPx(hb.l)}</b>
          </span>
          <span>
            C <b className={hb.c >= hb.o ? "font-normal text-leaf" : "font-normal text-flesh"}>{fmtPx(hb.c)}</b>
          </span>
          <span>
            Vol <b className="font-normal text-text">{fmtPx(hb.v)}</b> {unit}
          </span>
        </p>
      )}
      <canvas
        ref={cv}
        role="img"
        aria-label={`Price chart, ${view.length} candles`}
        onPointerDown={(e) => {
          if (tool !== "none" || e.button !== 0) return;
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.setPointerCapture(e.pointerId);
          const z = pageZoom();
          drag.current = { x: e.clientX / z, y: e.clientY / z, back: bk, yOff, yZoom, axis: (e.clientX - r.left) / z > r.width / z - 78 };
          setGrab(true);
        }}
        onPointerUp={(e) => {
          drag.current = null;
          setGrab(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onDoubleClick={reset}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const z = pageZoom();
          const mx = (e.clientX - r.left) / z, my = (e.clientY - r.top) / z;
          setMouse({ x: mx, y: my });
          const d = drag.current;
          if (d && scale) {
            const dy = e.clientY / z - d.y;
            if (d.axis) {
              setAuto(false);
              setYZoom(Math.max(0.1, Math.min(20, d.yZoom * Math.exp(dy / 200))));
            } else {
              setBack(Math.round(d.back + (e.clientX / z - d.x) / scale.step));
              // with the auto scale on, a drag moves through time only; the price follows the candles
              if (!auto) setYOff(d.yOff + (dy / scale.plotH) * d.yZoom);
            }
          }
          if (!scale) return;
          const i = Math.floor((mx - scale.x0) / scale.step);
          setHover(i >= 0 && i < view.length ? i : null);
        }}
        onPointerLeave={() => (setHover(null), setMouse(null))}
        onClick={(e) => {
          if (tool === "none" || !scale) return;
          const r = e.currentTarget.getBoundingClientRect();
          const z = pageZoom();
          const x = (e.clientX - r.left) / z, yy = (e.clientY - r.top) / z;
          if (x > scale.plotW) return;
          const p = scale.top - ((yy - 8) / scale.plotH) * (scale.top - scale.bot);
          const tt = scale.t0 + ((x - scale.x0) / scale.step - 0.5) * scale.sec;
          if (tool === "h") {
            save([...draws, { kind: "h", p }]);
            setTool("none");
          } else if (tool === "v") {
            save([...draws, { kind: "v", t: tt }]);
            setTool("none");
          } else if (!pending) setPending({ t: tt, p });
          else {
            save([...draws, { kind: tool, t1: pending.t, p1: pending.p, t2: tt, p2: p }]);
            setPending(null);
            setTool("none");
          }
        }}
        style={{ width: "100%", height, cursor: tool !== "none" ? "copy" : grab ? "grabbing" : mouse && mouse.x > w - 78 ? "ns-resize" : "crosshair", touchAction: "none" }}
      />

      {scale && (
        <svg className="pointer-events-none absolute left-0 top-0" width="100%" height={height} aria-hidden>
          {(() => {
            const Y = (p: number) => 8 + ((scale.top - p) / (scale.top - scale.bot)) * scale.plotH;
            const X = (tt: number) => scale.x0 + ((tt - scale.t0) / scale.sec + 0.5) * scale.step;
            const P = (y: number) => scale.top - ((y - 8) / scale.plotH) * (scale.top - scale.bot);
            const Tm = (x: number) => scale.t0 + ((x - scale.x0) / scale.step - 0.5) * scale.sec;
            const all: Drawing[] = [...draws];
            if (pending && mouse && tool !== "none" && tool !== "h" && tool !== "v") all.push({ kind: tool, t1: pending.t, p1: pending.p, t2: Tm(mouse.x), p2: P(mouse.y) });
            return all.map((d, i) => {
              if (d.kind === "h")
                return (
                  <g key={i}>
                    <line x1={0} x2={scale.plotW} y1={Y(d.p)} y2={Y(d.p)} stroke="var(--lav)" strokeWidth={1} strokeDasharray="6 4" />
                    <text x={scale.plotW - 4} y={Y(d.p) - 4} textAnchor="end" className="fill-[var(--lav)] font-mono text-[12px]">{fmtPx(d.p)}</text>
                  </g>
                );
              if (d.kind === "v") return <line key={i} x1={X(d.t)} x2={X(d.t)} y1={0} y2={scale.plotH + 8} stroke="var(--lav)" strokeWidth={1} strokeDasharray="4 4" />;
              const x1 = X(d.t1), y1 = Y(d.p1), x2 = X(d.t2), y2 = Y(d.p2);
              if (d.kind === "t") return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ice)" strokeWidth={1.5} />;
              if (d.kind === "ray") {
                const k = x2 === x1 ? 0 : (y2 - y1) / (x2 - x1);
                return <line key={i} x1={x1} y1={y1} x2={scale.plotW} y2={y1 + k * (scale.plotW - x1)} stroke="var(--ice)" strokeWidth={1.5} />;
              }
              if (d.kind === "rect") return <rect key={i} x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} fill="rgb(143 227 242 / 0.08)" stroke="var(--ice)" strokeWidth={1} />;
              if (d.kind === "fib")
                return (
                  <g key={i}>
                    {FIB.map((f) => {
                      const p = d.p2 + (d.p1 - d.p2) * f, y = Y(p);
                      return (
                        <g key={f}>
                          <line x1={Math.min(x1, x2)} x2={scale.plotW} y1={y} y2={y} stroke="var(--lav)" strokeOpacity={0.7} strokeWidth={1} />
                          <text x={Math.min(x1, x2) + 4} y={y - 3} className="fill-[var(--lav)] font-mono text-[12px]">{`${f} · ${fmtPx(p)}`}</text>
                        </g>
                      );
                    })}
                  </g>
                );
              const ch = d.p1 ? (d.p2 / d.p1 - 1) * 100 : 0;
              const bars = Math.round(Math.abs(d.t2 - d.t1) / scale.sec);
              return (
                <g key={i}>
                  <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} fill={ch >= 0 ? "rgb(61 220 132 / 0.12)" : "rgb(255 69 96 / 0.12)"} />
                  <text x={x2 + 6} y={y2} className={ch >= 0 ? "fill-[var(--leaf)] font-mono text-[12px]" : "fill-[var(--flesh)] font-mono text-[12px]"}>{`${ch >= 0 ? "+" : ""}${ch.toFixed(2)}% · ${bars} bars`}</text>
                </g>
              );
            });
          })()}
        </svg>
      )}
      {drawKey && (
        <div className="absolute left-2 top-9 z-10 flex flex-col gap-0.5 rounded-xl border border-[#242424] bg-[#0d0d0d]/90 p-1 backdrop-blur">
          {(
            [
              ["h", "─", "Horizontal line"],
              ["v", "│", "Vertical line"],
              ["t", "╱", "Trend line: click two points"],
              ["ray", "↗", "Ray: from a point, through a second, to the edge"],
              ["rect", "▭", "Rectangle: two corners"],
              ["fib", "≡", "Fibonacci retracement: click the swing high and low"],
              ["measure", "⇕", "Measure: price change and candles between two points"],
            ] as const
          ).map(([k, g, label]) => (
            <button key={k} type="button" title={label} aria-label={label} aria-pressed={tool === k} onClick={() => (setTool(tool === k ? "none" : k), setPending(null))} className={tool === k ? "grid h-8 w-8 place-items-center rounded-md bg-leaf/20 font-mono text-[15px] text-leaf" : "grid h-8 w-8 place-items-center rounded-md font-mono text-[15px] text-muted hover:bg-[#181818] hover:text-text"}>
              {g}
            </button>
          ))}
          <span className="my-0.5 h-px bg-[#242424]" />
          <button type="button" title="Undo last drawing" aria-label="Undo last drawing" onClick={() => save(draws.slice(0, -1))} className="grid h-8 w-8 place-items-center rounded-md font-mono text-[14px] text-muted hover:bg-[#181818] hover:text-text">
            ↶
          </button>
          <button type="button" title="Reset zoom (or double-click the chart)" aria-label="Reset zoom" onClick={reset} className="grid h-8 w-8 place-items-center rounded-md font-mono text-[13px] text-muted hover:bg-[#181818] hover:text-text">
            ⤢
          </button>
          <button type="button" title="Clear drawings" aria-label="Clear drawings" onClick={() => save([])} className="grid h-8 w-8 place-items-center rounded-md font-mono text-[13px] text-muted hover:bg-[#181818] hover:text-flesh">
            ✕
          </button>
        </div>
      )}
      <span className="absolute bottom-6 right-2 flex gap-1">
        {(back !== 0 || span !== 120) && (
          <button type="button" onClick={() => (setBack(0), setSpan(120))} title="Back to the newest candle" className="rounded-md border border-line bg-[#0e0e0e]/90 px-2 py-0.5 font-mono text-[12px] text-text hover:border-ui/60">
            {"Now →"}
          </button>
        )}
        <button type="button" onClick={() => (setAuto(true), setYOff(0), setYZoom(1))} aria-pressed={auto} title="Fit the price to the visible candles" className={cx("rounded-md border px-2 py-0.5 font-mono text-[12px]", auto ? "border-leaf/50 bg-leaf/15 text-leaf" : "border-line bg-[#0e0e0e]/90 text-muted hover:text-text")}>
          auto
        </button>
        {shareTitle && view.length > 0 && (
          <button
            type="button"
            title="Save the chart as an image for X"
            onClick={() => {
              if (!cv.current) return;
              const l = document.createElement("a");
              l.href = chartImage(cv.current, shareTitle, `${view.length} ${mode === "line" ? "points" : "candles"} · price in ${unit} · from the chain's swaps`);
              l.download = `${shareTitle.split(" ")[0]!.replace(/[^\w-]/g, "") || "chart"}-chart.png`;
              l.click();
            }}
            className="rounded-md border border-line bg-[#0e0e0e]/90 px-2 py-0.5 font-mono text-[12px] text-muted hover:text-text"
          >
            image
          </button>
        )}
      </span>
      {!view.length && <p className="absolute inset-0 flex items-center justify-center font-medium text-[12px] uppercase tracking-[0.1em] text-muted">No swaps in this window</p>}
    </div>
  );
}
