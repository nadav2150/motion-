import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  buildReviewReference,
  normalizePlan,
  parseCreateStudioJobInput,
  StudioInputError,
  timelineTimes,
  type InputPolicy,
} from "./generate";
import { listTemplates, STUDIO_TEMPLATES, TEMPLATE_CATEGORIES } from "./templates";

const HOST = "abc.supabase.co";
const paid: InputPolicy = { planMaxDuration: 60, maxPromptChars: null, audioAllowed: true, storageHost: HOST };
const free: InputPolicy = { planMaxDuration: 15, maxPromptChars: 700, audioAllowed: false, storageHost: HOST };
const img = `https://${HOST}/storage/v1/object/public/storyboards/assets/u/a.png`;

describe("parseCreateStudioJobInput", () => {
  it("normalizes a full body", () => {
    const input = parseCreateStudioJobInput(
      {
        prompt: "  A promo  ",
        format: "9:16",
        targetDuration: 30,
        language: "he",
        voiceId: "EXAVITQu4vr4xnSDxMaL",
        musicEnabled: true,
        sources: [
          { kind: "youtube", url: "https://youtu.be/abc" },
          { kind: "image", url: img, name: "Product" },
          { kind: "website", url: "https://acme.com" },
        ],
        useBrandKit: false,
        templateId: "product-promo",
      },
      paid,
    );
    expect(input).toMatchObject({ prompt: "A promo", format: "9:16", targetDuration: 30, language: "he", useBrandKit: false });
    expect(input.sources).toHaveLength(3);
  });
  it("clamps duration and strips audio on the free plan", () => {
    const input = parseCreateStudioJobInput(
      { prompt: "x", format: "16:9", targetDuration: 60, voiceId: "EXAVITQu4vr4xnSDxMaL", musicEnabled: true },
      free,
    );
    expect(input.targetDuration).toBe(15);
    expect(input.voiceId).toBeNull();
    expect(input.musicEnabled).toBe(false);
  });
  it("rejects bad input", () => {
    const bad = (body: unknown, policy = paid) => expect(() => parseCreateStudioJobInput(body, policy)).toThrow(StudioInputError);
    bad(null);
    bad({ prompt: "x", format: "4:3" });
    bad({ prompt: "x", targetDuration: 20 });
    bad({ prompt: "x", language: "english!" });
    bad({ prompt: "x", voiceId: "not a voice" });
    bad({ prompt: "x".repeat(701) }, free);
    bad({ prompt: "" });
    bad({ prompt: "x", sources: [{ kind: "video_url", url: "http://127.0.0.1/a.mp4" }] });
    bad({ prompt: "x", sources: [{ kind: "image", url: "https://evil.com/a.png" }] });
    bad({ prompt: "x", sources: [{ kind: "upload", url: "https://evil.com/a.mp4" }] });
    bad({ prompt: "x", sources: [{ kind: "youtube", url: "https://vimeo.com/1" }] });
    bad({
      prompt: "x",
      sources: [
        { kind: "youtube", url: "https://youtu.be/a" },
        { kind: "video_url", url: "https://cdn.example.com/b.mp4" },
      ],
    });
    bad({ prompt: "x", templateId: "nope" });
  });
  it("allows an empty prompt when a source or template is attached", () => {
    expect(parseCreateStudioJobInput({ prompt: "", templateId: "logo-reveal" }, paid).templateId).toBe("logo-reveal");
  });
  it("referenceMode: close by default with a video reference, absent without one", () => {
    const yt = { kind: "youtube", url: "https://youtu.be/mtPqxJBMXCQ" };
    expect(parseCreateStudioJobInput({ prompt: "x", sources: [yt] }, paid).referenceMode).toBe("close");
    expect(parseCreateStudioJobInput({ prompt: "x", sources: [yt], referenceMode: "inspired" }, paid).referenceMode).toBe("inspired");
    expect(parseCreateStudioJobInput({ prompt: "x", sources: [yt], referenceMode: "close" }, paid).referenceMode).toBe("close");
    expect(parseCreateStudioJobInput({ prompt: "x", referenceMode: "inspired" }, paid)).not.toHaveProperty("referenceMode");
    expect(() => parseCreateStudioJobInput({ prompt: "x", sources: [yt], referenceMode: "exact" }, paid)).toThrow(StudioInputError);
  });
});

