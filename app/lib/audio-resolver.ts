// Audio resolver (Stage 1.75b of the v2 quality pipeline).
//
// Pure orchestration — no LLM calls. Takes the AudioPlan produced by
// generateAudioDirection and resolves every entry into a concrete URL:
//   • bgMusic    — searchTracks(jamendoQuery), pick top result with sane duration.
//   • voiceovers — generateVoiceover(text, voiceId, deliveryHint→voice settings),
//                  then upload the MP3 to Supabase Storage and return the public URL.
//   • sfxCues    — searchSfx(freesoundQuery), pick top result.
//
// All resolution happens in parallel. Per-item failures are logged and the
// item is dropped from the resolved bundle so the film still ships if one
// SFX search fails or ElevenLabs hiccups on one scene.

import { ElevenLabsError, generateVoiceover } from "./elevenlabs-tts";
import { searchSfx, type FreesoundLicense } from "./freesound-search";
import { getMeterContext } from "./billing/meter";
import { getPostHog } from "./posthog";
import {
  type AudioPlan,
  type AudioPlanSfxCue,
  type AudioPlanVoiceover,
  type AudioTrackToggles,
  type SfxKind,
  type VoiceoverDelivery,
} from "./hyperframes/llm-director";
import { searchTracks } from "./jamendo-search";
import { runWithConcurrency } from "./replicate";
import { uploadSceneAsset } from "./storage";

export type ResolvedBgMusic = {
  trackId: string;
  title: string;
  artist: string;
  streamUrl: string;
  durationSec: number;
};

export type ResolvedVoiceover = {
  sceneId: string;
  text: string;
  delivery: VoiceoverDelivery;
  voiceId: string;
  storagePath: string;
  publicUrl: string;
  // Round-tripped from AudioPlanVoiceover.startOffsetSeconds so the skeleton
  // builder can place data-start on the headline copy reveal instead of the
  // raw scene boundary. Default 0.3 when the plan omits it.
  startOffsetSeconds: number;
};

export type ResolvedSfxCue = {
  sceneId: string;
  momentSeconds: number;
  kind: SfxKind;
  id: string;
  name: string;
  url: string;
  license: FreesoundLicense;
  licenseUrl: string;
  volume: number;
};

export type ResolvedAudio = {
  bgMusic: ResolvedBgMusic | null;
  voiceovers: ResolvedVoiceover[];
  sfxCues: ResolvedSfxCue[];
};

export type ResolveAudioArgs = {
  jobId: string;
  plan: AudioPlan;
  /** Total film duration in seconds — used to filter bgMusic candidates that
   *  are too short to cover the film without abrupt re-loops. */
  totalFilmSeconds: number;
  /** Per-track opt-in flags from the job row. A disabled track skips its
   *  resolution stage entirely (no Jamendo / Freesound / ElevenLabs calls,
   *  no Storage writes) and resolves as empty/null on the returned bundle. */
  tracks: AudioTrackToggles;
  /** Sprint 3 — when re-resolving on Improve, pass the previous plan AND
   *  resolved bundle to skip API calls for entries whose plan fields are
   *  unchanged. Both must come from the same prior run. ElevenLabs is the
   *  load-bearing cost here. Omit on first runs. */
  previousPlan?: AudioPlan;
  previousResolved?: ResolvedAudio;
};

// ElevenLabs voice_settings tuning per deliveryHint. Higher stability =
// flatter, more consistent reads. Lower stability = more expressive.
// similarity_boost is kept near the default; the deliveryHint primarily
// shapes stability.
const DELIVERY_SETTINGS: Record<
  VoiceoverDelivery,
  { stability: number; similarityBoost: number }
> = {
  cinematic: { stability: 0.6, similarityBoost: 0.75 },
  energetic: { stability: 0.3, similarityBoost: 0.7 },
  intimate: { stability: 0.55, similarityBoost: 0.8 },
  deadpan: { stability: 0.85, similarityBoost: 0.7 },
  authoritative: { stability: 0.7, similarityBoost: 0.75 },
};

