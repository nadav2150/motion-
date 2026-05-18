import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSceneAssetArray } from "../utils";
import type { JobRow, ShotRow } from "../types";

export type SceneTiming = {
  startSeconds: number;
  durationSeconds: number;
  totalSeconds: number;
};

/**
 * Editor-wide timing model. There is ONE source of truth — `time` (seconds on
 * the assembled film). Everything else (preview video, music, sfx, voice-over,
 * iframe scenes, timeline UI) is derived or slaved to it:
 *
 *   - `time` is advanced by a single rAF loop using performance.now() deltas.
 *     No setInterval, no per-scene timers, no media-driven clocks.
 *   - `currentShot` and `localSceneTime` are derived from `time`.
 *   - `<audio>` / `<video>` elements are kept in sync by effects that set
 *     `currentTime` whenever drift exceeds a tolerance (0.1s default).
 *   - Iframe scenes (HtmlScenePane) receive `time` via postMessage and never
 *     run their own GSAP clock — they pause GSAP and seek per tick.
 */
const SYNC_TOLERANCE = 0.1; // seconds — re-seek media if drift exceeds this

// Default bg music mix when no per-scene override applies. Mirrors the
// constants in buildFilmSkeleton: 0.22 when voiceovers exist anywhere on
// the film, 0.4 otherwise. Per-scene overrides win when present.
const DEFAULT_BG_VOLUME_WITH_VO = 0.22;
const DEFAULT_BG_VOLUME_NO_VO = 0.4;

function extractBgVolumeOverrides(
  job: JobRow | null,
): Map<string, number> {
  const map = new Map<string, number>();
  const ad = job?.audio_direction as
    | { plan?: { bgMusicVolumeOverrides?: unknown } }
    | null
    | undefined;
  const raw = ad?.plan?.bgMusicVolumeOverrides;
  if (!Array.isArray(raw)) return map;
  for (const o of raw as Array<Record<string, unknown>>) {
    if (typeof o.sceneId === "string" && typeof o.volume === "number") {
      map.set(o.sceneId, Math.max(0, Math.min(1, o.volume)));
    }
  }
  return map;
}

