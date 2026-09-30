// Reaper rules: fail a busy-looking job only when nothing will ever resume it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioJobRow } from "./db";
import type { StudioTaskRow } from "./queue";

const h = vi.hoisted(() => ({
  tasks: [] as unknown[],
  activeRenders: 0,
  failOk: true,
}));

vi.mock("../billing/credits", () => ({ reconcileJob: vi.fn(async () => {}) }));
vi.mock("../supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "update"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve({ count: h.activeRenders, data: [], error: null });
  return { getSupabase: () => ({ from: () => chain }) };
});
vi.mock("./db", async (orig) => ({ ...(await orig<typeof import("./db")>()), setStage: vi.fn(async () => {}) }));
vi.mock("./queue", async (orig) => ({
  ...(await orig<typeof import("./queue")>()),
  liveTasksForJob: vi.fn(async () => h.tasks),
  failStudioTask: vi.fn(async () => h.failOk),
  settleFailedTask: vi.fn(async () => {}),
}));

const { reapDecision, reapInterruptedJob, INTERRUPTED_MESSAGE, NO_TASK_GRACE_MS } = await import("./active");
const db = await import("./db");
const queue = await import("./queue");
const credits = await import("../billing/credits");

const NOW = Date.parse("2026-09-30T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function task(over: Partial<StudioTaskRow> = {}): StudioTaskRow {
  return {
    id: "t1",
    job_id: "j1",
    kind: "generate",
    payload: {} as never,
    status: "running",
    attempts: 1,
    max_attempts: 3,
    run_after: ago(600_000),
    worker_id: "w",
    locked_at: ago(600_000),
    heartbeat_at: ago(5_000),
    last_error: null,
    created_at: ago(600_000),
    updated_at: ago(5_000),
    ...over,
  };
}

describe("reapDecision", () => {
  const base = { stage: "writing" as const, renderingRevision: false, updatedAt: ago(10 * 60_000), now: NOW };

  it("leaves idle jobs alone", () => {
    expect(reapDecision({ ...base, stage: "preview_ready", tasks: [] }).action).toBe("none");
    expect(reapDecision({ ...base, stage: "done", tasks: [] }).action).toBe("none");
  });
  it("fails an active job with no live task", () => {
    expect(reapDecision({ ...base, tasks: [] }).action).toBe("fail_orphan");
    // …also an idle job whose revision is stuck rendering
    expect(reapDecision({ ...base, stage: "done", renderingRevision: true, tasks: [] }).action).toBe("fail_orphan");
  });
  it("gives a just-claimed job time to get its task", () => {
    expect(reapDecision({ ...base, updatedAt: ago(NO_TASK_GRACE_MS - 1000), tasks: [] }).action).toBe("none");
  });
  it("never fails a running or queued task that still has attempts", () => {
    expect(reapDecision({ ...base, tasks: [task()] }).action).toBe("none");
    expect(reapDecision({ ...base, tasks: [task({ heartbeat_at: ago(30 * 60_000) })] }).action).toBe("none"); // stale → worker resumes
    expect(reapDecision({ ...base, tasks: [task({ status: "queued", attempts: 0, heartbeat_at: null })] }).action).toBe("none");
  });
  it("fails a stale task with no attempts left", () => {
    const t = task({ attempts: 3, heartbeat_at: ago(5 * 60_000) });
    expect(reapDecision({ ...base, tasks: [t] })).toEqual({ action: "fail_exhausted", task: t });
  });
  it("does not fail an exhausted task that is still heartbeating", () => {
    expect(reapDecision({ ...base, tasks: [task({ attempts: 3, heartbeat_at: ago(10_000) })] }).action).toBe("none");
  });
});

describe("reapInterruptedJob", () => {
  const row = (over: Partial<StudioJobRow> = {}) =>
    ({ id: "j1", status: "generating_scenes", stage_label: "Designing the motion", updated_at: new Date(Date.now() - 600_000).toISOString(), ...over }) as StudioJobRow;

  beforeEach(() => {
    vi.clearAllMocks();
    h.tasks = [];
    h.activeRenders = 0;
    h.failOk = true;
  });

  it("orphan: marks the job failed with the interrupted message and settles credits", async () => {
    expect(await reapInterruptedJob(row())).toBe(true);
    expect(db.setStage).toHaveBeenCalledWith("j1", "failed", { error: INTERRUPTED_MESSAGE });
    expect(credits.reconcileJob).toHaveBeenCalledWith("j1");
  });

  it("stale but retryable: left for the worker", async () => {
    h.tasks = [task({ heartbeat_at: new Date(Date.now() - 20 * 60_000).toISOString() })];
    expect(await reapInterruptedJob(row())).toBe(false);
    expect(db.setStage).not.toHaveBeenCalled();
    expect(credits.reconcileJob).not.toHaveBeenCalled();
  });

  it("exhausted: fails the task, then settles the job through the task", async () => {
    const t = task({ attempts: 3, heartbeat_at: new Date(Date.now() - 20 * 60_000).toISOString() });
    h.tasks = [t];
    expect(await reapInterruptedJob(row())).toBe(true);
    expect(queue.failStudioTask).toHaveBeenCalledWith("t1", null, expect.any(String));
    expect(queue.settleFailedTask).toHaveBeenCalledWith(t, INTERRUPTED_MESSAGE);
  });

  it("exhausted but a worker won the race to it: nothing happens", async () => {
    h.tasks = [task({ attempts: 3, heartbeat_at: new Date(Date.now() - 20 * 60_000).toISOString() })];
    h.failOk = false;
    expect(await reapInterruptedJob(row())).toBe(false);
    expect(queue.settleFailedTask).not.toHaveBeenCalled();
  });

  it("idle job with no active render: no queries for tasks at all", async () => {
    expect(await reapInterruptedJob(row({ status: "completed", stage_label: "Ready" }))).toBe(false);
    expect(queue.liveTasksForJob).not.toHaveBeenCalled();
  });
});
