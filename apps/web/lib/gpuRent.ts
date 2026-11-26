/**
 * Free GPU time by tier (Plus, Full, Core). The machine comes from lib/gpuProvider (GPU_ADAPTER); the holder gets a link
 * (GPU_GATE_URL/r/<token>/) and a password.
 *
 * Rules (GPU_FREE in config): from the Plus tier, one machine per wallet, the tier's gpuMinutes a day per wallet, all
 * holders together at most GPU_FREE.budgetUsdDay a day (counted at the hour price of each machine), GPU_FREE.maxAtOnce
 * machines at once. Every machine has an end time; a sweep every 30 s stops what is due, and at start-up it stops any of
 * our machines the record does not know (a crash can never leave one running).
 */
import { createHash, randomBytes } from "node:crypto";
import { GPU_FREE, GPU_PAID } from "@corbel/config";
import { getClient } from "@corbel/data/chain";
import { gpuProvider, type GpuMachine } from "./gpuProvider";
import { balance as creditBalance, charge, creditsOpen, settle } from "./credits";
import { store } from "./store";
import { tierOf } from "./tiers";
import { markupOf } from "./markup";

/** Free GPU minutes a day for this wallet, by its tier (Plus 10, Full 30, Core 60; none below). */
export const freeMinutes = (owner: string) => tierOf(owner)?.gpuMinutes ?? 0;

const PREFIX = "corbel-gpu-";
/** The machine image (server env only: it would name the provider). Without it no machine starts. */
const IMAGE = () => process.env.GPU_IMAGE ?? "";

let migrated = false;
const db = () => {
  const d = openDb();
  // the app column came after the first rentals: added once, an older row is a notebook rental
  if (d && !migrated) {
    migrated = true;
    for (const sql of [
      "ALTER TABLE rentals ADD COLUMN app TEXT NOT NULL DEFAULT 'code'",
      "ALTER TABLE bookings ADD COLUMN app TEXT NOT NULL DEFAULT 'code'",
      // paid rentals: what was reserved from Credits at the start; the unused part goes back when it stops
      "ALTER TABLE rentals ADD COLUMN paid INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE rentals ADD COLUMN reserve REAL NOT NULL DEFAULT 0",
    ])
      try {
        d.exec(sql);
      } catch {
        /* already there */
      }
  }
  return d;
};
const openDb = () =>
  store(
    "gpu",
    `CREATE TABLE IF NOT EXISTS rentals (id TEXT PRIMARY KEY, owner TEXT NOT NULL, gpu TEXT NOT NULL, pod TEXT, hourly REAL NOT NULL,
       started INTEGER NOT NULL, ends INTEGER NOT NULL, stopped INTEGER, status TEXT NOT NULL, token TEXT NOT NULL, pass TEXT NOT NULL, day TEXT NOT NULL);
     CREATE INDEX IF NOT EXISTS rentals_owner ON rentals (owner, day);
     CREATE TABLE IF NOT EXISTS rental_events (rental TEXT NOT NULL, at INTEGER NOT NULL, step TEXT NOT NULL, block INTEGER);
     CREATE INDEX IF NOT EXISTS rental_events_r ON rental_events (rental, at);
     CREATE TABLE IF NOT EXISTS bookings (owner TEXT PRIMARY KEY, gpu TEXT NOT NULL, at INTEGER NOT NULL, made INTEGER NOT NULL, status TEXT NOT NULL, note TEXT);`,
  );
const appOf = (id: string | undefined) => GPU_FREE.apps.find((a) => a.id === id) ?? GPU_FREE.apps[0]!;

// ---------------------------------------------------------------- the rental's own log (a receipt with chain blocks)

/** One step of a rental, stamped with the chain's latest block so the receipt can be checked against the chain. */
async function note(rental: string, step: string) {
  let block: number | null = null;
  try {
    const c = getClient(process.env.RPC_URL);
    if (c) block = Number(await c.getBlockNumber());
  } catch {
    /* the step is kept without a block */
  }
  db()?.prepare("INSERT INTO rental_events (rental, at, step, block) VALUES (?, ?, ?, ?)").run(rental, Date.now(), step, block);
}
const eventsOf = (rental: string) => (db()?.prepare("SELECT at, step, block FROM rental_events WHERE rental = ? ORDER BY at").all(rental) ?? []) as { at: number; step: string; block: number | null }[];

