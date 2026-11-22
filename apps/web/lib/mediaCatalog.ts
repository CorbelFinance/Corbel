/**
 * Pictures, film and sound in the chat: the models offered, their options and what each choice costs (in
 * service credits). Shared by the chat (to draw the options) and the
 * server (to check a request before it is sent).
 */
export type MediaKind = "image" | "video" | "audio";
export type MediaOption = { id: string; label: string; values: (string | number)[]; default: string | number; unit?: string };
export type MediaModel = {
  id: string;
  kind: MediaKind;
  label: string;
  maker: string;
  line: string;
  /** upstream route: service and model type */
  ai: string;
  type: string;
  options: MediaOption[];
  /** cost in upstream tokens for a set of options and the prompt's length (speech is priced per character) */
  cost: (o: Record<string, string | number>, chars: number) => number;
  /** settings sent upstream as they are, whatever the options */
  fixed?: Record<string, string | number>;
  /** turns the chosen options into upstream settings (a voice name into its id) */
  map?: (o: Record<string, string | number>) => Record<string, string | number>;
  /** longest prompt this model takes, in characters */
  maxPrompt?: number;
  /** typical seconds from send to the finished file, measured */
  seconds: number;
};

const ASPECT_IMAGE: MediaOption = { id: "aspect_ratio", label: "Shape", values: ["1:1", "16:9", "9:16", "4:3", "3:4"], default: "1:1" };
const ASPECT_VIDEO: MediaOption = { id: "aspect_ratio", label: "Shape", values: ["16:9", "9:16", "1:1"], default: "16:9" };

/** Voices checked on 2026-11-18: each one spoke a test line. An unknown id is accepted upstream and never finishes. */
const VOICES: Record<string, string> = { George: "JBFqnCBsd6RMkjVDRZzb", Sarah: "EXAVITQu4vr4xnSDxMaL", Adam: "pNInz6obpgDQGcFmaJgB", Rachel: "21m00Tcm4TlvDq8ikWAM" };
const VOICE: MediaOption = { id: "voice", label: "Voice", values: Object.keys(VOICES), default: "George" };
const voiceId = (o: Record<string, string | number>) => ({ voice_id: VOICES[String(o.voice)] ?? VOICES.George! });

export const MEDIA_MODELS: MediaModel[] = [
  {
    id: "nano-2",
    kind: "image",
    label: "Nano Banana 2",
    maker: "google",
    line: "Sharp, follows the prompt closely",
    ai: "banana",
    type: "banana3",
    options: [ASPECT_IMAGE, { id: "image_size", label: "Quality", values: ["0.5K", "1K", "2K", "4K"], default: "1K" }],
    cost: (o) => ({ "0.5K": 1.5, "1K": 2, "2K": 3, "4K": 4 })[String(o.image_size)] ?? 4,
    seconds: 17,
  },
  {
    id: "nano-2-lite",
    kind: "image",
    label: "Nano Banana 2 Lite",
    maker: "google",
    line: "The cheapest and fastest",
    ai: "banana",
    type: "banana3_light",
    options: [ASPECT_IMAGE, { id: "image_size", label: "Quality", values: ["1K"], default: "1K" }],
    cost: () => 1.3,
    seconds: 15,
  },
  {
    id: "nano-pro",
    kind: "image",
    label: "Nano Banana Pro",
    maker: "google",
    line: "The most detail",
    ai: "banana",
    type: "banana2",
    options: [ASPECT_IMAGE, { id: "image_size", label: "Quality", values: ["1K", "2K", "4K"], default: "1K" }],
    cost: (o) => ({ "1K": 2, "2K": 2, "4K": 7.5 })[String(o.image_size)] ?? 7.5,
    seconds: 25,
  },
  {
    id: "seedance-fast",
    kind: "video",
    label: "Seedance Pro Fast",
    maker: "bytedance",
    line: "Quick clips, the lowest price",
    ai: "seedance",
    type: "seedance_pro-fast",
    options: [
      ASPECT_VIDEO,
      { id: "resolution", label: "Quality", values: ["480p", "720p", "1080p"], default: "480p" },
      { id: "video_duration", label: "Length", values: [3, 5, 10], default: 5, unit: "s" },
    ],
    cost: (o) => {
      const per = ({ "480p": 1.2, "720p": 2, "1080p": 4.8 } as Record<string, number>)[String(o.resolution)] ?? 4.8;
      return Math.round(per * Number(o.video_duration) * 10) / 10;
    },
    seconds: 120,
  },
  {
    id: "grok-video",
    kind: "video",
    label: "Grok Imagine",
    maker: "x-ai",
    line: "Lively motion and camera moves",
    ai: "grok_video",
    type: "grok_t2v",
    options: [
      ASPECT_VIDEO,
      { id: "resolution", label: "Quality", values: ["480p", "720p"], default: "480p" },
      { id: "video_duration", label: "Length", values: [6, 10], default: 6, unit: "s" },
    ],
    cost: (o) => (o.resolution === "720p" ? (o.video_duration === 10 ? 30 : 18) : o.video_duration === 10 ? 20 : 12),
    seconds: 90,
  },
  {
    id: "voice-turbo",
    kind: "audio",
    label: "Eleven v4 Turbo",
    maker: "elevenlabs",
    line: "Natural speech, half the price",
    ai: "elevenlabs",
    type: "eleven_v4_turbo",
    options: [VOICE],
    fixed: { mode: "text_to_speech" },
    map: voiceId,
    maxPrompt: 600,
    cost: (_o, n) => Math.ceil(n / 10) * 0.06,
    seconds: 8,
  },
  {
    id: "voice-v4",
    kind: "audio",
    label: "Eleven v4",
    maker: "elevenlabs",
    line: "The most expressive voice",
    ai: "elevenlabs",
    type: "eleven_v4",
    options: [VOICE],
    fixed: { mode: "text_to_speech" },
    map: voiceId,
    maxPrompt: 600,
    cost: (_o, n) => Math.ceil(n / 10) * 0.08,
    seconds: 10,
  },
];

export const mediaModel = (id: string) => MEDIA_MODELS.find((m) => m.id === id) ?? null;

/** The options a request may carry: only known keys, only allowed values; defaults fill the rest. */
export function cleanOptions(m: MediaModel, raw: Record<string, unknown> | undefined) {
  const out: Record<string, string | number> = {};
  for (const o of m.options) {
    const v = raw?.[o.id];
    out[o.id] = o.values.some((x) => x === v) ? (v as string | number) : o.default;
  }
  return out;
}
