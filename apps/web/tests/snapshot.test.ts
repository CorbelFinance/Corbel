import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("snapshot", () => {
  it("writes a snapshot next to the database and reads it back", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corbel-snap-"));
    vi.stubEnv("CORBEL_DB", join(dir, "corbel.db"));
    vi.resetModules();
    const { keepSnap, loadSnap } = await import("../lib/snapshot");
    keepSnap("t", { at: 5, rows: [1, 2] } as { at: number });
    expect(readdirSync(join(dir, "snapshots"))).toContain("t.json");
    expect(loadSnap<{ at: number; rows: number[] }>("t")).toEqual({ at: 5, rows: [1, 2] });
    vi.unstubAllEnvs();
  });
});
