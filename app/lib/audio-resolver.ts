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

import { generateVoiceover } from "./elevenlabs-tts";
import { searchSfx, type FreesoundLicense } from "./freesound-search";
import {
  type AudioPlan,
  type AudioPlanSfxCue,
  type AudioPlanVoiceover,
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

// ElevenLabs PAYG caps at 6 concurrent requests per API key — exceeding the
// cap returns 429 concurrent_limit_exceeded and drops the voiceover. Cap
// our parallelism at 5 by default (one slot of headroom). Tune via env if
// you're on a higher tier.
const ELEVENLABS_VO_CONCURRENCY = Math.max(
  1,
  Number(process.env.ELEVENLABS_VO_CONCURRENCY ?? 5),
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
  const settings = DELIVERY_SETTINGS[v.deliveryHint];
  try {
    const mp3 = await generateVoiceover({
      text: v.text,
      voiceId: v.voiceId,
      stability: settings.stability,
      similarityBoost: settings.similarityBoost,
    });
    const mirrored = await uploadSceneAsset({
      jobId,
      sceneId: v.sceneId,
      filename: "voiceover.mp3",
      body: mp3,
      contentType: "audio/mpeg",
    });
    // voiceId is resolved by the TTS client when omitted; we round-trip
    // the explicit value when the LLM supplied one, otherwise empty so the
    // editor surfaces "default" rather than a stale id.
    return {
      sceneId: v.sceneId,
      text: v.text,
      delivery: v.deliveryHint,
      voiceId: v.voiceId ?? "",
      storagePath: mirrored.storagePath,
      publicUrl: mirrored.publicUrl,
    };
  } catch (err) {
    console.warn(
      `[audio resolve] voiceover ${v.sceneId} failed: ` +
        (err instanceof Error ? err.message : String(err)),
    );
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
  const { jobId, plan, totalFilmSeconds, previousPlan, previousResolved } = args;

  // Reuse counters for the [audio resolve] summary log.
  let bgMusicReused = false;
  let voReusedCount = 0;
  let voRegenCount = 0;
  let sfxReusedCount = 0;
  let sfxRegenCount = 0;

  // bgMusic — reuse only when BOTH the previous plan's query AND the
  // previous resolved bundle are present AND the new query matches.
  let bgMusic: ResolvedBgMusic | null = null;
  if (plan.bgMusic) {
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
  const prevVoBySceneId = new Map(
    (previousResolved?.voiceovers ?? []).map((v) => [v.sceneId, v] as const),
  );
  // Concurrency-capped at ELEVENLABS_VO_CONCURRENCY because ElevenLabs PAYG
  // allows max 6 concurrent requests. Reuse path (cached prevVo) is
  // synchronous and doesn't count against the live-API budget, but we run
  // both branches through the same queue for simplicity.
  const voiceoverSettled = await runWithConcurrency(
    plan.voiceovers.map((v) => async () => {
      const prevVo = prevVoBySceneId.get(v.sceneId);
      if (prevVo && prevVo.text === v.text && prevVo.delivery === v.deliveryHint) {
        voReusedCount++;
        return prevVo;
      }
      voRegenCount++;
      return resolveVoiceover(jobId, v);
    }),
    ELEVENLABS_VO_CONCURRENCY,
  );
  const voiceovers = voiceoverSettled
    .filter(
      (r): r is PromiseFulfilledResult<ResolvedVoiceover | null> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((v): v is ResolvedVoiceover => v !== null);

  // sfxCues — reuse per (sceneId, freesoundQuery, kind) tuple. The previous
  // resolved bundle doesn't carry freesoundQuery (plan-only field), so we
  // look it up on previousPlan.sfxCues. If a cue's (sceneId, kind) matched
  // a previous cue with the same freesoundQuery, reuse the Freesound URL.
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
  const sfxCues = sfxResults.filter((c): c is ResolvedSfxCue => c !== null);

  if (previousPlan || previousResolved) {
    console.log(
      `[audio resolve] reuse vs regen — bgMusic=${bgMusicReused ? "reuse" : plan.bgMusic ? "regen" : "n/a"} · ` +
        `voiceovers=${voReusedCount} reuse / ${voRegenCount} regen · ` +
        `sfx=${sfxReusedCount} reuse / ${sfxRegenCount} regen`,
    );
  }

  return { bgMusic, voiceovers, sfxCues };
}
