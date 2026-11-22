/**
 * Chain Field simulation: pure logic over a Lattice, driven by a seeded RNG.
 * Runners: bright traces that run along the lattice, branch at crossings, or hop block → block.
 * Packets: tiny squares that walk on their own while the pointer rests; every Nth is red and
 * dies at the next crossing ("failed the check"). Labels: short hex tags at some crossings.
 */
import { CHAIN, type ChainConfig } from "./config";
import { shortestPath, type Lattice } from "./lattice";

export type Pt = { x: number; y: number };
const FADE = 0.35; // s

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Runner {
  trail: Pt[]; // passed vertices (oldest first)
  from: number;
  to: number;
  along: number;
  speed: number;
  tail: number;
  born: number;
  ttl: number;
  depth: number;
  path: number[] | null; // hop route (vertex ids)
  pi: number;
  hopNode: number; // node lit on arrival, -1 if none
  dead: boolean;
  diedAt: number;
  frozen: boolean;
}
export interface Packet {
  edge: number;
  from: number;
  along: number;
  red: boolean;
  dead: boolean;
}
export interface Label {
  x: number;
  y: number;
  text: string;
  until: number;
}
export interface Pulse {
  x: number;
  y: number;
  at: number;
  red?: boolean;
}

export class ChainSim {
  L: Lattice;
  rng: () => number;
  cfg: ChainConfig;
  now = 0;
  runners: Runner[] = [];
  packets: Packet[] = [];
  labels: Label[] = [];
  pulses: Pulse[] = [];
  lit = new Map<number, number>(); // node → time lit
  litFrames = new Map<number, number>(); // node → time its frame lit by a passing runner
  private packetCount = 0;
  hops = { tried: 0, routed: 0, arrived: 0 };

  constructor(L: Lattice, seed = 1, cfg: ChainConfig = CHAIN) {
    this.L = L;
    this.rng = mulberry32(seed);
    this.cfg = cfg;
  }

  private range([a, b]: readonly [number, number]) {
    return a + (b - a) * this.rng();
  }
  pos(v: number): Pt {
    return this.L.vertices[v]!;
  }
  private other(k: number, v: number) {
    const e = this.L.edges[k]!;
    return e.a === v ? e.b : e.a;
  }
  private edgeBetween(u: number, v: number) {
    return this.L.adj[u]!.find((k) => this.other(k, u) === v) ?? -1;
  }

  /** Replace the lattice; live runners and packets are re-attached by coordinates. */
  setLattice(L: Lattice) {
    const key = (p: Pt) => `${p.x},${p.y}`;
    const map = new Map(L.vertices.map((v, i) => [key(v), i]));
    const re = (oldId: number) => map.get(key(this.L.vertices[oldId] ?? { x: NaN, y: NaN })) ?? -1;
    for (const r of this.runners) {
      const f = re(r.from),
        t = re(r.to);
      if (f < 0 || t < 0) r.frozen = true;
      else {
        r.from = f;
        r.to = t;
        r.path = r.path ? r.path.map(re) : null;
        if (r.path && r.path.some((v) => v < 0)) r.path = null;
      }
    }
    const old = this.L;
    this.packets = this.packets.filter((p) => {
      const e = old.edges[p.edge];
      if (!e) return false;
      const a = map.get(key(old.vertices[e.a]!)),
        b = map.get(key(old.vertices[e.b]!));
      if (a === undefined || b === undefined) return false;
      const k = L.adj[a]?.find((kk) => (L.edges[kk]!.a === a ? L.edges[kk]!.b : L.edges[kk]!.a) === b);
      if (k === undefined) return false;
      p.edge = k;
      p.from = old.vertices[p.from] && map.get(key(old.vertices[p.from]!)) === a ? a : b;
      return true;
    });
    this.L = L;
  }

