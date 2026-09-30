// runStudioJob resume: a re-claimed generate / regenerate task skips every
// checkpoint that is already persisted. Every external call (Opus, Gemini,
// ElevenLabs, Replicate, Jamendo, Supabase, Chrome, ffmpeg) is mocked; the
// assertions are about which of them run.
import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRevisionRow, StudioJobRow, StudioPlanRecord } from "./db";
import type { StudioPlan } from "./types";

const DOC = `<!DOCTYPE html><html><head><script>window.__videly={duration:15,fps:30,width:1920,height:1080}</script></head><body></body></html>`;

const h = vi.hoisted(() => ({
  row: null as unknown as StudioJobRow,
  revisions: [] as JobRevisionRow[],
  files: new Map<string, string>(),
  failLabels: new Set<string>(),
  updates: [] as Record<string, unknown>[],
  ref: {
    summary: "A fast promo",
    totalDurationSeconds: 15,
    aspectRatio: "16:9",
    pacing: "fast",
    editingRhythm: "cuts",
    colorPalette: ["#000000"],
    typography: "bold sans",
    motionStyle: "kinetic",
    cameraMoves: "none",
    transitions: ["cut"],
    audioMood: "upbeat",
    beats: [],
    suggestedScript: "",
    recreationNotes: "",
    model: "gemini",
  },
}));

