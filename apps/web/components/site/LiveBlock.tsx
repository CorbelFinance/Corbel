"use client";

import { useEffect, useState } from "react";

/** Polls our own /api/net every 15 s while the tab is visible. Shows "—" on any failure. */
export function LiveBlock() {
  const [block, setBlock] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/net", { cache: "no-store" });
        const j = (await r.json()) as { block: string | null };
        if (alive) setBlock(r.ok && j.block ? j.block : null);
      } catch {
        if (alive) setBlock(null);
      }
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return block ? (
    <span className="text-text">{Number(block).toLocaleString("en-US")}</span>
  ) : (
    <span aria-label="not connected">—</span>
  );
}

