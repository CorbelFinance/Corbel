import type { SceneId } from "./DotScene";

/** Which scene and tone each tool shows. */
export const SCENE_OF: Record<string, { scene: SceneId; tone: string }> = {
  "trust-check": { scene: "scan", tone: "#6cc0d0" },
  "trust-radar": { scene: "sonar", tone: "#6cc0d0" },
  "trade-quote": { scene: "helix", tone: "#5be49b" },
  "exit-split": { scene: "helix", tone: "#5be49b" },
  "whale-radar": { scene: "sonar", tone: "#5be49b" },
  "stock-market": { scene: "cube", tone: "#f2c46d" },
  "stock-desk": { scene: "cube", tone: "#f2c46d" },
  "earn-pools": { scene: "rings", tone: "#7fd1b9" },
  "launch-analytics": { scene: "array", tone: "#e8a07a" },
  strategies: { scene: "lattice", tone: "#93a6ff" },
  "agent-guard": { scene: "lattice", tone: "#93a6ff" },
  "mandate-lab": { scene: "lattice", tone: "#93a6ff" },
  "decision-log": { scene: "lattice", tone: "#93a6ff" },
  "agent-hub": { scene: "lattice", tone: "#93a6ff" },
  "agent-limits": { scene: "lattice", tone: "#93a6ff" },
  predict: { scene: "array", tone: "#9b86e4" },
  compute: { scene: "stack", tone: "#ff9a5c" },
  wallet: { scene: "net", tone: "#ff8fa3" },
};
