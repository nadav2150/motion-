// Studio audio: voiceover with real word timings, music pick, SRT captions,
// and the final mix/mux wrapper.
//
//   recordVoiceover()     ElevenLabs /with-timestamps → mp3 + VoLine timings
//   alignmentToVoLines()  character alignment → per-line start/end (pure)
//   remapBeats()          plan beats re-timed onto the recorded voiceover (pure)
//   pickMusicTrack()      Jamendo search by the plan's musicMood
//   buildSrt()            VoLines → SubRip captions (pure)
//   mixAndMux()           writes the SRT and calls muxAudio (workstream A)

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  generateVoiceoverWithTimestamps,
  type TtsAlignment,
} from "../elevenlabs-tts";
import { searchTracks, type JamendoTrack } from "../jamendo-search";
import { roundToFrame } from "./format";
import type { StudioBeat, StudioPlan, VoLine } from "./types";

const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE_BIN = process.env.FFPROBE_PATH || "ffprobe";

// ─── Voiceover ─────────────────────────────────────────────────────────────

/** Lines are read as one take so intonation flows; joined with single spaces. */
export function buildVoiceoverText(lines: string[]): { text: string; offsets: [number, number][] } {
  const offsets: [number, number][] = [];
  let text = "";
  lines.forEach((raw, i) => {
    const line = raw.trim().replace(/\s+/g, " ");
    if (i > 0 && line) text += " ";
    const start = text.length;
    text += line;
    offsets.push([start, text.length]);
  });
  return { text, offsets };
}

/**
 * Map each line's character span to times from the TTS alignment. When the
 * alignment does not match the text we sent (normalization, missing data),
 * fall back to distributing the audio duration proportionally to length.
 */
export function alignmentToVoLines(
  lines: string[],
  alignment: TtsAlignment | null,
  audioDuration: number,
): VoLine[] {
  const { text, offsets } = buildVoiceoverText(lines);
  const aligned =
    alignment &&
    alignment.characters.length === text.length &&
    alignment.character_start_times_seconds.length === text.length &&
    alignment.character_end_times_seconds.length === text.length &&
    alignment.characters.join("") === text;

  if (!aligned) return proportionalLines(lines, offsets, text.length, audioDuration);

  const starts = alignment!.character_start_times_seconds;
  const ends = alignment!.character_end_times_seconds;
  const out: VoLine[] = [];
  lines.forEach((raw, i) => {
    const [a, b] = offsets[i]!;
    let s = a;
    let e = b - 1;
    while (s <= e && /\s/.test(text[s]!)) s++;
    while (e >= s && /\s/.test(text[e]!)) e--;
    if (s > e) return; // empty line
    out.push({ text: raw.trim(), start: round3(starts[s]!), end: round3(ends[e]!) });
  });
  return enforceMonotonic(out);
}

function proportionalLines(
  lines: string[],
  offsets: [number, number][],
  totalChars: number,
  audioDuration: number,
): VoLine[] {
  const out: VoLine[] = [];
  const perChar = totalChars > 0 ? audioDuration / totalChars : 0;
  lines.forEach((raw, i) => {
    const [a, b] = offsets[i]!;
    if (b <= a) return;
    out.push({ text: raw.trim(), start: round3(a * perChar), end: round3(b * perChar) });
  });
  return enforceMonotonic(out);
}

