import { afterEach, describe, expect, it, vi } from "vitest";
import { privateAddress, publicUrl, safeFetch } from "../lib/safeFetch";

describe("publicUrl", () => {
  it("accepts public https hosts", () => {
    expect(publicUrl("https://example.com/a.png")?.hostname).toBe("example.com");
    expect(publicUrl("https://1.1.1.1/x")).not.toBeNull();
  });
  it("refuses everything that could reach this server or its network", () => {
    for (const u of [
      "http://example.com/",
      "https://localhost/",
      "https://127.0.0.1/",
      "https://10.0.0.5/",
      "https://169.254.169.254/latest/meta-data",
      "https://192.168.1.1/",
      "https://[::1]/",
      "https://[::ffff:127.0.0.1]/",
      "https://example.com:8080/",
      "https://user:pw@example.com/",
      "https://panel.internal/",
      "https://intranet/",
      "ftp://example.com/",
      "not a url",
    ])
      expect(publicUrl(u), u).toBeNull();
  });
  it("knows the private ranges", () => {
    expect(privateAddress("100.64.0.1")).toBe(true);
    expect(privateAddress("172.20.0.1")).toBe(true);
    expect(privateAddress("172.32.0.1")).toBe(false);
    expect(privateAddress("8.8.8.8")).toBe(false);
  });
});

describe("safeFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses a redirect to a private address and never calls it", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (u: URL) => {
      calls.push(String(u));
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1:8080/admin" } });
    });
    expect(await safeFetch("https://example.com/logo.png")).toBeNull();
    expect(calls).toEqual(["https://example.com/logo.png"]);
  });

  it("follows a public redirect and cuts a body over the cap while it streams", async () => {
    vi.stubGlobal("fetch", async (u: URL) =>
      String(u).includes("/a") ? new Response(null, { status: 301, headers: { location: "/b" } }) : new Response(new Uint8Array(5000), { status: 200, headers: { "content-type": "image/png" } }),
    );
    const r = await safeFetch("https://example.com/a", { maxBytes: 1000 });
    expect(r?.url).toBe("https://example.com/b");
    expect(r?.cut).toBe(true);
    expect(r?.body.length).toBe(1000);
  });

  it("refuses a declared size over the cap without reading it", async () => {
    vi.stubGlobal("fetch", async () => new Response("x", { status: 200, headers: { "content-length": "999999999" } }));
    const r = await safeFetch("https://example.com/big", { maxBytes: 1000 });
    expect(r?.cut).toBe(true);
    expect(r?.body.length).toBe(0);
  });
});
