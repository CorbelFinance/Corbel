/**
 * Pure lattice builder. Input: node and obstacle rectangles (document coordinates) and a vertical window.
 * Output: an orthogonal graph that runs along node frames and through the gaps between them,
 * never through node interiors, text or masked illustrations. No DOM access: testable on fixtures.
 */
import { CHAIN, type ChainConfig } from "./config";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Vertex {
  x: number;
  y: number;
}
export interface Edge {
  a: number;
  b: number;
  len: number;
  /** index of the node whose frame this edge lies on, or -1 */
  frame: number;
}
export interface Lattice {
  vertices: Vertex[];
  edges: Edge[];
  adj: number[][]; // vertex → edge indices
  ports: number[][]; // node → 4 vertex ids [tl, tr, br, bl] (-1 if missing)
  nodes: Rect[];
}

type Coord = { v: number; border: boolean };

/** Merge coordinates closer than `min`; a node border always wins over a gap midline. */
export function snap(values: Coord[], min: number): number[] {
  const s = [...values].sort((p, q) => p.v - q.v);
  const out: Coord[] = [];
  for (const c of s) {
    const last = out[out.length - 1];
    if (last && c.v - last.v < min) {
      if (c.border && !last.border) out[out.length - 1] = c;
      continue;
    }
    out.push(c);
  }
  return out.map((c) => Math.round(c.v));
}

const inside = (r: Rect, x: number, y: number) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;

/** True when an axis-aligned segment passes through the open interior of r. */
export function segmentHits(r: Rect, x1: number, y1: number, x2: number, y2: number): boolean {
  if (y1 === y2) {
    if (!(y1 > r.y && y1 < r.y + r.h)) return false;
    return Math.max(x1, x2) > r.x && Math.min(x1, x2) < r.x + r.w;
  }
  if (!(x1 > r.x && x1 < r.x + r.w)) return false;
  return Math.max(y1, y2) > r.y && Math.min(y1, y2) < r.y + r.h;
}

const distToRect = (r: Rect, x: number, y: number) => {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
};


/** Group nodes into visual rows (vertical overlap > 50% of the shorter one). */
function rowsOf(nodes: Rect[]): number[][] {
  const order = nodes.map((_, i) => i).sort((a, b) => nodes[a]!.y - nodes[b]!.y);
  const rows: number[][] = [];
  for (const i of order) {
    const n = nodes[i]!;
    const row = rows.find((r) => {
      const m = nodes[r[0]!]!;
      const ov = Math.min(m.y + m.h, n.y + n.h) - Math.max(m.y, n.y);
      return ov > 0.5 * Math.min(m.h, n.h);
    });
    if (row) row.push(i);
    else rows.push([i]);
  }
  return rows;
}

