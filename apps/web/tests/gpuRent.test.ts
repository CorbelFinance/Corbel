import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// the fake provider (tests/fixtures/gpuFake.mjs) keeps its state here; the test drives it
type M = { id: string; name: string; running: boolean; hourly: number };
const F = ((globalThis as unknown as { __gpuFake?: unknown }).__gpuFake ??= {
  machines: new Map<string, M>(),
  stopped: [] as string[],
  price: 0.59,
  seq: 0,
  notebookUp: false,
  failCreate: null as string | null,
  hold: null as Promise<void> | null,
}) as { machines: Map<string, M>; stopped: string[]; price: number; seq: number; notebookUp: boolean; failCreate: string | null; hold: Promise<void> | null };

let G: typeof import("../lib/gpuRent");
beforeAll(async () => {
  process.env.CORBEL_DB = join(mkdtempSync(join(tmpdir(), "gpu-")), "index.db");
  process.env.GPU_ADAPTER = resolve(__dirname, "fixtures/gpuFake.mjs");
  process.env.GPU_IMAGE = "test/image";
  process.env.GPU_GATE_URL = "https://gate.test";
  process.env.CREDITS_TREASURY = "0x00000000000000000000000000000000000000ee";
  G = await import("../lib/gpuRent");
});
beforeEach(() => {
  F.price = 0.59;
  F.failCreate = null;
  F.hold = null;
  delete process.env.GPU_PAUSED;
  delete process.env.GPU_BLOCKED;
});

const A = "0x00000000000000000000000000000000000000a1";
const ours = () => [...F.machines.values()].filter((m) => m.name.startsWith("corbel-gpu-"));

