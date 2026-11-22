import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["apps/web/app", "apps/web/components", "packages/config/src", "packages/ui/src", "packages/data/src"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|json)$/.test(n) ? [p] : [];
  });
}
const files = SCAN.flatMap((d) => walk(join(ROOT, d)));
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

/** String literals and JSX text only, so identifiers and class names don't count. */
function visibleText(src: string): string[] {
  const out: string[] = [];
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const m of noComments.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) out.push(m[1] ?? m[2] ?? "");
  for (const m of noComments.matchAll(/>\s*([^<>{}]*[A-Za-z][^<>{}]*)\s*</g)) out.push(m[1]!);
  return out.filter((s) => /[A-Za-z]{2}/.test(s) && !isClassish(s));
}

/** Tailwind class lists, import paths, ids: every token is lowercase or carries - : [ ] / */
function isClassish(s: string) {
  return s
    .trim()
    .split(/\s+/)
    .every((t) => /[-:[\]/@]/.test(t) || /^[a-z0-9.]+$/.test(t));
}

const BANNED = [
  "revolutionary",
  "seamless",
  "cutting-edge",
  "next-generation",
  "unlock",
  "empower",
  "elevate",
  "supercharge",
  "game-changing",
  "world-class",
  "best-in-class",
  "leverage",
  "robust",
  "holistic",
  "ecosystem",
  "in today's fast-paced",
  "delve",
  "tapestry",
  "landscape",
  "unparalleled",
  "effortlessly",
];

describe("copy rules", () => {
  it("has files to scan", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("uses no banned words in visible text", () => {
    const hits: string[] = [];
    for (const f of files) {
      for (const s of visibleText(readFileSync(f, "utf8"))) {
        const low = s.toLowerCase();
        for (const w of BANNED) if (new RegExp(`\\b${w}\\b`).test(low)) hits.push(`${rel(f)}: "${w}" in "${s.slice(0, 80)}"`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("uses 'journey' only as the label of the steps block", () => {
    const hits: string[] = [];
    for (const f of files) {
      for (const s of visibleText(readFileSync(f, "utf8"))) {
        if (/journey/i.test(s) && !/^\d\d \/ THE JOURNEY$/.test(s) && s !== "Journey") hits.push(`${rel(f)}: ${s}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("keeps money, percentages and big numbers inside facts.ts", () => {
    const NUM = /\$\s?\d|\d\s?%|\b\d+(\.\d+)?\s?(M|B|K|bps|APY|APR)\b|\b\d{1,3}(,\d{3})+\b/;
    // facts.ts holds market numbers with sources; mandate.ts holds the demo contract's own enforced parameters
    const allowed = ["packages/config/src/facts.ts", "packages/config/src/mandate.ts", "packages/data/src/mocks/"];
    const hits: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (allowed.some((a) => r.startsWith(a))) continue;
      for (const s of visibleText(readFileSync(f, "utf8"))) {
        if (s.includes("{") && s.includes("}") && !s.includes("{{")) continue; // code template, not copy
        if (/^\s*rgba?\(/.test(s)) continue; // a colour, not copy
        if (NUM.test(s) && !/^[\w\s-]*$/.test(s)) hits.push(`${r}: ${s.slice(0, 90)}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("writes at most 2 em dashes per copy file (placeholders excluded)", () => {
    const copy = files.filter((f) => rel(f).startsWith("packages/config/src/copy/"));
    for (const f of copy) {
      const texts = visibleText(readFileSync(f, "utf8")).filter((s) => s.trim() !== "—");
      const n = texts.join(" ").split("—").length - 1;
      expect(n, rel(f)).toBeLessThanOrEqual(2);
    }
  });

  it("keeps sentences at 18 words or fewer in copy", () => {
    const copy = files.filter((f) => rel(f).startsWith("packages/config/src/copy/"));
    const long: string[] = [];
    for (const f of copy) {
      for (const s of visibleText(readFileSync(f, "utf8"))) {
        for (const sentence of s.split(/(?<=[.?!])\s+/)) {
          const words = sentence.trim().split(/\s+/).filter(Boolean);
          if (words.length > 18) long.push(`${rel(f)} (${words.length}): ${sentence.slice(0, 80)}`);
        }
      }
    }
    expect(long).toEqual([]);
  });

  it("never uses vague button labels", () => {
    const hits: string[] = [];
    for (const f of files) {
      for (const s of visibleText(readFileSync(f, "utf8"))) if (/^(learn more|get started|click here)$/i.test(s.trim())) hits.push(rel(f));
    }
    expect(hits).toEqual([]);
  });
});

describe("tokens", () => {
  const css = readFileSync(join(ROOT, "packages/ui/src/tokens.css"), "utf8");
  const tok = (name: string) => {
    const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    if (!m) throw new Error(`missing token ${name}`);
    return m[1]!;
  };
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(tok(a)), lum(tok(b))].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };

  it("keeps the fixed values", () => {
    expect(tok("bg")).toBe("#060807");
    expect(tok("leaf")).toBe("#2fbf72");
    expect(tok("flesh")).toBe("#ff4560");
  });

  it.each([
    ["text", "bg"],
    ["text", "surface"],
    ["text", "surface-2"],
    ["muted", "bg"],
    ["muted", "surface"],
    ["muted", "surface-2"],
    ["leaf", "bg"],
    ["flesh", "bg"],
    ["text", "flesh-deep"],
    ["text", "rind"],
    ["bg", "leaf"],
  ])("%s on %s has contrast ≥ 4.5:1", (a, b) => {
    expect(ratio(a, b)).toBeGreaterThanOrEqual(4.5);
  });
});
