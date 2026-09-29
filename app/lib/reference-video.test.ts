import { describe, expect, it } from "vitest";
import {
  formatReferenceBrief,
  isYouTubeUrl,
  validateReferenceUrl,
  type ReferenceAnalysis,
} from "./reference-video";

describe("isYouTubeUrl", () => {
  it("recognises youtube hosts", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isYouTubeUrl("https://m.youtube.com/shorts/abc")).toBe(true);
  });
  it("rejects other hosts and garbage", () => {
    expect(isYouTubeUrl("https://vimeo.com/123")).toBe(false);
    expect(isYouTubeUrl("not a url")).toBe(false);
  });
});

describe("validateReferenceUrl", () => {
  it("accepts public http(s) URLs", () => {
    expect(validateReferenceUrl("https://cdn.example.com/clip.mp4")).toBeNull();
    expect(validateReferenceUrl("https://pxynebeabrwfpucmlsce.supabase.co/storage/v1/object/public/storyboards/reference/u/x.mp4")).toBeNull();
  });
  it("rejects non-http, private and loopback targets", () => {
    expect(validateReferenceUrl("ftp://example.com/a.mp4")).not.toBeNull();
    expect(validateReferenceUrl("http://localhost:3000/a.mp4")).not.toBeNull();
    expect(validateReferenceUrl("http://127.0.0.1/a.mp4")).not.toBeNull();
    expect(validateReferenceUrl("http://192.168.1.4/a.mp4")).not.toBeNull();
    expect(validateReferenceUrl("http://10.0.0.1/a.mp4")).not.toBeNull();
    expect(validateReferenceUrl("http://[::1]/a.mp4")).not.toBeNull();
    expect(validateReferenceUrl("nonsense")).not.toBeNull();
  });
});

describe("formatReferenceBrief", () => {
  it("renders palette, beats and notes", () => {
    const a: ReferenceAnalysis = {
      summary: "Fast kinetic-type launch teaser.",
      totalDurationSeconds: 15,
      aspectRatio: "16:9",
      pacing: "0.8s average shot",
      editingRhythm: "cuts on the kick",
      colorPalette: ["#0a0a0a", "#ffda2a"],
      typography: "bold grotesk, all caps",
      motionStyle: "snappy expo-out",
      cameraMoves: "slow push-in",
      transitions: ["hard cut", "mask wipe"],
      audioMood: "128 BPM electro",
      beats: [
        { start: 0, end: 1.5, description: "logo slam", onScreenText: "NEW", motion: "scale 1.4→1", transitionOut: "hard cut" },
      ],
      suggestedScript: "Meet the new thing.",
      recreationNotes: "Keep every beat under a second.",
      model: "gemini-3.5-flash",
    };
    const brief = formatReferenceBrief(a);
    expect(brief).toContain("REFERENCE VIDEO");
    expect(brief).toContain("#0a0a0a, #ffda2a");
    expect(brief).toContain('0.0–1.5s: logo slam | text: "NEW"');
    expect(brief).toContain("hard cut · mask wipe");
    expect(brief).toContain("recreationNotes: Keep every beat under a second.");
  });
});
