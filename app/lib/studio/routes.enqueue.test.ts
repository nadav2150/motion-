// The Studio routes enqueue a studio_tasks row (after the credit reservation
// and job claim) instead of running the operation in the web process, and
// answer exactly as before.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioJobRow } from "./db";

const h = vi.hoisted(() => ({
  row: null as StudioJobRow | null,
  claim: true,
  reserveOk: true,
  enqueueError: null as null | "conflict" | "error",
  inserted: [] as Record<string, unknown>[],
}));

vi.mock("../auth", () => ({
  requireUserApi: vi.fn(async () => ({ user: { id: "user-a" }, headers: new Headers() })),
}));
vi.mock("../billing/credits", () => ({
  getOrCreateBilling: vi.fn(async () => ({ plan_tier: "pro" })),
  reserveCredits: vi.fn(async (_u: string, amount: number) =>
    h.reserveOk ? { ok: true, reservationId: "r" } : { ok: false, required: amount, balance: 1 },
  ),
  reconcileJob: vi.fn(async () => {}),
  adjustBalance: vi.fn(async () => {}),
  attachReservationToJob: vi.fn(async () => {}),
}));
vi.mock("./db", async (orig) => ({
  ...(await orig<typeof import("./db")>()),
  getOwnedStudioJob: vi.fn(async () => h.row),
  getRevision: vi.fn(async (_j: string, n: number) => ({ revision: n, kind: "initial", html_path: "x" })),
  nextRevisionNumber: vi.fn(async () => 3),
  claimJob: vi.fn(async () => h.claim),
  setStage: vi.fn(async () => {}),
  updateRevision: vi.fn(async () => {}),
  insertUserAsset: vi.fn(async () => ({})),
}));
// Nothing may run an operation in the web process any more.
vi.mock("./generate", async (orig) => {
  const actual = await orig<typeof import("./generate")>();
  return {
    ...actual,
    runStudioJob: vi.fn(async () => {
      throw new Error("runStudioJob must not run in the web process");
    }),
    runStudioRender: vi.fn(async () => {
      throw new Error("runStudioRender must not run in the web process");
    }),
  };
});
vi.mock("../supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        h.inserted.push({ table, ...row });
        return {
          select: () => ({
            single: async () => {
              if (table === "studio_tasks") {
                if (h.enqueueError === "conflict") return { data: null, error: { code: "23505", message: "duplicate key" } };
                if (h.enqueueError) return { data: null, error: { code: "XX000", message: "db down" } };
                return { data: { id: "task-1", status: "queued", attempts: 0, max_attempts: 3, ...row }, error: null };
              }
              return { data: { id: "00000000-0000-4000-8000-00000000000a" }, error: null };
            },
          }),
        };
      },
    }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  }),
}));

const tasks = () => h.inserted.filter((r) => r.table === "studio_tasks");
const db = await import("./db");
const credits = await import("../billing/credits");

const params = { id: "00000000-0000-4000-8000-000000000001" };
const post = (body: unknown) =>
  new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
type Handler = (args: { request: Request; params: Record<string, string> }) => Promise<Response>;

function job(over: Partial<StudioJobRow> = {}): StudioJobRow {
  return {
    id: params.id,
    user_id: "user-a",
    generation_mode: "v2",
    status: "scenes_ready",
    stage_label: "Preview ready",
    current_revision: 2,
    target_duration: 15,
    voice_id: null,
    music_enabled: false,
    reference_video_url: null,
    reference_analysis: null,
    studio_plan: { version: 1, input: { sources: [], useBrandKit: false, templateId: null }, plan: null, finalDuration: 15 },
    ...over,
  } as StudioJobRow;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.row = job();
  h.claim = true;
  h.reserveOk = true;
  h.enqueueError = null;
  h.inserted = [];
});

