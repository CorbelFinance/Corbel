"use client";

import { useEffect, useState } from "react";

/** Live numbers for the intro corners: the latest block and pools created on the chain in the last 24 h. */
export function LoaderStats({ part }: { part: "block" | "pools" }) {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    const url = part === "block" ? "/api/net" : "/api/launches";
    fetch(url, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j: { block?: string | null; hours?: { v2: number; v4: number }[] }) => {
        if (part === "block" && j.block) setV(`#${Number(j.block).toLocaleString("en")}`);
        if (part === "pools" && j.hours) setV(j.hours.slice(0, 24).reduce((a, x) => a + x.v2 + x.v4, 0).toLocaleString("en"));
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [part]);
  return <b className="font-normal text-text">{v ?? "—"}</b>;
}
