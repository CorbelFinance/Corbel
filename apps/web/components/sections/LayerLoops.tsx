import type { CSSProperties } from "react";
import type { LayerId } from "@corbel/config";
import { WeekendDials } from "./WeekendDials";

/** One live illustration per layer, green line work (CSS/SVG; static under reduced motion). */
/** Rotated ellipse as a path string, for CSS offset-path orbits. */
function ellipsePath(cx: number, cy: number, rx: number, ry: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  const pts = Array.from({ length: 49 }, (_, i) => {
    const t = (i / 48) * Math.PI * 2;
    const x = rx * Math.cos(t),
      y = ry * Math.sin(t);
    return `${(cx + x * Math.cos(a) - y * Math.sin(a)).toFixed(1)} ${(cy + x * Math.sin(a) + y * Math.cos(a)).toFixed(1)}`;
  });
  return `M${pts.join(" L")} Z`;
}
const ORBIT_A = ellipsePath(140, 60, 46, 16, 18);
const ORBIT_B = ellipsePath(140, 60, 46, 16, -18);

export function LayerLoop({ id }: { id: LayerId }) {
  const common = { width: 280, height: 120, viewBox: "0 0 280 120", fill: "none", "aria-hidden": true } as const;
  const hex = (cx: number, cy: number, r: number) =>
    Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 3) * k - Math.PI / 2;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    }).join(" ");

  switch (id) {
    case "shield":
      return (
        <svg {...common} className="loop loop-scan">
          <polygon points={hex(36, 60, 26)} className="mut" stroke="currentColor" strokeOpacity=".7" />
          <rect x="26" y="52" width="20" height="16" className="mut" stroke="currentColor" strokeOpacity=".7" />
          <path d="M62 60 H118" className="dim" stroke="currentColor" />
          {/* the shield */}
          <path d="M140 26 L164 34 V58 C164 76 152 88 140 94 C128 88 116 76 116 58 V34 Z" stroke="currentColor" strokeWidth="1.5" />
          <path className="scan" d="M118 60 H162" stroke="currentColor" strokeWidth="1.5" />
          {/* allowed: passes through */}
          <path d="M164 48 H236" stroke="var(--leaf)" strokeOpacity=".8" />
          <text className="tick" style={{ "--k": 0 } as CSSProperties} x="208" y="42" fontSize="8" fontFamily="var(--font-mono)" fill="var(--leaf)">
            ✓ SWAP
          </text>
          {/* refused: stops at the shield */}
          <path d="M164 74 H186" stroke="var(--flesh)" strokeOpacity=".85" />
          <path d="M186 68 L196 80 M196 68 L186 80" stroke="var(--flesh)" strokeWidth="1.5" />
          <text className="tick" style={{ "--k": 1 } as CSSProperties} x="204" y="78" fontSize="8" fontFamily="var(--font-mono)" fill="var(--flesh)">
            ✕ DRAIN
          </text>
          <text x="18" y="104" fill="var(--muted)" fontSize="8" fontFamily="var(--font-mono)">WALLET</text>
          <text x="118" y="112" fill="var(--muted)" fontSize="8" fontFamily="var(--font-mono)">7702</text>
        </svg>
      );
    case "account":
      return (
        <svg {...common} className="loop loop-orbit">
          <polygon points={hex(36, 60, 26)} className="mut" stroke="currentColor" strokeOpacity=".7" />
          <circle cx="36" cy="54" r="5" className="mut" stroke="currentColor" strokeOpacity=".7" />
          <rect x="28" y="62" width="16" height="7" rx="2" className="mut" stroke="currentColor" strokeOpacity=".7" />
          <polygon points={hex(244, 60, 26)} className="mut" stroke="currentColor" strokeOpacity=".7" />
          <rect x="234" y="52" width="20" height="16" className="mut" stroke="currentColor" strokeOpacity=".7" />
          <path d="M238 52 V48 H250 V52" className="mut" stroke="currentColor" strokeOpacity=".7" />
          <path d="M62 60 H218" className="dim" stroke="currentColor" />
          <ellipse cx="140" cy="60" rx="46" ry="16" transform="rotate(18 140 60)" className="dim" stroke="currentColor" />
          <ellipse cx="140" cy="60" rx="46" ry="16" transform="rotate(-18 140 60)" className="dim" stroke="currentColor" />
          {[0, 1, 2].map((k) => (
            <circle key={`a${k}`} r="2.6" fill="currentColor" className="orb" style={{ offsetPath: `path("${ORBIT_A}")`, "--k": k } as CSSProperties} />
          ))}
          {[0, 1].map((k) => (
            <circle key={`b${k}`} r="2.6" fill="currentColor" className="orb rev" style={{ offsetPath: `path("${ORBIT_B}")`, "--k": k } as CSSProperties} />
          ))}
          <circle cx="140" cy="60" r="3" fill="currentColor" className="ping" />
          <text x="18" y="104" fill="var(--muted)" fontSize="8" fontFamily="var(--font-mono)">WALLET</text>
          <text x="228" y="104" fill="var(--muted)" fontSize="8" fontFamily="var(--font-mono)">VAULT</text>
        </svg>
      );
    case "trust":
      return (
        <svg {...common} className="loop loop-scan">
          <polygon points={hex(40, 60, 28)} className="mut" stroke="currentColor" strokeOpacity=".7" />
          <path d="M30 60 L38 68 L52 52" stroke="currentColor" strokeWidth="1.6" />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <g key={k}>
              <path d={`M86 ${18 + k * 16} H${222 - (k % 3) * 26}`} className="dim" stroke="currentColor" />
              <text x="86" y={14 + k * 16} fill="var(--muted)" fontSize="6" fontFamily="var(--font-mono)">
                {["HONEYPOT", "TAX", "OWNER", "LP LOCK", "TICKER", "CREATOR"][k]}
              </text>
              <text
                className="tick"
                style={{ "--k": k } as CSSProperties}
                x="244"
                y={21 + k * 16}
                fontSize="9"
                fontFamily="var(--font-mono)"
                fill={k === 1 || k === 4 ? "var(--flesh)" : "var(--leaf)"}
              >
                {k === 1 || k === 4 ? "✕" : "✓"}
              </text>
            </g>
          ))}
          <path className="scan" d="M80 12 H260" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "stocks":
      return <WeekendDials />;
    case "trade":
      return (
        <svg {...common} className="loop loop-route">
          <circle cx="20" cy="60" r="5" fill="currentColor" />
          <circle cx="260" cy="60" r="5" stroke="currentColor" />
          {[
            "M25 60 C 80 60, 90 18, 140 18 S 200 60, 255 60",
            "M25 60 H255",
            "M25 60 C 80 60, 90 102, 140 102 S 200 60, 255 60",
          ].map((d, k) => (
            <g key={d}>
              <path className="dim" d={d} stroke="currentColor" />
              <path className="flow" d={d} stroke="currentColor" />
              <rect width="5" height="5" x="-2.5" y="-2.5" fill="currentColor" className="pkt" style={{ offsetPath: `path("${d}")`, "--k": k } as CSSProperties} />
            </g>
          ))}
          {[18, 60, 102].map((y, k) => (
            <g key={y}>
              <rect x="128" y={y - 8} width="24" height="16" fill="var(--bg)" stroke="var(--muted)" />
              <text x="131" y={y + 3} fill="var(--muted)" fontSize="6.5" fontFamily="var(--font-mono)">
                {["V2", "V3", "V4"][k]}
              </text>
            </g>
          ))}
        </svg>
      );
    case "agents":
      return (
        <svg {...common} className="loop loop-limit">
          <path d="M14 104 H266 M14 104 V12" className="dim" stroke="currentColor" />
          <path className="red" d="M14 30 H266" strokeDasharray="5 4" />
          <text x="226" y="24" fill="var(--flesh)" fontSize="8" fontFamily="var(--font-mono)">LIMIT</text>
          <path
            className="chart"
            d="M14 96 L36 86 L56 90 L78 70 L100 78 L122 56 L144 64 L166 44 L188 52 L210 36 L232 42 L254 34 L266 36"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="254" cy="34" r="3" fill="currentColor" className="ping" />
          <text x="18" y="116" fill="var(--muted)" fontSize="7" fontFamily="var(--font-mono)">STOP AT DRAWDOWN · LOG EVERY TRADE</text>
        </svg>
      );
    case "launch":
      return (
        <svg {...common} className="loop loop-curve">
          <path d="M14 104 H266 M14 104 V10" className="dim" stroke="currentColor" />
          <rect x="60" y="10" width="70" height="94" fill="var(--leaf)" fillOpacity=".06" />
          <text x="64" y="20" fill="var(--muted)" fontSize="7" fontFamily="var(--font-mono)">REFUND WINDOW</text>
          <path d="M14 100 C 110 98, 170 70, 250 14" stroke="currentColor" strokeWidth="1.6" />
          {[
            [60, 96],
            [130, 84],
            [196, 52],
          ].map(([x, y]) => (
            <g key={x}>
              <circle cx={x} cy={y} r="3" fill="currentColor" />
              <path d={`M${x} ${y} L250 84`} className="dim" stroke="currentColor" />
            </g>
          ))}
          <circle cx="250" cy="84" r="6" fill="currentColor" className="ping" />
          <text x="214" y="100" fill="var(--muted)" fontSize="7" fontFamily="var(--font-mono)">V4 POOL</text>
          <path className="back red" d="M110 70 C 96 84, 80 88, 64 88" markerEnd="url(#arr)" />
          <defs>
            <marker id="arr" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M6 0 L0 3 L6 6" fill="none" stroke="var(--flesh)" />
            </marker>
          </defs>
          <circle className="rider" r="3.5" fill="currentColor" />
        </svg>
      );
  }
}

