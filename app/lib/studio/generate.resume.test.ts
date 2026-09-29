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
  uploadBuffer: vi.fn(async ({ storagePath }: { storagePath: string }) => ({ publicUrl: `https://cdn/${storagePath}`, storagePath })),
  mirrorAssetForJob: vi.fn(async (_j: string, _s: string, slot: string) => ({ publicUrl: `https://cdn/${slot}.png`, storagePath: `p/${slot}.png` })),
}));
vi.mock("../reference-video", async (orig) => ({
  ...(await orig<typeof import("../reference-video")>()),
  analyzeReferenceVideo: vi.fn(async () => h.ref),
}));
vi.mock("./anthropic", async (orig) => ({
  ...(await orig<typeof import("./anthropic")>()),
  remainingBudget: vi.fn(() => 1_000_000),
  callOpus: vi.fn(async ({ label }: { label: string }) => {
    if (label === "plan") return { json: RAW_PLAN, text: "" };
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
  downloadText: vi.fn(async () => DOC),
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
