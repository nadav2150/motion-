import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";

import { ensureBucket, STORYBOARDS_BUCKET } from "./storage";
import { getJob } from "./jobs";
import { getSupabase, type JobRow, type ShotRow } from "./supabase";

const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE_BIN = process.env.FFPROBE_PATH || "ffprobe";

const STITCH_BUCKET_LIMIT = 500 * 1024 * 1024;

type TransitionKind =
  | "hard_cut"
  | "match_cut"
  | "whip_pan"
  | "glass_morph"
  | "fade_to_black"
  | "speed_ramp";

type XfadeRecipe = { transition: string; baseDuration: number };

// ffmpeg's chained xfade silently drops frames when a single xfade duration
// is shorter than ~1 frame at the output fps (30 here → ~0.033s). Sub-frame
// durations break the chain — every xfade after the first emits 0 frames and
// the final output collapses to ~the duration of the first clip. The fix:
// floor every xfade at MIN_XFADE_DURATION (3 frames @ 30fps) so the math
// stays sub-perceptible while remaining frame-aligned.
const MIN_XFADE_DURATION = 0.1;

const TRANSITION_MAP: Record<TransitionKind, XfadeRecipe> = {
  hard_cut: { transition: "fade", baseDuration: MIN_XFADE_DURATION },
  match_cut: { transition: "fade", baseDuration: 0.25 },
  whip_pan: { transition: "slideleft", baseDuration: 0.15 },
  glass_morph: { transition: "fadeblack", baseDuration: 0.4 },
  fade_to_black: { transition: "fadeblack", baseDuration: 0.6 },
  speed_ramp: { transition: "fade", baseDuration: 0.25 },
};

function mapTransition(name: string | null | undefined): XfadeRecipe {
  if (!name) return TRANSITION_MAP.hard_cut;
  const k = name as TransitionKind;
  return TRANSITION_MAP[k] ?? TRANSITION_MAP.hard_cut;
}

function aggressivenessMultiplier(continuity: unknown): number {
  const v = (continuity as { motionSystem?: { transitionAggressiveness?: string } } | null)
    ?.motionSystem?.transitionAggressiveness;
  if (v === "low") return 1.4;
  if (v === "high") return 0.7;
  return 1.0;
}

function effectiveDuration(shot: ShotRow, actualClipSeconds: number): number {
  const planned = Number(shot.duration);
  const safePlanned =
    Number.isFinite(planned) && planned > 0 ? planned : actualClipSeconds;
  // Honor the LLM's pacing intent when it's shorter than the actual clip;
  // never exceed what's physically in the file.
  return Math.max(0.5, Math.min(safePlanned, actualClipSeconds));
}

function buildFilterComplex(
  shots: ShotRow[],
  durations: number[],
  continuity: unknown,
): { filter: string; totalDuration: number; shotStarts: number[] } {
  const mult = aggressivenessMultiplier(continuity);

  // Per-clip normalization stage. Trim is clamped to the actual file length
  // so xfade offsets never run past the source.
  const filters: string[] = [];
  shots.forEach((_s, i) => {
    filters.push(
      `[${i}:v]trim=0:${durations[i]!.toFixed(3)},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`,
    );
  });

  const shotStarts: number[] = new Array(shots.length).fill(0);

  if (shots.length === 1) {
    filters.push(`[v0]null[vout]`);
    return { filter: filters.join(";"), totalDuration: durations[0]!, shotStarts };
  }

  let prev = "[v0]";
  let cum = durations[0]!;
  for (let i = 1; i < shots.length; i++) {
    const prevShot = shots[i - 1]!;
    const recipe = mapTransition(prevShot.transition_out);
    const shorter = Math.min(durations[i - 1]!, durations[i]!);
    const safeMax = Math.max(MIN_XFADE_DURATION, shorter * 0.9);
    const d = Math.max(
      MIN_XFADE_DURATION,
      Math.min(recipe.baseDuration * mult, safeMax),
    );
    const offset = Math.max(0, cum - d);
    // Visible start of shot i in the output = moment the xfade into it begins.
    shotStarts[i] = offset;
    const tag = i === shots.length - 1 ? "[vout]" : `[vx${i}]`;
    filters.push(
      `${prev}[v${i}]xfade=transition=${recipe.transition}:duration=${d.toFixed(3)}:offset=${offset.toFixed(3)}${tag}`,
    );
    prev = tag;
    cum = cum - d + durations[i]!;
  }

  return { filter: filters.join(";"), totalDuration: cum, shotStarts };
}

