import type { Model } from "./compute";

/**
 * Picture, film and sound models that open later in Compute. Listed so people can see what is coming; no price
 * until they open. Models already in the live catalogue are not repeated here.
 */
type M = [id: string, name: string, kind: Model["kind"], inp: string[], out: string[], about: string];
const T = ["text"], TI = ["text", "image"], TIV = ["text", "image", "video"];
const LIST: M[] = [
  ["kuaishou/kling", "Kling", "video", TI, ["video"], "Text or a picture into a film clip with steady motion and real camera moves."],
  ["google/veo-3.1", "Veo 3.1", "video", TI, ["video"], "Film clips with sound from a prompt or a frame, with control over the first and last frame."],
  ["openai/sora-2", "Sora 2", "video", TI, ["video"], "Short films with synced sound and physics that hold up across shots."],
  ["bytedance/seedance-2.5", "Seedance 2.5", "video", TIV, ["video"], "Multi-shot clips from text, pictures and reference videos; edits an existing clip too."],
  ["bytedance/seedance-2.0", "Seedance 2.0", "video", TI, ["video"], "Fast multi-shot video with dynamic scenes and consistent characters."],
  ["runway/gen-4", "Runway Gen-4", "video", TI, ["video"], "Cinematic clips that keep a character and a place the same from shot to shot."],
  ["alibaba/wan", "Wan Video", "video", TI, ["video"], "Open video model: text or a picture into a clip, strong on motion."],
  ["minimax/hailuo", "Hailuo", "video", TI, ["video"], "Clips with expressive faces and lively action from text or a picture."],
  ["luma/ray", "Luma Ray", "video", TI, ["video"], "Smooth, realistic motion with keyframes to steer the shot."],
  ["black-forest-labs/flux-3-video", "FLUX 3 Video", "video", TI, ["video"], "Video from the FLUX family, sharp detail and close prompt following."],
  ["x-ai/grok-imagine", "Grok Imagine", "video", TI, ["image", "video"], "Pictures and short clips with sound from one prompt."],
  ["heygen/avatar", "HeyGen Avatar", "video", ["text", "image", "audio"], ["video"], "A talking presenter from a photo and a voice or a script, lip-synced."],
  ["higgsfield/video", "Higgsfield", "video", TI, ["video"], "Camera-move presets (crash zoom, orbit, dolly) on top of leading video models."],
  ["bytedance/seedream-5-pro", "Seedream 5 Pro", "image", TI, ["image"], "Photoreal pictures and text-guided edits of your own pictures, up to 4K."],
  ["black-forest-labs/flux-3", "FLUX 3", "image", TI, ["image"], "Pictures with fine detail, readable text and close prompt following; edits with references."],
  ["ideogram/ideogram-3", "Ideogram 3", "image", TI, ["image"], "Posters, logos and pictures where the lettering has to be right."],
  ["runway/frames", "Runway Frames", "image", TI, ["image"], "Stills with a consistent look, made for storyboards and art direction."],
  ["higgsfield/soul", "Higgsfield Soul", "image", TI, ["image"], "Fashion-grade portraits and lifestyle photos with natural skin and light."],
  ["qwen/qwen-image", "Qwen Image", "image", TI, ["image"], "Pictures and edits with strong text rendering in many languages."],
  ["luma/uni-1", "Luma Uni-1", "image", TI, ["image"], "Pictures that follow the style of your references."],
  ["topaz/upscale", "Topaz Upscale", "image", TIV, ["image", "video"], "Sharpens and enlarges pictures and video without the plastic look."],
  ["magnific/upscale", "Magnific", "image", TI, ["image"], "Upscales pictures and adds believable detail as it does."],
  ["suno/suno", "Suno", "audio", T, ["audio"], "Full songs with vocals from a prompt or your own lyrics."],
  ["elevenlabs/voice", "ElevenLabs", "audio", T, ["audio"], "Natural speech in many voices and languages; voice cloning and dubbing."],
];

export const MEDIA: (Model & { media: true })[] = LIST.map(([id, name, kind, inp, out, about]) => ({ id, name, maker: id.split("/")[0]!, ctx: 0, pin: 0, pout: 0, pimg: null, in: inp, out, created: 0, about, kind, media: true }));