export function buildLattice(
  nodes: Rect[],
  obstacles: Rect[],
  view: { top: number; bottom: number; left: number; right: number },
  cfg: ChainConfig = CHAIN,
): Lattice {
  const inView = (r: Rect) => r.y + r.h > view.top && r.y < view.bottom;
  const vis = nodes.filter(inView);

  const xs: Coord[] = [];
  const ys: Coord[] = [];
  for (const n of vis) {
    xs.push({ v: n.x, border: true }, { v: n.x + n.w, border: true });
    ys.push({ v: n.y, border: true }, { v: n.y + n.h, border: true });
  }
  for (const row of rowsOf(vis)) {
    const r = row.map((i) => vis[i]!).sort((a, b) => a.x - b.x);
    for (let k = 0; k < r.length - 1; k++) {
      const gap = r[k + 1]!.x - (r[k]!.x + r[k]!.w);
      if (gap > cfg.minSegment) xs.push({ v: r[k]!.x + r[k]!.w + gap / 2, border: false });
    }
    // the bus above the row sits mid-way between the row and whatever stands above it (text, a rule)
    const top = Math.min(...r.map((n) => n.y));
    const left = Math.min(...r.map((n) => n.x)),
      right = Math.max(...r.map((n) => n.x + n.w));
    const above = obstacles
      .filter((o) => o.y + o.h <= top && o.y + o.h > top - 4 * cfg.busOffset && o.x < right && o.x + o.w > left)
      .reduce((m, o) => Math.max(m, o.y + o.h), -Infinity);
    const gapTop = Number.isFinite(above) ? above : top - 2 * cfg.busOffset;
    if (cfg.bus && top - gapTop >= 2 * cfg.minSegment) ys.push({ v: (gapTop + top) / 2, border: false });
  }
  const rows = rowsOf(vis)
    .map((row) => ({ top: Math.min(...row.map((i) => vis[i]!.y)), bottom: Math.max(...row.map((i) => vis[i]!.y + vis[i]!.h)) }))
    .sort((a, b) => a.top - b.top);
  for (let k = 0; k < rows.length - 1; k++) {
    const gap = rows[k + 1]!.top - rows[k]!.bottom;
    if (gap > cfg.minSegment) ys.push({ v: rows[k]!.bottom + gap / 2, border: false });
  }

  const X = snap(xs, cfg.minSegment).filter((x) => x >= view.left && x <= view.right);
  const Y = snap(ys, cfg.minSegment).filter((y) => y >= view.top && y <= view.bottom);

  // obstacles: node interiors (frames stay usable) + padded text + masks
  const blocks: Rect[] = [...vis.map((n) => ({ x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 })), ...obstacles];
  const blocked = (x1: number, y1: number, x2: number, y2: number) => blocks.some((r) => segmentHits(r, x1, y1, x2, y2));
  const nearNode = (x: number, y: number) => vis.some((n) => distToRect(n, x, y) <= cfg.hugNodes);
  const onFrame = (x1: number, y1: number, x2: number, y2: number) =>
    vis.findIndex((n) =>
      y1 === y2
        ? (y1 === Math.round(n.y) || y1 === Math.round(n.y + n.h)) && Math.min(x1, x2) >= Math.round(n.x) - 1 && Math.max(x1, x2) <= Math.round(n.x + n.w) + 1
        : (x1 === Math.round(n.x) || x1 === Math.round(n.x + n.w)) && Math.min(y1, y2) >= Math.round(n.y) - 1 && Math.max(y1, y2) <= Math.round(n.y + n.h) + 1,
    );

  // vertices at intersections, skipping points inside any block
  const id = new Map<string, number>();
  const vertices: Vertex[] = [];
  const vAt = (x: number, y: number) => {
    const k = `${x},${y}`;
    let i = id.get(k);
    if (i === undefined) {
      i = vertices.length;
      vertices.push({ x, y });
      id.set(k, i);
    }
    return i;
  };
  const free = (x: number, y: number) => !blocks.some((r) => inside(r, x, y)) && nearNode(x, y);

  const edges: Edge[] = [];
  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    if (len < cfg.minSegment) return;
    if (blocked(x1, y1, x2, y2)) return;
    if (!nearNode((x1 + x2) / 2, (y1 + y2) / 2)) return;
    edges.push({ a: vAt(x1, y1), b: vAt(x2, y2), len, frame: onFrame(x1, y1, x2, y2) });
  };
  for (const y of Y) {
    for (let i = 0; i < X.length - 1; i++) if (free(X[i]!, y) && free(X[i + 1]!, y)) addEdge(X[i]!, y, X[i + 1]!, y);
  }
  for (const x of X) {
    for (let j = 0; j < Y.length - 1; j++) if (free(x, Y[j]!) && free(x, Y[j + 1]!)) addEdge(x, Y[j]!, x, Y[j + 1]!);
  }

  // vertex budget: keep the edges nearest the window centre
  let E = edges;
  if (vertices.length > cfg.maxVertices) {
    const cy = (view.top + view.bottom) / 2;
    const keep = new Set(
      vertices
        .map((v, i) => [Math.abs(v.y - cy), i] as const)
        .sort((a, b) => a[0] - b[0])
        .slice(0, cfg.maxVertices)
        .map(([, i]) => i),
    );
    E = edges.filter((e) => keep.has(e.a) && keep.has(e.b));
  }

  // compact: drop degree-0 vertices
  const used = new Map<number, number>();
  const V: Vertex[] = [];
  const remap = (i: number) => {
    let j = used.get(i);
    if (j === undefined) {
      j = V.length;
      V.push(vertices[i]!);
      used.set(i, j);
    }
    return j;
  };
  const edgesOut = E.map((e) => ({ ...e, a: remap(e.a), b: remap(e.b) }));
  const adj: number[][] = V.map(() => []);
  edgesOut.forEach((e, k) => {
    adj[e.a]!.push(k);
    adj[e.b]!.push(k);
  });

  const find = (x: number, y: number) => {
    let best = -1,
      bd = 6;
    V.forEach((v, i) => {
      const d = Math.abs(v.x - x) + Math.abs(v.y - y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const ports = vis.map((n) => [
    find(Math.round(n.x), Math.round(n.y)),
    find(Math.round(n.x + n.w), Math.round(n.y)),
    find(Math.round(n.x + n.w), Math.round(n.y + n.h)),
    find(Math.round(n.x), Math.round(n.y + n.h)),
  ]);

  return { vertices: V, edges: edgesOut, adj, ports, nodes: vis };
}

/** Dijkstra over the lattice with a binary heap. Returns the vertex path from a to b, or null. */
export function shortestPath(L: Lattice, a: number, b: number): number[] | null {
  if (a < 0 || b < 0) return null;
  const n = L.vertices.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap: [number, number][] = [];
  const push = (d: number, v: number) => {
    heap.push([d, v]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  dist[a] = 0;
  push(0, a);
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]!) continue;
    if (u === b) break;
    for (const k of L.adj[u]!) {
      const e = L.edges[k]!;
      const v = e.a === u ? e.b : e.a;
      const nd = d + e.len;
      if (nd < dist[v]!) {
        dist[v] = nd;
        prev[v] = u;
        push(nd, v);
      }
    }
  }
  if (!Number.isFinite(dist[b]!)) return null;
  const path: number[] = [];
  for (let v = b; v !== -1; v = prev[v]!) path.push(v);
  return path.reverse();
}
