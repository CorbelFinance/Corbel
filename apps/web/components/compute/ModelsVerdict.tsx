"use client";

/**
 * AI · the page's answer first: how many models you can use right now, and what the cheapest one costs. Read from the
 * live catalogue (/api/compute?what=models); while the open list is not read yet it says so instead of a zero.
 */
import { useEffect, useState } from "react";
import { Verdict } from "../app/kit";

type Row = { id: string; name: string; pin: number; pout: number; kind: string; avail?: boolean; media?: boolean };

export function ModelsVerdict() {
  const [d, setD] = useState<{ rows: Row[]; provider: boolean } | null>(null);
  useEffect(() => {
    let off = false;
    let t: ReturnType<typeof setTimeout>;
    const load = (n: number) =>
      fetch("/api/compute?what=models")
        .then((r) => (r.status === 200 ? (r.json() as Promise<{ rows?: Row[]; provider?: boolean }>) : null))
        .then((j) => {
          if (off) return;
          if (j?.rows) setD({ rows: j.rows, provider: !!j.provider });
          if (!j?.provider && n < 6) t = setTimeout(() => load(n + 1), 8000);
        })
        .catch(() => undefined);
    void load(0);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, []);

  if (!d)
    return (
      <div aria-hidden className="h-40 rounded-2xl border border-[#3a2418] bg-[#120c0a] p-8">
        <span className="block h-3 w-40 rounded bg-[#2a1b13]" />
        <span className="mt-5 block h-8 w-[55%] rounded bg-[#2a1b13]" />
      </div>
    );
  const text = d.rows.filter((r) => !r.media && r.kind !== "image");
  const open = text.filter((r) => r.avail);
  const cheap = [...open].filter((r) => r.pin > 0).sort((a, b) => a.pin - b.pin)[0];
  const makers = new Set(open.map((r) => r.id.split("/")[0])).size;
  return (
      <Verdict
        kicker="AI · open right now"
        tone="ai"
        value={d.provider ? open.length : "…"}
        valueLabel={d.provider ? "models you can chat with now" : "reading which models are open"}
        facts={[
          ["In the catalogue", text.length.toLocaleString("en")],
          ...(d.provider ? ([["Makers open", makers]] as [string, number][]) : []),
          ...(cheap ? ([["Cheapest open", `${cheap.name}`]] as [string, string][]) : []),
          ...(cheap ? ([["Its price", `$${cheap.pin.toFixed(2)} in · $${cheap.pout.toFixed(2)} out per 1M`]] as [string, string][]) : []),
          ["Full holders", "185 models"],
        ]}
      >
        {d.provider
          ? `${open.length} models from ${makers} makers answer in the chat today. Full holders get all 185: text, pictures, video, voice and music.`
          : `The catalogue lists ${text.length} models; which ones are open is being read now.`}
      </Verdict>
  );
}
