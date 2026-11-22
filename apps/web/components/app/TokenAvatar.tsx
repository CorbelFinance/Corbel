"use client";

/**
 * A token's avatar: its own logo when one exists (served by /api/logo from this site), otherwise one drawn
 * from its address so every token stays recognisable. Stock tokens get the company logo or a ticker tile.
 */
import { useState } from "react";
import { cx } from "@corbel/ui";

function hue(addr: string) {
  let h = 0;
  for (let i = 2; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) % 360;
  return h;
}

export function TokenAvatar({ address, symbol, size = 28, stock = false, className }: { address: string; symbol?: string | null; size?: number; stock?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  // the logo service may be busy when a long list asks for dozens at once: try again twice before drawing a mark
  const [tries, setTries] = useState(0);
  const h = hue(address.toLowerCase());
  const sym = (symbol ?? "").replace(/^\$/, "");
  const text = (sym || "?").slice(0, stock ? 4 : 2).toUpperCase();
  const shape = stock ? "rounded-md" : "rounded-full";
  if (!failed && /^0x[0-9a-fA-F]{40}$/.test(address)) {
    const src = `/api/logo?a=${address.toLowerCase()}&s=${encodeURIComponent(sym)}${stock ? "&stock=1" : ""}&v=3${tries ? `&r=${tries}` : ""}`;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served by our own API, sizes are tiny
      <img src={src} alt="" width={size} height={size} loading="lazy" onError={() => (tries < 2 ? setTimeout(() => setTries((n) => n + 1), 1500 + tries * 3500) : setFailed(true))} className={cx("shrink-0 bg-[#181818] object-cover", shape, className)} style={{ width: size, height: size }} />
    );
  }
  // no logo anywhere: a mark drawn from the address (a mirrored 5×5 pattern in the token's own hue), so every
  // token still has a picture of its own instead of two letters
  if (!stock) {
    const a = address.toLowerCase().replace(/^0x/, "");
    const bits = Array.from({ length: 15 }, (_, i) => parseInt(a[(i * 2) % a.length] ?? "0", 16) % 2 === 0);
    const cells: [number, number][] = [];
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 3; x++)
        if (bits[y * 3 + x]) {
          cells.push([x, y]);
          if (x < 2) cells.push([4 - x, y]);
        }
    return (
      <svg aria-hidden viewBox="0 0 7 7" width={size} height={size} className={cx("shrink-0 rounded-full", className)} style={{ width: size, height: size, background: `radial-gradient(circle at 30% 25%, hsl(${h} 45% 20%), hsl(${(h + 40) % 360} 50% 10%))` }}>
        {cells.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x + 1} y={y + 1} width={1.02} height={1.02} fill={`hsl(${h} 75% ${55 + ((x + y) % 3) * 8}%)`} />
        ))}
      </svg>
    );
  }
  const style = stock
    ? { width: size, height: size, background: `linear-gradient(135deg, hsl(${h} 45% 22%), hsl(${(h + 40) % 360} 55% 14%))`, color: `hsl(${h} 80% 80%)`, fontSize: size * (text.length > 3 ? 0.27 : 0.33) }
    : { width: size, height: size, background: `radial-gradient(circle at 30% 25%, hsl(${h} 75% 62%), hsl(${(h + 50) % 360} 60% 28%))`, color: "#0b0b0b", fontSize: size * 0.38 };
  return (
    <span aria-hidden className={cx("inline-flex shrink-0 select-none items-center justify-center font-semibold leading-none", shape, className)} style={style}>
      {text}
    </span>
  );
}
