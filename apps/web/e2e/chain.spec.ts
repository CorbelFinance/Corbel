import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

type Seg = [{ x: number; y: number }, { x: number; y: number }];

const settle = (page: Page) => page.waitForFunction(() => !!(window as unknown as { __chainDebug?: unknown }).__chainDebug, null, { timeout: 8000 });

async function textRects(page: Page) {
  return page.evaluate(() => {
    const out: { x: number; y: number; w: number; h: number }[] = [];
    const walker = document.createTreeWalker(document.querySelector("main")!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      const el = n.parentElement!;
      if (el.closest("[aria-hidden='true'],[data-chain-mask],.sr-only,svg")) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of Array.from(range.getClientRects())) if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight) out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    return out;
  });
}

const hits = (r: { x: number; y: number; w: number; h: number }, [a, b]: Seg, pad: number) => {
  const R = { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
  if (a.y === b.y) return a.y > R.y && a.y < R.y + R.h && Math.max(a.x, b.x) > R.x && Math.min(a.x, b.x) < R.x + R.w;
  return a.x > R.x && a.x < R.x + R.w && Math.max(a.y, b.y) > R.y && Math.min(a.y, b.y) < R.y + R.h;
};

for (const [w, h] of [
  [1280, 600],
  [1440, 900],
  [1920, 1080],
  [390, 844],
]) {
  test(`chain: no lattice edge or trace crosses text at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w!, height: h! });
    await page.goto("/?chain=debug&seed=1");
    await settle(page);
    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    for (const f of [0.15, 0.3, 0.5, 0.7, 0.85]) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round(H * f));
      await page.waitForTimeout(2200);
      for (let i = 0; i < 12; i++) await page.mouse.move(80 + i * (w! / 14), h! * 0.3 + (i % 4) * 60);
      // hover can re-run an entrance animation (Token card); the lattice re-measures when it ends
      await page.waitForTimeout(900);
      const segs = await page.evaluate(() => {
        const d = (window as unknown as { __chainDebug: { segments(): Seg[]; edges(): Seg[] } }).__chainDebug;
        return [...d.segments(), ...d.edges()];
      });
      const texts = await textRects(page);
      const bad = segs.filter((s) => texts.some((t) => hits(t, s, 4)));
      expect(bad.length, `scroll ${f}`).toBe(0);
    }
  });
}

test("chain: cursor spawns traces, idle leaves packets, entering a block hops to a neighbour", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?chain=debug&seed=1");
  await settle(page);
  await page.evaluate(() => document.getElementById("faq")!.scrollIntoView({ behavior: "instant" }));
  await page.waitForTimeout(1500);
  const gap = await page.evaluate(() => {
    const a = document.querySelectorAll("#faq [data-chain-node]")[0]!.getBoundingClientRect();
    return { x: a.right, y: a.top - 10 };
  });
  // the field rebuilds after the scroll; sweep across the gap until a trace appears (a few tries at most)
  let live = 0;
  for (let k = 0; k < 5 && live < 1; k++) {
    for (let i = 0; i < 10; i++) await page.mouse.move(gap.x - 100 + i * 20, gap.y + (k % 2) * 4);
    await page.waitForTimeout(300);
    live = await page.evaluate(() => (window as unknown as { __chainDebug: { counts(): { runners: number } } }).__chainDebug.counts().runners);
  }
  expect(live).toBeGreaterThanOrEqual(1);

  await page.waitForTimeout(3000);
  const idle = await page.evaluate(() => (window as unknown as { __chainDebug: { counts(): { runners: number; packets: number } } }).__chainDebug.counts());
  expect(idle.runners).toBe(0);
  expect(idle.packets).toBeGreaterThanOrEqual(1);

  const card = await page.evaluate(() => {
    const r = document.querySelectorAll("#faq [data-chain-node]")[1]!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(card.x - 300, card.y);
  await page.mouse.move(card.x, card.y, { steps: 6 });
  await page.waitForTimeout(1500);
  const hops = await page.evaluate(() => (window as unknown as { __chainDebug: { counts(): { hops: { arrived: number } } } }).__chainDebug.counts().hops);
  expect(hops.arrived).toBeGreaterThanOrEqual(1);
});

test("chain: reduced motion draws the static lattice and runs no frames", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/?chain=debug&seed=1");
  await settle(page);
  await page.evaluate(() => document.getElementById("layers")!.scrollIntoView({ behavior: "instant" }));
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => (window as unknown as { __chainStats: { frames: number } }).__chainStats.frames);
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => (window as unknown as { __chainStats: { frames: number } }).__chainStats.frames);
  expect(after - before).toBe(0);
  const edges = await page.evaluate(() => (window as unknown as { __chainDebug: { counts(): { edges: number } } }).__chainDebug.counts().edges);
  expect(edges).toBeGreaterThan(0);
  await ctx.close();
});

test("chain: perf under 10 s of pointer movement", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?chain=debug&seed=1");
  await settle(page);
  await page.evaluate(() => document.getElementById("layers")!.scrollIntoView({ behavior: "instant" }));
  await page.waitForTimeout(1200);
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 10_000) {
    await page.mouse.move(100 + ((i * 37) % 1240), 120 + ((i * 53) % 700));
    if (i % 40 === 0) await page.mouse.wheel(0, 300);
    i++;
  }
  const s = await page.evaluate(() => {
    const st = (window as unknown as { __chainStats: { draws: number[] } }).__chainStats;
    const d = st.draws.slice().sort((a, b) => a - b);
    return { avg: d.reduce((a, b) => a + b, 0) / d.length, p99: d[Math.floor(d.length * 0.99)]!, edges: (window as unknown as { __chainDebug: { counts(): { edges: number } } }).__chainDebug.counts().edges };
  });
  console.log("chain perf", JSON.stringify(s));
  expect(s.avg).toBeLessThan(2);
  expect(s.p99).toBeLessThan(6);
  expect(s.edges).toBeLessThanOrEqual(4000 * 2);
});

test("chain: canvas is inert and accessible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?chain=debug");
  await settle(page);
  const c = page.locator("canvas[data-chain-canvas]");
  await expect(c).toHaveAttribute("aria-hidden", "true");
  expect(await c.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  expect(await c.evaluate((el) => (el as HTMLCanvasElement).tabIndex)).toBe(-1);
  // a click on a button under the canvas still lands
  await page.evaluate(() => document.getElementById("faq")!.scrollIntoView({ behavior: "instant" }));
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Risk/ }).first().click();
  await expect(page.getByRole("button", { name: /Risk/ }).first()).toHaveAttribute("aria-pressed", "true");
  // the jump to the FAQ passes every block above it, and those fade in on their own: contrast is read once they have
  // finished (mid-fade text is dimmer than it ever stays)
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 10_000 });
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("chain: ?chain=off mounts nothing and logs nothing", async ({ page }) => {
  const errs: string[] = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errs.push(m.text()));
  await page.goto("/?chain=off");
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => "__chainDebug" in window || "__chainStats" in window)).toBe(false);
  expect(errs).toEqual([]);
});
