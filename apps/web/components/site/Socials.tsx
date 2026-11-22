/**
 * Our channels as small instrument buttons beside the chain status: X, GitHub, Telegram, and the $CORBEL chart. Each draws its glyph in on
 * hover with a leaf glow; at rest a light sweep passes over them one after another, so they read as live. Only the
 * channels set in BRAND.social are shown.
 */
import { BRAND } from "@corbel/config";
import { cx } from "@corbel/ui";

const ICONS: Record<string, { label: string; d: string; fill?: boolean }> = {
  x: { label: "X", d: "M4 4h4.2L20 20h-4.2L4 4Zm15.5 0-6.6 7.3M10.9 12.9 4.5 20" },
  github: {
    label: "GitHub",
    d: "M12 3a9 9 0 0 0-2.85 17.54c.45.08.6-.2.6-.43v-1.6c-2.5.54-3.03-1.06-3.03-1.06-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.07 1.38.93 1.38.93.8 1.38 2.11.98 2.62.75.08-.58.32-.98.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.79.93-2.42-.1-.23-.4-1.15.08-2.4 0 0 .76-.24 2.48.93a8.6 8.6 0 0 1 4.52 0c1.72-1.17 2.48-.93 2.48-.93.49 1.25.18 2.17.09 2.4.58.63.92 1.44.92 2.42 0 3.46-2.1 4.22-4.11 4.44.32.28.61.83.61 1.67v2.48c0 .24.16.52.61.43A9 9 0 0 0 12 3Z",
  },
  telegram: { label: "Telegram", d: "M21 4 3 11.2l5.6 2 2 6.1 3.2-3.9 4.9 3.6L21 4ZM8.6 13.2 18 6.8" },
  // the $CORBEL pair on the pairs index: drawn from their own mark (a mask), not a path
  chart: { label: "$CORBEL on the pairs index", d: "" },
};

export function Socials({ className }: { className?: string }) {
  const s = BRAND.social as Record<string, string | null | undefined>;
  // every channel is shown; one without a link yet is drawn dimmed and says so
  const list = ["x", "github", "telegram", "chart"] as const;
  return (
    <ul className={cx("flex items-center gap-1.5", className)} aria-label="Corbel channels">
      {list.map((k, i) => {
        const ic = ICONS[k]!;
        return (
          <li key={k}>
            {!s[k] ? (
              <span
                role="img"
                title={`${ic.label}: soon`}
                aria-label={`Corbel on ${ic.label}: soon`}
                className="grid h-9 w-9 place-items-center border border-dashed border-[#353535] text-[#8a978f]"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="h-[18px] w-[18px]"
                  fill={k === "github" ? "currentColor" : "none"}
                  stroke={k === "github" ? "none" : "currentColor"}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={ic.d} />
                </svg>
              </span>
            ) : (
              <a
                href={s[k]!}
                target="_blank"
                rel="noreferrer"
                aria-label={k === "chart" ? `${ic.label}` : `Corbel on ${ic.label}`}
                title={k === "chart" ? ic.label : undefined}
                className="soc group relative grid h-9 w-9 place-items-center overflow-hidden border border-line text-muted transition-colors hover:border-leaf hover:text-leaf"
                style={{ ["--d" as string]: `${i * 0.6}s` }}
              >
                <span aria-hidden className="soc-sweep" />
                {k === "chart" ? (
                  <span aria-hidden className="relative block h-[18px] w-[18px] bg-current" style={{ WebkitMaskImage: "url(/brand/ext/dex-mark.png)", maskImage: "url(/brand/ext/dex-mark.png)", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }} />
                ) : (
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="relative h-[18px] w-[18px]"
                  fill={k === "github" ? "currentColor" : "none"}
                  stroke={k === "github" ? "none" : "currentColor"}
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={ic.d} pathLength={1} className="soc-path" />
                </svg>
                )}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