vi.mock("../billing/credits", () => ({
  getOrCreateBilling: vi.fn(async () => ({ plan_tier: "pro" })),
  reserveCredits: vi.fn(),
  adjustBalance: vi.fn(),
  attachReservationToJob: vi.fn(),
  reconcileJob: vi.fn(async () => {}),
}));
vi.mock("../billing/track-cost", () => ({ recordModelCost: vi.fn(async () => {}) }));
vi.mock("../brand-scrape", () => ({ scrapeBrand: vi.fn(async () => null) }));
vi.mock("../replicate", () => ({
  FLUX_ULTRA: "flux",
  runImage: vi.fn(async () => ({ url: "https://img.example/1.png" })),
}));
vi.mock("../storage", async (orig) => ({
  ...(await orig<typeof import("../storage")>()),
  uploadBuffer: vi.fn(async ({ storagePath, body }: { storagePath: string; body: Buffer }) => {
    h.files.set(storagePath, body.toString("utf8"));
    return { publicUrl: `https://cdn/${storagePath}`, storagePath };
  }),
  mirrorAssetForJob: vi.fn(async (_j: string, _s: string, slot: string) => ({ publicUrl: `https://cdn/${slot}.png`, storagePath: `p/${slot}.png` })),
}));
vi.mock("../reference-video", async (orig) => ({
  ...(await orig<typeof import("../reference-video")>()),
  analyzeReferenceVideo: vi.fn(async () => h.ref),
}));
vi.mock("./reference-frames", async (orig) => ({
  ...(await orig<typeof import("./reference-frames")>()),
  ensureReferenceFrames: vi.fn(async ({ analysis }: { analysis: Record<string, unknown> }) => ({
    ...analysis,
    frameSource: "video",
    frames: [
      { time: 2, url: "https://cdn/f1.jpg", path: "jobs/job1/v2/reference/frame-1.jpg", beatIndex: null },
      { time: 6, url: "https://cdn/f2.jpg", path: "jobs/job1/v2/reference/frame-2.jpg", beatIndex: null },
    ],
  })),
}));
vi.mock("./contact-sheet", () => ({ makeContactSheet: vi.fn(async () => Buffer.from("sheet")) }));
vi.mock("./anthropic", async (orig) => ({
  ...(await orig<typeof import("./anthropic")>()),
  remainingBudget: vi.fn(() => 1_000_000),
  callOpus: vi.fn(async ({ label }: { label: string }) => {
    if (h.failLabels.has(label)) throw new Error(`${label} failed`);
    if (label === "plan") return { json: RAW_PLAN, text: "" };
    if (label === "style") return { json: FOUNDATION, text: "" };
    if (label.startsWith("scene-")) {
      const n = Number(label.split("-")[1]);
      return {
        json: {
          html: `<section class="scene" id="scene-${n}"><p class="s${n}-p">S${n}</p></section>`,
          css: `.s${n}-p{color:red}`,
          js: `tl.to(root.querySelector(".s${n}-p"), { x: 10 }, 0);`,
        },
        text: "",
      };
    }
    if (label === "code") return { text: DOC };
    if (label === "review") return { json: { verdict: "keep", score: 8, issues: [], edits: [] }, text: "" };
    throw new Error(`unexpected callOpus ${label}`);
  }),
}));
vi.mock("./audio", async (orig) => ({
  ...(await orig<typeof import("./audio")>()),
  recordVoiceover: vi.fn(async () => ({ audio: Buffer.from("mp3"), duration: 2, lines: [{ text: "Hi", start: 0.2, end: 1.8 }] })),
  pickMusicTrack: vi.fn(async () => ({ id: "m1", title: "Calm", artist: "A", streamUrl: "https://music/1.mp3" })),
  downloadAudio: vi.fn(async () => Buffer.from("music")),
  mixAndMux: vi.fn(async ({ outPath }: { outPath: string }) => {
    await fs.writeFile(outPath, "mp4");
  }),
}));
vi.mock("./render", () => ({
  captureFrames: vi.fn(async () => ({ frames: [] })),
  renderVideo: vi.fn(async () => {}),
}));
vi.mock("./db", async (orig) => ({
  ...(await orig<typeof import("./db")>()),
  getStudioJob: vi.fn(async () => h.row),
  listRevisions: vi.fn(async () => h.revisions),
  getRevision: vi.fn(async (_j: string, n: number) => h.revisions.find((r) => r.revision === n) ?? null),
  nextRevisionNumber: vi.fn(async () => Math.max(0, ...h.revisions.map((r) => r.revision)) + 1),
  updateJob: vi.fn(async (_j: string, patch: Record<string, unknown>) => {
    h.updates.push(patch);
  }),
  setStage: vi.fn(async () => {}),
  updateRevision: vi.fn(async () => {}),
  downloadText: vi.fn(async (p: string) => (p.endsWith(".json") ? h.files.get(p)! : DOC)),
  downloadBuffer: vi.fn(async () => Buffer.from("x")),
  getBrandKit: vi.fn(async () => null),
  insertUserAsset: vi.fn(async () => ({})),
}));
vi.mock("./edit", async (orig) => ({
  ...(await orig<typeof import("./edit")>()),
  withStudioOperation: vi.fn(async (_row: unknown, fn: () => Promise<unknown>) => fn()),
  repairUntilValid: vi.fn(async (html: string) => ({ html, report: { ok: true, errors: [], warnings: [], frames: [] }, rounds: 0 })),
  validateWith: vi.fn(async () => ({ ok: true, errors: [], warnings: [], frames: [] })),
  saveRevision: vi.fn(async (a: { revision: number; kind: JobRevisionRow["kind"] }) => {
    h.revisions.push(rev(a.revision, a.kind));
  }),
  planWatermark: vi.fn(async () => false),
  capture: vi.fn(),
}));

const FOUNDATION = {
  fontsHead: "",
  css: ":root{--c-bg:#000}",
  helpersJs: "V.one = 1;",
  motionLanguage: "m",
  transitionStyle: "t",
  scenes: [
    { index: 1, summary: "a" },
    { index: 2, summary: "b" },
  ],
  handoffs: [{ after: 1, frame: "cut" }],
};