  nearestVertex(x: number, y: number, radius: number) {
    let best = -1,
      bd = radius * radius;
    const V = this.L.vertices;
    for (let i = 0; i < V.length; i++) {
      const dx = V[i]!.x - x,
        dy = V[i]!.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd && this.L.adj[i]!.length) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private makeRunner(v: number, next: number, depth: number, path: number[] | null = null, hopNode = -1): Runner | null {
    if (this.runners.filter((r) => !r.dead).length >= this.cfg.maxRunners) return null;
    const r: Runner = {
      trail: [{ ...this.pos(v) }],
      from: v,
      to: next,
      along: 0,
      speed: this.cfg.runnerSpeed * (1 + (this.rng() * 2 - 1) * this.cfg.speedJitter),
      tail: this.range(this.cfg.tailLength),
      born: this.now,
      ttl: this.range(this.cfg.runnerTtl) + (path ? 0.6 : 0),
      depth,
      path,
      pi: 1,
      hopNode,
      dead: false,
      diedAt: -1,
      frozen: false,
    };
    this.runners.push(r);
    return r;
  }

  /** Start a runner at the vertex nearest (x, y). */
  spawnAt(x: number, y: number, radius: number = this.cfg.cursorRadius) {
    const v = this.nearestVertex(x, y, radius);
    if (v < 0) return null;
    const ks = this.L.adj[v]!;
    const k = ks[Math.floor(this.rng() * ks.length)]!;
    return this.makeRunner(v, this.other(k, v), 0);
  }

  /** Route a runner from node A's nearest port to node B's nearest port. */
  hop(a: number, b: number) {
    this.hops.tried++;
    const A = this.L.nodes[a],
      B = this.L.nodes[b];
    if (!A || !B) return null;
    const cA = { x: A.x + A.w / 2, y: A.y + A.h / 2 },
      cB = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
    const dist = (p: number, c: Pt) => Math.hypot(this.pos(p).x - c.x, this.pos(p).y - c.y);
    const pa = (this.L.ports[a] ?? []).filter((p) => p >= 0).sort((p, q) => dist(p, cB) - dist(q, cB));
    const pb = (this.L.ports[b] ?? []).filter((p) => p >= 0).sort((p, q) => dist(p, cA) - dist(q, cA));
    // neighbours often share a corner: take the first pair of distinct corners that has a route
    let path: number[] | null = null;
    outer: for (const from of pa)
      for (const to of pb) {
        if (from === to) continue;
        path = shortestPath(this.L, from, to);
        if (path && path.length >= 2) break outer;
      }
    if (!path || path.length < 2) return null;
    this.hops.routed++;
    return this.makeRunner(path[0]!, path[1]!, 0, path, b);
  }

  /** Nearest neighbour nodes of node a (by centre distance). */
  neighbours(a: number, count: number) {
    const A = this.L.nodes[a];
    if (!A) return [];
    const c = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    const ca = c(A);
    return this.L.nodes
      .map((n, i) => [i, Math.hypot(c(n).x - ca.x, c(n).y - ca.y)] as const)
      .filter(([i]) => i !== a)
      .sort((p, q) => p[1] - q[1])
      .slice(0, count)
      .map(([i]) => i);
  }

  addPacket() {
    if (this.packets.length >= this.cfg.maxPackets || !this.L.edges.length) return;
    const k = Math.floor(this.rng() * this.L.edges.length);
    this.packetCount++;
    this.packets.push({ edge: k, from: this.L.edges[k]!.a, along: 0, red: this.packetCount % this.cfg.redEvery === 0, dead: false });
  }

  private choose(r: Runner, at: number) {
    const ks = this.L.adj[at]!.filter((k) => this.other(k, at) !== r.from);
    if (!ks.length) return -1;
    const dir = { x: Math.sign(this.pos(at).x - this.pos(r.from).x), y: Math.sign(this.pos(at).y - this.pos(r.from).y) };
    const straight = ks.find((k) => {
      const v = this.other(k, at);
      return Math.sign(this.pos(v).x - this.pos(at).x) === dir.x && Math.sign(this.pos(v).y - this.pos(at).y) === dir.y;
    });
    if (straight !== undefined && this.rng() < this.cfg.straightP) return this.other(straight, at);
    const turns = ks.filter((k) => k !== straight);
    const pick = turns.length ? turns : ks;
    return this.other(pick[Math.floor(this.rng() * pick.length)]!, at);
  }

  private arrive(r: Runner) {
    const at = r.to;
    const p = this.pos(at);
    r.trail.push({ ...p });
    const k = this.edgeBetween(r.from, at);
    const fr = k >= 0 ? this.L.edges[k]!.frame : -1;
    if (fr >= 0) this.litFrames.set(fr, this.now);
    if (this.L.ports.some((ports) => ports.includes(at)) && fr >= 0) this.pulses.push({ ...p, at: this.now });

    if (this.labels.length < this.cfg.maxLabels && this.L.adj[at]!.length >= 3 && this.rng() < this.cfg.labelChance) {
      const hex = Math.floor(this.rng() * 0xffff)
        .toString(16)
        .padStart(4, "0");
      this.labels.push({ x: p.x, y: p.y, text: hex, until: this.now + this.cfg.labelMs / 1000 });
    }

    if (r.path) {
      if (r.pi >= r.path.length - 1) {
        this.pulses.push({ ...p, at: this.now });
        if (r.hopNode >= 0) this.lit.set(r.hopNode, this.now);
        this.hops.arrived++;
        this.kill(r);
        return;
      }
      r.from = at;
      r.pi++;
      r.to = r.path[r.pi]!;
      return;
    }
    const next = this.choose(r, at);
    if (next < 0) {
      this.kill(r);
      return;
    }
    if (r.depth < this.cfg.maxDepth && this.rng() < this.cfg.branchP) {
      const others = this.L.adj[at]!.map((kk) => this.other(kk, at)).filter((v) => v !== next && v !== r.from);
      if (others.length) this.makeRunner(at, others[Math.floor(this.rng() * others.length)]!, r.depth + 1);
    }
    r.from = at;
    r.to = next;
  }

  /** Advance by dt seconds. cursor in document coordinates, or null. */
  step(dt: number, cursor: Pt | null) {
    this.now += dt;
    for (const r of this.runners) {
      if (r.dead) continue;
      if (this.now - r.born > r.ttl) {
        this.kill(r);
        continue;
      }
      if (r.frozen) continue;
      if (cursor && !r.path) {
        const h = this.head(r);
        if (Math.hypot(h.x - cursor.x, h.y - cursor.y) > this.cfg.maxFromCursor) {
          this.kill(r);
          continue;
        }
      }
      r.along += r.speed * dt;
      let guard = 0;
      while (!r.dead && guard++ < 16) {
        const k = this.edgeBetween(r.from, r.to);
        const len = k >= 0 ? this.L.edges[k]!.len : 0;
        if (k < 0) {
          this.kill(r);
          break;
        }
        if (r.along < len) break;
        r.along -= len;
        this.arrive(r);
      }
    }
    // dead runners keep their tail for a short fade, then go
    this.runners = this.runners.filter((r) => !r.dead || this.now - r.diedAt < FADE);

    for (const p of this.packets) {
      if (p.dead) continue;
      const e = this.L.edges[p.edge];
      if (!e) {
        p.dead = true;
        continue;
      }
      p.along += this.cfg.packetSpeed * dt;
      if (p.along >= e.len) {
        const at = this.other(p.edge, p.from);
        if (p.red) {
          this.pulses.push({ ...this.pos(at), at: this.now, red: true });
          p.dead = true;
          continue;
        }
        const ks = this.L.adj[at]!.filter((k) => k !== p.edge);
        if (!ks.length) {
          p.dead = true;
          continue;
        }
        p.edge = ks[Math.floor(this.rng() * ks.length)]!;
        p.from = at;
        p.along = 0;
      }
    }
    this.packets = this.packets.filter((p) => !p.dead);
    this.labels = this.labels.filter((l) => l.until > this.now);
    const pm = this.cfg.cornerPulseMs / 1000;
    this.pulses = this.pulses.filter((p) => this.now - p.at < pm * 1.4);
  }

  head(r: Runner): Pt {
    const a = this.pos(r.from),
      b = this.pos(r.to);
    if (!a || !b) return r.trail[r.trail.length - 1]!;
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y) || 1;
    const f = Math.min(1, r.along / len);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  /** Polyline of a runner's tail, head first, cut to its tail length. */
  tail(r: Runner): Pt[] {
    const pts: Pt[] = [r.dead || r.frozen ? r.trail[r.trail.length - 1]! : this.head(r)];
    let left = r.tail;
    for (let i = r.trail.length - 1; i >= 0 && left > 0; i--) {
      const p = r.trail[i]!,
        q = pts[pts.length - 1]!;
      const d = Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
      if (d >= left) {
        const f = left / (d || 1);
        pts.push({ x: q.x + (p.x - q.x) * f, y: q.y + (p.y - q.y) * f });
        left = 0;
      } else {
        pts.push(p);
        left -= d;
      }
    }
    return pts;
  }

  kill(r: Runner) {
    if (r.dead) return;
    r.dead = true;
    r.diedAt = this.now;
  }

  /** 0..1 visibility of a runner (fades out after death). */
  alpha(r: Runner) {
    return r.dead ? Math.max(0, 1 - (this.now - r.diedAt) / FADE) : 1;
  }

  /** Axis-aligned segments of all live runner tails (for tests and debug). */
  segments() {
    const out: [Pt, Pt][] = [];
    for (const r of this.runners) {
      const t = this.tail(r);
      for (let i = 0; i < t.length - 1; i++) out.push([t[i]!, t[i + 1]!]);
    }
    return out;
  }
}
