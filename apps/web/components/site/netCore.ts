/**
 * The house illustration: a mountain range drawn in the ASCII style of the Corbel ridge (green, with red ranges where
 * something is wrong), seen in perspective, and over it the network the product reads: wallets, pools, agents, models,
 * a vault, joined by arcs that carry transactions as moving packets. One scene, one story per place:
 *  - overview: the whole network trading
 *  - trust: a scanning wall sweeps the range; the nodes it finds bad turn red
 *  - stocks: a green range (the token, trading all week) against a red one (the share, closed), a gap between
 *  - trade: one swap, three routes over the range; the one that pays most carries the packets
 *  - agents: an agent inside the ring of its mandate; packets bound outside stop at the ring
 *  - account: wallets feed one vault; what is not spent flows back into it
 *  - models: a ring of model nodes answering a prompt node (AI pages, in the AI colour)
 *  - token (the loader): the range rises, the CORBEL token stands in the middle and every layer is wired to it
 *  - paths (the hero): the whole product as one network; five paths light up in turn, each named in a legend
 *  - lens (the footer): the busiest tokens on the chain as nodes. The lens follows the cursor and settles on the
 *    nearest token (twice the detail inside, a reticle, the zoom), with a card of its live numbers; a click opens
 *    its chart. Without a cursor it tours the tokens on its own.
 * Nodes stand on pads; raised ones carry a spinning orbit, the token three.
 * Canvas 2D with its own projection, about 20 frames a second on screen, one still frame under reduced motion.
 *
 * This file is the scene itself, with no DOM: it draws into the canvas it is given, on the page or inside a worker
 * (the loader runs in a worker, so the page starting up under it cannot freeze it). The host feeds it the size,
 * whether it is on screen and the pointer.
 */

export type Story =
  "overview" | "trust" | "stocks" | "trade" | "agents" | "account" | "models" | "token" | "paths" | "lens";
type Kind = "wallet" | "pool" | "agent" | "model" | "vault" | "router" | "bad" | "share" | "token" | "corbel";
type Node = { x: number; z: number; label: string; kind: Kind; lift?: number; at?: number };
type Edge = {
  a: number;
  b: number;
  bad?: boolean;
  dim?: boolean;
  route?: number;
  paths?: number[];
  n?: number;
  tint?: [number, number, number];
  speed?: number;
};
type Live = {
  token: string;
  symbol: string;
  name: string;
  volume: number;
  price: number | null;
  change: number | null;
  liquidity: number;
  buys?: number;
  swaps?: number;
  base?: string;
};

const RAMP = " .:-=+*#%@";
const GREEN: [number, number, number] = [111, 231, 168];
const MINT: [number, number, number] = [196, 255, 222];
const RED: [number, number, number] = [255, 69, 96];
const AI: [number, number, number] = [255, 154, 92];
const LAV: [number, number, number] = [155, 134, 228];

const PATHS = [
  "Check before you buy",
  "Swap on the best route",
  "Earn pool fees",
  "An agent inside its mandate",
  "Ask a model, pay per use",
];

/** Height of the range at (x in -1..1, z in 0..1 near to far). Ridged sines: sharp crests, soft valleys. */
function height(x: number, z: number, story: Story) {
  const r = (v: number) => 1 - Math.abs(Math.sin(v));
  let h =
    0.42 * r(x * 2.2 + z * 3.1) +
    0.28 * r(x * 4.7 - z * 5.3 + 1.3) +
    0.12 * Math.sin(x * 11 + z * 9) * 0.5 +
    0.06;
  h *= 0.55 + z * 0.75; // the far range rises
  if (story === "stocks") h *= 0.35 + Math.min(1, Math.abs(x) * 2.4); // a valley in the middle: the gap
  if (story === "token") h *= 0.45 + Math.min(1, Math.hypot(x * 0.9, (z - 0.5) * 1.6)); // a basin the token stands in
  return Math.max(0, h);
}