const RAW_PLAN = {
  title: "Promo",
  concept: "c",
  duration: 15,
  palette: ["#112233"],
  typography: { heading: "Inter", body: "Inter" },
  beats: [{ start: 0, end: 15, visual: "v", technique: "t" }],
  voiceover: [{ text: "Hi", start: 0, end: 2 }],
  musicMood: "calm",
  assetRequests: [{ id: "img1", description: "a desk", kind: "photo" as const }],
  libraries: ["gsap" as const],
};
const PLAN: StudioPlan = { ...RAW_PLAN, beats: RAW_PLAN.beats, libraries: ["gsap"] };

const { runStudioJob, resumeStateFor } = await import("./generate");
const anthropic = await import("./anthropic");
const refVideo = await import("../reference-video");
const audio = await import("./audio");
const replicate = await import("../replicate");
const edit = await import("./edit");
const render = await import("./render");
const db = await import("./db");
const credits = await import("../billing/credits");
const refFrames = await import("./reference-frames");

function baseRecord(over: Partial<StudioPlanRecord> = {}): StudioPlanRecord {
  return { version: 1, input: { sources: [], useBrandKit: false, templateId: null }, plan: null, ...over };
}

function makeRow(over: Partial<StudioJobRow> = {}): StudioJobRow {
  const now = new Date().toISOString();
  return {
    id: "job1",
    user_id: "u1",
    status: "pending",
    generation_mode: "v2",
    script: "",
    prompt: "A promo",
    title: null,
    format: "16:9",
    width: 1920,
    height: 1080,
    fps: 30,
    target_duration: 15,
    language: "en",
    voice_id: "21m00Tcm4TlvDq8ikWAM",
    voiceover_enabled: true,
    music_enabled: true,
    favorite: false,
    deleted_at: null,
    template_id: null,
    seed: 1,
    studio_plan: baseRecord(),
    audio: null,
    current_revision: 0,
    stage_label: "Queued",
    progress: 0,
    error: null,
    reference_video_url: "https://youtu.be/abc",
    reference_analysis: null,
    final_video_url: null,
    created_at: now,
    updated_at: now,
    ...over,
  };
}

function rev(revision: number, kind: JobRevisionRow["kind"]): JobRevisionRow {
  return {
    id: `r${revision}`,
    job_id: "job1",
    revision,
    kind,
    instruction: null,
    html_path: `jobs/job1/v2/rev-${revision}/index.html`,
    thumb_path: null,
    video_path: null,
    video_url: null,
    render_status: "none",
    render_error: null,
    render_options: null,
    credits: null,
    created_at: new Date().toISOString(),
  };
}

const AUDIO = {
  voiceover: { url: "https://cdn/vo.mp3", path: "jobs/job1/v2/audio/vo.mp3", duration: 2, lines: [{ text: "Hi", start: 0.2, end: 1.8 }] },
  music: { url: "https://cdn/m.mp3", path: "jobs/job1/v2/audio/m.mp3", title: "Calm", artist: null },
};
const ASSETS = [{ id: "img1", url: "https://cdn/img1.png", path: "p/img1.png", description: "a desk" }];

const opusLabels = () => vi.mocked(anthropic.callOpus).mock.calls.map((c) => c[0].label);
const savedKinds = () => vi.mocked(edit.saveRevision).mock.calls.map((c) => c[0].kind);
const checkpoints = () =>
  h.updates.map((u) => (u.studio_plan as StudioPlanRecord | undefined)?.run).filter((r): r is NonNullable<typeof r> => !!r);

beforeEach(() => {
  vi.clearAllMocks();
  h.revisions = [];
  h.updates = [];
  h.files = new Map();
  h.failLabels = new Set();
  delete process.env.STUDIO_PARALLEL_SCENES;
  // These tests cover the resume logic including the (optional) review pass.
  process.env.STUDIO_SELF_REVIEW = "1";
});

describe("runStudioJob — self-review off (default)", () => {
  it("ships V1 without a review call", async () => {
    delete process.env.STUDIO_SELF_REVIEW;
    h.row = makeRow();
    await runStudioJob("job1", { runId: "task-1" });
    expect(opusLabels()).toEqual(["plan", "code"]);
    expect(savedKinds()).toEqual(["initial"]);
    expect(render.renderVideo).toHaveBeenCalledTimes(1);
    expect(checkpoints().at(-1)!.finalRevision).toBe(1);
  });
});