describe("buildReviewReference", () => {
  const still = (w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 120, b: 200 } } }).jpeg().toBuffer();
  it("contact sheets for the reference stills and the video's own frames", async () => {
    const s = await still(1280, 720);
    const ref = await buildReviewReference(
      null,
      [0, 1, 2].map((i) => ({ time: i * 2, beatIndex: i, thumbnail: false, jpeg: s })),
      [{ time: 1, jpeg: s }, { time: 3, jpeg: s }],
    );
    expect(ref!.thumbnail).toBe(false);
    const sheet = await sharp(Buffer.from(ref!.sheetBase64, "base64")).metadata();
    expect(sheet.format).toBe("jpeg");
    expect(sheet.width).toBeGreaterThan(3 * 400); // 3 tiles across
    expect(ref!.candidateSheetBase64).toBeTruthy();
  });
  it("a YouTube thumbnail is sent as-is (resized), and nothing without stills", async () => {
    const ref = await buildReviewReference(null, [{ time: 0, beatIndex: null, thumbnail: true, jpeg: await still(1280, 720) }], []);
    expect(ref!.thumbnail).toBe(true);
    expect((await sharp(Buffer.from(ref!.sheetBase64, "base64")).metadata()).width).toBe(1024);
    expect(ref!.candidateSheetBase64).toBeNull();
    expect(await buildReviewReference(null, [], [])).toBeNull();
  });
});

describe("normalizePlan", () => {
  it("cleans the model's plan", () => {
    const plan = normalizePlan(
      {
        title: "  Big Launch ",
        concept: "c",
        duration: 99,
        palette: ["#AABBCC", "red", "#000000"],
        typography: { heading: "", body: "Inter" },
        beats: [
          { start: 5, end: 12, visual: "b", technique: "t", onScreenText: "" },
          { start: 0, end: 5, visual: "a", technique: "t", onScreenText: "Hi" },
        ],
        voiceover: [{ text: "Hello", start: 0.5, end: 2 }],
        musicMood: "",
        assetRequests: Array.from({ length: 6 }, (_, i) => ({ id: `img ${i}!`, description: "d", kind: "photo" as const })),
        libraries: ["three", "bogus" as never],
      },
      { cap: 20, voiceover: false, music: true },
    );
    expect(plan.title).toBe("Big Launch");
    expect(plan.duration).toBe(20);
    expect(plan.palette).toEqual(["#aabbcc", "#000000"]);
    expect(plan.typography.heading).toBe("Inter");
    expect(plan.beats.map((b) => b.visual)).toEqual(["a", "b"]);
    expect(plan.beats[0]!.onScreenText).toBe("Hi");
    expect(plan.beats[1]!.onScreenText).toBeUndefined();
    expect(plan.voiceover).toEqual([]);
    expect(plan.musicMood).toBeNull();
    expect(plan.assetRequests).toHaveLength(4);
    expect(plan.assetRequests[0]!.id).toBe("img0");
    expect(plan.libraries).toEqual(["gsap", "three"]);
  });
});

describe("templates", () => {
  it("has ≥12 templates covering every category and the landing six", () => {
    expect(STUDIO_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    for (const c of TEMPLATE_CATEGORIES) expect(listTemplates(c.id).length).toBeGreaterThan(0);
    const names = STUDIO_TEMPLATES.map((t) => t.name);
    for (const n of ["Product Promo", "App Showcase", "Brand Story", "Social Media Ad", "Event Teaser", "Minimal Product"]) {
      expect(names).toContain(n);
    }
    expect(new Set(STUDIO_TEMPLATES.map((t) => t.id)).size).toBe(STUDIO_TEMPLATES.length);
  });
});

describe("timelineTimes", () => {
  it("spreads frames across the video, frame-aligned", () => {
    expect(timelineTimes(12, 4)).toEqual([1.5, 4.5, 7.5, 10.5]);
  });
});
