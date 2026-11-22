import { DecisionEntry } from "../schemas";

/** Mock data for the decision log layout. */
export const EXAMPLE_LOG = DecisionEntry.array().parse([
  { t: "T+00:00", action: "BUY", asset: "TOKEN-A", why: "Trust check passed. Size inside the per-trade cap.", withinLimits: true },
  { t: "T+00:42", action: "HOLD", asset: "TOKEN-A", why: "Signal below threshold.", withinLimits: true },
  { t: "T+01:15", action: "SELL", asset: "TOKEN-A", why: "Take-profit rule met.", withinLimits: true },
  { t: "T+02:03", action: "STOP", asset: "ALL", why: "Daily drawdown cap reached. Agent paused.", withinLimits: false },
]);
