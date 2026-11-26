/**
 * Holder prompts: design intent. Holders of the Corbel token get a daily allowance of prompts for an image model
 * (Nano Banana) and a voice model (ElevenLabs), paid from one shared daily pool.
 *
 * The formula, per wallet and per day (resets 00:00 UTC, unused credits do not roll over):
 *
 *   B   = time-weighted average balance over the last `twabDays` days
 *   w   = sqrt(B / minHold) when B >= minHold, else 0        (square root: 4x the tokens, 2x the weight)
 *   L   = 1 + maxLoyalty * min(1, d / loyaltyDays)          (d = days held above minHold without a break)
 *   s   = w * L / sum over all holders of (w * L)           (this wallet's share of the day)
 *   credits = min(capPerWallet, dailyPool * s)
 *
 * Why: the average balance stops buying or borrowing tokens just before the reset; the square root gives larger
 * holders more without letting them take the pool; the loyalty factor rewards time held, not size; the pool and the
 * cap keep the day's spend inside a fixed budget. A prompt costs `cost` credits per unit of each model.
 *
 * The numbers that set the size (minHold, dailyPool, capPerWallet, cost) are not set yet: null until announced.
 */
export type HolderModel = { id: "image" | "voice"; label: string; maker: string; unit: string; cost: number | null };

export const HOLDER_ACCESS = {
  status: "design intent" as const,
  twabDays: 7,
  loyaltyDays: 60,
  maxLoyalty: 0.5,
  minHold: null as number | null,
  dailyPool: null as number | null,
  capPerWallet: null as number | null,
  models: [
    { id: "image", label: "Nano Banana", maker: "Google", unit: "image", cost: null },
    { id: "voice", label: "ElevenLabs voice", maker: "ElevenLabs", unit: "thousand characters", cost: null },
  ] as HolderModel[],
};

/** One wallet's weight: zero under the minimum, the square root of the balance in minimums above it, times loyalty. */
export function holderWeight(avgBalance: number, minHold: number, daysHeld: number, p = HOLDER_ACCESS): number {
  if (!(minHold > 0) || !(avgBalance >= minHold)) return 0;
  const loyalty = 1 + p.maxLoyalty * Math.min(1, Math.max(0, daysHeld) / p.loyaltyDays);
  return Math.sqrt(avgBalance / minHold) * loyalty;
}

/** The day's credits for each wallet: a share of the pool by weight, each capped. Capped-off credits stay in the pool. */
export function dailyCredits(weights: number[], dailyPool: number, capPerWallet: number): number[] {
  const out = weights.map(() => 0);
  let left = dailyPool;
  let open = weights.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0);
  // hand out by weight; a wallet that hits its cap is closed and the rest is shared again
  for (let round = 0; round < weights.length && open.length && left > 1e-9; round++) {
    const sum = open.reduce((a, i) => a + weights[i]!, 0);
    let spent = 0;
    const still: number[] = [];
    for (const i of open) {
      const want = (left * weights[i]!) / sum;
      const room = capPerWallet - out[i]!;
      const give = Math.min(want, room);
      out[i] = out[i]! + give;
      spent += give;
      if (out[i]! < capPerWallet - 1e-9) still.push(i);
    }
    left -= spent;
    if (still.length === open.length) break;
    open = still;
  }
  return out;
}

/**
 * AI access by holding (four tiers since 2026-11-23, two before), replacing the pooled formula above. Tiers by coins held,
 * where "held" is the lowest balance over the last `holdDays` days, so coins moved from wallet to wallet or borrowed for
 * a minute do not count. Wallets found to belong to one person share one tier's limits. Counts reset 00:00 UTC.
 * `cap` is the most a wallet may spend a day in generation credits, whatever the counts allow.
 */
export type AiTier = {
  id: "light" | "plus" | "full" | "core";
  name: string;
  minCoins: number;
  text: number;
  chars: number;
  image: number;
  video: number;
  voice: number;
  music: number;
  upscale: number;
  cap: number;
  models: string;
  quality: string;
  /** what Credits add on top of the list price for this tier, 0..1 (the base is CREDITS_MARKUP) */
  markup: number;
  /** free GPU minutes a day (0 = none) */
  gpuMinutes: number;
  /** multiplier on the per-minute API limits */
  apiBoost: number;
  /** tokens followed with Telegram alerts; null = no limit */
  alerts: number | null;
  /** wallets this tier's drain alarm watches; null = no limit */
  drain: number | null;
  /** bonus added to a Credits top-up, 0..1 */
  topUpBonus: number;
  /** what else this tier opens, in one line */
  extra: string;
};
/** A signed-in wallet with no tier: the free level (chat and media counts come from the panel limits). */
export const FREE_LEVEL = { drain: 1, topUpBonus: 0, markup: 0.1 } as const;
/** What Credits add on top of the list price for a wallet with no tier. */
export const CREDITS_MARKUP = 0.1;
/** Models open to Full holders across text, pictures, video, voice and music: the one number every page uses. */
export const FULL_MODELS = 185;