describe("runStudioJob — fresh run", () => {
  it("runs every step and writes a checkpoint after each", async () => {
    h.row = makeRow();
    await runStudioJob("job1", { runId: "task-1" });
    expect(refVideo.analyzeReferenceVideo).toHaveBeenCalledTimes(1);
    expect(opusLabels()).toEqual(["plan", "code", "review"]);
    expect(audio.recordVoiceover).toHaveBeenCalledTimes(1);
    expect(replicate.runImage).toHaveBeenCalledTimes(1);
    expect(audio.pickMusicTrack).toHaveBeenCalledTimes(1);
    expect(savedKinds()).toEqual(["initial"]);
    expect(render.renderVideo).toHaveBeenCalledTimes(1);
    const cps = checkpoints();
    expect(cps.every((c) => c.runId === "task-1" && c.kind === "initial")).toBe(true);
    expect(cps.map((c) => [c.planned, c.assetsReady, !!c.draftPath, c.reviewDone])).toEqual([
      [true, false, false, false],
      [true, true, false, false],
      [true, true, true, false],
      [true, true, true, true],
    ]);
    expect(cps.at(-1)!.finalRevision).toBe(1);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });
});

describe("runStudioJob — resume (re-claimed generate task)", () => {
  it("skips a reference analysis that already ran (even one that failed)", async () => {
    h.row = makeRow({ reference_analysis: { error: "Gemini 503" } });
    await runStudioJob("job1", { runId: "task-1" });
    expect(refVideo.analyzeReferenceVideo).not.toHaveBeenCalled();
    expect(opusLabels()[0]).toBe("plan");
  });

  it("skips the plan when studio_plan.plan is saved", async () => {
    h.row = makeRow({ reference_analysis: h.ref, studio_plan: baseRecord({ plan: PLAN }) });
    await runStudioJob("job1", { runId: "task-1" });
    expect(opusLabels()).toEqual(["code", "review"]);
    expect(audio.recordVoiceover).toHaveBeenCalledTimes(1); // assets not saved yet
  });

  it("skips voiceover, images and music when audio + generatedAssets are saved", async () => {
    h.row = makeRow({
      reference_analysis: h.ref,
      audio: AUDIO,
      studio_plan: baseRecord({ plan: PLAN, finalDuration: 15, generatedAssets: ASSETS }),
    });
    await runStudioJob("job1", { runId: "task-1" });
    expect(audio.recordVoiceover).not.toHaveBeenCalled();
    expect(replicate.runImage).not.toHaveBeenCalled();
    expect(audio.pickMusicTrack).not.toHaveBeenCalled();
    expect(opusLabels()).toEqual(["code", "review"]);
    // The code call gets the saved assets.
    const codeCall = vi.mocked(anthropic.callOpus).mock.calls.find((c) => c[0].label === "code")!;
    expect(JSON.stringify(codeCall[0].messages)).toContain("https://cdn/img1.png");
  });

  it("skips the code call when this run saved its draft", async () => {
    h.row = makeRow({
      reference_analysis: h.ref,
      audio: AUDIO,
      studio_plan: baseRecord({
        plan: PLAN,
        finalDuration: 15,
        generatedAssets: ASSETS,
        run: { runId: "task-1", kind: "initial", planned: true, assetsReady: true, draftPath: "jobs/job1/v2/runs/task-1/draft.html" },
      }),
    });
    await runStudioJob("job1", { runId: "task-1" });
    expect(opusLabels()).toEqual(["review"]);
    expect(db.downloadText).toHaveBeenCalledWith("jobs/job1/v2/runs/task-1/draft.html");
    expect(savedKinds()).toEqual(["initial"]);
  });

  it("ignores a draft written by a different run", async () => {
    h.row = makeRow({
      reference_analysis: h.ref,
      audio: AUDIO,
      studio_plan: baseRecord({
        plan: PLAN,
        finalDuration: 15,
        generatedAssets: ASSETS,
        run: { runId: "other-task", kind: "initial", draftPath: "jobs/job1/v2/runs/other-task/draft.html" },
      }),
    });
    await runStudioJob("job1", { runId: "task-1" });
    expect(opusLabels()).toEqual(["code", "review"]);
  });

  it("with the initial revision saved, only the review and render remain", async () => {
    h.row = makeRow({
      reference_analysis: h.ref,
      audio: AUDIO,
      studio_plan: baseRecord({ plan: PLAN, finalDuration: 15, generatedAssets: ASSETS }),
    });
    h.revisions = [rev(1, "initial")];
    await runStudioJob("job1", { runId: "task-1" });
    expect(opusLabels()).toEqual(["review"]);
    expect(edit.repairUntilValid).not.toHaveBeenCalled();
    expect(edit.validateWith).toHaveBeenCalledTimes(1); // frames for the reviewer
    expect(edit.saveRevision).not.toHaveBeenCalled();
    expect(render.renderVideo).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.setStage).mock.calls).toContainEqual(["job1", "preview_ready", { current_revision: 1, error: null }]);
  });

  it("with the reviewed revision saved, goes straight to preview_ready and the render", async () => {
    h.row = makeRow({
      reference_analysis: h.ref,
      audio: AUDIO,
      studio_plan: baseRecord({ plan: PLAN, finalDuration: 15, generatedAssets: ASSETS }),
    });
    h.revisions = [rev(1, "initial"), rev(2, "review")];
    await runStudioJob("job1", { runId: "task-1" });
    expect(anthropic.callOpus).not.toHaveBeenCalled();
    expect(edit.validateWith).not.toHaveBeenCalled();
    expect(edit.saveRevision).not.toHaveBeenCalled();
    expect(vi.mocked(db.setStage).mock.calls).toContainEqual(["job1", "preview_ready", { current_revision: 2, error: null }]);
    expect(render.renderVideo).toHaveBeenCalledTimes(1);
  });

  it("a review that kept the first cut (reviewDone) is not repeated", async () => {
    h.row = makeRow({
      reference_analysis: h.ref,
      audio: AUDIO,
      studio_plan: baseRecord({
        plan: PLAN,
        finalDuration: 15,
        generatedAssets: ASSETS,
        run: { runId: "task-1", kind: "initial", reviewDone: true, finalRevision: 1 },
      }),
    });
    h.revisions = [rev(1, "initial")];
    await runStudioJob("job1", { runId: "task-1" });
    expect(anthropic.callOpus).not.toHaveBeenCalled();
    expect(render.renderVideo).toHaveBeenCalledTimes(1);
  });
});

