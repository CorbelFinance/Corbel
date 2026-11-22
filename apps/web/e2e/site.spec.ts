import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WIDTHS = [390, 768, 1280, 1920, 2535];
const PAGES = [
  ["home", "/"],
  ["layer-trust", "/layers/trust"],
  ["layer-stocks", "/layers/stocks"],
  ["app-trust-check", "/app/trust/check"],
  ["app-trust-radar", "/app/trust/radar"],
  ["app-trust-api", "/app/trust/api"],
  ["app-account-dashboard", "/app/account/dashboard"],
  ["app-trade-quote", "/app/trade/quote"],
  ["app-launch-analytics", "/app/trust/launches"],
  ["app-portfolio", "/app/portfolio"],
  ["docs", "/docs/overview"],
  ["roadmap", "/roadmap"],
  ["changelog", "/changelog"],
  ["analytics", "/analytics"],
  ["security", "/security"],
  ["layer-agents", "/layers/agents"],
  ["app-agents-break", "/app/agents/break"],
  ["app-stocks-loan", "/app/stocks/loan"],
  ["app-agents-log", "/app/agents/log"],
  ["app-overview", "/app/overview"],
  ["status", "/status"],
  ["docs-api", "/docs/api"],
  ["app-trade-orders", "/app/trade/orders"],
  ["app-agents-limits", "/app/agents/limits"],
  ["app-agents-strategies", "/app/agents/strategies"],
  ["app-trade-terminal", "/app/trade/terminal"],
  ["app-account-pools", "/app/account/pools"],
  ["app-predict", "/app/predict"],
  ["docs-predict", "/docs/predict"],
  ["app-stocks-market", "/app/stocks/market"],
] as const;

/** Scroll the whole page so every reveal fires, then return to top. */
async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 500) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    // let entrance animations end (the hero waits for the loader), so checks see the final colours; endless ones are skipped
    const finite = document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity));
    await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => undefined))), new Promise((r) => setTimeout(r, 6000))]);
  });
  await page.waitForTimeout(700);
}

for (const w of WIDTHS) {
  test(`screens and no horizontal scroll at ${w}px`, async ({ page }) => {
    // every site page now opens with the intro, and this walks all of them
    test.setTimeout(300_000);
    await page.setViewportSize({ width: w, height: w < 500 ? 844 : w < 1000 ? 1024 : 900 });
    for (const [name, path] of PAGES) {
      await page.goto(path);
      await settle(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${w}px`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `e2e/screens/${w}/${name}-top.png` });
      if (name === "home" || w === 390) await page.screenshot({ path: `e2e/screens/${w}/${name}-full.png`, fullPage: true });
    }
  });
}

test("reduced motion: content visible, no running animations", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/");
  const hidden = await page.evaluate(
    () => Array.from(document.querySelectorAll("[data-reveal]")).filter((e) => getComputedStyle(e).opacity !== "1").length,
  );
  expect(hidden).toBe(0);
  const words = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("[data-words] .word")).filter(
        (e) => getComputedStyle(e).color !== getComputedStyle(document.body).color,
      ).length,
  );
  expect(words).toBe(0);
  const running = await page.evaluate(
    () => document.getAnimations().filter((a) => a.playState === "running" && Number(a.effect?.getTiming().duration) > 1).length,
  );
  expect(running).toBe(0);
  await page.screenshot({ path: "e2e/screens/reduced-motion-home.png", fullPage: true });
  await ctx.close();
});

test("anchors in the header resolve to sections", async ({ page }) => {
  await page.goto("/");
  for (const id of ["why", "layers", "core", "compare", "onchain", "safety", "data", "token", "roadmap", "faq"]) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
});

test("keyboard: skip link is first and moves focus to main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

test("open layers send Open App into the app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Open App" }).first()).toHaveAttribute("href", "/app");
});

test("no unverified number leaks: hero facts show a dash", async ({ page }) => {
  await page.goto("/layers/stocks");
  await expect(page.getByText("62.5%")).toHaveCount(0);
});

for (const [name, path] of PAGES) {
  test(`axe: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(path);
    await settle(page);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const v = r.violations.map((x) => `${x.id} (${x.impact}): ${x.nodes.length} × ${x.nodes[0]?.target.join(" ")}`);
    expect(v, v.join("\n")).toEqual([]);
  });
}

test("api/token refuses input that is neither an address nor a ticker", async ({ request }) => {
  const r = await request.get("/api/token?q=" + encodeURIComponent("<script>"));
  expect(r.status()).toBe(400);
  const long = await request.get(`/api/token?q=${"a".repeat(80)}`);
  expect(long.status()).toBe(400);
});

test("api/net answers 200 with a block or null, never an RPC URL", async ({ request }) => {
  const r = await request.get("/api/net");
  expect(r.status()).toBe(200);
  const body = await r.text();
  expect(body).not.toContain("http");
});

test("browser never calls the RPC directly", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (q) => {
    if (!q.url().startsWith("http://localhost")) external.push(q.url());
  });
  await page.goto("/");
  await page.waitForTimeout(2000);
  expect(external).toEqual([]);
});