// Per-kind default playback volume (0..1). The skeleton emits these on the
// <audio> tag's data-volume attribute. Background music is mixed lower than
// SFX so the punches read; voiceover sits highest.
const SFX_VOLUME: Record<SfxKind, number> = {
  punch: 0.7,
  impact: 0.75,
  transition: 0.6,
  ambient: 0.45,
};

// ElevenLabs caps concurrent requests per SUBSCRIPTION TIER — exceeding the
// cap returns 429 concurrent_limit_exceeded. Observed on this account: the
// limit is 3 (a 2026-06 8-scene job lost 4 voiceovers when this was 5). The
// generateVoiceover retry/backoff is the real safety net; this cap just keeps
// us at or under the tier limit so retries rarely fire. Default 3 matches the
// current tier — raise via env on a higher tier (Creator=5, Pro=10, Scale=15).
const ELEVENLABS_VO_CONCURRENCY = Math.max(
  1,
  Number(process.env.ELEVENLABS_VO_CONCURRENCY ?? 3),
);

async function resolveBgMusic(
  query: string,
  totalFilmSeconds: number,
): Promise<ResolvedBgMusic | null> {
  try {
    const tracks = await searchTracks(query, 12);
    if (tracks.length === 0) {
      console.warn(`[audio resolve] bgMusic "${query}" — no Jamendo results`);
      return null;
    }
    // Prefer the first track whose duration covers >= 80% of the film so
    // it can play through without a hard re-loop. Fall back to the longest
    // available if nothing meets the bar.
    const minDur = totalFilmSeconds * 0.8;
    const fit =
      tracks.find((t) => t.durationSec >= minDur) ??
      tracks.slice().sort((a, b) => b.durationSec - a.durationSec)[0];
    return {
      trackId: fit.id,
      title: fit.title,
      artist: fit.artist,
      streamUrl: fit.streamUrl,
      durationSec: fit.durationSec,
    };
  } catch (err) {
    console.warn(
      `[audio resolve] bgMusic search failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function resolveVoiceover(
  jobId: string,
  v: AudioPlanVoiceover,
): Promise<ResolvedVoiceover | null> {
  const baseline = DELIVERY_SETTINGS[v.deliveryHint];
  // LLM-picked per-scene settings override the deliveryHint baseline. Omitted
  // fields fall through to the baseline (stability/similarityBoost) or to
  // sensible defaults (style=0.15, speakerBoost=true). modelId omitted = the
  // TTS client's default (eleven_multilingual_v2).
  try {
    const mp3 = await generateVoiceover({
      text: v.text,
      voiceId: v.voiceId,
      modelId: v.modelId,
      stability: v.stability ?? baseline.stability,
      similarityBoost: v.similarityBoost ?? baseline.similarityBoost,
      style: v.style ?? 0.15,
      useSpeakerBoost: v.useSpeakerBoost ?? true,
    });
    const mirrored = await uploadSceneAsset({
      jobId,
      sceneId: v.sceneId,
      filename: "voiceover.mp3",
      body: mp3,
      contentType: "audio/mpeg",
    });
    return {
      sceneId: v.sceneId,
      text: v.text,
      delivery: v.deliveryHint,
      voiceId: v.voiceId ?? "",
      storagePath: mirrored.storagePath,
      publicUrl: mirrored.publicUrl,
      startOffsetSeconds: v.startOffsetSeconds ?? 0.3,
    };
  } catch (err) {
    const status = err instanceof ElevenLabsError ? err.status : null;
    console.warn(
      `[audio resolve] voiceover ${v.sceneId} failed${status ? ` (HTTP ${status})` : ""}: ` +
        (err instanceof Error ? err.message : String(err)),
    );
    // Observability: a dropped voiceover used to be invisible (the error
    // throws before any cost telemetry). Emit a dedicated event so 4/8-style
    // drops are catchable in PostHog instead of only by eye. No-ops outside a
    // runJob meter context (scripts/tests have no userId).
    const ctx = getMeterContext();
    if (ctx.userId) {
      try {
        getPostHog().capture({
          distinctId: ctx.userId,
          event: "voiceover_failed",
          properties: {
            job_id: ctx.jobId,
            scene_id: v.sceneId,
            http_status: status,
            message: err instanceof Error ? err.message : String(err),
          },
        });
      } catch (phErr) {
        console.error(
          "[posthog] capture voiceover_failed failed:",
          phErr instanceof Error ? phErr.message : phErr,
        );
      }
    }
    return null;
  }
}

async function resolveSfxCue(c: AudioPlanSfxCue): Promise<ResolvedSfxCue | null> {
  try {
    const results = await searchSfx(c.freesoundQuery, 8);
    if (results.length === 0) {
      console.warn(
        `[audio resolve] sfx ${c.sceneId} "${c.freesoundQuery}" — no Freesound results`,
      );
      return null;
    }
    // Prefer cues whose duration matches the kind: punches stay <2s, impacts
    // up to 4s, transitions up to 3s, ambient anything. Fall back to the top
    // result if nothing in the band matches.
    const inBand = results.filter((r) => {
      if (c.kind === "punch") return r.durationSec > 0 && r.durationSec <= 2;
      if (c.kind === "impact") return r.durationSec > 0 && r.durationSec <= 4;
      if (c.kind === "transition") return r.durationSec > 0 && r.durationSec <= 3;
      return true;
    });
    const pick = inBand[0] ?? results[0];
    return {
      sceneId: c.sceneId,
      momentSeconds: c.momentSeconds,
      kind: c.kind,
      id: pick.id,
      name: pick.name,
      url: pick.previewUrl,
      license: pick.license,
      licenseUrl: pick.licenseUrl,
      volume: SFX_VOLUME[c.kind],
    };
  } catch (err) {
    console.warn(
      `[audio resolve] sfx ${c.sceneId} "${c.freesoundQuery}" failed: ` +
        (err instanceof Error ? err.message : String(err)),
    );
    return null;
  }
}

export async function resolveAudioPlan(args: ResolveAudioArgs): Promise<ResolvedAudio> {
  const { jobId, plan, totalFilmSeconds, tracks, previousPlan, previousResolved } = args;

  // Reuse counters for the [audio resolve] summary log.
  let bgMusicReused = false;
  let voReusedCount = 0;
  let voRegenCount = 0;
  let sfxReusedCount = 0;
  let sfxRegenCount = 0;

  // bgMusic — reuse only when BOTH the previous plan's query AND the
  // previous resolved bundle are present AND the new query matches.
  // Skipped entirely when tracks.music is false (no Jamendo call).
  let bgMusic: ResolvedBgMusic | null = null;
  if (tracks.music && plan.bgMusic) {
    const queryUnchanged =
      previousPlan?.bgMusic?.jamendoQuery === plan.bgMusic.jamendoQuery;
    if (queryUnchanged && previousResolved?.bgMusic) {
      bgMusic = previousResolved.bgMusic;
      bgMusicReused = true;
    } else {
      bgMusic = await resolveBgMusic(plan.bgMusic.jamendoQuery, totalFilmSeconds);
    }
  }

  // voiceovers — reuse per scene when text + deliveryHint match. ElevenLabs
  // is the load-bearing cost so this is the most important reuse path.
  // Skipped entirely when tracks.voiceover is false (no ElevenLabs calls,
  // no Storage writes).
  let voiceovers: ResolvedVoiceover[] = [];
  if (tracks.voiceover) {
    const prevVoBySceneId = new Map(
      (previousResolved?.voiceovers ?? []).map((v) => [v.sceneId, v] as const),
    );
    // Concurrency-capped at ELEVENLABS_VO_CONCURRENCY because ElevenLabs PAYG
    // allows max 6 concurrent requests. Reuse path (cached prevVo) is
    // synchronous and doesn't count against the live-API budget, but we run
    // both branches through the same queue for simplicity.
    const prevPlanVoBySceneId = new Map(
      (previousPlan?.voiceovers ?? []).map((pv) => [pv.sceneId, pv] as const),
    );
    const voiceoverSettled = await runWithConcurrency(
      plan.voiceovers.map((v) => async () => {
        const prevVo = prevVoBySceneId.get(v.sceneId);
        const prevPlanVo = prevPlanVoBySceneId.get(v.sceneId);
        // Reuse the cached MP3 only when every byte-affecting input matches:
        // text + delivery + voice + model + per-scene settings. startOffsetSeconds
        // is NOT in the key — it only affects data-start in the next skeleton,
        // so the cached audio bytes are still valid.
        const reusable =
          prevVo &&
          prevPlanVo &&
          prevVo.text === v.text &&
          prevVo.delivery === v.deliveryHint &&
          prevPlanVo.voiceId === v.voiceId &&
          prevPlanVo.modelId === v.modelId &&
          prevPlanVo.stability === v.stability &&
          prevPlanVo.similarityBoost === v.similarityBoost &&
          prevPlanVo.style === v.style &&
          prevPlanVo.useSpeakerBoost === v.useSpeakerBoost;
        if (reusable) {
          voReusedCount++;
          // Round-trip the new offset onto the reused entry so a timing-only
          // tweak still takes effect in the rebuilt skeleton without burning
          // an ElevenLabs call.
          return { ...prevVo, startOffsetSeconds: v.startOffsetSeconds ?? 0.3 };
        }
        voRegenCount++;
        return resolveVoiceover(jobId, v);
      }),
      ELEVENLABS_VO_CONCURRENCY,
    );
    voiceovers = voiceoverSettled
      .filter(
        (r): r is PromiseFulfilledResult<ResolvedVoiceover | null> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value)
      .filter((v): v is ResolvedVoiceover => v !== null);
  }

  // sfxCues — reuse per (sceneId, freesoundQuery, kind) tuple. The previous
  // resolved bundle doesn't carry freesoundQuery (plan-only field), so we
  // look it up on previousPlan.sfxCues. If a cue's (sceneId, kind) matched
  // a previous cue with the same freesoundQuery, reuse the Freesound URL.
  // Skipped entirely when tracks.sfx is false (no Freesound calls).
  let sfxCues: ResolvedSfxCue[] = [];
  if (tracks.sfx) {
    const prevPlanSfxKey = (c: { sceneId: string; kind: SfxKind; freesoundQuery: string }) =>
      `${c.sceneId}::${c.kind}::${c.freesoundQuery}`;
    const prevResolvedSfxBySceneKind = new Map(
      (previousResolved?.sfxCues ?? []).map(
        (c) => [`${c.sceneId}::${c.kind}`, c] as const,
      ),
    );
    // Map each previous PLAN entry to the resolved cue it produced — only
    // those pairs are eligible for reuse.
    const reusableSfx = new Map<string, ResolvedSfxCue>();
    for (const prevCue of previousPlan?.sfxCues ?? []) {
      const resolved = prevResolvedSfxBySceneKind.get(`${prevCue.sceneId}::${prevCue.kind}`);
      if (resolved) {
        reusableSfx.set(prevPlanSfxKey(prevCue), resolved);
      }
    }
    const sfxResults = await Promise.all(
      plan.sfxCues.map(async (c) => {
        const prevCue = reusableSfx.get(prevPlanSfxKey(c));
        if (prevCue) {
          sfxReusedCount++;
          // Pick up the new momentSeconds in case timing alone changed.
          return { ...prevCue, momentSeconds: c.momentSeconds };
        }
        sfxRegenCount++;
        return resolveSfxCue(c);
      }),
    );
    sfxCues = sfxResults.filter((c): c is ResolvedSfxCue => c !== null);
  }

  if (previousPlan || previousResolved) {
    console.log(
      `[audio resolve] reuse vs regen — bgMusic=${bgMusicReused ? "reuse" : plan.bgMusic ? "regen" : "n/a"} · ` +
        `voiceovers=${voReusedCount} reuse / ${voRegenCount} regen · ` +
        `sfx=${sfxReusedCount} reuse / ${sfxRegenCount} regen`,
    );
  }

  return { bgMusic, voiceovers, sfxCues };
}