describe("runStudioJob — regenerate", () => {
  const done = () =>
    makeRow({
      stage_label: "Planning the story",
      status: "directing",
      reference_analysis: h.ref,
      audio: AUDIO,
      current_revision: 2,
      studio_plan: baseRecord({ plan: PLAN, finalDuration: 15, generatedAssets: ASSETS }),
    });

  it("re-plans from scratch even though the job has a plan from the first run", async () => {
    h.row = done();
    h.revisions = [rev(1, "initial"), rev(2, "review")];
    await runStudioJob("job1", { kind: "regenerate", runId: "regen-1", expectedRevision: 3 });
    expect(opusLabels()).toEqual(["plan", "code", "review"]);
    expect(audio.recordVoiceover).toHaveBeenCalledTimes(1);
    expect(savedKinds()).toEqual(["regenerate"]);
    expect(vi.mocked(edit.saveRevision).mock.calls[0]![0].revision).toBe(3);
  });

  it("resumes its own checkpoints", async () => {
    h.row = done();
    h.row.studio_plan!.run = { runId: "regen-1", kind: "regenerate", planned: true, assetsReady: true };
    h.revisions = [rev(1, "initial"), rev(2, "review")];
    await runStudioJob("job1", { kind: "regenerate", runId: "regen-1", expectedRevision: 3 });
    expect(opusLabels()).toEqual(["code", "review"]);
    expect(audio.recordVoiceover).not.toHaveBeenCalled();
  });

  it("skips to the render when its revision is already saved", async () => {
    h.row = done();
    h.revisions = [rev(1, "initial"), rev(2, "review"), rev(3, "regenerate")];
    await runStudioJob("job1", { kind: "regenerate", runId: "regen-1", expectedRevision: 3 });
    expect(anthropic.callOpus).not.toHaveBeenCalled();
    expect(edit.saveRevision).not.toHaveBeenCalled();
    expect(vi.mocked(db.setStage).mock.calls).toContainEqual(["job1", "preview_ready", { current_revision: 3, error: null }]);
  });
});