test("api/wallet refuses a non-address and never echoes an RPC URL", async ({ request }) => {
  const bad = await request.get("/api/wallet?address=" + encodeURIComponent("<x>"));
  expect(bad.status()).toBe(400);
  const r = await request.get("/api/wallet?address=0x0000000000000000000000000000000000000001");
  expect([200, 502, 503]).toContain(r.status());
  expect(await r.text()).not.toContain("http");
});

test("api/radar answers from the index or says it is not running", async ({ request }) => {
  const r = await request.get("/api/radar?limit=3");
  expect([200, 503]).toContain(r.status());
  const j = await r.json();
  if (r.status() === 200) expect(Array.isArray(j.rows)).toBe(true);
  else expect(typeof j.error).toBe("string");
});

test("radar, wallet and api console talk only to this site", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (q) => {
    if (!q.url().startsWith("http://localhost")) external.push(q.url());
  });
  await page.goto("/app/trust/radar");
  await expect(page.getByText("Pools indexed")).toBeVisible();
  await page.goto("/app/account/dashboard");
  await page.getByLabel("Address to open").fill("not-an-address");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByText("Paste a 0x address")).toBeVisible();
  // the API tab is open (keys for holders): its page loads and reads only this site
  await page.goto("/app/trust/api");
  await expect(page.getByRole("heading", { name: "API", exact: true, level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(external).toEqual([]);
});

test("api/quote validates input and never leaks an RPC URL", async ({ request }) => {
  const same = await request.get("/api/quote?from=ETH&to=ETH&amount=1");
  expect(same.status()).toBe(400);
  const bad = await request.get("/api/quote?from=ETH&to=USDG&amount=abc");
  expect(bad.status()).toBe(400);
  const r = await request.get("/api/quote?from=ETH&to=USDG&amount=0.01");
  expect([200, 502, 503]).toContain(r.status());
  expect(await r.text()).not.toContain("http");
});

test("api/launches answers from the index or says it is off", async ({ request }) => {
  const r = await request.get("/api/launches");
  // 429: other tests running at the same time used up this visitor's minute; a valid answer, not a failure
  expect([200, 429, 503]).toContain(r.status());
  if (r.status() === 200) expect(Array.isArray((await r.json()).hours)).toBe(true);
});

test("quote, analytics and portfolio talk only to this site", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (q) => {
    if (!q.url().startsWith("http://localhost")) external.push(q.url());
  });
  await page.goto("/app/trade/quote");
  await expect(page.getByRole("button", { name: "Quote", exact: true })).toBeVisible();
  await page.goto("/app/trust/launches");
  await expect(page.getByText(/Pools created|Reading the index|index/i).first()).toBeVisible();
  await page.goto("/app/portfolio");
  await expect(page.getByText("Link an address")).toBeVisible();
  expect(external).toEqual([]);
});


test("security headers: CSP keeps pages talking to this origin only, no framing, no banner header", async ({ request }) => {
  const r = await request.get("/");
  const h = r.headers();
  expect(h["content-security-policy"]).toContain("connect-src 'self'");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("api is rate-limited per visitor", async ({ request }) => {
  const codes: number[] = [];
  for (let i = 0; i < 45; i++) codes.push((await request.get("/api/assets?q=zz")).status());
  expect(codes).toContain(429);
  expect(codes.slice(0, 10).every((c) => c !== 429)).toBe(true);
});

test("devkit never renders in a production build", async ({ page }) => {
  await page.goto("/?devkit=1");
  await page.waitForTimeout(800);
  await expect(page.locator("#corbel-devkit, .dk-fab")).toHaveCount(0);
});

test("api/mandate lists scenarios and refuses unknown ones", async ({ request }) => {
  const list = await request.get("/api/mandate");
  expect(list.status()).toBe(200);
  expect(((await list.json()) as { scenarios: unknown[] }).scenarios.length).toBeGreaterThanOrEqual(8);
  const bad = await request.get("/api/mandate?s=nope");
  expect(bad.status()).toBe(400);
});