export const AI_ACCESS = {
  holdDays: 7,
  lightShare: 0.3,
  // thresholds for Plus and Core are a proposal (sprint plan, round 4) until the owner sets them
  tiers: [
    { id: "light", name: "Light", minCoins: 100_000, text: 100, chars: 6000, image: 15, video: 3, voice: 10, music: 0, upscale: 0, cap: 20, models: "More models than a signed-in wallet in standard quality: pictures, short video and voice", quality: "Standard", markup: 0.1, gpuMinutes: 0, apiBoost: 2, alerts: 10, drain: 3, topUpBonus: 0.05, extra: "Holder card" },
    { id: "plus", name: "Plus", minCoins: 1_000_000, text: 150, chars: 8000, image: 30, video: 5, voice: 20, music: 2, upscale: 1, cap: 40, models: `All ${FULL_MODELS} models: every picture, video, voice and music model`, quality: "Full", markup: 0.075, gpuMinutes: 15, apiBoost: 3, alerts: 30, drain: 5, topUpBonus: 0.15, extra: "Free GPU time every day" },
    { id: "full", name: "Full", minCoins: 2_500_000, text: 200, chars: 8000, image: 50, video: 8, voice: 30, music: 3, upscale: 3, cap: 60, models: `All ${FULL_MODELS} models at full quality, upscale included`, quality: "Full", markup: 0.035, gpuMinutes: 30, apiBoost: 5, alerts: 100, drain: 10, topUpBonus: 0.25, extra: "The model panel on every token check" },
    { id: "core", name: "Core", minCoins: 10_000_000, text: 300, chars: 8000, image: 100, video: 15, voice: 50, music: 5, upscale: 5, cap: 100, models: `All ${FULL_MODELS} models at full quality, first in the queue`, quality: "Full", markup: 0, gpuMinutes: 60, apiBoost: 10, alerts: null, drain: null, topUpBonus: 0.3, extra: "First in the queue for models and GPUs" },
  ] as AiTier[],
};

/** The tier that opens every model (Plus since 2026-11-26); every tier above it keeps that. */
export const FULL_TIER = AI_ACCESS.tiers.find((t) => t.id === "plus")!;
/** True for the tier that opens every model and every tier above it. */
export const hasFull = (t: AiTier | null | undefined) => !!t && t.minCoins >= FULL_TIER.minCoins;
/** What Credits add for this tier (the base markup without one). */
export const markupFor = (t: AiTier | null | undefined) => t?.markup ?? CREDITS_MARKUP;

/** Bonus on a Credits top-up for this tier (none without one). */
export const topUpBonusFor = (t: AiTier | null | undefined) => t?.topUpBonus ?? FREE_LEVEL.topUpBonus;
/** Wallets the drain alarm watches for this owner's tier; null = no limit. */
export const drainFor = (t: AiTier | null | undefined) => (t ? t.drain : FREE_LEVEL.drain);

/** The tier for a balance held through the whole window (the lowest balance of the last `holdDays` days). */
export function aiTier(heldCoins: number): AiTier | null {
  return [...AI_ACCESS.tiers].reverse().find((t) => heldCoins >= t.minCoins) ?? null;
}

/**
 * Free GPU time for Full holders: one machine at a time, up to `minutesPerDay` and `startsPerDay` a day per wallet,
 * all holders together at most `budgetUsdDay` a day; a machine stops itself when its time is up. `choices` are the
 * GPU types offered, each with the most an hour may cost us (a dearer quote is refused, never started).
 */
export const GPU_FREE = {
  // beta limits: short sessions and few machines keep the free time hard to abuse; raise them once it has run a while
  minutesPerDay: 30,
  startsPerDay: 3,
  budgetUsdDay: 3,
  maxAtOnce: 2,
  diskGb: 20,
  choices: [
    { id: "a40", label: "48 GB GPU", gpu: "NVIDIA A40", vram: 48, maxHourly: 0.7, line: "Big models, pictures and video" },
    { id: "4090", label: "24 GB fast GPU", gpu: "NVIDIA GeForce RTX 4090", vram: 24, maxHourly: 1.0, line: "Fastest for pictures and smaller models" },
    { id: "a100", label: "80 GB GPU", gpu: "NVIDIA A100 80GB PCIe", vram: 80, maxHourly: 2.3, line: "The biggest open models and training" },
  ],
  /**
   * What the machine opens to. Each is a ready program behind the same gate; the holder is signed in to it by the link.
   * The images and ports behind each live in the server's private provider module, not here.
   */
  apps: [
    { id: "images", label: "Pictures & video", app: "ComfyUI", line: "Make images and video in a visual editor. Models download from inside it." },
    { id: "chat", label: "Chat", app: "Open WebUI", line: "Chat with open models like Llama and Qwen, on your own GPU." },
    { id: "code", label: "Code", app: "Jupyter", line: "Python notebooks and a terminal, with a Start here notebook." },
  ],
  /** Shown as coming, not startable yet: the stronger machines, opened once the free time has run a while. */
  soon: [
    { id: "l40s", label: "48 GB pro GPU", vram: 48, line: "Faster video and pictures" },
    { id: "h100", label: "80 GB fastest GPU", vram: 80, line: "Fast training and big models" },
    { id: "pro6000", label: "96 GB GPU", vram: 96, line: "Very large models on one card" },
    { id: "h200", label: "141 GB GPU", vram: 141, line: "The largest models, long context" },
    { id: "b200", label: "180 GB GPU", vram: 180, line: "The newest generation" },
  ],
} as const;
export type GpuChoice = (typeof GPU_FREE.choices)[number];

/** Paid GPU time from Credits: any signed-in wallet, the same machines and programs, billed by the minute from ready. */
export const GPU_PAID = { minutes: [15, 30, 60, 120, 240], maxAtOnce: 5 } as const;