/**
 * Compute: one prompt priced at three models side by side (bar = price per token, shorter is cheaper). The prompt
 * goes to the cheapest, the answer streams back, and it is paid from the one balance.
 */
export function ComputeLoop() {
  const row = (y: number, label: string, w: number, pick: boolean, i: number) => (
    <g>
      <text x="104" y={y + 6} fontSize="7" fontFamily="var(--font-mono)" fill={pick ? "#ff9a5c" : "var(--muted)"}>
        {label}
      </text>
      <rect x="160" y={y} width="80" height="7" rx="3.5" fill="currentColor" fillOpacity=".08" />
      <rect x="160" y={y} width={w} height="7" rx="3.5" fill={pick ? "#ff9a5c" : "currentColor"} fillOpacity={pick ? 1 : 0.4} className="cmp-bar" style={{ animationDelay: `${i * 0.18}s` }} />
      {pick && (
        <text x={166 + w} y={y + 6.5} fontSize="6.5" fontFamily="var(--font-mono)" fill="#ffcfae">
          LOWEST
        </text>
      )}
    </g>
  );
  return (
    <svg width={280} height={120} viewBox="0 0 280 120" fill="none" aria-hidden className="loop">
      <rect x="10" y="40" width="64" height="34" rx="4" stroke="currentColor" strokeOpacity=".7" />
      <text x="18" y="54" fontSize="7.5" fontFamily="var(--font-mono)" fill="var(--muted)">
        PROMPT
      </text>
      <path d="M20 63 H64" stroke="currentColor" strokeOpacity=".5" className="cmp-type" />
      <path d="M74 50 C88 50 88 25 100 25" stroke="currentColor" strokeOpacity=".3" strokeDasharray="2 3" />
      <path d="M74 57 H100" stroke="#ff9a5c" className="cmp-route" />
      <path d="M74 64 C88 64 88 89 100 89" stroke="currentColor" strokeOpacity=".3" strokeDasharray="2 3" />
      {row(19, "MODEL A", 72, false, 0)}
      {row(53, "MODEL B", 26, true, 1)}
      {row(86, "MODEL C", 50, false, 2)}
      <path d="M100 66 C 90 100 60 104 42 74" stroke="#ff9a5c" strokeOpacity=".7" strokeDasharray="2 4" className="cmp-back" />
      <circle r="2.4" fill="#ff9a5c">
        <animateMotion dur="2.4s" repeatCount="indefinite" path="M100 66 C 90 100 60 104 42 74" />
      </circle>
      <text x="10" y="112" fontSize="7" fontFamily="var(--font-mono)" fill="var(--muted)">
        ANSWER BACK · PAID FROM ONE BALANCE
      </text>
    </svg>
  );
}

