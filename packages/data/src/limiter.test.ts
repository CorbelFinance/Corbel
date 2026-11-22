import { afterEach, describe, expect, it, vi } from "vitest";
import { gateState, limitedFetch } from "./limiter.ts";

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
  delete process.env.RPC_CONCURRENCY;
  delete process.env.RPC_SPACING_MS;
  delete process.env.RPC_LANES;
});

describe("limitedFetch", () => {
  it("waits out a 429 and retries instead of failing", async () => {
    process.env.RPC_SPACING_MS = "0";
    process.env.RPC_LANES = "1";
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return calls === 1 ? new Response("slow down", { status: 429, headers: { "retry-after": "0.05" } }) : new Response("ok", { status: 200 });
    }) as typeof fetch;
    const t = Date.now();
    const r = await limitedFetch("https://rpc.example/");
    expect(r.status).toBe(200);
    expect(calls).toBe(2);
    expect(Date.now() - t).toBeGreaterThanOrEqual(40);
  });

  it("never runs more requests at once than the cap", async () => {
    process.env.RPC_CONCURRENCY = "2";
    process.env.RPC_LANES = "1";
    process.env.RPC_SPACING_MS = "0";
    let live = 0;
    let peak = 0;
    globalThis.fetch = vi.fn(async () => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((res) => setTimeout(res, 15));
      live--;
      return new Response("ok");
    }) as typeof fetch;
    await Promise.all(Array.from({ length: 8 }, () => limitedFetch("https://rpc.example/")));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("gives up after a bounded number of 429s and returns the last answer", async () => {
    process.env.RPC_SPACING_MS = "0";
    globalThis.fetch = vi.fn(async () => new Response("", { status: 429, headers: { "retry-after": "0.001" } })) as typeof fetch;
    const r = await limitedFetch("https://rpc.example/");
    expect(r.status).toBe(429);
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(7);
  });
});

describe("RPC lanes", () => {
  const rpc = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
  afterEach(() => {
    delete process.env.RPC_URLS;
  });

  it("keeps wide eth_getLogs off an endpoint with a small window", async () => {
    process.env.RPC_SPACING_MS = "0";
    process.env.RPC_URLS = "https://wide.example,https://narrow.example#logs=10000";
    const hits: string[] = [];
    globalThis.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      const host = new URL(String(u)).host;
      if (String(init?.body).includes("eth_chainId")) return rpc("0x1237");
      hits.push(host);
      return rpc([]);
    }) as typeof fetch;
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ fromBlock: "0x1", toBlock: "0x4e20" }] }); // 20 000 blocks
    await Promise.all(Array.from({ length: 6 }, () => limitedFetch("https://wide.example", { method: "POST", body })));
    expect(hits.every((h) => h === "wide.example")).toBe(true);
  });

  it("moves a request to another endpoint when one fails, and drops a wrong chain", async () => {
    process.env.RPC_SPACING_MS = "0";
    process.env.RPC_URLS = "https://down.example,https://other-chain.example,https://up.example";
    globalThis.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      const host = new URL(String(u)).host;
      if (String(init?.body).includes("eth_chainId")) return rpc(host === "other-chain.example" ? "0x1" : "0x1237");
      if (host === "down.example") return new Response("bad gateway", { status: 502 });
      if (host === "other-chain.example") throw new Error("must never be used");
      return rpc("0x10");
    }) as typeof fetch;
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] });
    for (let i = 0; i < 4; i++) {
      const r = await limitedFetch("https://down.example", { method: "POST", body });
      expect(((await r.json()) as { result: string }).result).toBe("0x10");
    }
  });
});

describe("batch limits", () => {
  afterEach(() => {
    delete process.env.RPC_URLS;
  });

  it("cuts a batch into pieces the node accepts and joins the answers in order", async () => {
    process.env.RPC_SPACING_MS = "0";
    process.env.RPC_URLS = "https://small.example#batch=3";
    const sizes: number[] = [];
    globalThis.fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { id: number }[] | { id: number };
      if (!Array.isArray(body)) return new Response('{"jsonrpc":"2.0","id":1,"result":"0x1237"}');
      sizes.push(body.length);
      return new Response(JSON.stringify(body.map((c) => ({ jsonrpc: "2.0", id: c.id, result: `0x${c.id}` }))));
    }) as typeof fetch;
    const calls = Array.from({ length: 8 }, (_, i) => ({ jsonrpc: "2.0", id: i + 1, method: "eth_blockNumber", params: [] }));
    const r = await limitedFetch("https://small.example", { method: "POST", body: JSON.stringify(calls) });
    const out = (await r.json()) as { id: number }[];
    expect(sizes).toEqual([3, 3, 2]);
    expect(out.map((x) => x.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(gateState().endpoints).toEqual(["small.example"]);
  });
});