describe("free GPU time", () => {
  it("stops a machine of ours the record does not know, on the first sweep", async () => {
    F.machines.set("orphan", { id: "orphan", name: "corbel-gpu-lost", running: true, hourly: 0.5 });
    F.machines.set("other", { id: "other", name: "someone-else", running: true, hourly: 0.5 });
    await G.sweepGpus();
    expect(F.stopped).toContain("orphan");
    expect(F.stopped).not.toContain("other");
  });

  it("starts nothing until the rules are accepted", async () => {
    expect(await G.startGpu(A, "a40")).toMatch(/Accept the rules/);
    expect(G.bookGpu(A, "a40", Date.now() + 3600_000)).toMatch(/Accept the rules/);
    expect(ours()).toHaveLength(0);
  });

  it("starts a machine, shows the gate link only once the notebook answers, and refuses a second one", async () => {
    expect(await G.startGpu(A, "a40", true)).toBeNull();
    let s = G.gpuState(A);
    expect(s.active?.status).toBe("starting");
    expect(s.active?.access).toBeNull();
    expect(s.active?.password.length).toBeGreaterThan(8);
    expect(s.last?.steps.some((x) => x.step.startsWith("Rules accepted"))).toBe(true);
    const m = ours()[0]!;
    m.running = true;
    // the provider says running but the notebook does not answer yet: no link
    F.notebookUp = false;
    await G.sweepGpus();
    expect(G.gpuState(A).active?.status).toBe("starting");
    expect(G.gpuState(A).active?.access).toBeNull();
    F.notebookUp = true;
    await G.sweepGpus();
    s = G.gpuState(A);
    expect(s.active?.status).toBe("running");
    expect(s.active?.access).toMatch(/^https:\/\/gate\.test\/r\/[\w-]+\/$/);
    expect(JSON.stringify(s)).not.toMatch(/\bm\d+\b/);
    const token = s.active!.access!.split("/r/")[1]!.replace("/", "");
    expect(G.podForToken(token)?.pod).toBe(m.id);
    expect(await G.startGpu(A, "4090", true)).toMatch(/already have a machine/);
  });

  it("stops on request and the link stops working", async () => {
    const token = G.gpuState(A).active!.access!.split("/r/")[1]!.replace("/", "");
    expect(await G.stopGpu(A)).toBeNull();
    expect(G.gpuState(A).active).toBeNull();
    expect(G.podForToken(token)).toBeNull();
    expect(ours()).toHaveLength(0);
  });

  it("a stop that comes while the machine is still being made never leaves it running", async () => {
    const B = "0x00000000000000000000000000000000000000b1";
    let release!: () => void;
    F.hold = new Promise<void>((r) => (release = r));
    const starting = G.startGpu(B, "a40", true);
    await new Promise((r) => setTimeout(r, 20));
    expect(await G.stopGpu(B)).toBeNull();
    release();
    expect(await starting).toBeNull();
    expect(ours()).toHaveLength(0);
  });

  it("a machine made although the answer was lost is found and stopped", async () => {
    const C = "0x00000000000000000000000000000000000000c1";
    F.failCreate = "lost-answer";
    expect(await G.startGpu(C, "a40", true)).toMatch(/No machine of that kind/);
    expect(ours()).toHaveLength(0);
  });

  it("refuses a machine that quotes more than the cap, and stops it", async () => {
    F.price = 2.5;
    const D = "0x00000000000000000000000000000000000000d2";
    expect(await G.startGpu(D, "a40", true)).toMatch(/costs more/);
    expect(G.gpuState(D).active).toBeNull();
    expect(ours()).toHaveLength(0);
  });

  it("limits starts a day, refuses blocked wallets, and the pause stops what runs", async () => {
    const E = "0x00000000000000000000000000000000000000e1";
    process.env.GPU_BLOCKED = `0xabc,${E.toUpperCase()}`;
    expect(await G.startGpu(E, "a40", true)).toMatch(/can no longer use/);
    delete process.env.GPU_BLOCKED;
    const H = "0x00000000000000000000000000000000000000f1";
    for (let i = 0; i < 3; i++) {
      expect(await G.startGpu(H, "a40", true)).toBeNull();
      expect(await G.stopGpu(H)).toBeNull();
    }
    expect(await G.startGpu(H, "a40", true)).toMatch(/starts/);
    expect(await G.startGpu(E, "a40", true)).toBeNull();
    process.env.GPU_PAUSED = "1";
    expect(G.gpuOpen()).toBe(false);
    await G.sweepGpus();
    expect(G.gpuState(E).active).toBeNull();
    expect(ours()).toHaveLength(0);
  });

  it("paid time: reserves from Credits, charges only the minutes used, gives back the rest; a failed start gives all back", async () => {
    const P = "0x00000000000000000000000000000000000000d9";
    const Cr = await import("../lib/credits");
    Cr.balance(P);
    const { store } = await import("../lib/store");
    store("credits", "")!.prepare("INSERT INTO deposits (tx, wallet, usd, block, at) VALUES (?, ?, ?, ?, ?)").run("tx-paid", P, 5, 1, Date.now());
    expect(await G.startGpu(P, "a40", true, "code", { minutes: 600 })).toMatch(/times listed/);
    expect(await G.startGpu(P, "a40", true, "code", { minutes: 60 })).toBeNull();
    const reserved = 5 - Cr.balance(P).balance;
    expect(reserved).toBeCloseTo(0.77, 2); // 0.70/h cap + 10%
    const m = ours().find((x) => !F.stopped.includes(x.id))!;
    m.running = true;
    F.notebookUp = true;
    await G.sweepGpus();
    expect(G.gpuState(P).active?.status).toBe("running");
    expect(await G.stopGpu(P)).toBeNull();
    // stopped within seconds of ready: next to nothing charged, the reserve is back
    expect(Cr.balance(P).balance).toBeGreaterThan(4.99);
    F.failCreate = "lost-answer";
    expect(await G.startGpu(P, "a40", true, "code", { minutes: 60 })).toMatch(/No machine/);
    expect(Cr.balance(P).balance).toBeGreaterThan(4.99);
  });

  it("paid time needs the balance first", async () => {
    const Q = "0x00000000000000000000000000000000000000da";
    expect(await G.startGpu(Q, "a40", true, "code", { minutes: 60 })).toMatch(/Top up/);
  });

  it("refuses unknown GPUs and keeps the day's budget", async () => {
    expect(await G.startGpu(A, "h100", true)).toMatch(/Pick one/);
    expect(G.gpuState(null).budgetLeft).toBeLessThanOrEqual(3);
  });
});
