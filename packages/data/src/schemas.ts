import { z } from "zod";

export const CheckResult = z.enum(["pass", "warn", "fail", "unknown"]);

export const TrustCheck = z.object({
  id: z.enum(["honeypot", "exit", "tax", "owner", "liquidity", "ticker", "creator"]),
  name: z.string(),
  result: CheckResult,
  reason: z.string(),
  /** short measured value shown next to the result, e.g. "4.2%" */
  metric: z.string().optional(),
  /** the measured numbers behind the result, for the score (shares as 0..1) */
  value: z.record(z.string(), z.number()).optional(),
  /** where this result was read and when: the chain at a block, or Corbel's own index; partial when a part is missing */
  source: z.object({ from: z.string(), block: z.string().nullable(), at: z.number(), partial: z.boolean() }).optional(),
});

export const TrustReport = z.object({
  token: z.string(),
  example: z.boolean(),
  checks: z.array(TrustCheck),
  /** what the checks were run against; absent on the example */
  meta: z
    .object({
      symbol: z.string().nullable(),
      name: z.string().nullable(),
      venue: z.string().nullable(),
      pool: z.string().nullable(),
      block: z.string(),
      ms: z.number(),
    })
    .optional(),
  /** wallets the creator exempted from the launch fee, read from the launch transaction; not scored */
  waivers: z
    .object({
      tx: z.string(),
      block: z.string(),
      wallets: z.number(),
      bought: z.number(),
      fast: z.number(),
      buyers: z.number(),
      eth: z.number(),
      holdNow: z.number().nullable(),
      top: z.array(z.object({ address: z.string(), bought: z.number() })),
    })
    .optional(),
});

export type TrustReport = z.infer<typeof TrustReport>;
export type TrustCheck = z.infer<typeof TrustCheck>;

export const DecisionEntry = z.object({
  t: z.string(),
  action: z.enum(["BUY", "SELL", "HOLD", "STOP"]),
  asset: z.string(),
  why: z.string(),
  withinLimits: z.boolean(),
});
export type DecisionEntry = z.infer<typeof DecisionEntry>;