describe("runStudioJob — reference frames", () => {
  const imagesIn = (label: string) => {
    const call = vi.mocked(anthropic.callOpus).mock.calls.find((c) => c[0].label === label)!;
    const content = call[0].messages[0]!.content;
    return typeof content === "string" ? 0 : content.filter((b) => b.type === "image").length;
  };
  const refUpdates = () => h.updates.filter((u) => "reference_analysis" in u);
  const upload = { kind: "upload" as const, url: "https://cdn/ref.mp4", name: "ref.mp4", storagePath: "uploads/u1/ref.mp4" };

  it("close (default): extracts frames after the analysis and shows them to plan, code and review", async () => {
    h.row = makeRow({ reference_video_url: "https://cdn/ref.mp4", studio_plan: baseRecord({ input: { sources: [upload], useBrandKit: false, templateId: null } }) });
    await runStudioJob("job1", { runId: "task-1" });
    const analyzeOpts = vi.mocked(refVideo.analyzeReferenceVideo).mock.calls[0]![1]!;
    expect(typeof analyzeOpts.onVideoBytes).toBe("function");
    expect(refFrames.ensureReferenceFrames).toHaveBeenCalledTimes(1);
    expect(vi.mocked(refFrames.ensureReferenceFrames).mock.calls[0]![0]).toMatchObject({
      jobId: "job1",
      videoUrl: "https://cdn/ref.mp4",
      storagePath: "uploads/u1/ref.mp4",
    });
    // The analysis is saved, then saved again with its frames (the checkpoint).
    const saved = refUpdates().map((u) => u.reference_analysis as { frames?: unknown[] });
    expect(saved).toHaveLength(2);
    expect(saved[1]!.frames).toHaveLength(2);
    expect(imagesIn("plan")).toBe(2);
    expect(imagesIn("code")).toBe(2);
    // Review: the reference contact sheet (capture is mocked to return no
    // frames of our own, so there is no second sheet).
    expect(imagesIn("review")).toBe(1);
    const review = vi.mocked(anthropic.callOpus).mock.calls.find((c) => c[0].label === "review")!;
    expect(JSON.stringify(review[0].messages)).toContain("REFERENCE MATCH");
    // Each stored still is downloaded once for the whole run.
    expect(vi.mocked(db.downloadBuffer).mock.calls.map((c) => c[0]).filter((p) => p.includes("/reference/"))).toEqual([
      "jobs/job1/v2/reference/frame-1.jpg",
      "jobs/job1/v2/reference/frame-2.jpg",
    ]);
  });

  it("resume: frames already stored are not extracted again", async () => {
    h.row = makeRow({
      reference_analysis: { ...h.ref, frameSource: "video", frames: [{ time: 2, url: "u", path: "p1", beatIndex: null }] },
      studio_plan: baseRecord({ plan: PLAN }),
    });
    await runStudioJob("job1", { runId: "task-1" });
    expect(refVideo.analyzeReferenceVideo).not.toHaveBeenCalled();
    expect(refFrames.ensureReferenceFrames).not.toHaveBeenCalled();
    expect(refUpdates()).toHaveLength(0);
    expect(imagesIn("code")).toBe(1);
  });

  it("resume: an empty frames list (a failed extraction) is not retried", async () => {
    h.row = makeRow({ reference_analysis: { ...h.ref, frames: [], framesError: "ffmpeg missing" } });
    await runStudioJob("job1", { runId: "task-1" });
    expect(refFrames.ensureReferenceFrames).not.toHaveBeenCalled();
    expect(imagesIn("plan")).toBe(0);
  });

  it("resume after the analysis but before the frames: extracts them then", async () => {
    h.row = makeRow({ reference_analysis: h.ref, studio_plan: baseRecord({ plan: PLAN }) });
    await runStudioJob("job1", { runId: "task-1" });
    expect(refVideo.analyzeReferenceVideo).not.toHaveBeenCalled();
    expect(refFrames.ensureReferenceFrames).toHaveBeenCalledTimes(1);
    expect(imagesIn("code")).toBe(2);
  });

  it("inspired: no frames, no images, no reference comparison in the review", async () => {
    h.row = makeRow({
      studio_plan: baseRecord({ input: { sources: [], useBrandKit: false, templateId: null, referenceMode: "inspired" } }),
    });
    await runStudioJob("job1", { runId: "task-1" });
    expect(vi.mocked(refVideo.analyzeReferenceVideo).mock.calls[0]![1]!.onVideoBytes).toBeUndefined();
    expect(refFrames.ensureReferenceFrames).not.toHaveBeenCalled();
    expect(imagesIn("plan")).toBe(0);
    expect(imagesIn("code")).toBe(0);
    const review = vi.mocked(anthropic.callOpus).mock.calls.find((c) => c[0].label === "review")!;
    expect(JSON.stringify(review[0].messages)).not.toContain("REFERENCE MATCH");
  });
});

