// Worst-case cost estimator. Used at job creation to reserve credits BEFORE
// any external API fires. Rounded UP everywhere — the defensive margin
// posture means we'd rather over-reserve and refund than under-reserve and
// eat the difference. See the PLAN file for the per-operation table.

import { MAX_SHOTS } from "../director";

// Per-job flat cost: director + blueprint + audio direction + headroom.
// Real-data: $0.18 + $0.39 + $0.20 = $0.77/job average; round up to $1.10
// to absorb variance in audio_direction (varies with scene count).
export const CREDITS_JOB_BASE = 1_100;
// Per-scene: image $0.08 + vision $0.0015 + opus_scene_fill worst-case $0.92.
// PostHog showed scene_fill at $0.78/call avg with cache misses; with cache
// reuse this falls to ~$0.25 but reservation stays at the no-cache worst case.
export const CREDITS_PER_SCENE_BASE = 1_000;
// Per-scene Replicate video clip (Kling 2.1 master, 5s @ $0.50). Only billed
// when input.video=true — gated by user toggle in the generator screen.
export const CREDITS_PER_SCENE_VIDEO = 500;
// ElevenLabs multilingual_v2 @ ~500 chars worst-case ($0.30/1k chars).
export const CREDITS_PER_SCENE_VOICEOVER = 150;
export const CREDITS_PER_SCENE_SFX = 20;        // Freesound search (cheap) + extra Opus tokens for sfx plan
export const CREDITS_MUSIC_FLAT = 30;           // Jamendo search + Opus music-pick tokens
export const CREDITS_PER_SCENE_CRITIQUE = 100;  // GPT-4o vision + Opus critique tokens per scene
export const CREDITS_FILM_POLISH = 600;         // Opus film critique + polish refinement

export type EstimateInput = {
  // Best-known scene count. Pass null/undefined when the LLM hasn't run yet
  // — we default to MAX_SHOTS so the reservation is the true worst case.
  sceneCountGuess?: number | null;
  // True when the user opted into per-scene Replicate video clips. When
  // false, only the still image is generated and CREDITS_PER_SCENE_VIDEO
  // is omitted from the reservation.
  video: boolean;
  audioVoiceover: boolean;
  audioMusic: boolean;
  audioSfx: boolean;
  autoCritique?: boolean;
  // True when this estimate is for an /improve or /critique call that
  // exercises the polish pipeline.
  includePolish?: boolean;
};

export type EstimateBreakdown = {
  scenes: number;
  jobBase: number;
  base: number;
  video: number;
  voiceover: number;
  music: number;
  sfx: number;
  critique: number;
  polish: number;
  total: number;
};

export function estimateJobCost(input: EstimateInput): number {
  return estimateJobCostBreakdown(input).total;
}

export function estimateJobCostBreakdown(input: EstimateInput): EstimateBreakdown {
  // Defensive: when we don't know the scene count yet, assume the maximum.
  // Reservation is the cap — if the LLM picks fewer scenes, reconcile refunds
  // the unused credits.
  const scenes = clampScenes(input.sceneCountGuess);
  const jobBase = CREDITS_JOB_BASE;
  const base = scenes * CREDITS_PER_SCENE_BASE;
  const video = input.video ? scenes * CREDITS_PER_SCENE_VIDEO : 0;
  const voiceover = input.audioVoiceover ? scenes * CREDITS_PER_SCENE_VOICEOVER : 0;
  const music = input.audioMusic ? CREDITS_MUSIC_FLAT : 0;
  const sfx = input.audioSfx ? scenes * CREDITS_PER_SCENE_SFX : 0;
  const critique = input.autoCritique ? scenes * CREDITS_PER_SCENE_CRITIQUE : 0;
  const polish = input.includePolish ? CREDITS_FILM_POLISH : 0;
  return {
    scenes,
    jobBase,
    base,
    video,
    voiceover,
    music,
    sfx,
    critique,
    polish,
    total: jobBase + base + video + voiceover + music + sfx + critique + polish,
  };
}

function clampScenes(guess: number | null | undefined): number {
  if (typeof guess !== "number" || !Number.isFinite(guess) || guess <= 0) {
    return MAX_SHOTS;
  }
  return Math.min(MAX_SHOTS, Math.ceil(guess));
}
