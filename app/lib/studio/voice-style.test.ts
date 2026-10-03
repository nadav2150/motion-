import { describe, expect, it } from "vitest";
import { atempoChain, scaleAlignment } from "./audio";
import { voiceDeliveryLines } from "./prompts";
import { parseVoiceSpeed, parseVoiceTone, splitSpeed } from "./voice-style";

describe("voice speed", () => {
  it("accepts only the offered speeds", () => {
    expect(parseVoiceSpeed(1.5)).toBe(1.5);
    expect(parseVoiceSpeed("2")).toBe(2);
    expect(parseVoiceSpeed(1.3)).toBeNull();
    expect(parseVoiceSpeed("fast")).toBeNull();
  });

  it("keeps speeds ElevenLabs supports native and tempo-shifts the rest", () => {
    expect(splitSpeed(1)).toEqual({ native: 1, tempo: 1 });
    expect(splitSpeed(1.1)).toEqual({ native: 1.1, tempo: 1 });
    const s = splitSpeed(2);
    expect(s.native).toBe(1.2);
    expect(s.native * s.tempo).toBeCloseTo(2);
  });

  it("builds atempo chains within ffmpeg's per-stage range", () => {
    expect(atempoChain(1.25)).toBe("atempo=1.2500");
    expect(atempoChain(3)).toBe("atempo=2.0000,atempo=1.5000");
  });

  it("scales alignment times with the tempo change", () => {
    const a = {
      characters: ["h", "i"],
      character_start_times_seconds: [0, 1],
      character_end_times_seconds: [1, 2],
    };
    const out = scaleAlignment(a, 0.5);
    expect(out.character_start_times_seconds).toEqual([0, 0.5]);
    expect(out.character_end_times_seconds).toEqual([0.5, 1]);
    expect(out.characters).toEqual(["h", "i"]);
  });
});

describe("voice tone", () => {
  it("accepts only the offered tones", () => {
    expect(parseVoiceTone("calm")).toBe("calm");
    expect(parseVoiceTone("angry")).toBeNull();
  });

  it("tells the planner about tone and a faster word budget", () => {
    expect(voiceDeliveryLines(1, "natural")).toHaveLength(1);
    const lines = voiceDeliveryLines(1.5, "energetic").join("\n");
    expect(lines).toContain("Energetic");
    expect(lines).toContain("3.6 words/second");
  });
});
