/**
 * RPC lanes: every request this process sends to the chain goes through one gate that spreads the load over
 * the configured endpoints, several lanes each.
 *
 *   RPC_URLS          comma-separated endpoints (falls back to RPC_URL). Optional per endpoint, after "#":
 *                     logs=N (eth_getLogs window), wide=N (the same for one contract), batch=N (largest JSON-RPC batch), e.g. https://x.org#logs=10000&batch=3
 *   RPC_LANES         lanes per endpoint (default 4)
 *   RPC_CONCURRENCY   in-flight requests per lane (default 4)
 *   RPC_SPACING_MS    minimum gap between requests on one lane (default 60)
 *
 * A 429 pauses only that lane (Retry-After, else exponential) and the request moves to another lane.
 * Network errors and 5xx count against a lane; five in a row rest it for 30 s. A JSON-RPC error that is a limit of
 * the node itself (window, plan, pruning) sends the request to another endpoint.
 * eth_getLogs wider than an endpoint's window never goes to that endpoint; when it is wider than every window, only the
 * endpoints with the widest one are asked. A query for one contract has its own, much wider window on some nodes.
 * Each configured endpoint is checked once for chain id 4663 before use; a mismatch disables it.
 *
 * Priority: a request made while serving a visitor (rpcPriority 2) goes ahead of normal work (1), and background
 * refreshes (0) wait behind both. Set it with rpcPriority.run(level, fn); the level follows the async call chain.
 */
export const rpcPriority = ((globalThis as unknown as { __corbelRpcPrio?: AsyncLocalStorage<number> }).__corbelRpcPrio ??= new AsyncLocalStorage<number>());
/** Run fn as a visitor's request (2) or as background work (0). */
export const asVisitor = <T>(fn: () => Promise<T>) => rpcPriority.run(2, fn);
export const asBackground = <T>(fn: () => Promise<T>) => rpcPriority.run(0, fn);

import { AsyncLocalStorage } from "node:async_hooks";

const CHAIN_ID_HEX = "0x1237"; // 4663
const MAX_ATTEMPTS = 7;
const KNOWN_LOG_WINDOW: Record<string, number> = { "robinhood.drpc.org": 10_000 };
const DEFAULT_LOG_WINDOW = 25_000;
/** Window of a query for a single contract, where the node gives it more room (measured 2026-11-24). */
const KNOWN_WIDE_WINDOW: Record<string, number> = { "rpc.mainnet.chain.robinhood.com": 10_000_000 };
/** Largest JSON-RPC batch a node takes (drpc's free plan refuses more than 3). */
const KNOWN_MAX_BATCH: Record<string, number> = { "robinhood.drpc.org": 3 };

type Endpoint = { url: string; host: string; logWindow: number; wideWindow: number; maxBatch: number; fromEnv: boolean; verified: Promise<boolean> | null; ok: boolean };
type Lane = { id: string; ep: Endpoint; inflight: number; last: number; pausedUntil: number; strikes: number; fails: number };
type Job = { prio: number; url: string; init: RequestInit | undefined; range: number; wide: boolean; tried: Set<string>; attempts: number; last: Response | null; err: unknown; resolve: (r: Response) => void; reject: (e: unknown) => void };

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const concurrency = () => num(process.env.RPC_CONCURRENCY, 4);
const spacing = () => num(process.env.RPC_SPACING_MS, 60);
/** Background requests in flight at once, across all lanes: the rest of the RPC budget stays free for visitors. */
const bgMax = () => num(process.env.RPC_BACKGROUND_MAX, 2);
let bgInflight = 0;

// ---------- configuration (read once per process, shared across bundles) ----------

const G = globalThis as unknown as { __corbelLanes?: { lanes: Lane[]; key: string; queue: Job[]; timer: ReturnType<typeof setTimeout> | null } };