/** Overview: the chain's blocks rolling in on the left, the live readings they feed on the right. */
export function OverviewLoop() {
  const bars = [
    ["BLOCK", 0.9],
    ["SWAPS", 0.65],
    ["LAUNCHES", 0.45],
    ["MODELS", 0.75],
  ] as const;
  return (
    <svg width={280} height={120} viewBox="0 0 280 120" fill="none" aria-hidden className="loop">
      {/* blocks arriving on a conveyor */}
      <path d="M10 92 H112" stroke="currentColor" strokeOpacity=".35" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect y="70" width="18" height="18" rx="2" stroke="currentColor" strokeOpacity=".75" fill="currentColor" fillOpacity=".06">
            <animate attributeName="x" from={-10 + i * 30} to={20 + i * 30} dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values={i === 0 ? "0;1;1" : i === 3 ? "1;1;0" : "1;1;1"} dur="1.6s" repeatCount="indefinite" />
          </rect>
        </g>
      ))}
      <text x="10" y="58" fontSize="7" fontFamily="var(--font-mono)" fill="var(--muted)">
        NEW BLOCK
      </text>
      <circle cx="56" cy="55.5" r="2.2" fill="var(--leaf)">
        <animate attributeName="opacity" values="1;.2;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
      {/* the feed into the readings */}
      <path d="M112 79 C 128 79 128 60 144 60" stroke="var(--leaf)" strokeOpacity=".6" strokeDasharray="2 3" />
      <circle r="2" fill="var(--leaf)">
        <animateMotion dur="1.6s" repeatCount="indefinite" path="M112 79 C 128 79 128 60 144 60" />
      </circle>
      {bars.map(([k, v], i) => (
        <g key={k}>
          <text x="148" y={26 + i * 22} fontSize="6.5" fontFamily="var(--font-mono)" fill="var(--muted)">
            {k}
          </text>
          <rect x="148" y={30 + i * 22} width="120" height="5" rx="2.5" fill="currentColor" fillOpacity=".08" />
          <rect x="148" y={30 + i * 22} height="5" rx="2.5" fill={k === "MODELS" ? "#ff9a5c" : "var(--leaf)"} fillOpacity=".85">
            <animate attributeName="width" values={`${v * 120 * 0.7};${v * 120};${v * 120 * 0.85};${v * 120 * 0.7}`} dur={`${2.4 + i * 0.4}s`} repeatCount="indefinite" />
          </rect>
        </g>
      ))}
    </svg>
  );
}
