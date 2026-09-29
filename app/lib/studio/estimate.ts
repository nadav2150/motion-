// Worst-case credit reservations for Studio (v2) operations. 1 credit =
// $0.001 of upstream cost. reconcileJob() refunds whatever is not consumed,
// so these round UP. Tune after measuring real jobs (PostHog model_cost).
//
// Where the numbers come from (Opus 5.5: $4/M in, $20/M out):
//   plan call    ~20k in + ~8k out (thinking + JSON)          ≈ 240
//   code call    ~25k in + ~45k out (thinking + full HTML)    ≈ 1,000
//   → STUDIO_BASE 1,500 covers plan + code with headroom.
//   repair       ~50k in (doc + errors) + ~10k out, up to 2   ≈ 2 × 400
//   review       12 frames + doc ~45k in + ~8k out            ≈ 300
//   voiceover    ElevenLabs $0.30 / 1k chars, ~15 chars/s     150–300
//   reference    Gemini 3.5 Flash, video tokens               50
//   images       Flux 1.1 Pro Ultra $0.06 each, max 4         60 each
//   render       own compute, 5 credits per output second (x2 at 4K)

import type { ExportResolution } from "./types";

export const CREDITS_STUDIO_BASE = 1_500;
export const CREDITS_STUDIO_REPAIR = 400; // per repair round
export const MAX_REPAIR_ROUNDS = 2;
export const CREDITS_STUDIO_REVIEW = 300;
export const CREDITS_STUDIO_REFERENCE = 50;
export const CREDITS_STUDIO_IMAGE = 60;
export const MAX_GENERATED_IMAGES = 4;
export const CREDITS_VOICEOVER_MIN = 150;
export const CREDITS_VOICEOVER_MAX = 300;
export const CREDITS_MUSIC = 1;
export const CREDITS_RENDER_PER_SECOND = 5;
export const CREDITS_EDIT_PATCH = 250;
export const CREDITS_EDIT_REWRITE = 900;

const VO_CHARS_PER_SECOND = 15;
const ELEVENLABS_CREDITS_PER_CHAR = 0.3;

export type StudioEstimateInput = {
  targetDuration: number;
  maxDuration: number; // hard ceiling on the rendered length
  voiceover: boolean;
  music: boolean;
  reference: boolean;
  generatedImages?: number; // default MAX_GENERATED_IMAGES
  render?: boolean; // initial job renders the MP4 (default true)
  resolution?: ExportResolution;
};

export type StudioEstimate = {
  base: number;
  repair: number;
  review: number;
  reference: number;
  images: number;
  voiceover: number;
  music: number;
  render: number;
  total: number;
};

export function voiceoverCredits(seconds: number): number {
  const chars = seconds * VO_CHARS_PER_SECOND;
  return Math.min(
    CREDITS_VOICEOVER_MAX,
    Math.max(CREDITS_VOICEOVER_MIN, Math.ceil(chars * ELEVENLABS_CREDITS_PER_CHAR)),
  );
}

export function renderCredits(seconds: number, resolution: ExportResolution = "1080p"): number {
  const mult = resolution === "4k" ? 2 : 1;
  return Math.ceil(Math.max(0, seconds) * CREDITS_RENDER_PER_SECOND * mult);
}

export function estimateStudioJob(input: StudioEstimateInput): StudioEstimate {
  const base = CREDITS_STUDIO_BASE;
  const repair = CREDITS_STUDIO_REPAIR * MAX_REPAIR_ROUNDS;
  const review = CREDITS_STUDIO_REVIEW;
  const reference = input.reference ? CREDITS_STUDIO_REFERENCE : 0;
  const images = CREDITS_STUDIO_IMAGE * Math.max(0, input.generatedImages ?? MAX_GENERATED_IMAGES);
  const voiceover = input.voiceover ? voiceoverCredits(input.maxDuration) : 0;
  const music = input.music ? CREDITS_MUSIC : 0;
  const render = input.render === false ? 0 : renderCredits(input.maxDuration, input.resolution);
  return {
    base,
    repair,
    review,
    reference,
    images,
    voiceover,
    music,
    render,
    total: base + repair + review + reference + images + voiceover + music + render,
  };
}

/**
 * Chat edit. Patch edits usually cost ~250; a fallback full rewrite ~900.
 * We cannot know in advance whether the patch will apply, so the default
 * reservation is the rewrite ceiling plus one repair round.
 */
export function estimateStudioEdit(opts: { expectRewrite?: boolean } = {}): number {
  const call = opts.expectRewrite === false ? CREDITS_EDIT_PATCH : CREDITS_EDIT_REWRITE;
  return call + CREDITS_STUDIO_REPAIR;
}

export function estimateStudioRender(seconds: number, resolution: ExportResolution): number {
  return renderCredits(seconds, resolution);
}
