/** Line icons for the roadmap cards, drawn for Corbel on a 24-unit grid. */
const P: Record<string, string> = {
  candles: "M6 4v3m0 8v5M4 7h4v8H4zM12 3v4m0 6v8M10 7h4v6h-4zM18 6v5m0 5v4M16 11h4v5h-4z",
  route: "M5 6a2 2 0 1 0 0 .01M19 18a2 2 0 1 0 0 .01M5 8v3a3 3 0 0 0 3 3h8a3 3 0 0 1 3 3v-1M7 6h10l-2-2m2 2-2 2",
  split: "M4 12h6m0 0 4-5h6m-10 5 4 5h6M18 5l2 2-2 2m0 6 2 2-2 2",
  whale: "M3 13c2 4 6 6 10 6 5 0 8-3 8-7l-3 1c0-3-2-5-5-5-4 0-6 3-6 6H3Zm12-2h0M18 6l2-3m0 3-2-3",
  book: "M4 5h7v14H4zM13 5h7v14h-7zM6 8h3m-3 3h3m-3 3h2m6-6h3m-3 3h3m-3 3h2",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2",
  scan: "M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3m4-4 3 3 5-6",
  doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6m-6 3h6m-6 3h4",
  radar: "M12 21a9 9 0 1 1 9-9M12 17a5 5 0 1 1 5-5M12 12l7-7M12 13a1 1 0 1 0 0-2",
  bars: "M4 20h16M6 16v-4m4 4V8m4 8v-6m4 6V5",
  people: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6m2 3c2 .7 3 3 3 6",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4a2 2 0 0 0 4 0",
  badge: "M12 3l2.4 1.8 3-.2.8 2.9 2.4 1.8-1 2.8 1 2.8-2.4 1.8-.8 2.9-3-.2L12 21l-2.4-1.8-3 .2-.8-2.9-2.4-1.8 1-2.8-1-2.8 2.4-1.8.8-2.9 3 .2L12 3Zm-3 9 2 2 4-4",
  gap: "M3 15h6m6-6h6M9 15l6-6M9 19v-4m6-6V5",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6Zm6-2v14m6-12v14",
  coins: "M9 10c3.3 0 6-1.1 6-2.5S12.3 5 9 5 3 6.1 3 7.5 5.7 10 9 10Zm-6-2.5v4C3 12.9 5.7 14 9 14s6-1.1 6-2.5v-4M15 12c3.3 0 6 1.1 6 2.5S18.3 17 15 17s-6-1.1-6-2.5m12 0v3C21 18.9 18.3 20 15 20s-6-1.1-6-2.5v-3",
  umbrella: "M3 12a9 9 0 0 1 18 0H3Zm9 0v6a2 2 0 0 0 4 0M12 3v0",
  fork: "M12 20v-6m0 0L6 8m6 6 6-6M6 8V4m0 4H3m3 0h3m9 0V4m0 4h-3m3 0h3",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4M8 14h2m4 0h2m-8 3h2",
  wallet: "M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7Zm0 0 11-3v3M15 12.5h5v3h-5a1.5 1.5 0 0 1 0-3Z",
  sliders: "M5 4v16M12 4v16M19 4v16M3 8h4m3 6h4m3-4h4",
  gate: "M4 20V8l8-4 8 4v12M8 20v-8h8v8M4 12h4m8 0h4",
  bolt: "M13 3 5 13h6l-1 8 8-10h-6l1-8Z",
  list: "M9 6h11M9 12h11M9 18h11M4 6h1m-1 6h1m-1 6h1",
  plug: "M9 3v5m6-5v5M7 8h10v3a5 5 0 0 1-10 0V8Zm5 8v5",
  lock: "M6 11h12v10H6zM8 11V8a4 4 0 1 1 8 0v3m-4 4v2",
  chip: "M7 7h10v10H7zM9.5 4v3m5-3v3m-5 10v3m5-3v3M4 9.5h3m-3 5h3m10-5h3m-3 5h3",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm6 12 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z",
  film: "M4 5h16v14H4zM8 5v14m8-14v14M4 9h4m-4 6h4m8-6h4m-4 6h4",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  gpu: "M3 7h18v10H3zM7 17v3m4-3v3m4-3v3M8 12a2 2 0 1 0 0 .01M16 12a2 2 0 1 0 0 .01",
  chat: "M4 5h16v11H9l-5 4V5Zm4 5h8m-8 3h5",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  wave: "M3 6l5 7 4-4 5 8 4-3M3 20h18",
  paper: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Zm4 5h6m-6 4h6m-6 4h3",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  rocket: "M14 4c3 1 5 3 6 6l-6 6-6-6 6-6ZM8 10l-3 1-1 3 4-1M14 16l-1 3-3 1 1-4M15.5 8.5h0",
  gavel: "M13 4l7 7m-9-5 7 7m-9-4 4 4M10 9l-7 7 2 2 7-7M4 21h9",
  api: "M8 7l-5 5 5 5m8-10 5 5-5 5M14 5l-4 14",
  layers: "M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  shield: "M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Zm-3 9 2 2 4-4",
};

export function RoadIcon({ id, className }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={P[id] ?? P.spark} />
    </svg>
  );
}