describe("resumeStateFor", () => {
  it("a fresh first generation has nothing to resume", () => {
    expect(resumeStateFor(makeRow(), "initial", "t", [])).toEqual({
      planned: false,
      assetsReady: false,
      draftPath: null,
      firstRevision: null,
      finalRevision: null,
    });
  });
  it("assets need audio, generatedAssets and finalDuration together", () => {
    const partial = makeRow({ studio_plan: baseRecord({ plan: PLAN, finalDuration: 15 }), audio: AUDIO });
    expect(resumeStateFor(partial, "initial", "t", []).assetsReady).toBe(false);
  });
});

describe("runStudioJob — parallel scenes", () => {
  // Five 3 s beats over 15 s → two scenes (0–6 s, 6–15 s). The single-beat
  // PLAN above always takes the single code call (one scene: nothing to split).
  const MULTI: StudioPlan = {
    ...PLAN,
    beats: [0, 3, 6, 9, 12].map((t) => ({ start: t, end: t + 3, visual: `v${t}`, technique: "t" })),
  };
  const ready = (run?: StudioPlanRecord["run"]) =>
    makeRow({
      reference_analysis: h.ref,
      audio: AUDIO,
      studio_plan: baseRecord({ plan: MULTI, finalDuration: 15, generatedAssets: ASSETS, ...(run ? { run } : {}) }),
    });
  const repairedHtml = () => vi.mocked(edit.repairUntilValid).mock.calls[0]![0];

  beforeEach(() => {
    delete process.env.STUDIO_SELF_REVIEW;
  });

  it("default: foundation + one call per scene, assembled into the draft", async () => {
    h.row = ready();
    await runStudioJob("job1", { runId: "task-1" });
    expect(opusLabels()).toEqual(["style", "scene-1", "scene-2"]);
    const html = repairedHtml();
    expect(html).toContain('id="scene-1"');
    expect(html).toContain('id="scene-2"');
    expect(html).toContain("window.__videly.timeline = tl;");
    const last = checkpoints().at(-1)!;
    expect(last.draftPath).toBe("jobs/job1/v2/runs/task-1/draft.html");
    expect(last.parallel).toMatchObject({
      split: [
        [0, 6],
        [6, 15],
      ],
      stylePath: "jobs/job1/v2/runs/task-1/style.json",
      scenes: { "1": "jobs/job1/v2/runs/task-1/scene-1.json", "2": "jobs/job1/v2/runs/task-1/scene-2.json" },
    });
    expect(savedKinds()).toEqual(["initial"]);
    const reasons = vi.mocked(anthropic.callOpus).mock.calls.map((c) => c[0].reason);
    expect(reasons).toEqual(["opus_studio_style", "opus_studio_scene", "opus_studio_scene"]);
  });

  it("STUDIO_PARALLEL_SCENES=0 keeps the single code call", async () => {
    process.env.STUDIO_PARALLEL_SCENES = "0";
    h.row = ready();
    await runStudioJob("job1", { runId: "task-1" });
    expect(opusLabels()).toEqual(["code"]);
  });

  it("a scene that fails twice falls back to the single code call", async () => {
    h.failLabels = new Set(["scene-2", "scene-2-retry"]);
    h.row = ready();
    await runStudioJob("job1", { runId: "task-1" });
    const labels = opusLabels();
    expect(labels.slice(0, 3)).toEqual(["style", "scene-1", "scene-2"]);
    expect(labels).toContain("scene-2-retry");
    expect(labels.at(-1)).toBe("code");
    expect(repairedHtml()).toBe(DOC);
    expect(savedKinds()).toEqual(["initial"]);
  });

  it("a failed foundation falls back to the single code call", async () => {
    h.failLabels = new Set(["style"]);
    h.row = ready();
    await runStudioJob("job1", { runId: "task-1" });
    expect(opusLabels()).toEqual(["style", "code"]);
    expect(savedKinds()).toEqual(["initial"]);
  });

  it("resume: the saved foundation and finished scenes are not rewritten", async () => {
    h.files.set("jobs/job1/v2/runs/task-1/style.json", JSON.stringify(FOUNDATION));
    h.files.set(
      "jobs/job1/v2/runs/task-1/scene-1.json",
      JSON.stringify({ html: '<section class="scene" id="scene-1"><b>saved</b></section>', css: "", js: "" }),
    );
    h.row = ready({
      runId: "task-1",
      kind: "initial",
      planned: true,
      assetsReady: true,
      parallel: {
        split: [
          [0, 6],
          [6, 15],
        ],
        stylePath: "jobs/job1/v2/runs/task-1/style.json",
        scenes: { "1": "jobs/job1/v2/runs/task-1/scene-1.json" },
      },
    });
    await runStudioJob("job1", { runId: "task-1" });
    expect(opusLabels()).toEqual(["scene-2"]);
    expect(repairedHtml()).toContain("<b>saved</b>");
  });

  it("an old checkpoint without `parallel` still resumes from its draft", async () => {
    h.row = ready({ runId: "task-1", kind: "initial", planned: true, assetsReady: true, draftPath: "jobs/job1/v2/runs/task-1/draft.html" });
    await runStudioJob("job1", { runId: "task-1" });
    expect(anthropic.callOpus).not.toHaveBeenCalled();
    expect(repairedHtml()).toBe(DOC);
  });

  it("regenerate uses the parallel path too", async () => {
    h.row = ready();
    h.row.current_revision = 2;
    h.row.studio_plan!.run = { runId: "regen-1", kind: "regenerate", planned: true, assetsReady: true };
    h.revisions = [rev(1, "initial"), rev(2, "review")];
    await runStudioJob("job1", { kind: "regenerate", runId: "regen-1", expectedRevision: 3 });
    expect(opusLabels()).toEqual(["style", "scene-1", "scene-2"]);
    expect(savedKinds()).toEqual(["regenerate"]);
  });
});