type Row = { id: string; owner: string; gpu: string; app?: string; paid?: number; reserve?: number; pod: string | null; hourly: number; started: number; ends: number; stopped: number | null; status: string; token: string; pass: string; day: string };
const today = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
/** Set up on this server: a provider module and a machine image. */
const configured = () => !!(process.env.GPU_ADAPTER && process.env.GPU_IMAGE);
/** GPU_PAUSED=1: nothing new starts and the sweep stops what runs (the switch for abuse or a provider problem). */
const paused = () => process.env.GPU_PAUSED === "1";
export const gpuOpen = () => configured() && !paused();
/** Wallets that broke the rules (GPU_BLOCKED, comma separated): they get no more machines. */
const blocked = (o: string) =>
  (process.env.GPU_BLOCKED ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim())
    .includes(o);

async function provider() {
  const p = await gpuProvider();
  if (!p) throw new Error("no provider");
  return p;
}

/** The rules every holder accepts before a machine starts; each start records them on its receipt. */
export const GPU_RULES = [
  "No mining, no attacks, no scanning or spam, nothing illegal.",
  "One machine at a time; it stops itself when the time is up.",
  "Every start is recorded against your wallet. A machine that breaks these rules is stopped and the wallet loses free GPU time.",
] as const;

// ---------------------------------------------------------------- the record

const usedMinutes = (owner: string, day = today()) =>
  ((db()?.prepare("SELECT COALESCE(SUM((COALESCE(stopped, MIN(ends, ?)) - started) / 60000.0), 0) AS m FROM rentals WHERE owner = ? AND day = ? AND paid = 0").get(Date.now(), owner, day) as { m: number } | undefined)?.m ?? 0);
const spentToday = () =>
  ((db()?.prepare("SELECT COALESCE(SUM(hourly * (COALESCE(stopped, ends) - started) / 3600000.0), 0) AS s FROM rentals WHERE day = ? AND status != 'failed' AND paid = 0").get(today()) as { s: number } | undefined)?.s ?? 0);
const running = () => (db()?.prepare("SELECT * FROM rentals WHERE stopped IS NULL AND status != 'failed'").all() ?? []) as Row[];
const startsToday = (owner: string) =>
  ((db()?.prepare("SELECT COUNT(*) AS n FROM rentals WHERE owner = ? AND day = ? AND status != 'failed' AND paid = 0").get(owner, today()) as { n: number } | undefined)?.n ?? 0);
const activeOf = (owner: string) => (db()?.prepare("SELECT * FROM rentals WHERE owner = ? AND stopped IS NULL AND status != 'failed' ORDER BY started DESC LIMIT 1").get(owner) as Row | undefined) ?? null;

const gate = (token: string) => (process.env.GPU_GATE_URL ? `${process.env.GPU_GATE_URL.replace(/\/$/, "")}/r/${token}/` : null);

export type GpuState = {
  open: boolean;
  choices: { id: string; label: string; vram: number; line: string }[];
  apps: { id: string; label: string; app: string; line: string }[];
  soon: { id: string; label: string; vram: number; line: string }[];
  minutesPerDay: number;
  minutesLeft: number | null;
  budgetLeft: number;
  busy: boolean;
  active: { id: string; gpu: string; app: string; started: number; ends: number; status: string; access: string | null; password: string; paid: boolean } | null;
  /** the wallet's latest rental today with its steps (running or finished), for the receipt */
  last: { id: string; gpu: string; started: number; stopped: number | null; status: string; steps: { at: number; step: string; block: number | null }[] } | null;
  booking: { gpu: string; at: number; status: string; note: string | null } | null;
  /** paid time from Credits: open or not, the wallet's balance, the times to pick and the price per hour of each GPU */
  paid: { open: boolean; balance: number | null; minutes: readonly number[]; hourly: Record<string, number> };
};

