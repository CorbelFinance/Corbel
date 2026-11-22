"use client";

/**
 * App · Overview. Every tool on one screen: three starting paths that chain tools in order, then each area as its
 * own tinted block with its tools as tiles. Built from the same list as the side menu, so it never drifts.
 */
import Link from "next/link";
import { cx } from "@corbel/ui";
import { NAV_GROUPS } from "./AppNav";
import { NavIcon } from "./NavIcon";

const TONE: Record<string, string> = { trade: "moss", check: "ice", predict: "ink", earn: "amber", launch: "moss", agents: "violet", wallet: "ink", shield: "moss", compute: "ember" };
const PATHS = [
  { k: "Buy a token without the traps", tone: "moss", steps: [["Terminal", "/app/trade/terminal"], ["Check", "/app/trade/check"], ["Swap", "/app/trade/quote"]] },
  { k: "Earn on a pool you understand", tone: "amber", steps: [["Pool fees", "/app/account/pools"], ["Planner", "/app/account/pools"], ["Your positions", "/app/account/dashboard"]] },
  { k: "Let an agent trade on a leash", tone: "violet", steps: [["Mandate", "/app/agents/strategies"], ["Guard", "/app/agents/guard"], ["Break it", "/app/agents/break"]] },
] as const;

export function ToolsGrid() {
  const groups = NAV_GROUPS;
  const count = groups.reduce((s, g) => s + g.items.filter((i) => i.href.startsWith("/app")).length, 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 lg:grid-cols-3">
        {PATHS.map((p, i) => (
          <section key={p.k} data-tone={p.tone} className="bay card-in p-5" style={{ animationDelay: `${i * 0.06}s` }} aria-label={p.k}>
            <p className="bay-kicker">{`Path 0${i + 1}`}</p>
            <h2 className="bay-title">{p.k}</h2>
            <ol className="mt-4 flex items-center gap-1.5">
              {p.steps.map(([label, href], j) => (
                <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Link href={href} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-(--bay-edge) bg-(--bay-bg2) px-2.5 py-2 text-[12.5px] text-text transition-colors hover:border-(--bay-acc)">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-(--bay-acc) font-mono text-[12px] text-[#07080b]">{j + 1}</span>
                    <span className="truncate">{label}</span>
                  </Link>
                  {j < p.steps.length - 1 && <span className="text-(--bay-acc)">→</span>}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <p className="text-[12.5px] text-muted">{`${count} tools in ${groups.length} areas. The ones marked soon or plan are not live yet.`}</p>

      <div className="columns-1 gap-4 md:columns-2 2xl:columns-3 [&>*]:mb-4">
        {groups.map((g, gi) => (
          <section key={g.id} data-tone={TONE[g.id] ?? "moss"} className="bay card-in break-inside-avoid" style={{ animationDelay: `${0.1 + gi * 0.05}s` }} aria-label={g.label}>
            <header className="bay-head">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-(--bay-bg2) text-(--bay-acc)">
                <NavIcon id={g.id} className="h-5 w-5" />
              </span>
              <h2 className="bay-title">{g.label}</h2>
              {g.soon && <span className="ml-auto rounded-full border border-(--bay-edge) px-2 py-0.5 text-[12px] text-muted">soon</span>}
            </header>
            <ul className="grid gap-1.5 px-3 pb-3 sm:grid-cols-2">
              {g.items.map((it) => (
                <li key={it.href}>
                  <Link href={it.href} className={cx("group flex h-full flex-col rounded-xl border border-transparent bg-(--bay-bg2) px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-(--bay-acc)", (it.tag === "soon" || g.soon) && "opacity-80")}>
                    <span className="flex items-center gap-2 text-[13px] font-medium text-text">
                      {it.title}
                      {it.tag && <span className="rounded-full border border-(--bay-edge) px-1.5 text-[12px] font-normal text-muted">{it.tag}</span>}
                      <span className="ml-auto text-(--bay-acc) opacity-0 transition-opacity group-hover:opacity-100">→</span>
                    </span>
                    <span className="mt-0.5 text-[12px] leading-snug text-muted">{it.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