describe("routes enqueue studio tasks", () => {
  it("edit → 202 { revision } and an edit task with the promised revision", async () => {
    const { action } = await import("../../routes/api.jobs.$id.edit");
    const res = await (action as unknown as Handler)({ request: post({ instruction: "Make it blue" }), params });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ revision: 3 });
    expect(tasks()).toEqual([
      {
        table: "studio_tasks",
        job_id: params.id,
        kind: "edit",
        payload: { instruction: "Make it blue", baseRevision: null, restoreStage: "preview_ready", expectedRevision: 3 },
      },
    ]);
    expect(credits.reserveCredits).toHaveBeenCalledTimes(1);
  });

  it("regenerate → 202 { revision } and a regenerate task", async () => {
    h.row = job({ stage_label: "Ready", status: "completed" });
    const { action } = await import("../../routes/api.jobs.$id.regenerate");
    const res = await (action as unknown as Handler)({ request: post({}), params });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ revision: 3 });
    expect(tasks()).toMatchObject([{ kind: "regenerate", job_id: params.id, payload: { restoreStage: "done", expectedRevision: 3 } }]);
  });

  it("render → 202 { revision, renderStatus: queued } and a render task", async () => {
    const { action } = await import("../../routes/api.jobs.$id.render");
    const body = { resolution: "1080p", quality: "high", includeSubtitles: false, includeVoiceover: true, watermark: false };
    const res = await (action as unknown as Handler)({ request: post(body), params });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ revision: 2, renderStatus: "queued" });
    expect(tasks()).toMatchObject([
      { kind: "render", payload: { restoreStage: "preview_ready", options: { revision: 2, resolution: "1080p", quality: "high" } } },
    ]);
  });

  it("402 without credits never enqueues", async () => {
    h.reserveOk = false;
    const { action } = await import("../../routes/api.jobs.$id.edit");
    const res = await (action as unknown as Handler)({ request: post({ instruction: "x" }), params });
    expect(res.status).toBe(402);
    expect(tasks()).toEqual([]);
  });

  it("a live task already on the job → 409, stage restored, reservation settled", async () => {
    h.enqueueError = "conflict";
    const { action } = await import("../../routes/api.jobs.$id.edit");
    const res = await (action as unknown as Handler)({ request: post({ instruction: "x" }), params });
    expect(res.status).toBe(409);
    expect(db.setStage).toHaveBeenCalledWith(params.id, "preview_ready");
    expect(credits.reconcileJob).toHaveBeenCalledWith(params.id);
  });

  it("an enqueue failure on render → 500 and the revision is not left queued", async () => {
    h.enqueueError = "error";
    const { action } = await import("../../routes/api.jobs.$id.render");
    const body = { resolution: "1080p", quality: "standard", includeSubtitles: false, includeVoiceover: true, watermark: false };
    const res = await (action as unknown as Handler)({ request: post(body), params });
    expect(res.status).toBe(500);
    expect(db.updateRevision).toHaveBeenLastCalledWith(params.id, 2, expect.objectContaining({ render_status: "failed" }));
    expect(credits.reconcileJob).toHaveBeenCalledWith(params.id);
  });

  it("POST /api/studio/jobs → 201 { id } with a queued job and a generate task", async () => {
    const { action } = await import("../../routes/api.studio.jobs");
    const res = await (action as unknown as Handler)({ request: post({ prompt: "A launch video", targetDuration: 15 }), params: {} });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "00000000-0000-4000-8000-00000000000a" });
    expect(h.inserted[0]).toMatchObject({ generation_mode: "v2", status: "pending", stage_label: "Queued" });
    expect(tasks()).toEqual([{ table: "studio_tasks", job_id: "00000000-0000-4000-8000-00000000000a", kind: "generate", payload: {} }]);
    expect(credits.reserveCredits).toHaveBeenCalledTimes(1);
  });

  it("POST /api/studio/jobs fails the job and returns credits when the enqueue fails", async () => {
    h.enqueueError = "error";
    const { action } = await import("../../routes/api.studio.jobs");
    const res = await (action as unknown as Handler)({ request: post({ prompt: "A launch video" }), params: {} });
    expect(res.status).toBe(500);
    expect(db.setStage).toHaveBeenCalledWith("00000000-0000-4000-8000-00000000000a", "failed", expect.anything());
    expect(credits.reconcileJob).toHaveBeenCalledWith("00000000-0000-4000-8000-00000000000a");
  });
});