export function gpuState(owner: string | null): GpuState {
  const o = owner?.toLowerCase() ?? null;
  const a = o ? activeOf(o) : null;
  return {
    open: gpuOpen(),
    choices: GPU_FREE.choices.map((c) => ({ id: c.id, label: c.label, vram: c.vram, line: c.line })),
    apps: GPU_FREE.apps.map((a) => ({ ...a })),
    soon: GPU_FREE.soon.map((c) => ({ ...c })),
    minutesPerDay: o ? freeMinutes(o) : GPU_FREE.minutesPerDay,
    minutesLeft: o ? Math.max(0, Math.floor(freeMinutes(o) - usedMinutes(o))) : null,
    budgetLeft: Math.max(0, Math.round((GPU_FREE.budgetUsdDay - spentToday()) * 100) / 100),
    busy: running().filter((r) => !r.paid).length >= GPU_FREE.maxAtOnce,
    active: a ? { id: a.id, gpu: GPU_FREE.choices.find((c) => c.id === a.gpu)?.label ?? a.gpu, app: appOf(a.app).label, started: a.started, ends: a.ends, status: a.status, access: a.status === "running" ? gate(a.token) : null, password: a.pass, paid: !!a.paid } : null,
    last: o ? lastOf(o) : null,
    booking: o ? bookingOf(o) : null,
    paid: {
      open: gpuOpen() && creditsOpen(),
      balance: o && creditsOpen() ? creditBalance(o).balance : null,
      minutes: GPU_PAID.minutes,
      hourly: Object.fromEntries(GPU_FREE.choices.map((c) => [c.id, Math.round(c.maxHourly * (1 + markupOf(o)) * 100) / 100])),
    },
  };
}

const label = (gpu: string) => GPU_FREE.choices.find((c) => c.id === gpu)?.label ?? gpu;
function lastOf(owner: string): GpuState["last"] {
  const r = db()?.prepare("SELECT * FROM rentals WHERE owner = ? ORDER BY started DESC LIMIT 1").get(owner) as Row | undefined;
  if (!r || Date.now() - r.started > 86_400_000) return null;
  return { id: rentalTag(r.id), gpu: label(r.gpu), started: r.started, stopped: r.stopped, status: r.status, steps: eventsOf(r.id) };
}
function bookingOf(owner: string): GpuState["booking"] {
  const b = db()?.prepare("SELECT gpu, at, status, note FROM bookings WHERE owner = ?").get(owner) as { gpu: string; at: number; status: string; note: string | null } | undefined;
  if (!b || (b.status !== "booked" && Date.now() - b.at > 6 * 3600_000)) return null;
  return { gpu: label(b.gpu), at: b.at, status: b.status, note: b.note };
}