function enforceMonotonic(lines: VoLine[]): VoLine[] {
  let prevEnd = 0;
  return lines.map((l) => {
    const start = Math.max(prevEnd, l.start);
    const end = Math.max(start + 0.05, l.end);
    prevEnd = end;
    return { ...l, start: round3(start), end: round3(end) };
  });
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export type RecordedVoiceover = { audio: Buffer; lines: VoLine[]; duration: number };

export async function recordVoiceover(args: {
  lines: string[];
  voiceId: string;
}): Promise<RecordedVoiceover> {
  const { text } = buildVoiceoverText(args.lines);
  const tts = await generateVoiceoverWithTimestamps({ text, voiceId: args.voiceId });
  const duration = await probeBufferDuration(tts.audio, "mp3").catch(() => {
    const ends = tts.alignment?.character_end_times_seconds ?? [];
    return ends.length ? ends[ends.length - 1]! : 0;
  });
  const lines = alignmentToVoLines(args.lines, tts.alignment ?? tts.normalizedAlignment, duration);
  return { audio: tts.audio, lines, duration };
}

// ─── Re-timing beats onto the recorded voiceover ───────────────────────────

/** Piecewise-linear time map through (planned → actual) anchor pairs. */
export function makeTimeMap(planned: number[], actual: number[]): (t: number) => number {
  const pairs = planned.map((p, i) => [p, actual[i]!] as const).sort((a, b) => a[0] - b[0]);
  // Drop non-monotonic anchors so the map stays increasing.
  const clean: (readonly [number, number])[] = [];
  for (const p of pairs) {
    const last = clean[clean.length - 1];
    if (!last || (p[0] > last[0] && p[1] >= last[1])) clean.push(p);
  }
  return (t: number) => {
    if (clean.length === 0) return t;
    if (t <= clean[0]![0]) return clean[0]![1] + (t - clean[0]![0]);
    for (let i = 1; i < clean.length; i++) {
      const [p0, a0] = clean[i - 1]!;
      const [p1, a1] = clean[i]!;
      if (t <= p1) return a0 + ((t - p0) / (p1 - p0)) * (a1 - a0);
    }
    const [pl, al] = clean[clean.length - 1]!;
    return al + (t - pl);
  };
}

/**
 * Final duration: voiceover end + 1s (the lockup hold), otherwise the plan's
 * duration; clamped to [minimum, cap] and rounded to a frame.
 */
export function computeFinalDuration(args: {
  planDuration: number;
  voiceover: VoLine[];
  cap: number;
  fps: number;
  minimum?: number;
}): number {
  const base = args.voiceover.length
    ? args.voiceover[args.voiceover.length - 1]!.end + 1
    : args.planDuration;
  const clamped = Math.min(args.cap, Math.max(args.minimum ?? 3, base));
  return roundToFrame(clamped, args.fps);
}

/**
 * Re-time the plan onto the recorded voiceover: anchors are every planned
 * line start/end matched to the recorded one, plus 0 and the durations.
 * Beats stay contiguous (each starts where the previous ends).
 */
export function remapBeats(
  beats: StudioBeat[],
  plannedVo: VoLine[],
  actualVo: VoLine[],
  plannedDuration: number,
  finalDuration: number,
): StudioBeat[] {
  const n = Math.min(plannedVo.length, actualVo.length);
  const planned = [0];
  const actual = [0];
  for (let i = 0; i < n; i++) {
    planned.push(plannedVo[i]!.start, plannedVo[i]!.end);
    actual.push(actualVo[i]!.start, actualVo[i]!.end);
  }
  planned.push(plannedDuration);
  actual.push(finalDuration);
  const map = makeTimeMap(planned, actual);
  const sorted = [...beats].sort((a, b) => a.start - b.start);
  const out: StudioBeat[] = [];
  sorted.forEach((b, i) => {
    const start = i === 0 ? 0 : out[i - 1]!.end;
    const rawEnd = i === sorted.length - 1 ? finalDuration : map(b.end);
    const end = Math.min(finalDuration, Math.max(start + 0.2, rawEnd));
    out.push({ ...b, start: round3(start), end: round3(end) });
  });
  return out.filter((b) => b.start < finalDuration);
}

/** Beats scaled to a new duration (no voiceover case). */
export function scaleBeats(beats: StudioBeat[], from: number, to: number): StudioBeat[] {
  if (from <= 0 || Math.abs(from - to) < 0.01) return beats;
  const k = to / from;
  return beats.map((b) => ({ ...b, start: round3(b.start * k), end: round3(Math.min(to, b.end * k)) }));
}

/** Clean up a plan the model returned (ordering, bounds, empty strings). */
export function normalizePlanTimings(plan: StudioPlan, cap: number): StudioPlan {
  const duration = Math.min(cap, Math.max(3, Number(plan.duration) || cap));
  const beats = [...plan.beats]
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end))
    .sort((a, b) => a.start - b.start)
    .map((b) => ({ ...b, start: Math.max(0, b.start), end: Math.min(duration, b.end) }))
    .filter((b) => b.end > b.start);
  const voiceover = [...plan.voiceover]
    .filter((l) => l.text && l.text.trim())
    .sort((a, b) => a.start - b.start);
  return { ...plan, duration, beats, voiceover };
}

