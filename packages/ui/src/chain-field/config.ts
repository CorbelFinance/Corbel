/**
 * Every tunable number of the Chain Field lives here. Change by eye, not by logic.
 * Notes say why when a value changed.
 */
export const CHAIN = {
  cursorRadius: 240, // px: spawn radius around the pointer
  spawnDistance: 24, // px of pointer travel between spawns
  maxSpawnPerSec: 10,
  runnerSpeed: 1100, // px/s, ±20%
  speedJitter: 0.2,
  tailLength: [150, 350] as const, // px
  runnerTtl: [0.9, 1.3] as const, // s
  straightP: 0.62,
  branchP: 0.18,
  maxDepth: 2,
  maxRunners: 24,
  maxPackets: 8,
  maxLabels: 3,
  staticAlpha: 0.05,
  nearAlpha: 0.2,
  glowWidth: 3,
  glowAlpha: 0.12,
  cornerPulseMs: 280,
  edgeLitMs: 400,
  packetSpeed: 60, // px/s
  ambientPackets: 5,
  redEvery: 12, // one packet in N is red ("failed the check")
  labelChance: 1 / 12,
  labelMs: 600,
  minSegment: 24, // px
  obstaclePad: 12, // px around text outside nodes
  maxVertices: 4000,
  idleAfterMs: 600,
  maxFromCursor: 420, // px: runners fade past this
  hugNodes: 140, // px: grid lines exist only this close to a node, so the lattice hugs the blocks
  bus: false, // horizontal bus above each row: off, it drew a strip of thin cells against section dividers
  busOffset: 28, // px: bus search distance when enabled
  touchRunnerEveryMs: 2500,
  touchPackets: 3,
  fastScrollPx: 40,
  startAfterMs: 3800, // ms after navigation: the intro presentation ends at ~3.7 s
} as const;

/** Widened type so tests can pass their own numbers. */
export type ChainConfig = {
  [K in keyof typeof CHAIN]: (typeof CHAIN)[K] extends number ? number : (typeof CHAIN)[K];
};
