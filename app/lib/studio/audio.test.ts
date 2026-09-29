import { describe, expect, it } from "vitest";
import {
  alignmentToVoLines,
  buildMuxArgs,
  buildSrt,
  buildVoiceoverText,
  computeFinalDuration,
  makeTimeMap,
  remapBeats,
  wrapCaption,
} from "./audio";
import type { TtsAlignment } from "../elevenlabs-tts";

// Build a fake per-character alignment: each char 0.05s, spaces 0.1s.
function fakeAlignment(text: string, lead = 0.2): TtsAlignment {
  const starts: number[] = [];
  const ends: number[] = [];
  let t = lead;
  for (const ch of text) {
    const d = ch === " " ? 0.1 : 0.05;
    starts.push(Number(t.toFixed(3)));
    t += d;
    ends.push(Number(t.toFixed(3)));
  }
  return { characters: [...text], character_start_times_seconds: starts, character_end_times_seconds: ends };
}

describe("buildVoiceoverText", () => {
  it("joins trimmed lines with single spaces and records offsets", () => {
    const { text, offsets } = buildVoiceoverText([" Hello  world ", "Second line"]);
    expect(text).toBe("Hello world Second line");
    expect(offsets).toEqual([
      [0, 11],
      [12, 23],
    ]);
  });
});

describe("alignmentToVoLines", () => {
  it("maps each line to its first/last character times", () => {
    const lines = ["Hi there", "Go"];
    const { text } = buildVoiceoverText(lines);
    const al = fakeAlignment(text);
    const vo = alignmentToVoLines(lines, al, 5);
    expect(vo).toHaveLength(2);
    expect(vo[0]).toEqual({ text: "Hi there", start: 0.2, end: al.character_end_times_seconds[7] });
    expect(vo[1]!.start).toBe(al.character_start_times_seconds[9]);
    expect(vo[1]!.end).toBe(al.character_end_times_seconds[10]);
  });
  it("falls back to proportional timing when the alignment does not match", () => {
    const vo = alignmentToVoLines(["aaaa", "bbbb"], fakeAlignment("different text"), 9);
    // "aaaa bbbb" = 9 chars over 9s → 1s per char
    expect(vo).toEqual([
      { text: "aaaa", start: 0, end: 4 },
      { text: "bbbb", start: 5, end: 9 },
    ]);
  });
  it("handles a null alignment", () => {
    const vo = alignmentToVoLines(["one"], null, 2);
    expect(vo[0]).toEqual({ text: "one", start: 0, end: 2 });
  });
});

describe("timing", () => {
  it("interpolates between anchors", () => {
    const map = makeTimeMap([0, 2, 10], [0, 3, 12]);
    expect(map(1)).toBeCloseTo(1.5);
    expect(map(6)).toBeCloseTo(7.5);
    expect(map(11)).toBeCloseTo(13);
  });
  it("final duration = VO end + 1s, capped, frame-rounded", () => {
    expect(computeFinalDuration({ planDuration: 30, voiceover: [{ text: "a", start: 0, end: 27.51 }], cap: 41, fps: 30 })).toBe(28.5);
    expect(computeFinalDuration({ planDuration: 30, voiceover: [{ text: "a", start: 0, end: 60 }], cap: 41, fps: 30 })).toBe(41);
    expect(computeFinalDuration({ planDuration: 15, voiceover: [], cap: 20, fps: 30 })).toBe(15);
  });
  it("re-times contiguous beats onto the recorded voiceover", () => {
    const beats = [
      { start: 0, end: 4, visual: "a", technique: "t" },
      { start: 4, end: 10, visual: "b", technique: "t" },
      { start: 10, end: 15, visual: "c", technique: "t" },
    ];
    const planned = [
      { text: "one", start: 0.5, end: 4 },
      { text: "two", start: 4, end: 10 },
    ];
    const actual = [
      { text: "one", start: 0.4, end: 5 },
      { text: "two", start: 5.3, end: 12 },
    ];
    const out = remapBeats(beats, planned, actual, 15, 13);
    expect(out[0]!.start).toBe(0);
    expect(out[0]!.end).toBeCloseTo(5, 2);
    expect(out[1]!.start).toBe(out[0]!.end);
    expect(out[1]!.end).toBeCloseTo(12, 2);
    expect(out[2]!.end).toBe(13);
  });
});

describe("captions", () => {
  it("wraps on word boundaries", () => {
    expect(wrapCaption("one two three four five", 9)).toEqual(["one two", "three", "four five"]);
  });
  it("builds SRT cues, splitting long lines", () => {
    const srt = buildSrt(
      [
        { text: "Short line.", start: 0.5, end: 1.75 },
        { text: "This is a much longer voiceover line that will need more than two caption rows to show", start: 2, end: 8 },
      ],
      30,
    );
    expect(srt.startsWith("1\n00:00:00,500 --> 00:00:01,750\nShort line.\n")).toBe(true);
    const cues = srt.trim().split("\n\n");
    expect(cues.length).toBe(3);
    expect(cues[2]).toContain("--> 00:00:08,000");
  });
});

describe("buildMuxArgs", () => {
  it("ducks music under the voiceover and burns subtitles", () => {
    const args = buildMuxArgs({
      videoPath: "/t/v.mp4",
      voiceoverPath: "/t/vo.mp3",
      musicPath: "/t/m.mp3",
      duration: 20,
      outPath: "/t/out.mp4",
      subtitlesSrtPath: "/t/c.srt",
    });
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("volume=0.18");
    expect(fc).toContain("sidechaincompress");
    expect(fc).toContain("afade=t=out:st=18.500:d=1.5");
    expect(fc).toContain("subtitles='/t/c.srt'");
    expect(args).toContain("libx264");
    expect(args.slice(-1)[0]).toBe("/t/out.mp4");
  });
  it("copies video when only music is added", () => {
    const args = buildMuxArgs({ videoPath: "v", musicPath: "m", duration: 10, outPath: "o" });
    expect(args).toContain("copy");
    expect(args).not.toContain("libx264");
  });
});