// ─── Music ─────────────────────────────────────────────────────────────────

/** Best Jamendo track for the mood: prefer tracks at least as long as the video. */
export async function pickMusicTrack(mood: string, duration: number): Promise<JamendoTrack | null> {
  const queries = [mood, mood.split(/\s+/).slice(0, 2).join(" "), "cinematic corporate"].filter(
    (q, i, arr) => q.trim() && arr.indexOf(q) === i,
  );
  for (const q of queries) {
    let tracks: JamendoTrack[] = [];
    try {
      tracks = await searchTracks(q, 20);
    } catch (err) {
      console.warn(`[studio audio] Jamendo search "${q}" failed:`, err instanceof Error ? err.message : err);
      continue;
    }
    const usable = tracks.filter((t) => t.streamUrl);
    const longEnough = usable.find((t) => t.durationSec >= duration);
    const pick = longEnough ?? usable[0];
    if (pick) return pick;
  }
  return null;
}

export async function downloadAudio(url: string, maxBytes = 40 * 1024 * 1024): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Audio download failed (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new Error("Audio file too large");
  return buf;
}

// ─── Captions ──────────────────────────────────────────────────────────────

function srtTime(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/** Wrap text into ≤ maxChars lines on word boundaries. */
export function wrapCaption(text: string, maxChars = 42): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * SubRip captions from voiceover lines. Each cue shows at most two wrapped
 * rows; longer lines split into several cues with time shared by length.
 */
export function buildSrt(lines: VoLine[], maxChars = 42): string {
  const cues: { start: number; end: number; text: string }[] = [];
  for (const l of lines) {
    const rows = wrapCaption(l.text, maxChars);
    if (rows.length === 0) continue;
    const chunks: string[][] = [];
    for (let i = 0; i < rows.length; i += 2) chunks.push(rows.slice(i, i + 2));
    const total = chunks.reduce((n, c) => n + c.join(" ").length, 0) || 1;
    let t = l.start;
    for (const c of chunks) {
      const share = ((l.end - l.start) * c.join(" ").length) / total;
      cues.push({ start: t, end: t + share, text: c.join("\n") });
      t += share;
    }
  }
  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join("\n");
}

// ─── ffprobe ───────────────────────────────────────────────────────────────

export function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      FFPROBE_BIN,
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${stderr.trim()}`));
      const d = parseFloat(stdout.trim());
      if (!Number.isFinite(d) || d <= 0) return reject(new Error(`ffprobe: bad duration "${stdout.trim()}"`));
      resolve(d);
    });
  });
}

async function probeBufferDuration(buf: Buffer, ext: string): Promise<number> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "videly-probe-"));
  const file = path.join(dir, `audio.${ext}`);
  try {
    await fs.writeFile(file, buf);
    return await probeDuration(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Mux ───────────────────────────────────────────────────────────────────
// The ffmpeg mix/mux lives with the renderer (./mux): music at 0.18,
// sidechain-ducked under the voiceover, 1.5 s fade-out, optional burned-in
// subtitles. Re-exported here for existing callers.
export { buildMuxArgs, muxAudio } from "./mux";
import { muxAudio } from "./mux";

/**
 * Mix voiceover + music under the silent render and (optionally) burn in
 * captions built from the voiceover lines.
 */
export async function mixAndMux(args: {
  videoPath: string;
  outPath: string;
  duration: number;
  voiceoverPath?: string | null;
  musicPath?: string | null;
  subtitles?: VoLine[] | null;
}): Promise<void> {
  let srtPath: string | undefined;
  if (args.subtitles && args.subtitles.length > 0) {
    srtPath = path.join(path.dirname(args.outPath), "captions.srt");
    await fs.writeFile(srtPath, buildSrt(args.subtitles), "utf8");
  }
  if (!args.voiceoverPath && !args.musicPath && !srtPath) {
    await fs.copyFile(args.videoPath, args.outPath);
    return;
  }
  await muxAudio({
    videoPath: args.videoPath,
    voiceoverPath: args.voiceoverPath ?? undefined,
    musicPath: args.musicPath ?? undefined,
    duration: args.duration,
    outPath: args.outPath,
    subtitlesSrtPath: srtPath,
  });
}