function endpoints(fallbackUrl: string): Endpoint[] {
  const list = (process.env.RPC_URLS ?? process.env.RPC_URL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const fromEnv = list.length > 0;
  return (fromEnv ? list : [fallbackUrl]).map((entry) => {
    const [url, frag] = entry.split("#");
    const host = new URL(url!).host;
    const m = /logs=(\d+)/.exec(frag ?? "");
    const wd = /wide=(\d+)/.exec(frag ?? "");
    const logWindow = m ? Number(m[1]) : (KNOWN_LOG_WINDOW[host] ?? DEFAULT_LOG_WINDOW);
    const b = /batch=(\d+)/.exec(frag ?? "");
    const maxBatch = b ? Math.max(1, Number(b[1])) : (KNOWN_MAX_BATCH[host] ?? 0);
    return { url: url!, host, logWindow, wideWindow: Math.max(logWindow, wd ? Number(wd[1]) : (KNOWN_WIDE_WINDOW[host] ?? 0)), maxBatch, fromEnv, verified: null, ok: true };
  });
}

function state(fallbackUrl: string) {
  const key = [process.env.RPC_URLS, process.env.RPC_URL, process.env.RPC_LANES, fallbackUrl].join("|");
  if (G.__corbelLanes?.key === key) return G.__corbelLanes;
  const per = Math.max(1, num(process.env.RPC_LANES, 4));
  const lanes: Lane[] = [];
  endpoints(fallbackUrl).forEach((ep, i) => {
    for (let j = 0; j < per; j++) lanes.push({ id: `${i}.${j}`, ep, inflight: 0, last: 0, pausedUntil: 0, strikes: 0, fails: 0 });
  });
  G.__corbelLanes = { lanes, key, queue: G.__corbelLanes?.queue ?? [], timer: null };
  return G.__corbelLanes;
}

// ---------- request routing ----------

/** Widest eth_getLogs block range in a request body (0 when there is none or it can't be told). */
function logRange(body: unknown): number {
  let max = 0;
  for (const r of Array.isArray(body) ? body : [body]) {
    const req = r as { method?: string; params?: { fromBlock?: string; toBlock?: string }[] };
    if (req?.method !== "eth_getLogs") continue;
    const p = req.params?.[0];
    if (p?.fromBlock?.startsWith("0x") && p.toBlock?.startsWith("0x")) max = Math.max(max, Number(BigInt(p.toBlock) - BigInt(p.fromBlock)) + 1);
  }
  return max;
}

/** True when every log query in the body names exactly one contract: such a query may be much wider. */
function oneContract(body: unknown): boolean {
  let any = false;
  for (const r of Array.isArray(body) ? body : [body]) {
    const req = r as { method?: string; params?: { address?: string | string[] }[] };
    if (req?.method !== "eth_getLogs") continue;
    const a = req.params?.[0]?.address;
    if (typeof a !== "string" && !(Array.isArray(a) && a.length === 1)) return false;
    any = true;
  }
  return any;
}

const BAD_RPC_ERROR = /ranges? over|block range|too many blocks|not supported|limit exceeded|header not found|unknown block|missing trie|historical state|does not exist\/is not available|batch of more than/i;

/**
 * Sends to a lane's endpoint, cutting a JSON-RPC batch into pieces the node accepts (ep.maxBatch) and joining the
 * answers back into one array. The first piece that is not a plain 200 is returned as is, so the usual retry rules apply.
 */
async function sendOn(lane: Lane, init: RequestInit | undefined): Promise<Response> {
  const max = lane.ep.maxBatch;
  let calls: unknown[] | null = null;
  if (max > 0 && typeof init?.body === "string" && init.body.startsWith("[")) {
    try {
      const parsed = JSON.parse(init.body) as unknown;
      if (Array.isArray(parsed) && parsed.length > max) calls = parsed;
    } catch {
      calls = null;
    }
  }
  if (!calls) return fetch(lane.ep.url, init);
  const out: unknown[] = [];
  for (let i = 0; i < calls.length; i += max) {
    const res = await fetch(lane.ep.url, { ...init, body: JSON.stringify(calls.slice(i, i + max)) });
    if (res.status !== 200) return res;
    const text = await res.text();
    if (BAD_RPC_ERROR.test(text) && text.includes('"error"')) return new Response(text, { status: res.status, headers: res.headers });
    const part = JSON.parse(text) as unknown;
    out.push(...(Array.isArray(part) ? part : [part]));
  }
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
}

/** One eth_chainId per configured endpoint before it carries traffic. */
function verify(lane: Lane): Promise<boolean> {
  const ep = lane.ep;
  if (!ep.fromEnv) return Promise.resolve(true);
  ep.verified ??= fetch(ep.url, { method: "POST", headers: { "content-type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' })
    .then(async (r) => ((await r.json()) as { result?: string }).result === CHAIN_ID_HEX)
    .catch(() => null as unknown as boolean)
    .then((v) => {
      if (v === false) ep.ok = false; // wrong chain: never use it
      if (v === null) ep.verified = null; // unreachable now: ask again next time
      return v !== false;
    });
  return ep.verified;
}

const gone = (job: Job) => job.init?.signal?.aborted === true;
/** More than this many waiting means the chain is not answering: new work is refused instead of piling up in memory. */
const MAX_QUEUE = 4_000;

function pump(st: ReturnType<typeof state>) {
  if (st.timer) return;
  const now = Date.now();
  let wait = Infinity;
  for (let qi = 0; qi < st.queue.length; ) {
    const job = st.queue[qi]!;
    // the caller gave up while this waited: drop it. Sent anyway it would fail at once, and that failure says nothing
    // about the lane (2026-11-24: such failures rested every lane for 30 s, so the next ones expired in the queue too)
    if (gone(job)) {
      st.queue.splice(qi, 1);
      job.reject(job.init!.signal!.reason ?? new Error("rpc: the caller stopped waiting"));
      continue;
    }
    if (job.prio === 0 && bgInflight >= bgMax()) {
      wait = Math.min(wait, 25);
      qi++;
      continue;
    }
    const room = (l: Lane) => (job.wide ? l.ep.wideWindow : l.ep.logWindow);
    const up = st.lanes.filter((l) => l.ep.ok);
    const fits = up.filter((l) => job.range === 0 || job.range <= room(l));
    const most = fits.length ? 0 : Math.max(0, ...up.map(room));
    const pool = fits.length ? fits : up.filter((l) => room(l) === most);
    if (!pool.length) {
      // nothing can carry it (every endpoint disabled): finish now instead of waiting forever
      st.queue.splice(qi, 1);
      if (job.last) job.resolve(job.last);
      else job.reject(job.err ?? new Error("rpc: no usable endpoint"));
      continue;
    }
    const fresh = pool.filter((l) => !job.tried.has(l.id));
    const candidates = (fresh.length ? fresh : pool).filter((l) => l.inflight < concurrency());
    let best: Lane | null = null;
    for (const l of candidates) {
      const ready = Math.max(l.pausedUntil, l.last + spacing());
      if (ready > now) {
        wait = Math.min(wait, ready - now);
        continue;
      }
      if (!best || l.inflight < best.inflight || (l.inflight === best.inflight && l.last < best.last)) best = l;
    }
    if (!best) {
      if (!candidates.length) wait = Math.min(wait, 25); // all busy: try again shortly
      qi++;
      continue;
    }
    st.queue.splice(qi, 1);
    void dispatch(st, job, best);
  }
  if (st.queue.length && Number.isFinite(wait)) {
    st.timer = setTimeout(() => {
      st.timer = null;
      pump(st);
    }, Math.max(5, wait));
  }
}

async function dispatch(st: ReturnType<typeof state>, job: Job, lane: Lane) {
  lane.inflight++;
  if (job.prio === 0) bgInflight++;
  lane.last = Date.now();
  job.attempts++;
  let retry = false;
  try {
    if (!(await verify(lane))) {
      retry = true;
      return;
    }
    const res = await sendOn(lane, job.init);
    if (res.status === 429) {
      lane.strikes++;
      const ra = Number(res.headers.get("retry-after"));
      lane.pausedUntil = Date.now() + (Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(8000, 250 * 2 ** Math.min(lane.strikes, 5)));
      job.last = res;
      retry = true;
      await res.body?.cancel().catch(() => undefined);
      return;
    }
    if (res.status >= 500 || res.status === 403) {
      lane.fails++;
      job.tried.add(lane.id);
      job.last = res;
      retry = true;
      return;
    }
    const text = await res.text();
    if (BAD_RPC_ERROR.test(text) && text.includes('"error"')) {
      // a limit of the node itself: no other lane to the same endpoint will do better
      for (const l of st.lanes) if (l.ep === lane.ep) job.tried.add(l.id);
      job.last = new Response(text, { status: res.status, headers: res.headers });
      retry = true;
      return;
    }
    lane.fails = 0;
    lane.strikes = Math.max(0, lane.strikes - 1);
    job.resolve(new Response(text, { status: res.status, headers: res.headers }));
  } catch (e) {
    // the caller's own timeout or cancel is not a fault of the lane, and there is nobody left to answer
    if (gone(job)) {
      job.reject(e);
      return;
    }
    lane.fails++;
    job.tried.add(lane.id);
    job.err = e;
    retry = true;
  } finally {
    lane.inflight--;
    if (job.prio === 0) bgInflight--;
    if (lane.fails >= 5) {
      lane.pausedUntil = Date.now() + 30_000; // rest a failing lane
      lane.fails = 0;
    }
    if (retry) {
      if (job.attempts < MAX_ATTEMPTS) enqueue(st, job, true);
      else if (job.last) job.resolve(job.last);
      else job.reject(job.err ?? new Error("rpc: no lane answered"));
    }
    pump(st);
  }
}

/** Drop-in fetch for viem's http transport (`fetchFn`). The URL picks nothing: lanes decide. */
export const limitedFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const st = state(url);
  let range = 0;
  let wide = false;
  try {
    const parsed = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
    range = logRange(parsed);
    wide = range > 0 && oneContract(parsed);
  } catch {
    range = 0;
  }
  const prio = rpcPriority.getStore() ?? 1;
  if (st.queue.length >= MAX_QUEUE) return Promise.reject(new Error("rpc: too much work is waiting"));
  return new Promise<Response>((resolve, reject) => {
    enqueue(st, { prio, url, init, range, wide, tried: new Set(), attempts: 0, last: null, err: null, resolve, reject }, false);
    pump(st);
  });
};

/** Keeps the queue ordered by priority; a retry goes to the front of its own priority. */
function enqueue(st: ReturnType<typeof state>, job: Job, front: boolean) {
  const q = st.queue;
  let i = front ? q.findIndex((j) => j.prio <= job.prio) : q.findIndex((j) => j.prio < job.prio);
  if (i < 0) i = q.length;
  q.splice(i, 0, job);
}

/** Pool health, for the operator only (never served publicly). */
export function gateState() {
  const st = G.__corbelLanes;
  if (!st) return { lanes: 0, healthy: 0, paused: 0, inflight: 0, queued: 0, endpoints: [] as string[] };
  const now = Date.now();
  return {
    lanes: st.lanes.length,
    healthy: st.lanes.filter((l) => l.ep.ok && l.pausedUntil <= now).length,
    paused: st.lanes.filter((l) => l.pausedUntil > now).length,
    inflight: st.lanes.reduce((a, l) => a + l.inflight, 0),
    queued: st.queue.length,
    endpoints: [...new Set(st.lanes.filter((l) => l.ep.ok).map((l) => l.ep.host))],
  };
}