/** What anyone may see: how busy the free machines are right now and today. No wallets, no provider. */
export function gpuPublic() {
  const d = db();
  const day = today();
  const runningNow = running();
  const todayRows = (d?.prepare("SELECT started, stopped, ends, status FROM rentals WHERE day = ?").all(day) ?? []) as { started: number; stopped: number | null; ends: number; status: string }[];
  const served = todayRows.filter((r) => r.status !== "failed").reduce((s, r) => s + Math.max(0, (Math.min(r.stopped ?? Date.now(), r.ends) - r.started) / 60_000), 0);
  const booked = ((d?.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status = 'booked'").get() as { n: number } | undefined)?.n ?? 0);
  return {
    open: gpuOpen(),
    at: Date.now(),
    running: runningNow.filter((r) => r.status === "running").length,
    starting: runningNow.filter((r) => r.status === "starting").length,
    maxAtOnce: GPU_FREE.maxAtOnce,
    rentalsToday: todayRows.filter((r) => r.status !== "failed").length,
    minutesToday: Math.round(served),
    budgetUsedPct: Math.min(100, Math.round((spentToday() / GPU_FREE.budgetUsdDay) * 100)),
    booked,
    minutesPerDay: GPU_FREE.minutesPerDay,
    choices: GPU_FREE.choices.map((c) => ({ id: c.id, label: c.label, vram: c.vram, line: c.line, inUse: runningNow.filter((r) => r.gpu === c.id).length })),
    soon: GPU_FREE.soon.map((c) => ({ ...c })),
  };
}

// ---------------------------------------------------------------- bookings: the machine starts itself at the hour picked

/** Books one start for this wallet within the next 24 h. The holder level is checked again when it starts. */
export function bookGpu(owner: string, gpuId: string, at: number, agreed = false, app = "code"): string | null {
  const o = owner.toLowerCase();
  if (!gpuOpen()) return "GPUs are not open right now.";
  if (!agreed) return "Accept the rules first.";
  if (blocked(o)) return "This wallet can no longer use free GPU time.";
  if (!GPU_FREE.choices.some((c) => c.id === gpuId)) return "Pick one of the GPUs listed.";
  const now = Date.now();
  if (!Number.isFinite(at) || at < now + 60_000 || at > now + 24 * 3600_000) return "Pick a time from a minute to 24 hours from now.";
  if (!GPU_FREE.apps.some((a) => a.id === app)) return "Pick one of the programs listed.";
  db()?.prepare("INSERT OR REPLACE INTO bookings (owner, gpu, at, made, status, note, app) VALUES (?, ?, ?, ?, 'booked', NULL, ?)").run(o, gpuId, Math.floor(at / 60_000) * 60_000, now, app);
  return null;
}
export function cancelBooking(owner: string): string | null {
  const r = db()?.prepare("DELETE FROM bookings WHERE owner = ? AND status = 'booked'").run(owner.toLowerCase());
  return r && Number(r.changes) > 0 ? null : "No booking to cancel.";
}
let isFullHolder: (owner: string) => boolean = () => false;
/** The route hands in its holder check so this module does not depend on the token reader. */
export function setHolderCheck(f: (owner: string) => boolean) {
  isFullHolder = f;
}
async function startBookings() {
  const due = (db()?.prepare("SELECT owner, gpu, app FROM bookings WHERE status = 'booked' AND at <= ?").all(Date.now()) ?? []) as { owner: string; gpu: string; app: string }[];
  for (const b of due) {
    // the rules were accepted when the start was booked
    const e = !isFullHolder(b.owner) ? "Not a Full holder at the booked time." : await startGpu(b.owner, b.gpu, true, b.app);
    db()?.prepare("UPDATE bookings SET status = ?, note = ? WHERE owner = ?").run(e ? "missed" : "started", e, b.owner);
  }
}

/** Starts a machine for this wallet. Returns an error to show, or null. The caller checks the holder level. */
export async function startGpu(owner: string, gpuId: string, agreed = false, appId = "code", paid: { minutes: number } | null = null): Promise<string | null> {
  const o = owner.toLowerCase();
  if (!gpuOpen()) return "GPUs are not open right now.";
  if (!agreed) return "Accept the rules first.";
  if (blocked(o)) return "This wallet can no longer use free GPU time.";
  const c = GPU_FREE.choices.find((x) => x.id === gpuId);
  if (!c) return "Pick one of the GPUs listed.";
  const app = GPU_FREE.apps.find((x) => x.id === appId);
  if (!app) return "Pick one of the programs listed.";
  if (activeOf(o)) return "You already have a machine running. Stop it first.";
  let left: number;
  let reserve = 0;
  if (paid) {
    // paid from Credits: the chosen time at the most this GPU may cost, plus the markup, is reserved now
    if (!creditsOpen()) return "Credits are not open right now.";
    if (!(GPU_PAID.minutes as readonly number[]).includes(paid.minutes)) return "Pick one of the times listed.";
    if (running().filter((r) => r.paid).length >= GPU_PAID.maxAtOnce) return "All paid machines are in use. Try again in a few minutes.";
    left = paid.minutes;
    reserve = Math.round(c.maxHourly * (1 + markupOf(o)) * (left / 60) * 100) / 100;
    if (creditBalance(o).spendable < reserve) return `This needs $${reserve.toFixed(2)} of Credits. Top up first.`;
  } else {
    if (startsToday(o) >= GPU_FREE.startsPerDay) return `That was today's ${GPU_FREE.startsPerDay} starts. They come back at 00:00 UTC.`;
    const mine = freeMinutes(o);
    if (!mine) return "Free GPU time opens at the Plus tier.";
    left = mine - usedMinutes(o);
    if (left < 5) return `That was today's ${mine} minutes. They come back at 00:00 UTC.`;
    if (running().filter((r) => !r.paid).length >= GPU_FREE.maxAtOnce) return "All free machines are in use. Try again in a few minutes.";
    // the whole remaining time is reserved against the day's budget before anything starts
    const cost = (c.maxHourly * left) / 60;
    if (spentToday() + cost > GPU_FREE.budgetUsdDay) return "Today's free GPU time is used up. It comes back at 00:00 UTC.";
  }
  const id = randomBytes(8).toString("hex");
  const rref = `reserve ${id.slice(0, 8)}`, bref = `back ${id.slice(0, 8)}`;
  if (paid) {
    // take the reserve first and check what was really taken: another spend may have come in since the balance check
    const got = charge(o, "gpu", reserve, { ref: rref });
    if (got + 1e-9 < reserve) {
      settle(o, rref, 0, bref);
      return `This needs $${reserve.toFixed(2)} of Credits. Top up first.`;
    }
  }
  const token = randomBytes(18).toString("base64url");
  const pass = randomBytes(12).toString("base64url");
  const now = Date.now();
  const ends = now + Math.floor(left) * 60_000;
  const d = db();
  if (!d) return "GPUs are not open right now.";
  d.prepare("INSERT INTO rentals (id, owner, gpu, pod, hourly, started, ends, stopped, status, token, pass, day, app, paid, reserve) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, 'starting', ?, ?, ?, ?, ?, ?)").run(id, o, c.id, c.maxHourly, now, ends, token, pass, today(now), app.id, paid ? 1 : 0, reserve);
  await note(id, `Requested: ${app.label} on the ${c.label}, ${Math.floor(left)} minutes${paid ? `, $${reserve.toFixed(2)} reserved from Credits` : ""}`);
  await note(id, "Rules accepted: no mining, no attacks, nothing illegal");
  const name = `${PREFIX}${id}`;
  try {
    const p = await provider();
    const pod = await p.create({ gpu: c.gpu, name, password: pass, image: IMAGE(), diskGb: GPU_FREE.diskGb, app: app.id });
    if (!pod?.id) throw new Error("no machine");
    if (pod.hourly && pod.hourly > c.maxHourly) {
      await p.stop(pod.id).catch(() => null);
      d.prepare("UPDATE rentals SET status = 'failed', stopped = ? WHERE id = ?").run(Date.now(), id);
      if (paid) settle(o, rref, 0, bref);
      await note(id, "Refused: the machine cost more than the limit; nothing was charged");
      return "That GPU costs more than usual right now. Try the other one.";
    }
    d.prepare("UPDATE rentals SET pod = ?, hourly = ? WHERE id = ?").run(pod.id, pod.hourly ?? c.maxHourly, id);
    // stopped (by the holder, the clock or a pause) while the machine was being made: it goes at once, never left running
    const after = d.prepare("SELECT stopped FROM rentals WHERE id = ?").get(id) as { stopped: number | null } | undefined;
    if (after?.stopped != null) {
      await p.stop(pod.id).catch(() => null);
      return null;
    }
    await note(id, "Machine assigned, starting up");
    return null;
  } catch {
    d.prepare("UPDATE rentals SET status = 'failed', stopped = ? WHERE id = ?").run(Date.now(), id);
    if (paid) settle(o, rref, 0, bref);
    await note(id, "No machine free of that kind; the minutes were not used");
    // the provider may have made it although its answer never came back: anything under this name goes
    await stopByName(name);
    return "No machine of that kind is free right now. Try the other one or again in a few minutes.";
  }
}

/** Stops this wallet's machine now. */
export async function stopGpu(owner: string): Promise<string | null> {
  const a = activeOf(owner.toLowerCase());
  if (!a) return "No machine is running.";
  await halt(a, "Stopped by you");
  return null;
}

async function stopByName(name: string) {
  try {
    const p = await provider();
    for (const m of await p.list()) if (m.name === name) await p.stop(m.id).catch(() => null);
  } catch {
    /* the regular sweep tries again */
  }
}

async function halt(r: Row, why: string) {
  const pod = r.pod;
  if (pod) await provider().then((p) => p.stop(pod)).catch(() => null);
  const at = Math.min(Date.now(), r.ends);
  const res = db()?.prepare("UPDATE rentals SET stopped = ?, status = 'stopped' WHERE id = ? AND stopped IS NULL").run(at, r.id);
  if (res && Number(res.changes) > 0) {
    await note(r.id, `${why}; the machine and its disk are gone`);
    // paid: the time from ready to stop at the machine's hourly price plus the markup; the rest of the reserve goes back
    if (r.paid && r.reserve) {
      const used = r.status === "running" ? Math.max(0, (at - r.started) / 3_600_000) * r.hourly * (1 + markupOf(r.owner)) : 0;
      const cost = Math.min(r.reserve, Math.round(used * 100) / 100);
      settle(r.owner, `reserve ${r.id.slice(0, 8)}`, cost, `back ${r.id.slice(0, 8)}`);
      await note(r.id, `Charged $${cost.toFixed(2)} for the time used; $${(r.reserve - cost).toFixed(2)} back to Credits`);
    }
  }
}

/** For the gate: the machine a link token opens, while it runs. */
export function podForToken(token: string): { pod: string; ends: number } | null {
  const r = db()?.prepare("SELECT pod, ends FROM rentals WHERE token = ? AND stopped IS NULL AND status = 'running'").get(token) as { pod: string | null; ends: number } | undefined;
  return r?.pod && r.ends > Date.now() ? { pod: r.pod, ends: r.ends } : null;
}

// ---------------------------------------------------------------- the sweep

const S = globalThis as unknown as {
  __corbelGpu?: { timer: ReturnType<typeof setInterval> | null; booted: boolean; busy: boolean; soon: ReturnType<typeof setTimeout> | null; orphans: number };
};
const st = (S.__corbelGpu ??= { timer: null, booted: false, busy: false, soon: null, orphans: 0 });

/**
 * Any machine of ours (by name) that the record does not hold as live is stopped: a crash, a lost answer or a stop
 * that raced a start can never leave one running and billing. Runs at start-up and then every two minutes.
 */
async function stopOrphans() {
  const live = new Set(running().map((r) => `${PREFIX}${r.id}`));
  const p = await provider().catch(() => null);
  if (!p) return;
  const list: GpuMachine[] = await p.list().catch(() => []);
  for (const m of list) if (m.name?.startsWith(PREFIX) && !live.has(m.name)) await p.stop(m.id).catch(() => null);
}

export async function sweepGpus() {
  if (st.busy || !configured()) return;
  st.busy = true;
  try {
    const now = Date.now();
    if (paused()) for (const r of running()) await halt(r, "Paused by Corbel");
    for (const r of running()) {
      if (r.ends <= now) {
        await halt(r, "Time up");
        continue;
      }
      if (r.status === "starting" && r.pod) {
        const prov = await provider().catch(() => null);
        const p = prov ? await prov.get(r.pod).catch(() => null) : null;
        if (prov && p?.running && (await prov.ready(r.pod, r.app ?? "code", r.pass).catch(() => false))) {
          // the holder's minutes start now: the start-up (the program's download) is on us, not on their time
          const at = Date.now();
          db()?.prepare("UPDATE rentals SET status = 'running', started = ?, ends = ? WHERE id = ?").run(at, at + (r.ends - r.started), r.id);
          await note(r.id, "Ready: the link opens it, signed in; your minutes start now");
        } else if (now - r.started > 15 * 60_000) await halt({ ...r, status: "failed" }, "Did not start within 15 minutes");
      }
    }
    if (!paused()) await startBookings();
    if (!st.booted || now - st.orphans > 2 * 60_000) {
      st.booted = true;
      st.orphans = now;
      await stopOrphans();
    }
  } finally {
    st.busy = false;
  }
  // while a machine is starting, look again in 5 s rather than 30, so the link shows soon after the notebook answers
  if (!st.soon && running().some((r) => r.status === "starting")) {
    st.soon = setTimeout(() => {
      st.soon = null;
      void sweepGpus();
    }, 5_000);
    st.soon.unref?.();
  }
}

export function startGpuSweep() {
  if (st.timer || !configured()) return;
  st.timer = setInterval(() => void sweepGpus(), 30_000);
  st.timer.unref?.();
  void sweepGpus();
}

/** A short public id for logs: never the token or the password. */
export const rentalTag = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 8);