function setup(story: Story): { nodes: Node[]; edges: Edge[]; redZone: (x: number, z: number) => boolean } {
  switch (story) {
    case "trust":
      return {
        nodes: [
          { x: -0.75, z: 0.35, label: "token", kind: "token" },
          { x: -0.3, z: 0.62, label: "pool", kind: "pool" },
          { x: 0.15, z: 0.4, label: "honeypot", kind: "bad" },
          { x: 0.5, z: 0.7, label: "pool", kind: "pool" },
          { x: 0.78, z: 0.3, label: "mint()", kind: "bad" },
          { x: -0.05, z: 0.85, label: "creator", kind: "wallet" },
        ],
        edges: [
          { a: 0, b: 1 },
          { a: 1, b: 2, bad: true },
          { a: 1, b: 5 },
          { a: 5, b: 3 },
          { a: 3, b: 4, bad: true },
          { a: 0, b: 5 },
        ],
        redZone: (x, z) => (x > 0.02 && x < 0.3 && z < 0.55) || (x > 0.66 && z < 0.45),
      };
    case "stocks":
      return {
        nodes: [
          { x: -0.62, z: 0.45, label: "NVDA token · trades all week", kind: "token" },
          { x: 0.62, z: 0.45, label: "NVDA share · market closed", kind: "share" },
          { x: -0.85, z: 0.85, label: "pool", kind: "pool" },
          { x: -0.3, z: 0.15, label: "pool", kind: "pool" },
        ],
        edges: [
          { a: 0, b: 1, dim: true },
          { a: 2, b: 0 },
          { a: 3, b: 0 },
          { a: 2, b: 3 },
        ],
        redZone: (x) => x > 0.18,
      };
    case "trade":
      return {
        nodes: [
          { x: -0.85, z: 0.3, label: "you", kind: "wallet" },
          { x: -0.05, z: 0.85, label: "V2 pool", kind: "pool" },
          { x: 0.0, z: 0.5, label: "v4 pool", kind: "pool" },
          { x: -0.1, z: 0.18, label: "via WETH", kind: "router" },
          { x: 0.85, z: 0.4, label: "out", kind: "token" },
        ],
        edges: [
          { a: 0, b: 1, route: 0 },
          { a: 1, b: 4, route: 0 },
          { a: 0, b: 2, route: 1 },
          { a: 2, b: 4, route: 1 },
          { a: 0, b: 3, route: 2 },
          { a: 3, b: 4, route: 2 },
        ],
        redZone: () => false,
      };
    case "agents":
      return {
        nodes: [
          { x: 0.0, z: 0.45, label: "agent", kind: "agent", lift: 0.22 },
          { x: -0.32, z: 0.3, label: "pool", kind: "pool" },
          { x: 0.3, z: 0.62, label: "pool", kind: "pool" },
          { x: -0.2, z: 0.72, label: "bond", kind: "vault" },
          { x: 0.82, z: 0.35, label: "over the cap", kind: "bad" },
          { x: -0.85, z: 0.7, label: "unknown token", kind: "bad" },
        ],
        edges: [
          { a: 0, b: 1 },
          { a: 0, b: 2 },
          { a: 0, b: 3, dim: true },
          { a: 0, b: 4, bad: true },
          { a: 0, b: 5, bad: true },
        ],
        redZone: (x, z) => Math.hypot(x / 0.55, (z - 0.45) / 0.36) > 1.25,
      };
    case "account":
      return {
        nodes: [
          { x: 0.0, z: 0.5, label: "vault", kind: "vault", lift: 0.2 },
          { x: -0.7, z: 0.28, label: "wallet", kind: "wallet" },
          { x: 0.68, z: 0.3, label: "swap", kind: "router" },
          { x: -0.45, z: 0.85, label: "lenders", kind: "pool" },
          { x: 0.5, z: 0.85, label: "token", kind: "token" },
        ],
        edges: [
          { a: 1, b: 0 },
          { a: 0, b: 2 },
          { a: 2, b: 4 },
          { a: 0, b: 3 },
          { a: 3, b: 0, dim: true },
        ],
        redZone: () => false,
      };
    case "models":
      return {
        nodes: [
          { x: 0.0, z: 0.42, label: "prompt", kind: "wallet", lift: 0.18 },
          { x: -0.7, z: 0.5, label: "model", kind: "model" },
          { x: -0.38, z: 0.82, label: "model", kind: "model" },
          { x: 0.38, z: 0.82, label: "model", kind: "model" },
          { x: 0.7, z: 0.5, label: "model", kind: "model" },
          { x: 0.0, z: 0.15, label: "GPU", kind: "router" },
        ],
        edges: [
          { a: 0, b: 1 },
          { a: 0, b: 2 },
          { a: 0, b: 3 },
          { a: 0, b: 4 },
          { a: 5, b: 0 },
        ],
        redZone: () => false,
      };
    case "token":
      return {
        nodes: [
          { x: 0.0, z: 0.48, label: "CORBEL", kind: "corbel", lift: 0.42, at: 0.25 },
          { x: -0.78, z: 0.32, label: "Check", kind: "router", at: 0.45 },
          { x: -0.5, z: 0.82, label: "Swap", kind: "pool", at: 0.57 },
          { x: 0.5, z: 0.84, label: "Earn", kind: "vault", at: 0.69 },
          { x: 0.8, z: 0.34, label: "Agents", kind: "agent", at: 0.81 },
          { x: 0.42, z: 0.24, label: "AI & GPUs", kind: "model", at: 0.93 },
          { x: -0.42, z: 0.24, label: "holders", kind: "wallet", at: 1.05 },
        ],
        edges: [
          { a: 0, b: 1 },
          { a: 0, b: 2 },
          { a: 0, b: 3 },
          { a: 0, b: 4 },
          { a: 0, b: 5 },
          { a: 6, b: 0 },
        ],
        redZone: () => false,
      };
    case "paths":
      return {
        nodes: [
          { x: -0.9, z: 0.46, label: "your wallet", kind: "wallet", lift: 0.18 },
          { x: -0.62, z: 0.74, label: "check", kind: "router" },
          { x: -0.95, z: 0.92, label: "honeypot", kind: "bad" },
          { x: -0.32, z: 0.95, label: "V2 pool", kind: "pool" },
          { x: 0.28, z: 0.95, label: "v4 pool", kind: "pool" },
          { x: 0.64, z: 0.76, label: "token out", kind: "token" },
          { x: -0.62, z: 0.48, label: "fee vault", kind: "vault" },
          { x: 0.9, z: 0.48, label: "agent", kind: "agent" },
          { x: 0.95, z: 0.9, label: "over the cap", kind: "bad" },
          { x: 0.6, z: 0.5, label: "model", kind: "model" },
          { x: 0.86, z: 0.68, label: "GPU", kind: "router" },
        ],
        edges: [
          { a: 0, b: 1, paths: [0, 1] },
          { a: 1, b: 2, bad: true, paths: [0] },
          { a: 1, b: 3, paths: [0] },
          { a: 1, b: 4, paths: [1] },
          { a: 4, b: 5, paths: [1] },
          { a: 0, b: 6, paths: [2] },
          { a: 6, b: 4, paths: [2] },
          { a: 7, b: 3, paths: [3] },
          { a: 7, b: 8, bad: true, paths: [3] },
          { a: 0, b: 9, paths: [4] },
          { a: 10, b: 9, paths: [4] },
        ],
        redZone: (x, z) => (x < -0.8 && z > 0.84) || (x > 0.84 && z > 0.82),
      };
    default:
      return {
        nodes: [
          { x: -0.8, z: 0.32, label: "wallet", kind: "wallet" },
          { x: -0.42, z: 0.7, label: "pool", kind: "pool" },
          { x: -0.05, z: 0.4, label: "agent", kind: "agent" },
          { x: 0.32, z: 0.82, label: "model", kind: "model" },
          { x: 0.55, z: 0.42, label: "vault", kind: "vault" },
          { x: 0.85, z: 0.72, label: "pool", kind: "pool" },
          { x: 0.15, z: 0.12, label: "wallet", kind: "wallet" },
          { x: 0.78, z: 0.18, label: "drainer", kind: "bad" },
        ],
        edges: [
          { a: 0, b: 1 },
          { a: 1, b: 2 },
          { a: 2, b: 3 },
          { a: 2, b: 4 },
          { a: 4, b: 5 },
          { a: 6, b: 2 },
          { a: 6, b: 4 },
          { a: 7, b: 6, bad: true },
          { a: 0, b: 6 },
        ],
        redZone: (x, z) => x > 0.6 && z < 0.32,
      };
  }
}