export function usePlayback({
  shots,
  job,
}: {
  shots: ShotRow[];
  job?: JobRow | null;
}) {
  const [time, setTimeRaw] = useState(0);
  const [playing, setPlaying] = useState(false);

  const totalDuration = useMemo(
    () => shots.reduce((acc, s) => acc + Number(s.duration || 0), 0),
    [shots],
  );

  // Cumulative scene start times. Ordered list is `shots` already sorted by
  // shot_index in the loader.
  const sceneTimings = useMemo(() => {
    let cumulative = 0;
    const map = new Map<string, SceneTiming>();
    for (const s of shots) {
      map.set(s.id, {
        startSeconds: cumulative,
        durationSeconds: s.duration,
        totalSeconds: 0, // patched below
      });
      cumulative += s.duration;
    }
    for (const entry of map.values()) entry.totalSeconds = cumulative;
    return map;
  }, [shots]);

  // ── Master clock ──────────────────────────────────────────────────────────
  // rAF loop. `playing` toggles whether dt is accumulated into `time`. Wraps
  // at totalDuration. Using performance.now() deltas means the clock survives
  // tab throttling / variable frame rate without drift accumulating in our
  // own state — at worst, a long pause produces one big jump (clamped by
  // wrapping logic).
  const playingRef = useRef(playing);
  const totalRef = useRef(totalDuration);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    totalRef.current = totalDuration;
  }, [totalDuration]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (playingRef.current && totalRef.current > 0) {
        setTimeRaw((t) => {
          const next = t + dt;
          if (next >= totalRef.current) return 0;
          return next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Seek helper that clamps and exposes a stable identity. Treat as the
  // canonical entry point for any scrub (timeline click, hotkey, etc.).
  const setTime = useCallback(
    (next: number | ((prev: number) => number)) => {
      setTimeRaw((prev) => {
        const raw = typeof next === "function" ? next(prev) : next;
        const total = totalRef.current;
        if (total <= 0) return 0;
        if (raw < 0) return 0;
        if (raw >= total) return Math.max(0, total - 0.001);
        return raw;
      });
    },
    [],
  );

  // Approximate display frame counter at 30fps. Stable derivation so the
  // debug overlay can show a frame index without owning state.
  const currentFrame = Math.floor(time * 30);

  // ── Active scene + local time ─────────────────────────────────────────────
  const currentShot = useMemo(() => {
    if (shots.length === 0) return null;
    let acc = 0;
    for (const s of shots) {
      const d = Number(s.duration) || 0;
      if (time < acc + d) return s;
      acc += d;
    }
    return shots[shots.length - 1] ?? null;
  }, [shots, time]);

  const activeSceneTiming = currentShot ? sceneTimings.get(currentShot.id) ?? null : null;
  const localSceneTime = activeSceneTiming ? time - activeSceneTiming.startSeconds : 0;

  // ── Per-asset URL extraction for the active scene ─────────────────────────
  const activeAssets = useMemo(() => {
    if (!currentShot) return { music: null as string | null, sfx: null as string | null, voiceover: null as string | null };
    const list = isSceneAssetArray(currentShot.assets) ? currentShot.assets : [];
    return {
      music: list.find((a) => a.kind === "music")?.url ?? null,
      sfx: list.find((a) => a.kind === "sfx")?.url ?? null,
      voiceover: list.find((a) => a.kind === "voiceover")?.url ?? null,
    };
  }, [currentShot]);

  const activeMusicUrl = activeAssets.music;
  const activeSfxUrl = activeAssets.sfx;
  const activeVoiceoverUrl = activeAssets.voiceover;

  // ── Audio element refs ────────────────────────────────────────────────────
  // Three independent <audio> elements — one per logical track. The editor.tsx
  // mounts each ref to a hidden <audio>. We never trust audio.currentTime as
  // a source of truth; we drive it from global `time` and SYNC_TOLERANCE.
  const audioRef = useRef<HTMLAudioElement | null>(null); // music
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const voRef = useRef<HTMLAudioElement | null>(null);

  // Sprint 3 — per-scene bg music volume. Look up the override for the
  // active scene; if none, use the default (lower when voiceovers exist on
  // the film, higher when not). Memoized so the effect below only fires
  // when the active scene's override actually changes.
  const overrides = useMemo(() => extractBgVolumeOverrides(job ?? null), [job]);
  const filmHasVoiceovers = useMemo(
    () => shots.some((s) => !!s.voiceover_url),
    [shots],
  );
  const defaultBgVolume = filmHasVoiceovers
    ? DEFAULT_BG_VOLUME_WITH_VO
    : DEFAULT_BG_VOLUME_NO_VO;
  const activeSceneId = currentShot
    ? `s${currentShot.shot_index + 1}`
    : null;
  const activeBgVolume =
    activeSceneId && overrides.has(activeSceneId)
      ? overrides.get(activeSceneId)!
      : defaultBgVolume;

  // Helper that runs every render so each audio element stays slaved. For
  // music we treat the URL as a continuous track spanning the whole film, so
  // audio.currentTime === global time. For sfx / vo we treat the asset as
  // scene-relative — it plays from scene local time.
  useEffect(() => {
    syncMediaElement(audioRef.current, activeMusicUrl, time, playing, "music");
  }, [activeMusicUrl, time, playing]);

  // Apply per-scene bg volume separately from the sync effect so changing
  // scene doesn't force a re-seek of the music element.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (Math.abs(el.volume - activeBgVolume) > 0.01) {
      el.volume = activeBgVolume;
    }
  }, [activeBgVolume]);

  useEffect(() => {
    const sceneRelative = activeSceneTiming
      ? clampNonNegative(time - activeSceneTiming.startSeconds)
      : 0;
    const within =
      activeSceneTiming != null &&
      sceneRelative >= 0 &&
      sceneRelative < activeSceneTiming.durationSeconds;
    syncMediaElement(
      sfxRef.current,
      within ? activeSfxUrl : null,
      sceneRelative,
      playing && within,
      "sfx",
    );
  }, [activeSfxUrl, activeSceneTiming, time, playing]);

  useEffect(() => {
    const sceneRelative = activeSceneTiming
      ? clampNonNegative(time - activeSceneTiming.startSeconds)
      : 0;
    const within =
      activeSceneTiming != null &&
      sceneRelative >= 0 &&
      sceneRelative < activeSceneTiming.durationSeconds;
    syncMediaElement(
      voRef.current,
      within ? activeVoiceoverUrl : null,
      sceneRelative,
      playing && within,
      "voiceover",
    );
  }, [activeVoiceoverUrl, activeSceneTiming, time, playing]);

  // ── Scene navigation ──────────────────────────────────────────────────────
  const goPrevScene = useCallback(() => {
    if (shots.length === 0) return;
    let acc = 0;
    const starts: number[] = [];
    for (const s of shots) {
      starts.push(acc);
      acc += Number(s.duration) || 0;
    }
    let target = 0;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] < time - 0.2) target = starts[i];
      else break;
    }
    setTime(target);
  }, [shots, time, setTime]);

  const goNextScene = useCallback(() => {
    if (shots.length === 0) return;
    let acc = 0;
    for (const s of shots) {
      acc += Number(s.duration) || 0;
      if (acc > time + 0.05) {
        setTime(Math.min(acc, Math.max(0, totalDuration - 0.01)));
        return;
      }
    }
  }, [shots, time, totalDuration, setTime]);

  return {
    time,
    currentFrame,
    setTime,
    playing,
    setPlaying,
    totalDuration,
    sceneTimings,
    currentShot,
    activeSceneTiming,
    localSceneTime,
    activeMusicUrl,
    activeSfxUrl,
    activeVoiceoverUrl,
    audioRef,
    sfxRef,
    voRef,
    goPrevScene,
    goNextScene,
  };
}

// Sets src/play/pause/currentTime on a hidden <audio> element to match the
// global clock. Idempotent — only mutates when it actually has to (avoids
// jitter from re-seeking every rAF tick). One helper for music / sfx / vo so
// the three effects stay symmetric.
function syncMediaElement(
  el: HTMLAudioElement | null,
  url: string | null,
  targetTime: number,
  shouldPlay: boolean,
  tag: string,
) {
  if (!el) return;
  if (!url) {
    if (!el.paused) el.pause();
    if (el.src) {
      try {
        el.removeAttribute("src");
        el.load();
      } catch {}
    }
    return;
  }
  if (el.src !== url) {
    el.src = url;
    el.load();
  }
  if (Math.abs(el.currentTime - targetTime) > SYNC_TOLERANCE) {
    try {
      el.currentTime = targetTime;
    } catch {}
  }
  if (shouldPlay) {
    if (el.paused) {
      const p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch((err) =>
          console.warn(
            `[${tag}] play() rejected (likely autoplay policy):`,
            err instanceof Error ? err.message : err,
          ),
        );
      }
    }
  } else if (!el.paused) {
    el.pause();
  }
}

function clampNonNegative(n: number) {
  return n < 0 ? 0 : n;
}