function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      FFPROBE_BIN,
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe exited ${code}: ${stderr.trim()}`));
      }
      const dur = parseFloat(stdout.trim());
      if (!Number.isFinite(dur) || dur <= 0) {
        return reject(new Error(`ffprobe returned non-numeric duration "${stdout.trim()}"`));
      }
      resolve(dur);
    });
  });
}

async function setJobFinal(
  jobId: string,
  patch: Partial<
    Pick<
      JobRow,
      | "final_video_status"
      | "final_video_url"
      | "final_video_storage_path"
      | "final_video_duration"
      | "final_video_error"
      | "final_video_built_at"
    >
  >,
): Promise<void> {
  const { error } = await getSupabase().from("jobs").update(patch).eq("id", jobId);
  if (error) {
    console.error(`setJobFinal(${jobId}) failed:`, error.message);
  }
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`download failed (${res.status}) for ${url}`);
  }
  const out = await fs.open(dest, "w");
  try {
    const stream = Readable.fromWeb(res.body as never);
    await new Promise<void>((resolve, reject) => {
      const ws = out.createWriteStream();
      stream.on("error", reject);
      ws.on("error", reject);
      ws.on("finish", () => resolve());
      stream.pipe(ws);
    });
  } finally {
    await out.close().catch(() => {});
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      const s = chunk.toString();
      stderr += s;
      // Stream progress lines into the server log.
      for (const line of s.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith("frame=") || trimmed.startsWith("size=")) {
          process.stdout.write(`[ffmpeg] ${trimmed}\n`);
        }
      }
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const tail = stderr.split(/\r?\n/).slice(-12).join("\n");
        reject(new Error(`ffmpeg exited with code ${code}\n${tail}`));
      }
    });
  });
}

async function bumpBucketLimitForVideo(): Promise<void> {
  try {
    const { error } = await getSupabase().storage.updateBucket(STORYBOARDS_BUCKET, {
      public: true,
      fileSizeLimit: STITCH_BUCKET_LIMIT,
    });
    if (error) {
      console.warn(`updateBucket warning: ${error.message}`);
    }
  } catch (err) {
    console.warn("updateBucket threw:", err instanceof Error ? err.message : err);
  }
}

type AudioInput = {
  localPath: string;
  delayMs: number;
  volume: number;
  loop: boolean;
  trimSeconds: number | null;
  label: string;
};

type AudioCollectStats = { voiceover: number; music: number; sfx: number };

type SfxCue = { url?: unknown; momentSec?: unknown; volume?: unknown };

async function collectAudioInputs(
  job: JobRow,
  shots: ShotRow[],
  shotStarts: number[],
  totalDuration: number,
  tmpDir: string,
): Promise<{ inputs: AudioInput[]; stats: AudioCollectStats }> {
  const inputs: AudioInput[] = [];
  const stats: AudioCollectStats = { voiceover: 0, music: 0, sfx: 0 };

  // 1. Voiceover per shot.
  if (job.audio_voiceover_enabled === true) {
    for (let i = 0; i < shots.length; i++) {
      const url = shots[i]!.voiceover_url;
      if (!url) continue;
      const local = path.join(tmpDir, `vo-${String(i).padStart(3, "0")}.mp3`);
      try {
        await downloadToFile(url, local);
        inputs.push({
          localPath: local,
          delayMs: Math.max(0, Math.round(shotStarts[i]! * 1000)),
          volume: 0.95,
          loop: false,
          trimSeconds: null,
          label: `vo-${i}`,
        });
        stats.voiceover++;
      } catch (err) {
        console.warn(
          `[stitch] voiceover download failed for shot ${i}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
  const anyVoiceover = stats.voiceover > 0;

  // 2. Background music (job-level, looped to fill totalDuration).
  if (job.audio_music_enabled === true && job.music_url) {
    const local = path.join(tmpDir, "bgm.mp3");
    try {
      await downloadToFile(job.music_url, local);
      inputs.push({
        localPath: local,
        delayMs: 0,
        volume: anyVoiceover ? 0.22 : 0.45,
        loop: true,
        trimSeconds: totalDuration,
        label: "bgm",
      });
      stats.music = 1;
    } catch (err) {
      console.warn(
        `[stitch] background music download failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // 3. SFX cues per shot (each cue is a one-shot at shotStart + momentSec).
  if (job.audio_sfx_enabled === true) {
    for (let i = 0; i < shots.length; i++) {
      const cuesRaw = shots[i]!.sfx_cues;
      const cues: SfxCue[] = Array.isArray(cuesRaw) ? (cuesRaw as SfxCue[]) : [];
      for (let j = 0; j < cues.length; j++) {
        const cue = cues[j];
        const url = typeof cue?.url === "string" ? cue.url : null;
        if (!url) continue;
        const moment = Number(cue?.momentSec);
        const safeMoment = Number.isFinite(moment) && moment >= 0 ? moment : 0;
        const rawVol = Number(cue?.volume);
        const volume = Number.isFinite(rawVol) && rawVol > 0 ? rawVol : 0.55;
        const local = path.join(tmpDir, `sfx-${String(i).padStart(3, "0")}-${j}.mp3`);
        try {
          await downloadToFile(url, local);
          inputs.push({
            localPath: local,
            delayMs: Math.max(0, Math.round((shotStarts[i]! + safeMoment) * 1000)),
            volume,
            loop: false,
            trimSeconds: null,
            label: `sfx-${i}-${j}`,
          });
          stats.sfx++;
        } catch (err) {
          console.warn(
            `[stitch] sfx download failed for shot ${i} cue ${j}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }
  }

  return { inputs, stats };
}

