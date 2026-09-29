// A re-claimed edit task whose revision was already saved does not redo the
// edit; a queued job reads as stage "queued" / "Queued"; a finally-failed task
// leaves its job usable and settles credits.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRevisionRow, StudioJobRow } from "./db";
import type { StudioTaskRow } from "./queue";

const h = vi.hoisted(() => ({ revisions: [] as unknown[], html: "" }));

vi.mock("../billing/credits", () => ({
  getOrCreateBilling: vi.fn(async () => ({ plan_tier: "pro" })),
  reconcileJob: vi.fn(async () => {}),
}));
vi.mock("../posthog", () => ({ flushPostHog: vi.fn(async () => {}), getPostHog: () => ({ capture: () => {} }) }));
vi.mock("./anthropic", async (orig) => ({
  ...(await orig<typeof import("./anthropic")>()),
  callOpus: vi.fn(async () => {
    throw new Error("the edit must not be redone");
  }),
}));
vi.mock("../supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["update", "eq", "in"]) chain[m] = vi.fn(() => chain);
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return { getSupabase: () => ({ from: () => chain, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } }) };
});
vi.mock("./db", async (orig) => ({
  ...(await orig<typeof import("./db")>()),
  getStudioJob: vi.fn(async () => job()),
  getRevision: vi.fn(async (_j: string, n: number) => (h.revisions as JobRevisionRow[]).find((r) => r.revision === n) ?? null),
  downloadText: vi.fn(async () => h.html),
  setStage: vi.fn(async () => {}),
  updateRevision: vi.fn(async () => {}),
}));

const { applyChatEdit } = await import("./edit");
const { settleFailedTask } = await import("./queue");
const db = await import("./db");
const credits = await import("../billing/credits");
const anthropic = await import("./anthropic");

function job(over: Partial<StudioJobRow> = {}): StudioJobRow {
  return {
    id: "j1",
    user_id: "u1",
    status: "generating_scenes",
    stage_label: "Designing the motion",
    width: 1920,
    height: 1080,
    fps: 30,
    seed: 1,
    current_revision: 2,
    target_duration: 15,
    studio_plan: { version: 1, input: { sources: [], useBrandKit: false, templateId: null }, plan: null, finalDuration: 15 },
    ...over,
  } as StudioJobRow;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.revisions = [];
});

describe("applyChatEdit resume", () => {
  it("moves to the saved edit revision instead of redoing the edit", async () => {
    h.revisions = [{ revision: 3, kind: "edit", html_path: "jobs/j1/v2/rev-3/index.html" }];
    h.html = "<script>window.__videly = { duration: 20, fps: 30 }</script>";
    const out = await applyChatEdit("j1", "make it 20 s", undefined, "preview_ready", { expectedRevision: 3 });
    expect(out).toBe(3);
    expect(anthropic.callOpus).not.toHaveBeenCalled();
    expect(db.setStage).toHaveBeenCalledWith(
      "j1",
      "preview_ready",
      expect.objectContaining({ current_revision: 3, error: null, studio_plan: expect.objectContaining({ finalDuration: 20 }) }),
    );
    expect(credits.reconcileJob).toHaveBeenCalledWith("j1");
  });

  it("does the edit when that revision number is not an edit yet", async () => {
    h.revisions = [{ revision: 2, kind: "initial", html_path: "p" }];
    h.html = "<html></html>";
    const out = await applyChatEdit("j1", "x", undefined, "done", { expectedRevision: 3 });
    // It tried the model (mocked to fail) → the edit failed and the stage was restored.
    expect(anthropic.callOpus).toHaveBeenCalled();
    expect(out).toBeNull();
    expect(db.setStage).toHaveBeenLastCalledWith("j1", "done", { error: expect.stringContaining("Edit failed") });
  });
});

describe("queued job view", () => {
  it("a job waiting for the worker reports stage queued / Queued", async () => {
    const view = db.toStudioJobView(job({ status: "pending", stage_label: "Queued", progress: 0 } as Partial<StudioJobRow>), []);
    expect(view).toMatchObject({ stage: "queued", stageLabel: "Queued", progress: 0 });
    const noLabel = db.toStudioJobView(job({ status: "pending", stage_label: null, progress: null } as Partial<StudioJobRow>), []);
    expect(noLabel).toMatchObject({ stage: "queued", stageLabel: "Queued", progress: 0 });
  });
});

describe("settleFailedTask", () => {
  const task = (kind: StudioTaskRow["kind"], payload: unknown): StudioTaskRow =>
    ({ id: "t", job_id: "j1", kind, payload, attempts: 3, max_attempts: 3 }) as StudioTaskRow;

  it("a first generation fails the video", async () => {
    await settleFailedTask(task("generate", {}), "boom");
    expect(db.setStage).toHaveBeenCalledWith("j1", "failed", expect.objectContaining({ error: "boom" }));
    expect(credits.reconcileJob).toHaveBeenCalledWith("j1");
  });
  it("an edit restores the previous stage with the error", async () => {
    await settleFailedTask(task("edit", { restoreStage: "done" }), "boom");
    expect(db.setStage).toHaveBeenCalledWith("j1", "done", { error: "Edit failed: boom" });
    expect(credits.reconcileJob).toHaveBeenCalledWith("j1");
  });
  it("a render marks its revision failed and restores the stage", async () => {
    await settleFailedTask(task("render", { restoreStage: "preview_ready", options: { revision: 2 } }), "boom");
    expect(db.updateRevision).toHaveBeenCalledWith("j1", 2, { render_status: "failed", render_error: "boom" });
    expect(db.setStage).toHaveBeenCalledWith("j1", "preview_ready");
    expect(credits.reconcileJob).toHaveBeenCalledWith("j1");
  });
});