/** Where the busiest tokens stand in the footer's range. */
const LENS_SPOTS: [number, number][] = [
  [-0.82, 0.38],
  [-0.55, 0.78],
  [-0.3, 0.3],
  [-0.05, 0.7],
  [0.22, 0.32],
  [0.46, 0.78],
  [0.7, 0.36],
  [0.9, 0.72],
];

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const usd = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(2)}`;
const px = (v: number) =>
  v >= 1
    ? `$${v.toFixed(2)}`
    : `$${v.toLocaleString("en", { maximumSignificantDigits: 3, maximumFractionDigits: 12 })}`;

/**
 * One glyph atlas for every scene on the page: each character at a size and colour bucket is drawn once, at exactly the
 * canvas's pixel ratio, then copied 1:1. Shelf-packed into one canvas (one texture); reset only if it ever fills.
 */
/** A canvas on the page or an OffscreenCanvas in a worker. */
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D;
type Sprite = { x: number; y: number; sw: number; sh: number; w: number; h: number; base: number };
let ATLAS_ONE: {
  canvas: AnyCanvas;
  get: (ch: string, size: number, col: [number, number, number], font: string) => Sprite;
  reset: () => void;
} | null = null;
function glyphAtlas(mk: () => AnyCanvas, dpr: number) {
  if (ATLAS_ONE) return ATLAS_ONE;
  const N = 2048;
  const canvas = mk();
  canvas.width = N;
  canvas.height = N;
  const g = canvas.getContext("2d") as Ctx2D;
  g.textBaseline = "alphabetic";
  const SS = Math.min(2, Math.max(1, Math.round(dpr || 1)));
  const map = new Map<string, Sprite>();
  let x = 0,
    y = 0,
    rowH = 0,
    set = "";
  const get = (ch: string, size: number, col: [number, number, number], font: string) => {
    // sizes in 2 px steps keep the atlas small; the eye does not tell 9 from 10 px at this density
    const sz = Math.max(4, Math.round(size / 2) * 2);
    const key = `${ch}|${sz}|${col[0]}|${col[1]}|${col[2]}`;
    let s = map.get(key);
    if (s) return s;
    const w = Math.ceil(sz * 0.75),
      h = Math.ceil(sz * 1.35),
      base = Math.ceil(sz * 1.05);
    const sw = w * SS + 2,
      sh = h * SS + 2;
    if (x + sw > N) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    if (y + sh > N) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, N, N);
      map.clear();
      x = y = rowH = 0;
    }
    g.setTransform(SS, 0, 0, SS, x + 1, y + 1);
    const f = `${sz}px ${font}`;
    if (f !== set) {
      g.font = f;
      set = f;
    }
    g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    g.fillText(ch, 0, base);
    s = { x: x + 1, y: y + 1, sw: sw - 2, sh: sh - 2, w, h, base };
    x += sw;
    rowH = Math.max(rowH, sh);
    map.set(key, s);
    return s;
  };
  const reset = () => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, N, N);
    map.clear();
    x = y = rowH = 0;
    set = "";
  };
  ATLAS_ONE = { canvas, get, reset };
  return ATLAS_ONE;
}

export type NetEnv = {
  cv: AnyCanvas;
  story: Story;
  still: boolean;
  phone: boolean;
  dpr: number;
  /** the first family of the mono font, "" for none */
  fam: string;
  mk: () => AnyCanvas;
  fontCheck: (fam: string) => boolean;
  fontLoad: (fam: string) => Promise<unknown>;
  covered: () => boolean;
  hidden: () => boolean;
  raf: (f: (now: number) => void) => number;
  caf: (id: number) => void;
  go?: (href: string) => void;
  cursor?: (c: string) => void;
};
export type NetCtl = {
  resize: (w: number, h: number) => void;
  seen: (on: boolean) => void;
  move: (fx: number, fy: number, tx: number, ty: number) => void;
  leave: () => void;
  click: () => void;
  stop: () => void;
};

export function runNet(env: NetEnv): NetCtl {
  const { cv, story, still, phone } = env;
  const ctx = cv.getContext("2d") as Ctx2D;
  const base = setup(story);
  let nodes = base.nodes,
    edges = base.edges;
  const redZone = base.redZone;
  const ACC = story === "models" ? AI : GREEN;
  let W = 0,
    H = 0,
    raf = 0,
    seen = true,
    font = "ui-monospace, monospace";
  // phones: a sparser range. At 390 px, 120 columns put glyphs three pixels apart, so they overlapped anyway, and the
  // fly-in of the loader spent seconds of a phone's main thread drawing them
  const COLS = phone ? (story === "lens" ? 80 : 64) : story === "lens" ? 150 : 120,
    ROWS = phone ? (story === "lens" ? 24 : 30) : story === "lens" ? 40 : 50;
  const hmap = Array.from({ length: ROWS + 1 }, (_, j) =>
    Array.from({ length: COLS + 1 }, (_, i) => height((i / COLS) * 2 - 1, j / ROWS, story)),
  );
  const hAt = (x: number, z: number) => {
    const i = Math.round(((x + 1) / 2) * COLS),
      j = Math.round(z * ROWS);
    return hmap[Math.max(0, Math.min(ROWS, j))]![Math.max(0, Math.min(COLS, i))]!;
  };
  let nodeY = nodes.map((n) => hAt(n.x, n.z) + (n.lift ?? 0.12));
  const t0 = performance.now();

  // the footer reads the busiest tokens and puts each on the range
  let live: Live[] = [];
  let asked = false;
  const readLive = () => {
    if (asked) return;
    asked = true;
    fetch("/api/trending")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: (Live & { symbol: string | null; name?: string | null })[] } | null) => {
        const rows = (j?.rows ?? [])
          .filter((r) => r.volume > 0 && r.symbol)
          .sort((a, b) => b.volume - a.volume)
          .slice(0, LENS_SPOTS.length);
        if (!rows.length) return;
        live = rows.map((r) => ({
          token: r.token,
          symbol: r.symbol ?? "?",
          name: r.name ?? "",
          volume: r.volume,
          price: r.price ?? null,
          change: r.change ?? null,
          liquidity: r.liquidity ?? 0,
          buys: r.buys,
          swaps: r.swaps,
          base: r.base,
        }));
        nodes = live.map((r, i) => ({
          x: LENS_SPOTS[i]![0],
          z: LENS_SPOTS[i]![1],
          label: r.symbol,
          kind: (r.change ?? 0) < -20 ? "bad" : "pool",
        }));
        const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
        const ethAt = live.findIndex((r) => r.symbol === "ETH" || r.symbol === "WETH");
        nodes.push({ x: 0.02, z: 0.08, label: "USDG", kind: "vault", lift: 0.2 });
        const usdgAt = nodes.length - 1;
        const maxSw = Math.max(1, ...live.map((r) => r.swaps ?? 0)),
          maxV = Math.max(1, ...live.map((r) => r.volume));
        edges = [];
        live.forEach((r, i) => {
          const to =
            (r.base ?? "").toLowerCase() === USDG || i === ethAt ? usdgAt : ethAt >= 0 ? ethAt : usdgAt;
          if (to === i) return;
          const share = r.swaps ? (r.buys ?? 0) / r.swaps : 0.5;
          edges.push({
            a: i,
            b: to,
            n: 1 + Math.round(4 * Math.sqrt((r.swaps ?? 0) / maxSw)),
            tint: share >= 0.5 ? MINT : [255, 120, 140],
            speed: 0.14 + 0.22 * Math.sqrt(r.volume / maxV),
          });
        });
        rebuildTerrain();
        nodeY = nodes.map((n) => hAt(n.x, n.z) + (n.lift ?? 0.12));
      })
      .catch(() => undefined);
  };

  // the camera: how high the range sits and how much of the height it spans, per place
  const cam =
    story === "token"
      ? { top: 0.5, span: 0.5, wide: 0.6 }
      : story === "paths"
        ? { top: 0.28, span: 0.68, wide: 0.8 }
        : story === "lens"
          ? { top: 0.05, span: 0.86, wide: 0.78 }
          : { top: 0.2, span: 0.74, wide: 0.66 };

  // the pointer: in the footer the lens follows it
  const ptr = { x: 0, y: 0, in: false, used: 0, lx: 0, ly: 0, tx: 0, ty: 0 };
  // fx, fy: the pointer as a fraction of the canvas box; tx, ty: across the window, -1..1
  const onMove = (fx: number, fy: number, tx: number, ty: number) => {
    ptr.tx = tx;
    ptr.ty = ty;
    ptr.x = fx * W;
    ptr.y = fy * H;
    ptr.in = ptr.x >= 0 && ptr.x <= W && ptr.y >= 0 && ptr.y <= H;
    if (ptr.in) ptr.used = performance.now();
  };
  const onLeave = () => (ptr.in = false);
  let hover: number | null = null;
  const onClick = () => {
    if (story === "lens" && hover != null && live[hover])
      env.go?.(`/app/trade/terminal?token=${live[hover]!.token}`);
  };

  // the loader: data streams that converge on the token from every edge
  const streams = Array.from({ length: story === "token" ? 46 : 0 }, (_, i) => {
    const side = i % 4;
    const u = Math.random() * 2 - 1;
    return {
      x: side === 0 ? -1.1 : side === 1 ? 1.1 : u,
      z: side === 2 ? 0.02 : side === 3 ? 0.98 : (u + 1) / 2,
      at: 0.15 + Math.random() * 1.1,
      dur: 0.55 + Math.random() * 0.4,
    };
  });

  let lastFont = "";
  // glyph sprites from one atlas shared by every scene on the page (see glyphAtlas below)
  const A = glyphAtlas(env.mk, env.dpr);
  const dprI = phone ? 1 : Math.min(2, Math.max(1, Math.round(env.dpr || 1)));
  const atlas = A.canvas;
  const sprite = (ch: string, size: number, col: [number, number, number]) => A.get(ch, size, col, font);
  const todo: (Sprite | number)[] = [];
  const quant = (c: [number, number, number]): [number, number, number] => [
    Math.min(255, Math.round(c[0] / 24) * 24),
    Math.min(255, Math.round(c[1] / 24) * 24),
    Math.min(255, Math.round(c[2] / 24) * 24),
  ];
  const setFont = (f: string) => {
    if (f !== lastFont) {
      ctx.font = f;
      lastFont = f;
    }
  };
  const hBil = (x: number, z: number) => {
    const fi = ((x + 1) / 2) * COLS,
      fj = z * ROWS;
    const i0 = Math.max(0, Math.min(COLS - 1, Math.floor(fi))),
      j0 = Math.max(0, Math.min(ROWS - 1, Math.floor(fj)));
    const a = fi - i0,
      b = fj - j0;
    const h00 = hmap[j0]![i0]!,
      h10 = hmap[j0]![i0 + 1]!,
      h01 = hmap[j0 + 1]![i0]!,
      h11 = hmap[j0 + 1]![i0 + 1]!;
    return h00 * (1 - a) * (1 - b) + h10 * a * (1 - b) + h01 * (1 - a) * b + h11 * a * b;
  };

  // the footer's range is the market itself: every token raises its own hill, as high as its volume (log scale),
  // as wide as its liquidity; the ground around a token that fell hard turns red
  type Hill = { x: number; z: number; g: number; s: number; sym: string; down: boolean };
  let hills: Hill[] = [];
  const rebuildTerrain = () => {
    const maxV = Math.max(...live.map((r) => r.volume), 1),
      maxL = Math.max(...live.map((r) => r.liquidity), 1);
    hills = live.map((r, i) => ({
      x: LENS_SPOTS[i]![0],
      z: LENS_SPOTS[i]![1],
      g: 0.14 + 0.36 * (Math.log10(1 + r.volume) / Math.log10(1 + maxV)),
      s: 0.07 + 0.11 * Math.sqrt(r.liquidity / maxL),
      sym: r.symbol,
      down: (r.change ?? 0) < -10,
    }));
  };
  const lensRed = (x: number, z: number) =>
    hills.some((q) => q.down && Math.hypot(x - q.x, (z - q.z) * 1.6) < q.s * 1.4);
  // price over the last day for the token under the lens, from its own swaps; read once per token
  const spark = new Map<string, number[] | null>();
  const recent = new Map<string, { side: string; price: number; t: number }[]>();
  const readSpark = (token: string) => {
    if (spark.has(token)) return;
    spark.set(token, null);
    fetch(`/api/market?token=${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { trades?: { t: number; price: number; side: string; token: number }[] } | null) => {
        const tr = (j?.trades ?? []).filter((x) => x.price > 0).sort((a, b) => a.t - b.t);
        spark.set(token, tr.length > 2 ? tr.map((x) => x.price) : []);
        recent.set(
          token,
          tr
            .slice(-3)
            .reverse()
            .map((x) => ({ side: x.side, price: x.price, t: x.t })),
        );
      })
      .catch(() => spark.set(token, []));
  };
  type Cam = {
    P: (x: number, y: number, z: number) => { sx: number; sy: number; D: number };
    rise: number;
    T: number;
    yaw: number;
    top: number;
  };
  const makeCam = (): Cam => {
    const T = (performance.now() - t0) / 1000;
    const rise = story === "token" ? ease(T / 0.9) : 1;
    // the loader flies in: the camera turns and closes in while the range rises
    const fly = story === "token" ? ease(T / 1.5) : 1;
    const yaw = (story === "lens" ? 0.02 : 0.05) - (1 - fly) * 0.9;
    const wide = cam.wide * (0.55 + 0.45 * fly);
    const top = cam.top;
    const P = (x: number, y: number, z: number) => {
      const xr = x * Math.cos(yaw) - (z - 0.5) * Math.sin(yaw) * 0.9;
      const zr = (z - 0.5) * Math.cos(yaw) + x * Math.sin(yaw) * 0.35 + 0.5;
      const D = 0.55 + zr * 2.3;
      return { sx: W / 2 + (xr * W * wide) / D, sy: H * top + ((1.05 - y * rise) * H * cam.span) / D, D };
    };
    return { P, rise, T, yaw, top };
  };
  // part: "terrain" draws the range into g, "overlay" the network on ctx, "all" both
  const scene = (
    t: number,
    focus?: { x: number; y: number; r: number },
    part: "all" | "terrain" | "overlay" = "all",
    camIn?: Cam,
    g: CanvasRenderingContext2D = ctx,
  ) => {
    const { P, rise } = camIn ?? makeCam();
    // the loader's clock is read here, every frame: it came from the camera, and the camera stops updating once it has
    // landed (about 1.6 s in), so every stream froze where it was at that moment
    const T = (performance.now() - t0) / 1000;
    const path = Math.floor(t / 4.5) % PATHS.length;
    if (part !== "overlay") {
      // the range, far rows first; inside the lens twice as dense, sampled between the grid points
      const step = focus && story !== "lens" ? 0.5 : coarse && !phone ? 2 : 1;
      for (let jj = ROWS; jj >= 0; jj -= step) {
        const z = jj / ROWS;
        for (let ii = 0; ii <= COLS; ii += step) {
          const x = (ii / COLS) * 2 - 1;
          const h = step < 1 ? hBil(x, z) : hmap[jj]![ii]!;
          const p = P(x, h, z);
          if (focus && Math.hypot(p.sx - focus.x, p.sy - focus.y) > focus.r * 1.05) continue;
          const k = Math.max(1, Math.min(RAMP.length - 1, Math.round(h * rise * 11)));
          const size = Math.max(5, Math.round((15 / p.D) * 2) / 2) * (step < 1 ? 0.62 : step > 1 ? 1.3 : 1);
          const red = story === "lens" && hills.length ? lensRed(x, z) : redZone(x, z);
          const col = red ? RED : mix(ACC, MINT, Math.min(1, h * 0.9));
          let glow = 0;
          if (story === "trust") {
            const sx = ((t * 0.18) % 1.4) * 2 - 1.2;
            glow = Math.max(0, 1 - Math.abs(x - sx) * 9);
          }
          // depth: the far range fades into the dark
          const a =
            Math.min(1, ((0.24 + h * 1.05) * (1.25 - z * 0.8) + glow * 0.6) * (focus ? 1.45 : 1)) *
            (story === "token" ? 0.35 + 0.65 * rise : 1);
          if (a < 0.03) continue;
          // collected first, drawn after: a glyph added to the atlas between two draws made the browser copy the whole
          // 16 MB atlas again for the next draw; the first frame of a scene added hundreds and froze the page (and
          // the loader on top of it) for seconds on phones
          const sp = sprite(RAMP[k]!, size, quant(glow > 0.2 ? mix(col, MINT, glow) : col));
          todo.push(sp, a, Math.round(p.sx * dprI) / dprI, Math.round((p.sy - sp.base) * dprI) / dprI);
        }
      }
      for (let q = 0; q < todo.length; q += 4) {
        const sp = todo[q] as Sprite;
        g.globalAlpha = todo[q + 1] as number;
        g.drawImage(
          atlas,
          sp.x,
          sp.y,
          sp.sw,
          sp.sh,
          todo[q + 2] as number,
          todo[q + 3] as number,
          sp.w,
          sp.h,
        );
      }
      todo.length = 0;
      g.globalAlpha = 1;
    }
    if (part === "terrain") return { P, path };
    // agents: the ring of the mandate around the agent
    if (story === "agents") {
      ctx.beginPath();
      for (let s = 0; s <= 64; s++) {
        const a = (s / 64) * Math.PI * 2;
        const x = Math.cos(a) * 0.55 * 1.25,
          z = 0.45 + Math.sin(a) * 0.36 * 1.25;
        const p = P(x, hAt(x, Math.max(0, Math.min(1, z))) + 0.03, Math.max(0, Math.min(1, z)));
        if (s) ctx.lineTo(p.sx, p.sy);
        else ctx.moveTo(p.sx, p.sy);
      }
      ctx.strokeStyle = rgba(LAV, 0.75);
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // the loader: streams of data running in from every edge to the token
    if (story === "token") {
      const tok = nodes[0]!;
      const ty = nodeY[0]!;
      for (const s of streams) {
        // each stream runs in again and again while the loader is on screen; run once, they had all landed before the
        // stage faded and the token looked cut off from its sources
        if (T < s.at) continue;
        const cycle = s.dur * 1.25 + 0.35;
        const u = ((T - s.at) % cycle) / s.dur;
        if (u <= 0 || u >= 1.25) continue;
        for (let tr = 0; tr < 7; tr++) {
          // each dot speeds up into the token and is gone on arrival. An ease-out here crawled through the last stretch
          // (the last third of the time for 3% of the way) and the landed dots sat on the token while they faded:
          // both read as the streams freezing just before the token
          const v = u - tr * 0.035;
          if (v <= 0 || v >= 1) continue;
          const e = v * (0.6 + 0.4 * v);
          const x = s.x + (tok.x - s.x) * e,
            z = s.z + (tok.z - s.z) * e;
          const y =
            hAt(Math.max(-1, Math.min(1, x)), Math.max(0, Math.min(1, z))) * (1 - e) +
            ty * e +
            Math.sin(Math.PI * e) * 0.25;
          const p = P(x, y, z);
          ctx.fillStyle = rgba(tr ? ACC : MINT, (1 - tr / 7) * 0.9);
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, Math.max(0.8, (2.4 - tr * 0.3) / Math.sqrt(p.D)), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // arcs and packets
    const best = Math.floor(t / 3) % 3;
    const arc = (e: Edge, u: number) => {
      const A = nodes[e.a]!,
        B = nodes[e.b]!;
      const ya = nodeY[e.a]!,
        yb = nodeY[e.b]!;
      const lift = 0.25 + Math.hypot(A.x - B.x, A.z - B.z) * 0.3;
      const x = (1 - u) * (1 - u) * A.x + 2 * u * (1 - u) * ((A.x + B.x) / 2) + u * u * B.x;
      const z = (1 - u) * (1 - u) * A.z + 2 * u * (1 - u) * ((A.z + B.z) / 2) + u * u * B.z;
      const y = (1 - u) * (1 - u) * ya + 2 * u * (1 - u) * ((ya + yb) / 2 + lift) + u * u * yb;
      return P(x, y, z);
    };
    edges.forEach((e, ei) => {
      const A = nodes[e.a]!,
        B = nodes[e.b]!;
      // the loader draws each arc once both ends have appeared
      const grow = story === "token" ? ease((T - Math.max(A.at ?? 0, B.at ?? 0) - 0.05) / 0.3) : 1;
      if (grow <= 0) return;
      const onPath = !e.paths || e.paths.includes(path);
      const on = (e.route === undefined || e.route === best) && onPath;
      const col = e.bad
        ? RED
        : B.kind === "model" || A.kind === "model"
          ? AI
          : B.kind === "agent" || A.kind === "agent"
            ? LAV
            : ACC;
      ctx.beginPath();
      const steps = Math.max(1, Math.round(28 * grow));
      for (let s = 0; s <= steps; s++) {
        const p = arc(e, s / 28);
        if (s) ctx.lineTo(p.sx, p.sy);
        else ctx.moveTo(p.sx, p.sy);
      }
      ctx.strokeStyle = rgba(col, e.dim ? 0.18 : on ? (e.paths ? 0.9 : 0.55) : e.paths ? 0.1 : 0.12);
      ctx.lineWidth = on && (e.route !== undefined || e.paths) ? 2.2 : 1.2;
      if (e.dim) ctx.setLineDash([4, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!on || e.dim || grow < 1) return;
      // packets; a bad one stops short (agents: at the ring; elsewhere: at mid-arc) and flashes
      const n = e.n ?? (e.route !== undefined || e.paths ? 4 : 2);
      for (let k = 0; k < n; k++) {
        let u = (t * (e.speed ?? 0.22 + (ei % 3) * 0.05) + k / n + ei * 0.13) % 1;
        const stop = e.bad ? 0.55 : 1;
        const blocked = e.bad && u > stop;
        if (blocked) u = stop;
        for (let tr = 0; tr < 6; tr++) {
          const p = arc(e, Math.max(0, u - tr * 0.018));
          ctx.fillStyle = rgba(e.bad ? RED : (e.tint ?? MINT), (1 - tr / 6) * 0.9);
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, Math.max(1.2, (3.2 - tr * 0.4) / Math.sqrt(p.D)), 0, Math.PI * 2);
          ctx.fill();
        }
        if (blocked) {
          const p = arc(e, stop);
          ctx.strokeStyle = rgba(RED, 0.8);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.sx - 5, p.sy - 5);
          ctx.lineTo(p.sx + 5, p.sy + 5);
          ctx.moveTo(p.sx + 5, p.sy - 5);
          ctx.lineTo(p.sx - 5, p.sy + 5);
          ctx.stroke();
        }
      }
    });
    // a ring in 3D around a point, tilted and spinning: drawn bright in front, faint behind
    const orbit = (
      cx: number,
      cy: number,
      cz: number,
      R: number,
      tilt: number,
      spin: number,
      col: [number, number, number],
      a: number,
    ) => {
      let prev: { sx: number; sy: number; f: number } | null = null;
      for (let s = 0; s <= 48; s++) {
        const ang = (s / 48) * Math.PI * 2;
        let x = Math.cos(ang) * R,
          y = 0,
          z = Math.sin(ang) * R;
        // tilt about x, then spin about y
        [y, z] = [y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
        [x, z] = [x * Math.cos(spin) + z * Math.sin(spin), -x * Math.sin(spin) + z * Math.cos(spin)];
        const p = P(cx + x, cy + y, cz + z * 0.6);
        const f = z < 0 ? 1 : 0.25;
        if (prev) {
          ctx.strokeStyle = rgba(col, a * (prev.f + f) * 0.5);
          ctx.beginPath();
          ctx.moveTo(prev.sx, prev.sy);
          ctx.lineTo(p.sx, p.sy);
          ctx.stroke();
        }
        prev = { sx: p.sx, sy: p.sy, f };
      }
      // a satellite riding the ring
      const ang = t * 1.6 + tilt * 3;
      let x = Math.cos(ang) * R,
        y = 0,
        z = Math.sin(ang) * R;
      [y, z] = [y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
      [x, z] = [x * Math.cos(spin) + z * Math.sin(spin), -x * Math.sin(spin) + z * Math.cos(spin)];
      const p = P(cx + x, cy + y, cz + z * 0.6);
      ctx.fillStyle = rgba(MINT, a);
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    };
    // nodes: a pad on the ground, a stem, a glowing head, a label
    nodes.forEach((n, i) => {
      const appear = story === "token" ? ease((T - (n.at ?? 0)) / 0.3) : 1;
      if (appear <= 0) return;
      const onPath =
        story !== "paths" || edges.some((e) => e.paths?.includes(path) && (e.a === i || e.b === i));
      const g = P(n.x, hAt(n.x, n.z), n.z),
        p = P(n.x, nodeY[i]!, n.z);
      const bad = n.kind === "bad" || (story === "stocks" && n.kind === "share");
      const col = bad ? RED : n.kind === "model" ? AI : n.kind === "agent" ? LAV : ACC;
      const dimK = onPath ? 1 : 0.35;
      const big = n.kind === "corbel";
      ctx.globalAlpha = appear * dimK;
      // the pad: the node's footprint on the range, with a pulse when it appears
      ctx.lineWidth = 1;
      for (const [rr, aa] of [
        [big ? 0.12 : 0.06, 0.35],
        ...(story === "token"
          ? ([
              [
                0.05 + Math.min(1, (T - (n.at ?? 0)) / 0.7) * 0.3,
                Math.max(0, 1 - (T - (n.at ?? 0)) / 0.7) * 0.8,
              ],
            ] as [number, number][])
          : []),
      ] as [number, number][]) {
        if (aa <= 0) continue;
        // a flat ring at the foot of the stem, not draped over the range
        const gy = hAt(n.x, n.z) + 0.01;
        ctx.beginPath();
        for (let s = 0; s <= 36; s++) {
          const a = (s / 36) * Math.PI * 2;
          const q = P(n.x + Math.cos(a) * rr, gy, n.z + Math.sin(a) * rr * 0.6);
          if (s) ctx.lineTo(q.sx, q.sy);
          else ctx.moveTo(q.sx, q.sy);
        }
        ctx.fillStyle = rgba(col, aa * 0.12);
        ctx.fill();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = rgba(col, aa * 0.8);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = rgba(col, 0.35);
      ctx.beginPath();
      ctx.moveTo(g.sx, g.sy);
      ctx.lineTo(p.sx, p.sy);
      ctx.stroke();
      const r = Math.max(3.5, 9 / p.D) * (n.lift ? 1.5 : 1) * (big ? 1.6 : 1) * (0.6 + 0.4 * appear);
      const pulse = 1 + 0.25 * Math.sin(t * 2 + i);
      const grd = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3.2 * pulse);
      grd.addColorStop(0, rgba(col, big ? 0.75 : 0.55));
      grd.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r * 3.2 * pulse, 0, Math.PI * 2);
      ctx.fill();
      // the token turns in a gyroscope of three rings; raised nodes carry one
      if (big) {
        ctx.lineWidth = 1.2;
        orbit(n.x, nodeY[i]!, n.z, 0.12, 1.15, t * 0.9, MINT, 0.85 * appear);
        orbit(n.x, nodeY[i]!, n.z, 0.15, 0.35, -t * 0.6 + 1, ACC, 0.7 * appear);
        orbit(n.x, nodeY[i]!, n.z, 0.18, 1.9, t * 0.4 + 2, AI, 0.45 * appear);
      } else if (n.lift || (story === "lens" && hover === i)) {
        ctx.lineWidth = 1;
        orbit(n.x, nodeY[i]!, n.z, 0.08, 1.2, t * 0.8 + i, col, 0.6);
      }
      ctx.fillStyle = rgba(bad ? [255, 210, 216] : MINT, 1);
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(col, 1);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      setFont(`600 ${Math.max(10, Math.round(((big ? 16 : 13) / Math.sqrt(p.D)) * 2) / 2)}px ${font}`);
      const label = bad && n.kind === "bad" ? `✕ ${n.label}` : n.label;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(5,8,7,0.82)";
      ctx.fillRect(p.sx + r + 6, p.sy - 9, tw + 10, 18);
      ctx.fillStyle = rgba(bad ? [255, 140, 155] : big ? MINT : [220, 240, 228], 1);
      ctx.fillText(label, p.sx + r + 11, p.sy + 4);
      ctx.globalAlpha = 1;
    });
    // stocks: the gap between the two ranges, marked
    if (story === "stocks") {
      const a = P(-0.18, 0.55, 0.45),
        b = P(0.18, 0.55, 0.45);
      ctx.strokeStyle = rgba(MINT, 0.7);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
      ctx.setLineDash([]);
      setFont(`600 12px ${font}`);
      ctx.fillStyle = rgba(MINT, 0.95);
      ctx.fillText("the weekend gap", (a.sx + b.sx) / 2 - 52, a.sy - 10);
    }
    return { P, path };
  };

  let lensAt = { x: 0, y: 0 },
    lensSet = false,
    zoom = 2.2;
  const layer = env.mk();
  const lctx = layer.getContext("2d") as Ctx2D;
  let camNow: Cam | null = null,
    lastTerrain = -1e9,
    coarse = false,
    landed = false;
  // scenes under the intro wait for it to open: drawing behind a cover only steals frames from it
  const covered = env.covered;
  const fp = { x: 0, y: 0 };
  const frame = (now: number) => {
    if (W < 2 || H < 2 || covered() || !fontOk) return;
    const t = now / 1000;
    // the range is redrawn only when the camera moved by about a pixel, or it animates: the loader while its camera
    // flies in and the trust scan, both coarse at 30 Hz. The loader stays coarse after landing too: switching to full
    // detail on landing showed as a jump in the picture, and full detail cost frames while the page loads.
    const next = makeCam();
    const flying = story === "token" && next.T < 1.6;
    const land = story === "token" && !flying && !landed;
    if (
      !camNow ||
      land ||
      ((flying || story === "trust") && now - lastTerrain >= 1000 / 30) ||
      Math.abs(next.yaw - camNow.yaw) > 0.0006 ||
      Math.abs(next.top - camNow.top) * H > 0.5
    ) {
      camNow = next;
      coarse = story === "token" || story === "trust";
      if (land) landed = true;
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, layer.width, layer.height);
      const d = layer.width / Math.max(1, W);
      lctx.setTransform(d, 0, 0, d, 0, 0);
      scene(t, undefined, "terrain", camNow, lctx);
      lastTerrain = now;
    }
    ctx.clearRect(0, 0, W, H);
    // the finished picture drifts slowly as one plane; it does not follow the pointer
    const ox = Math.sin(t * 0.07) * 0.012 * W,
      oy = 0;
    const SC = 1.04;
    ctx.save();
    ctx.translate(W / 2 + ox, H / 2 + oy);
    ctx.scale(SC, SC);
    ctx.translate(-W / 2, -H / 2);
    fp.x = (ptr.x - W / 2 - ox) / SC + W / 2;
    fp.y = (ptr.y - H / 2 - oy) / SC + H / 2;
    ctx.drawImage(layer, 0, 0, W, H);
    const { P } = scene(t, undefined, "overlay", camNow);
    // the loader: rings run out from the token over the range (lines, so the range itself stays still)
    if (story === "token") {
      const T = (performance.now() - t0) / 1000;
      for (const off of [0, 0.8]) {
        const r = (T * 0.5 + off) % 1.6;
        const a0 = Math.max(0, 1 - r / 1.6) * 0.55;
        if (r < 0.04 || a0 < 0.02) continue;
        ctx.beginPath();
        let pen = false;
        for (let s = 0; s <= 72; s++) {
          const ang = (s / 72) * Math.PI * 2;
          const x = Math.cos(ang) * r,
            z = 0.48 + (Math.sin(ang) * r) / 1.8;
          if (x < -1 || x > 1 || z < 0 || z > 1) {
            pen = false;
            continue;
          }
          const p = P(x, hAt(x, z) + 0.01, z);
          if (pen) ctx.lineTo(p.sx, p.sy);
          else ctx.moveTo(p.sx, p.sy);
          pen = true;
        }
        ctx.strokeStyle = rgba(MINT, a0);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // the hero: the headline stays readable, the scene fades under it
    if (story === "paths") {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      if (W >= 700) {
        ctx.translate(W / 2, H * 0.47);
        ctx.scale(W * 0.26, H * 0.34);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, "rgba(0,0,0,0.72)");
        g.addColorStop(0.6, "rgba(0,0,0,0.55)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    // the footer: a lens under the cursor (or touring the tokens on its own), magnifying the range
    if (story === "lens" && live.length) {
      const driven = ptr.in && performance.now() - ptr.used < 4000;
      const auto = Math.floor(t / 4) % live.length;
      const pos = nodes.map((n, i) => P(n.x, nodeY[i]!, n.z));
      const target = driven ? { sx: fp.x, sy: fp.y } : pos[auto]!;
      if (!lensSet) {
        lensAt = { x: target.sx, y: target.sy };
        lensSet = true;
      }
      const R = Math.min(64, H * 0.17);
      // magnetic: near a token the lens settles on it
      let near: number | null = null,
        nd = 1e9;
      pos.forEach((p, i) => {
        const d = Math.hypot(p.sx - (driven ? fp.x : target.sx), p.sy - (driven ? fp.y : target.sy));
        if (d < nd) {
          nd = d;
          near = i;
        }
      });
      const snap = near != null && nd < R * 0.75;
      const goal = snap ? pos[near!]! : target;
      const k = driven ? 0.22 : 0.08;
      lensAt = { x: lensAt.x + (goal.sx - lensAt.x) * k, y: lensAt.y + (goal.sy - lensAt.y) * k };
      hover = snap ? near : driven ? null : auto;
      env.cursor?.(driven && snap ? "pointer" : driven ? "none" : "");
      zoom += ((driven ? 2.4 : 2) - zoom) * 0.1;
      const Z = zoom;
      ctx.save();
      ctx.beginPath();
      ctx.arc(lensAt.x, lensAt.y, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "rgba(6,10,8,0.95)";
      ctx.fill();
      ctx.translate(lensAt.x, lensAt.y);
      ctx.scale(Z, Z);
      ctx.translate(-lensAt.x, -lensAt.y);
      lastFont = "";
      scene(t, { x: lensAt.x, y: lensAt.y, r: R / Z }, "all", camNow);
      ctx.restore();
      lastFont = "";
      // the glass: a soft sheen at the top, a thin bright rim with a dark edge under it
      const sheen = ctx.createLinearGradient(lensAt.x, lensAt.y - R, lensAt.x, lensAt.y + R);
      sheen.addColorStop(0, "rgba(196,255,222,0.10)");
      sheen.addColorStop(0.35, "rgba(196,255,222,0)");
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.arc(lensAt.x, lensAt.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = rgba(MINT, 0.85);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // four short ticks on the rim and a small centre mark
      ctx.strokeStyle = rgba(MINT, 0.7);
      ctx.lineWidth = 1;
      for (let s = 0; s < 4; s++) {
        const a = (s * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(lensAt.x + Math.cos(a) * (R - 5), lensAt.y + Math.sin(a) * (R - 5));
        ctx.lineTo(lensAt.x + Math.cos(a) * (R + 4), lensAt.y + Math.sin(a) * (R + 4));
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(MINT, 0.4);
      ctx.beginPath();
      ctx.moveTo(lensAt.x - 5, lensAt.y);
      ctx.lineTo(lensAt.x + 5, lensAt.y);
      ctx.moveTo(lensAt.x, lensAt.y - 5);
      ctx.lineTo(lensAt.x, lensAt.y + 5);
      ctx.stroke();
      // the zoom, on a small tag under the rim
      setFont(`600 10.5px ${font}`);
      const zs = `×${Z.toFixed(1)}`;
      const zw = ctx.measureText(zs).width + 10;
      ctx.fillStyle = "rgba(6,10,8,0.92)";
      ctx.beginPath();
      ctx.roundRect(lensAt.x - zw / 2, lensAt.y + R - 7, zw, 15, 7);
      ctx.fill();
      ctx.strokeStyle = rgba(MINT, 0.5);
      ctx.stroke();
      ctx.fillStyle = rgba(MINT, 0.95);
      ctx.fillText(zs, lensAt.x - zw / 2 + 5, lensAt.y + R + 4);

      // the card for the token under the lens
      if (hover != null && live[hover]) {
        const L = live[hover]!;
        readSpark(L.token);
        const sp = spark.get(L.token);
        const rc = recent.get(L.token) ?? [];
        const cw = 250,
          ch = (sp && sp.length ? 236 : 178) + (rc.length ? 14 + rc.length * 18 : 0);
        const right = lensAt.x + R + 18 + cw < W - 8;
        // a phone has room on neither side of the lens: the card stays inside the screen, over the lens if it must
        const cx = Math.max(8, Math.min(W - cw - 8, right ? lensAt.x + R + 18 : lensAt.x - R - 18 - cw)),
          cy = Math.max(8, Math.min(H - ch - 8, lensAt.y - ch / 2));
        ctx.fillStyle = "rgba(10,15,13,0.96)";
        ctx.strokeStyle = rgba(GREEN, 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cw, ch, 12);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = rgba(GREEN, 0.35);
        ctx.beginPath();
        ctx.moveTo(right ? lensAt.x + R + 10 : lensAt.x - R - 10, lensAt.y);
        ctx.lineTo(right ? cx : cx + cw, cy + ch / 2);
        ctx.stroke();
        setFont(`600 16px ${font}`);
        ctx.fillStyle = rgba([236, 243, 238], 1);
        ctx.fillText(L.symbol.slice(0, 14), cx + 14, cy + 27);
        if (L.change != null) {
          const up = L.change >= 0;
          setFont(`600 14px ${font}`);
          ctx.fillStyle = rgba(up ? GREEN : RED, 1);
          const s = `${up ? "▲ +" : "▼ "}${L.change.toFixed(1)}%`;
          ctx.fillText(s, cx + cw - 14 - ctx.measureText(s).width, cy + 27);
        }
        setFont(`12px ${font}`);
        ctx.fillStyle = rgba([150, 168, 158], 0.95);
        ctx.fillText((L.name || "Token on Robinhood Chain").slice(0, 30), cx + 14, cy + 45);
        const rowsC: [string, string][] = [
          ["Volume, 30h", usd(L.volume)],
          ["Price", L.price != null ? px(L.price) : "no route"],
          ["Liquidity", L.liquidity ? usd(L.liquidity) : "none read"],
        ];
        rowsC.forEach(([a, b], ri) => {
          const y = cy + 70 + ri * 21;
          ctx.fillStyle = rgba([30, 42, 36], 1);
          ctx.fillRect(cx + 14, y - 15, cw - 28, 1);
          setFont(`12.5px ${font}`);
          ctx.fillStyle = rgba([150, 168, 158], 1);
          ctx.fillText(a, cx + 14, y);
          ctx.fillStyle = rgba([236, 243, 238], 1);
          ctx.fillText(b, cx + cw - 14 - ctx.measureText(b).width, y);
        });
        // who is buying: the share of swaps that bought, as a split bar
        if (L.swaps) {
          const share = Math.max(0, Math.min(1, (L.buys ?? 0) / L.swaps));
          const y = cy + 140;
          ctx.fillStyle = rgba(GREEN, 0.85);
          ctx.fillRect(cx + 14, y, (cw - 28) * share, 5);
          ctx.fillStyle = rgba(RED, 0.75);
          ctx.fillRect(cx + 14 + (cw - 28) * share, y, (cw - 28) * (1 - share), 5);
          setFont(`11.5px ${font}`);
          ctx.fillStyle = rgba([150, 168, 158], 1);
          ctx.fillText(
            `${Math.round(share * 100)}% of ${L.swaps.toLocaleString("en")} swaps bought`,
            cx + 14,
            y + 20,
          );
        }
        if (sp && sp.length) {
          const gx = cx + 14,
            gw = cw - 28,
            gy = cy + 186,
            gh = 34;
          const lo = Math.min(...sp),
            hi = Math.max(...sp),
            span = hi - lo || 1;
          const up = sp[sp.length - 1]! >= sp[0]!;
          ctx.beginPath();
          sp.forEach((v, s) => {
            const X = gx + (s / (sp.length - 1)) * gw,
              Y = gy + gh - ((v - lo) / span) * gh;
            if (s) ctx.lineTo(X, Y);
            else ctx.moveTo(X, Y);
          });
          ctx.strokeStyle = rgba(up ? GREEN : RED, 0.95);
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.lineWidth = 1;
          ctx.lineTo(gx + gw, gy + gh);
          ctx.lineTo(gx, gy + gh);
          ctx.closePath();
          ctx.fillStyle = rgba(up ? GREEN : RED, 0.1);
          ctx.fill();
          setFont(`10.5px ${font}`);
          ctx.fillStyle = rgba([150, 168, 158], 0.9);
          ctx.fillText(`${sp.length} swaps, last day`, gx, gy - 4);
        }
        // the last swaps on it, newest first
        if (rc.length) {
          const y0 = cy + (sp && sp.length ? 236 : 178) - 8;
          setFont(`10.5px ${font}`);
          ctx.fillStyle = rgba([150, 168, 158], 0.9);
          ctx.fillText("Last swaps", cx + 14, y0);
          const nowS = Date.now() / 1000;
          rc.forEach((x, ri) => {
            const y = y0 + 17 + ri * 18;
            setFont(`600 12px ${font}`);
            ctx.fillStyle = rgba(x.side === "buy" ? GREEN : RED, 1);
            ctx.fillText(x.side === "buy" ? "BUY" : "SELL", cx + 14, y);
            setFont(`12px ${font}`);
            ctx.fillStyle = rgba([236, 243, 238], 1);
            ctx.fillText(`at ${px(x.price)}`, cx + 60, y);
            const ago = Math.max(1, Math.round((nowS - x.t) / 60));
            const s = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
            ctx.fillStyle = rgba([150, 168, 158], 1);
            ctx.fillText(s, cx + cw - 14 - ctx.measureText(s).width, y);
          });
        }
        setFont(`600 11.5px ${font}`);
        ctx.fillStyle = rgba(GREEN, 0.9);
        if (driven) ctx.fillText("click to open the chart →", cx + 14, cy + ch - 6);
      }
      // the hint, until someone moves over the range
      if (!driven && W < 700) {
        setFont(`11.5px ${font}`);
        ctx.fillStyle = rgba([150, 168, 158], 0.7);
        ctx.fillText("each hill is a token: height is volume, width liquidity", 16, H - 14);
      }
    }
    ctx.restore();
    // restore() put the canvas back on its default font (10px sans-serif): the cached name no longer matches, so the
    // next frame must set it again. Without this only the first frame was drawn in the real font.
    lastFont = "";
  };
  // as fast as the screen refreshes (60 to 360 Hz) while a frame is cheap; on a slow machine the scene steps back so
  // it never takes more than half of the main thread. Phones: at most 24 frames a second and a fifth of the thread.
  let cost = 2,
    lastRun = 0;
  const loop = (now: number) => {
    raf = env.raf(loop);
    if (!seen || env.hidden() || now - lastRun < (phone ? Math.max(1000 / 24, cost * 5) : cost * 2)) return;
    lastRun = now;
    const a = performance.now();
    frame(now);
    cost = cost * 0.9 + (performance.now() - a) * 0.1;
  };
  // next/font gives a list: the real face, then a fallback made from a system font. Checking the whole list says "ready"
  // at once (the fallback is always there), so the first frames were drawn in the fallback and the labels jumped when
  // the real face arrived. Only the first family, the real one, is checked and drawn with.
  const fam = env.fam;
  let fontOk = !fam || env.fontCheck(fam);
  if (!fontOk) {
    const ready = () => {
      if (fontOk) return;
      fontOk = true;
      // sprites drawn in the fallback (by another scene on the page) are thrown away and redrawn in the real font
      ATLAS_ONE?.reset();
      lastFont = "";
      lastTerrain = -1e9;
    };
    env.fontLoad(fam).then(ready, ready);
    setTimeout(ready, 4500); // only if the font never arrives: the loader is over by then
  }
  const resize = (w: number, h: number) => {
    W = w;
    H = h;
    if (fam) font = `${fam}, ui-monospace, monospace`;
    const dpr = dprI;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    layer.width = cv.width;
    layer.height = cv.height;
    lastTerrain = -1e9;
    camNow = null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = "alphabetic";
    lastFont = "";
    frame(performance.now());
  };
  // the footer asks for the busiest tokens only once it comes near the screen
  const onSeen = (on: boolean) => {
    seen = on;
    if (seen && story === "lens") readLive();
  };
  if (!still) raf = env.raf(loop);
  // the loader is on screen for a few seconds only
  const end = story === "token" ? setTimeout(() => env.caf(raf), 4800) : undefined;
  return {
    resize,
    seen: onSeen,
    move: onMove,
    leave: onLeave,
    click: onClick,
    stop: () => {
      env.caf(raf);
      if (end) clearTimeout(end);
    },
  };
}