export async function stitchJobFinal(jobId: string): Promise<void> {
  const result = await getJob(jobId);
  if (!result) {
    throw new Error(`stitchJobFinal: job ${jobId} not found`);
  }
  const { job, shots } = result;

  if (shots.length === 0) throw new Error("stitchJobFinal: no shots in job");
  const notReady = shots.filter((s) => s.clip_status !== "ready" || !s.clip_url);
  if (notReady.length > 0) {
    throw new Error(
      `stitchJobFinal: ${notReady.length} of ${shots.length} shots are not ready (clip_status === 'ready' required)`,
    );
  }

  await ensureBucket();
  await bumpBucketLimitForVideo();

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mglass-stitch-"));
  try {
    // 1. Download each clip
    const ordered = [...shots].sort((a, b) => a.shot_index - b.shot_index);
    const localPaths: string[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const s = ordered[i]!;
      const local = path.join(tmp, `${String(i).padStart(3, "0")}.mp4`);
      await downloadToFile(s.clip_url!, local);
      localPaths.push(local);
    }

    // 1b. Probe each clip's actual duration. Kling/Luma return fixed 5s or
    // 10s clips regardless of the LLM's planned shot.duration, so we MUST
    // use the real file length when computing xfade offsets — otherwise
    // ffmpeg's xfade fires past the end of the input and the output
    // truncates / drops frames.
    const actualDurations: number[] = [];
    for (let i = 0; i < ordered.length; i++) {
      let dur: number;
      try {
        dur = await probeDuration(localPaths[i]!);
      } catch (err) {
        console.warn(
          `[stitch ${jobId}] probe failed for shot ${i}; falling back to 5s:`,
          err instanceof Error ? err.message : err,
        );
        dur = 5;
      }
      actualDurations.push(dur);
    }
    const effective = ordered.map((s, i) => effectiveDuration(s, actualDurations[i]!));
    console.log(
      `[stitch ${jobId}] clip durations (real → effective): ${actualDurations
        .map((d, i) => `${d.toFixed(2)}→${effective[i]!.toFixed(2)}`)
        .join(", ")}`,
    );

    // 2. Filter graph
    const { filter: vFilter, totalDuration, shotStarts } = buildFilterComplex(
      ordered,
      effective,
      job.continuity,
    );

    // 2b. Pull every enabled audio source (voiceover per shot, background
    // music, SFX cues) and stage them in the same tmp dir.
    const { inputs: audioInputs, stats: audioStats } = await collectAudioInputs(
      job,
      ordered,
      shotStarts,
      totalDuration,
      tmp,
    );

    const outPath = path.join(tmp, "final.mp4");
    const videoInputCount = ordered.length;

    const args: string[] = ["-y"];
    for (let i = 0; i < videoInputCount; i++) {
      args.push("-i", path.join(tmp, `${String(i).padStart(3, "0")}.mp4`));
    }

    if (audioInputs.length === 0) {
      // Fallback: no enabled audio. Keep historical silent-stereo behavior.
      args.push(
        "-f", "lavfi",
        "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-filter_complex", vFilter,
        "-map", "[vout]",
        "-map", `${videoInputCount}:a`,
      );
    } else {
      // Real audio. Each input is normalized to 48k stereo, optionally trimmed
      // (looped bgm), delayed to its timeline position, then volume-scaled.
      for (const inp of audioInputs) {
        if (inp.loop) {
          args.push("-stream_loop", "-1", "-i", inp.localPath);
        } else {
          args.push("-i", inp.localPath);
        }
      }

      const audioFilters: string[] = [];
      audioInputs.forEach((inp, k) => {
        const inputIdx = videoInputCount + k;
        const parts: string[] = [
          `[${inputIdx}:a]aresample=48000`,
          `aformat=channel_layouts=stereo`,
        ];
        if (inp.trimSeconds != null) {
          parts.push(`atrim=0:${inp.trimSeconds.toFixed(3)}`);
          parts.push(`asetpts=PTS-STARTPTS`);
        }
        if (inp.delayMs > 0) {
          parts.push(`adelay=${inp.delayMs}|${inp.delayMs}`);
        }
        parts.push(`volume=${inp.volume.toFixed(3)}`);
        audioFilters.push(`${parts.join(",")}[a${k}]`);
      });

      const mixLabels = audioInputs.map((_, k) => `[a${k}]`).join("");
      // normalize=0 — amix's default normalizer divides every input by K,
      // which makes a multi-source mix barely audible. Volumes are already
      // balanced per source above.
      audioFilters.push(
        `${mixLabels}amix=inputs=${audioInputs.length}:duration=longest:dropout_transition=0:normalize=0[aout]`,
      );

      const combined = [vFilter, ...audioFilters].join(";");
      args.push(
        "-filter_complex", combined,
        "-map", "[vout]",
        "-map", "[aout]",
      );
    }

    args.push(
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-r", "30",
      "-c:a", "aac",
      "-b:a", "128k",
    );
    if (audioInputs.length === 0) {
      args.push("-shortest");
    } else {
      // Bound output to video duration. Looped bgm produces an infinite stream
      // until atrim cuts it; explicit -t is the safer cap.
      args.push("-t", totalDuration.toFixed(3));
    }
    args.push("-movflags", "+faststart", outPath);

    console.log(
      `[stitch ${jobId}] mixing ${audioInputs.length} audio source${audioInputs.length === 1 ? "" : "s"}: ${audioStats.voiceover} voiceover, ${audioStats.music} music, ${audioStats.sfx} sfx`,
    );
    console.log(
      `[stitch ${jobId}] ffmpeg ${ordered.length} clips → ${outPath} (est ${totalDuration.toFixed(2)}s)`,
    );
    await runFfmpeg(args);

    // 3. Upload
    const buf = await fs.readFile(outPath);
    const storagePath = `jobs/${jobId}/final.mp4`;
    const { error: uploadErr } = await getSupabase()
      .storage.from(STORYBOARDS_BUCKET)
      .upload(storagePath, buf, {
        contentType: "video/mp4",
        upsert: true,
        cacheControl: "31536000",
      });
    if (uploadErr) {
      throw new Error(`upload failed: ${uploadErr.message}`);
    }
    const { data } = getSupabase().storage.from(STORYBOARDS_BUCKET).getPublicUrl(storagePath);

    // 4. Persist
    await setJobFinal(jobId, {
      final_video_status: "ready",
      final_video_url: data.publicUrl,
      final_video_storage_path: storagePath,
      final_video_duration: Number(totalDuration.toFixed(2)),
      final_video_error: null,
      final_video_built_at: new Date().toISOString(),
    });

    console.log(`[stitch ${jobId}] ready · ${data.publicUrl}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`stitchJobFinal(${jobId}) failed:`, message);
    await setJobFinal(jobId, {
      final_video_status: "failed",
      final_video_error: message,
    });
    throw err;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
