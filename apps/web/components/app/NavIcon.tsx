/** Line icons for the app rail, drawn for each area (no icon font, no third party). */
const P: Record<string, string> = {
  // candles on an axis
  trade: "M4 20h16M7 16V9m0 0V6M7 9h0M12 17v-7m0 0V7M17 15v-4m0-3V6",
  // magnifier with a tick
  check: "M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Zm9.5 3-4.8-4.8M7.8 10.6l1.8 1.8 3.4-3.6",
  // a forked path with a target
  predict: "M4 18c4 0 5-12 9-12h7M13 6l-2-2m2 2-2 2M4 18h6M17 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  // stacked coins rising
  earn: "M5 17c0 1.1 2.7 2 6 2s6-.9 6-2M5 17v-3c0 1.1 2.7 2 6 2s6-.9 6-2v3M5 14c0-1.1 2.7-2 6-2s6 .9 6 2M17 9l2-3 2 3M19 6v7",
  // rocket
  launch: "M14 4c3 1 5 3 6 6l-6 6-6-6 6-6ZM8 10l-3 1-1 3 4-1M14 16l-1 3-3 1 1-4M15.5 8.5h0",
  // chip / agent
  agents: "M8 8h8v8H8zM10 4v4m4-4v4m-4 8v4m4-4v4M4 10h4m-4 4h4m8-4h4m-4 4h4",
  // shield
  shield: "M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Zm-3 9 2 2 4-4",
  // a wallet with a clasp
  wallet: "M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7Zm0 0 11-3v3M15 12.5h5v3h-5a1.5 1.5 0 0 1 0-3Z",
  // a chip with a spark: models and GPUs
  compute: "M7 7h10v10H7zM9.5 4v3m5-3v3m-5 10v3m5-3v3M4 9.5h3m-3 5h3m10-5h3m-3 5h3M12 9.5l1 2 2 .5-2 1-1 2-1-2-2-1 2-.5 1-2Z",
  // a gauge: everything at a glance
  overview: "M4 16a8 8 0 1 1 16 0M12 16l4-5M6.5 16h0M17.5 16h0M12 8.5v0M4 20h16",
  // a grid of four
  tools: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  // a clock over a gap: stock tokens that trade while the market is shut
  stocks: "M12 12.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9ZM12 5.5V8l1.6 1.1M4 20l4-4 3 2 5-5M16 13h3v3",
  // pie
  portfolio: "M12 3v9h9a9 9 0 1 1-9-9Zm3-1a8 8 0 0 1 7 7h-7V2Z",
};

export function NavIcon({ id, className, style }: { id: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className} style={style}>
      <path d={P[id] ?? P.check} />
    </svg>
  );
}
