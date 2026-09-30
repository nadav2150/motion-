// Final audio mix for Studio videos: voiceover + background music (quiet,
// sidechain-ducked under the voiceover, 1.5 s fade-out) muxed onto the silent
// render, with optional burned-in subtitles.

import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";

export const MUSIC_VOLUME = 0.18;
export const FADE_OUT_SECONDS = 1.5;

export type MuxAudioInput = {
  videoPath: string; // silent MP4 from renderVideo
  voiceoverPath?: string | null;
  musicPath?: string | null; // looped if shorter than the video
  duration: number; // seconds; output is trimmed/padded to this
  outPath: string;
  subtitlesSrtPath?: string | null; // burned in (re-encodes the video)
  crf?: number; // only used when subtitles force a re-encode (default 18)
};

export type MuxAudioResult = { outPath: string; hasAudio: boolean; reencoded: boolean };

// Escape a path for use inside a single-quoted filtergraph option value.
function filterPath(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function buildMuxArgs(input: MuxAudioInput): { args: string[]; hasAudio: boolean; reencoded: boolean } {
  const d = Math.max(0.1, input.duration);
  const fadeStart = Math.max(0, d - FADE_OUT_SECONDS).toFixed(3);
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error", "-i", input.videoPath];
  let next = 1;
  let voIdx = -1;
  let musicIdx = -1;
  if (input.voiceoverPath) {
    args.push("-i", input.voiceoverPath);
    voIdx = next++;
  }
  if (input.musicPath) {
    args.push("-stream_loop", "-1", "-i", input.musicPath);
    musicIdx = next++;
  }

  const graph: string[] = [];
  const norm = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
  if (voIdx >= 0) graph.push(`[${voIdx}:a]${norm},apad,atrim=0:${d},asetpts=PTS-STARTPTS[vo]`);
  if (musicIdx >= 0) graph.push(`[${musicIdx}:a]${norm},volume=${MUSIC_VOLUME},atrim=0:${d},asetpts=PTS-STARTPTS[mus]`);
  const fade = `afade=t=out:st=${fadeStart}:d=${FADE_OUT_SECONDS}`;
  if (voIdx >= 0 && musicIdx >= 0) {
    graph.push(
      "[vo]asplit=2[vo1][vosc]",
      "[mus][vosc]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[duck]",
      `[vo1][duck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,${fade}[aout]`,
    );
  } else if (voIdx >= 0) {
    graph.push(`[vo]${fade}[aout]`);
  } else if (musicIdx >= 0) {
    graph.push(`[mus]${fade}[aout]`);
  }
  const hasAudio = voIdx >= 0 || musicIdx >= 0;

  const reencoded = !!input.subtitlesSrtPath;
  if (reencoded) {
    const style = "FontName=Inter,FontSize=15,PrimaryColour=&H00FFFFFF,OutlineColour=&H99000000,BorderStyle=1,Outline=1.6,Shadow=0,MarginV=22,Alignment=2";
    graph.push(`[0:v]subtitles=filename='${filterPath(input.subtitlesSrtPath!)}':force_style='${style}'[vout]`);
  }

  if (graph.length) args.push("-filter_complex", graph.join(";"));
  args.push("-map", reencoded ? "[vout]" : "0:v:0");
  if (hasAudio) args.push("-map", "[aout]");
  if (reencoded) {
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", String(input.crf ?? 18), "-pix_fmt", "yuv420p");
  } else {
    args.push("-c:v", "copy");
  }
  if (hasAudio) args.push("-c:a", "aac", "-b:a", "192k", "-ar", "48000");
  args.push("-t", d.toFixed(3), "-movflags", "+faststart", input.outPath);
  return { args, hasAudio, reencoded };
}

export async function muxAudio(input: MuxAudioInput): Promise<MuxAudioResult> {
  await mkdir(path.dirname(path.resolve(input.outPath)), { recursive: true });
  const { args, hasAudio, reencoded } = buildMuxArgs(input);
  if (!hasAudio && !reencoded) {
    if (path.resolve(input.videoPath) !== path.resolve(input.outPath)) await copyFile(input.videoPath, input.outPath);
    return { outPath: input.outPath, hasAudio, reencoded };
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d: string) => {
      stderr = (stderr + d).slice(-4000);
    });
    child.on("error", (e) => reject(new Error(`ffmpeg failed to start: ${e.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg mux exited with ${code}: ${stderr.trim().slice(-800)}`))));
  });
  return { outPath: input.outPath, hasAudio, reencoded };
}
