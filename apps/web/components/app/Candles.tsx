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
  for (let t = Math.max(out[0]!.t, last - 3000 * sec); t <= last; t += sec) {
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

/** Liquidity by price: how much of the pool sits between this level and the one before it, in the chart's unit of money. */
const TZ_KEY = "corbel.chart.tz";
const TOOLS_KEY = "corbel.chart.tools";
/** Empty slots kept right of the newest candle (a negative offset in candles). */
const RIGHT = -4;
const FMT = new Map<string, Intl.DateTimeFormat>();
const fmtOf = (tz: string) => {
  let f = FMT.get(tz);
  if (!f) FMT.set(tz, (f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })));
  return f;
};
/** Day, hours, minutes and seconds of a unix time in a zone ("local" = the viewer's own). */
function parts(t: number, tz: string) {
  const d = new Date(t * 1000);
  const p = (x: number) => String(x).padStart(2, "0");
  if (tz === "local") return { day: d.getDate(), hh: p(d.getHours()), mm: p(d.getMinutes()), ss: p(d.getSeconds()) };
  const o: Record<string, string> = {};
  for (const x of fmtOf(tz).formatToParts(d)) o[x.type] = x.value;
  return { day: Number(o.day), hh: o.hour ?? "00", mm: o.minute ?? "00", ss: o.second ?? "00" };
}
/** "UTC+9" for a zone at this moment ("UTC" when no offset). */
function offsetOf(tz: string) {
  const now = new Date();
  let off: number;
  if (tz === "local") off = -now.getTimezoneOffset();
  else {
    const q = parts(now.getTime() / 1000, tz), u = parts(now.getTime() / 1000, "UTC");
    off = (Number(q.hh) * 60 + Number(q.mm) - (Number(u.hh) * 60 + Number(u.mm)) + 1440 * (q.day === u.day ? 0 : q.day > u.day || (u.day > 25 && q.day < 3) ? 1 : -1)) % 1440;
    if (off > 840) off -= 1440;
    if (off < -720) off += 1440;
  }
  const a = Math.abs(off);
  return off === 0 ? "UTC" : `UTC${off > 0 ? "+" : "-"}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, "0")}` : ""}`;
}
/** "10:08:53 UTC+1" in the chosen zone. */
function clockText(tz: string) {
  const q = parts(Date.now() / 1000, tz);
  return `${q.hh}:${q.mm}:${q.ss} ${tz === "UTC" ? "UTC" : offsetOf(tz)}`;
}
const zoneName = (tz: string) => (tz === "local" ? "Your time" : tz === "UTC" ? "UTC" : tz.split("/").slice(-1)[0]!.replace(/_/g, " "));
const ZONES = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
})();

export type DepthLevel = { from: number; to: number; amount: number; side: "ask" | "bid" };

export function Candles({ bars, mode, unit, height = 420, markers = [], drawKey, shareTitle, depth }: { bars: Bar[]; mode: "candles" | "line"; unit: string; height?: number; markers?: Marker[]; drawKey?: string; shareTitle?: string; depth?: DepthLevel[] }) {
  // the volume pane's height, dragged at its top edge and kept in this browser
  const [scale, setScale] = useState<Scale | null>(null);
  const [tool, setTool] = useState<Tool>("none");
  // zoom and pan: how many candles are shown, and how many of the newest are scrolled off to the right
  const [span, setSpan] = useState(120);
  // a few empty slots right of the newest candle, as trading charts keep, so the last candle never sits on the edge
  const [back, setBack] = useState(RIGHT);
  // vertical pan (share of the visible price range) and vertical zoom (drag the price axis)
  const [yOff, setYOff] = useState(0);
  const [yZoom, setYZoom] = useState(1);
  // with auto off the price range stays where the hand put it (no jump while time moves under it)
  const [yRange, setYRange] = useState<{ top: number; bot: number } | null>(null);
  // a released drag keeps gliding and slows down
  const glide = useRef<{ raf: number; v: number; last: { x: number; t: number } | null }>({ raf: 0, v: 0, last: null });
  const [auto, setAuto] = useState(true);
  const drag = useRef<{ x: number; y: number; back: number; yOff: number; yZoom: number; axis: boolean; top: number; bot: number } | null>(null);
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
  const [tools, setTools] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(TOOLS_KEY) === "0") void Promise.resolve().then(() => setTools(false));
    } catch {
      // storage off: shown
    }
  }, []);
  const flipTools = () =>
    setTools((v) => {
      try {
        localStorage.setItem(TOOLS_KEY, v ? "0" : "1");
      } catch {
        // convenience only
      }
      if (v) setTool("none");
      return !v;
    });
  const [tz, setTzState] = useState("local");
  const [tzOpen, setTzOpen] = useState(false);
  const [tzQ, setTzQ] = useState("");
  useEffect(() => {
    try {
      const v = localStorage.getItem(TZ_KEY);
      const ok = v === "local" || v === "UTC" || (v && ZONES.includes(v));
      if (v === "utc") void Promise.resolve().then(() => setTzState("UTC"));
      else if (ok && v) void Promise.resolve().then(() => setTzState(v));
    } catch {
      // storage off: local time
    }
  }, []);
  const setTz = (v: string) => {
    setTzState(v);
    setTzOpen(false);
    setTzQ("");
    try {
      localStorage.setItem(TZ_KEY, v);
    } catch {
      // convenience only
    }
  };
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => setClock(clockText(tz));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tz]);
  const n = bars.length;
  const fit = span === 120 ? Math.min(6000, Math.max(24, n + 4)) : span;
  const sp = Math.max(8, Math.min(fit, (n || 15) + 400));
  // back < 0 leaves empty space on the right; back up to n − 10 lets the oldest candles slide in from the left
  const bk = Math.max(-sp * 0.9, Math.min(back, Math.max(0, n - 3)));
  const cut = Math.max(0, Math.floor(bk));
  // the part of a candle the view is moved by: dragging glides instead of jumping a candle at a time
  const frac = bk > 0 ? bk - Math.floor(bk) : 0;
  const view = useMemo(() => bars.slice(Math.max(0, n - cut - Math.ceil(sp) - (frac > 0 ? 1 : 0)), n - cut), [bars, n, cut, sp, frac]);
  const padSlots = Math.max(0, -bk);
  const reset = () => (setSpan(120), setBack(RIGHT), setYOff(0), setYZoom(1), setYRange(null), setAuto(true));
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
      if (side) return void setBack(L.bk - side / 14);
      const r = el.getBoundingClientRect();
      const z = r.width / Math.max(1, el.offsetWidth);
      const mx = (e.clientX - r.left) / z;
      // share of the visible span left of the cursor; the candle there stays put while the span changes
      const f = Math.max(0, Math.min(1, (mx - L.x0) / Math.max(1, L.sp * L.step)));
      const d = Math.max(-120, Math.min(120, e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY));
      const next = Math.max(8, Math.min(bars.length + 400, L.sp * Math.exp(d * 0.0016)));
      if (Math.abs(next - L.sp) < 0.01) return;
      setSpan(next);
      setBack(L.bk + (L.sp - next) * (1 - f));
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
    const dpr = Math.min(3, Math.max(0.5, (window.devicePixelRatio || 1) * pageZoom()));
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
    const few = view.length < 40;
    const hi = few ? Math.max(...view.map((b) => b.h)) : Math.max(q(view.map((b) => b.h), 0.97), ...bodies.slice(-2));
    const lo = few ? Math.min(...view.map((b) => b.l)) : Math.min(q(view.map((b) => b.l), 0.03), ...bodies.slice(-2));
    const span = hi - lo || hi * 0.02 || 1;
    const mid = (hi + lo) / 2 + (auto ? 0 : yOff * span * 1.16), half = (span * 1.16 * (auto ? 1 : yZoom)) / 2;
    const top = !auto && yRange ? yRange.top : mid + half, bot = !auto && yRange ? yRange.bot : mid - half;
    const y = (v: number) => 8 + ((top - v) / (top - bot)) * plotH;
    const step = plotW / Math.max(sp + padSlots, 12);
    const bw = Math.max(0.6, Math.min(14, step * 0.7));
    const x0 = plotW - (view.length + padSlots - frac) * step;
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
    // volume and candles, clipped to the plot so a pan past the price range cuts them cleanly
    g.save();
    g.beginPath();
    g.rect(0, 0, plotW, height - padB);
    g.clip();
    const vmax = Math.max(1e-12, ...view.map((b) => b.v));
    const vh = plotH * 0.18, vb0 = 8 + plotH + 4;
    view.forEach((b, i) => {
      if (!b.v) return;
      const cx = x0 + i * step + step / 2;
      g.fillStyle = b.c >= b.o ? "rgba(111,231,168,0.32)" : "rgba(255,69,96,0.32)";
      const hgt = Math.max(1, (b.v / vmax) * vh);
      g.fillRect(cx - Math.max(0.5, bw / 2), vb0 - hgt, Math.max(1, bw), hgt);
    });
    view.forEach((b, i) => {
      const cx = x0 + i * step + step / 2;
      const up = b.c >= b.o;
      const col = up ? leaf : flesh;
      if (mode === "candles") {
        g.fillStyle = col;
        const px = 1 / dpr;
        g.fillRect(Math.round(cx * dpr) / dpr - px / 2, y(b.h), Math.max(px, 1 / dpr), Math.max(px, y(b.l) - y(b.h)));
        const yo = y(b.o), yc = y(b.c);
        const bwp = Math.max(px, Math.round(bw * dpr) / dpr);
        g.fillRect(Math.round((cx - bwp / 2) * dpr) / dpr, Math.round(Math.min(yo, yc) * dpr) / dpr, bwp, Math.max(px * 1.5, Math.round(Math.abs(yc - yo) * dpr) / dpr));
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
    g.restore();
    // last price
    const last = view[view.length - 1]!;
    const ly = Math.max(10, Math.min(height - padB - 10, y(last.c)));
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
    const every = Math.max(1, Math.round(view.length / 7));
    let lastDay = -1;
    view.forEach((b, i) => {
      const p = parts(b.t, tz);
      const newDay = p.day !== lastDay && lastDay !== -1;
      lastDay = p.day;
      if (i % every && !newDay) return;
      const x = x0 + i * step;
      if (x < 0 || x > plotW - 24) return;
      if (newDay) {
        g.fillStyle = text;
        g.fillText(String(p.day), x, height - 8);
        g.fillStyle = muted;
      } else g.fillText(`${p.hh}:${p.mm}`, x, height - 8);
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
      const pp = parts(view[hover]!.t, tz);
      const label = `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "2-digit", timeZone: tz === "local" ? undefined : tz }).replace(",", "")}  ${pp.hh}:${pp.mm}`;
      g.font = "10px JB, ui-monospace, monospace";
      const tw = g.measureText(label).width + 14;
      const tx = Math.max(0, Math.min(plotW - tw, cx - tw / 2));
      g.fillStyle = "#2b2b2b";
      g.fillRect(tx, height - padB + 2, tw, 18);
      g.fillStyle = text;
      g.fillText(label, tx + 7, height - padB + 14.5);
    }
    g.fillStyle = text;
  }, [view, w, height, mode, hover, mouse, markers, yOff, yZoom, yRange, auto, sp, padSlots, depth, tz, frac]);

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
          cancelAnimationFrame(glide.current.raf);
          glide.current = { raf: 0, v: 0, last: { x: e.clientX / z, t: performance.now() } };
          drag.current = { x: e.clientX / z, y: e.clientY / z, back: bk, yOff, yZoom, axis: (e.clientX - r.left) / z > r.width / z - 78, top: scale?.top ?? 0, bot: scale?.bot ?? 0 };
          setGrab(true);
        }}
        onPointerUp={(e) => {
          const was = drag.current;
          drag.current = null;
          // let go while moving: the chart keeps gliding through time and slows down
          const g0 = glide.current;
          if (was && !was.axis && scale && Math.abs(g0.v) > 0.05 && performance.now() - (g0.last?.t ?? 0) < 80) {
            let v = g0.v;
            const stepPx = scale.step;
            const run = () => {
              v *= 0.93;
              setBack((b) => b + (v * 16) / stepPx);
              if (Math.abs(v) > 0.02) glide.current.raf = requestAnimationFrame(run);
            };
            glide.current.raf = requestAnimationFrame(run);
          }
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
            const rng = d.top - d.bot || 1;
            if (d.axis) {
              // the price axis: drag down to see more of the price, up to see less, around the middle
              setAuto(false);
              const k = Math.max(0.05, Math.min(20, Math.exp(dy / 180)));
              const mid = (d.top + d.bot) / 2;
              setYRange({ top: mid + (rng / 2) * k, bot: mid - (rng / 2) * k });
            } else {
              setBack(d.back + (e.clientX / z - d.x) / scale.step);
              // a drag with any up or down in it takes the price along, like every trading chart
              if (!auto || Math.abs(dy) > 6) {
                if (auto) setAuto(false);
                const sh = (dy / scale.plotH) * rng;
                setYRange({ top: d.top + sh, bot: d.bot + sh });
              }
              const now = performance.now(), L = glide.current.last;
              if (L) {
                const dt = Math.max(1, now - L.t);
                glide.current.v = 0.7 * glide.current.v + 0.3 * ((e.clientX / z - L.x) / dt);
              }
              glide.current.last = { x: e.clientX / z, t: now };
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
      {drawKey && !tools && (
        <button type="button" onClick={flipTools} title="Show the drawing tools" aria-label="Show the drawing tools" className="absolute left-2 top-9 z-10 grid h-8 w-8 place-items-center rounded-lg border border-[#242424] bg-[#0d0d0d]/90 font-mono text-[14px] text-muted backdrop-blur transition-colors hover:text-text">
          ✎
        </button>
      )}
      {drawKey && tools && (
        <div className="chart-tools absolute left-2 top-9 z-10 flex flex-col gap-0.5 rounded-xl border border-[#242424] bg-[#0d0d0d]/90 p-1 backdrop-blur">
          <button type="button" onClick={flipTools} title="Hide the drawing tools" aria-label="Hide the drawing tools" className="grid h-6 w-8 place-items-center rounded-md font-mono text-[11px] text-muted hover:bg-[#181818] hover:text-text">
            ‹
          </button>
          <span className="mb-0.5 h-px bg-[#242424]" />
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
        <span className="relative">
          <button type="button" onClick={() => setTzOpen((o) => !o)} aria-expanded={tzOpen} title="Time zone of the chart: click to pick any" className={cx("rounded-md border bg-[#0e0e0e]/90 px-2 py-0.5 font-mono text-[12px] text-text hover:border-ui/60", tzOpen ? "border-ui/60" : "border-line")}>
            {clock}
          </button>
          {tzOpen && (
            <div role="dialog" aria-label="Time zone" className="chart-tz absolute bottom-8 right-0 z-30 w-64 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#141414] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)]">
              <input autoFocus value={tzQ} onChange={(e) => setTzQ(e.target.value)} placeholder="Search a city or zone" aria-label="Search a time zone" className="h-9 w-full border-b border-[#2a2a2a] bg-transparent px-3 text-[12.5px] text-text outline-none placeholder:text-muted" onKeyDown={(e) => e.key === "Escape" && setTzOpen(false)} />
              <ul className="max-h-64 overflow-y-auto py-1 [scrollbar-width:thin]">
                {["local", "UTC", ...ZONES.filter((z) => z !== "UTC")]
                  .filter((z) => !tzQ || `${z} ${zoneName(z)}`.toLowerCase().includes(tzQ.toLowerCase()))
                  .slice(0, 200)
                  .map((z) => (
                    <li key={z}>
                      <button type="button" onClick={() => setTz(z)} className={cx("flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-[#1c1c1c]", z === tz ? "text-leaf" : "text-text")}>
                        <span className="truncate">{z === "local" || z === "UTC" ? zoneName(z) : z.replace(/_/g, " ")}</span>
                        <span className="shrink-0 font-mono text-[11px] text-muted">{offsetOf(z)}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </span>
        {(Math.abs(back - RIGHT) > 0.5 || span !== 120) && (
          <button type="button" onClick={() => (setBack(RIGHT), setSpan(120))} title="Back to the whole history (or double-click the chart)" className="rounded-md border border-line bg-[#0e0e0e]/90 px-2 py-0.5 font-mono text-[12px] text-text hover:border-ui/60">
            {"Now →"}
          </button>
        )}
        <button type="button" onClick={() => (setAuto(true), setYOff(0), setYZoom(1), setYRange(null))} aria-pressed={auto} title="Fit the price to the visible candles" className={cx("rounded-md border px-2 py-0.5 font-mono text-[12px]", auto ? "border-leaf/50 bg-leaf/15 text-leaf" : "border-line bg-[#0e0e0e]/90 text-muted hover:text-text")}>
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
