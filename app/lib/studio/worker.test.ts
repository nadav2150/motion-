// Worker loop with fake claim / heartbeat / run and fake timers: lane
// concurrency, render serialization, heartbeats, retry vs final failure,
// timeouts and graceful shutdown. No database, no pipeline.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioTaskKind, StudioTaskRow } from "./queue";
import { applyChatEdit } from "./edit";
import { getStudioJob } from "./db";
import { runStudioJob, runStudioRender } from "./generate";
import { retryDelayMs, runStudioTask, runWorker, type WorkerDeps } from "./worker";

vi.mock("./generate", () => ({ runStudioJob: vi.fn(), runStudioRender: vi.fn() }));
vi.mock("./edit", () => ({ applyChatEdit: vi.fn() }));
vi.mock("./db", async (orig) => ({ ...(await orig<typeof import("./db")>()), getStudioJob: vi.fn() }));

let seq = 0;
function task(kind: StudioTaskKind, over: Partial<StudioTaskRow> = {}): StudioTaskRow {
  seq++;
  const now = new Date().toISOString();
  return {
    id: `t${seq}`,
    job_id: `job${seq}`,
    kind,
    payload: {} as never,
    status: "queued",
    attempts: 0,
    max_attempts: 3,
    run_after: now,
    worker_id: null,
    locked_at: null,
    heartbeat_at: null,
    last_error: null,
    created_at: now,
    updated_at: now,
    ...over,
  };
}

type Deferred = { resolve: () => void; reject: (e: unknown) => void; promise: Promise<void> };
function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { resolve, reject, promise };
}

function harness(initial: StudioTaskRow[]) {
  const queue = [...initial];
  const runs = new Map<string, Deferred>();
  const running = new Set<string>();
  let maxRender = 0;
  let maxLlm = 0;
  const events: string[] = [];
  const deps: WorkerDeps = {
    claim: vi.fn(async (_w: string, kinds: StudioTaskKind[]) => {
      const i = queue.findIndex((t) => kinds.includes(t.kind));
      if (i < 0) return null;
      const [t] = queue.splice(i, 1);
      return { ...t!, status: "running" as const, attempts: t!.attempts + 1 };
    }),
    heartbeat: vi.fn(async () => true),
    run: vi.fn(async (t: StudioTaskRow) => {
      const d = deferred();
      runs.set(t.id, d);
      running.add(t.id);
      const count = (k: StudioTaskKind[]) => [...running].filter((id) => k.includes(kindOf(id))).length;
      maxRender = Math.max(maxRender, count(["render"]));
      maxLlm = Math.max(maxLlm, count(["generate", "edit", "regenerate"]));
      try {
        await d.promise;
      } finally {
        running.delete(t.id);
      }
    }),
    complete: vi.fn(async (id: string) => void events.push(`done:${id}`)),
    retry: vi.fn(async (t: StudioTaskRow) => void events.push(`retry:${t.id}`)),
    fail: vi.fn(async (t: StudioTaskRow) => void events.push(`fail:${t.id}`)),
    release: vi.fn(async (t: StudioTaskRow) => void events.push(`release:${t.id}`)),
    sweep: vi.fn(async () => 0),
    subscribe: () => () => {},
    writeStatus: vi.fn(),
    log: vi.fn(),
  };
  const kinds = new Map(initial.map((t) => [t.id, t.kind]));
  const kindOf = (id: string) => kinds.get(id)!;
  return {
    deps,
    queue,
    runs,
    running,
    events,
    stats: () => ({ maxRender, maxLlm }),
    add: (t: StudioTaskRow) => {
      kinds.set(t.id, t.kind);
      queue.push(t);
    },
  };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("runWorker", () => {
  it("runs up to 3 generate/edit tasks at once and claims more as they finish", async () => {
    const tasks = [task("generate"), task("generate"), task("edit"), task("regenerate"), task("generate")];
    const h = harness(tasks);
    const ac = new AbortController();
    const done = runWorker({ deps: h.deps, signal: ac.signal, shutdownGraceMs: 1000 });
    await flush();
    expect(h.running.size).toBe(3);
    expect(h.queue).toHaveLength(2);

    h.runs.get(tasks[0]!.id)!.resolve();
    await flush();
    expect(h.events).toContain(`done:${tasks[0]!.id}`);
    expect(h.running.size).toBe(3); // the next one was claimed right away (wake)
    expect(h.queue).toHaveLength(1);

    for (const d of h.runs.values()) d.resolve();
    await vi.advanceTimersByTimeAsync(2_500);
    for (const d of h.runs.values()) d.resolve();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(h.stats().maxLlm).toBe(3);
    ac.abort();
    const res = await done;
    expect(res.completed).toBe(5);
  });

  it("serializes renders but runs them alongside generate tasks", async () => {
    const tasks = [task("render"), task("render"), task("render"), task("generate")];
    const h = harness(tasks);
    const ac = new AbortController();
    const done = runWorker({ deps: h.deps, signal: ac.signal });
    await flush();
    expect([...h.running].sort()).toEqual([tasks[0]!.id, tasks[3]!.id].sort());

    h.runs.get(tasks[0]!.id)!.resolve();
    await flush();
    expect(h.running.has(tasks[1]!.id)).toBe(true);
    expect(h.running.has(tasks[2]!.id)).toBe(false);
    h.runs.get(tasks[1]!.id)!.resolve();
    await flush();
    h.runs.get(tasks[2]!.id)!.resolve();
    h.runs.get(tasks[3]!.id)!.resolve();
    await flush();
    expect(h.stats().maxRender).toBe(1);
    ac.abort();
    expect((await done).completed).toBe(4);
  });

  it("heartbeats every 15 s while a task runs, and stops after", async () => {
    const t = task("generate");
    const h = harness([t]);
    const ac = new AbortController();
    const done = runWorker({ deps: h.deps, signal: ac.signal, workerId: "w1" });
    await flush();
    expect(h.deps.heartbeat).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(h.deps.heartbeat).toHaveBeenCalledTimes(1);
    expect(h.deps.heartbeat).toHaveBeenCalledWith(t.id, "w1");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.deps.heartbeat).toHaveBeenCalledTimes(3);
    h.runs.get(t.id)!.resolve();
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.deps.heartbeat).toHaveBeenCalledTimes(3);
    ac.abort();
    await done;
  });

  it("retries a failed attempt with backoff, and fails for good on the last one", async () => {
    const first = task("generate", { attempts: 0 }); // claimed → attempt 1 of 3
    const last = task("edit", { attempts: 2 }); // claimed → attempt 3 of 3
    const h = harness([first, last]);
    const ac = new AbortController();
    const done = runWorker({ deps: h.deps, signal: ac.signal });
    await flush();
    h.runs.get(first.id)!.reject(new Error("supabase blip"));
    h.runs.get(last.id)!.reject(new Error("still broken"));
    await flush();
    expect(h.deps.retry).toHaveBeenCalledTimes(1);
    const [retried, , error, delay] = (h.deps.retry as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(retried.id).toBe(first.id);
    expect(error).toBe("supabase blip");
    expect(delay).toBe(retryDelayMs(1));
    expect(h.deps.fail).toHaveBeenCalledTimes(1);
    expect((h.deps.fail as ReturnType<typeof vi.fn>).mock.calls[0]![0].id).toBe(last.id);
    expect(h.deps.complete).not.toHaveBeenCalled();
    ac.abort();
    const res = await done;
    expect(res).toMatchObject({ retried: 1, failed: 1, completed: 0 });
  });

  it("fails a task that runs past the timeout", async () => {
    const t = task("generate");
    const h = harness([t]);
    const ac = new AbortController();
    const done = runWorker({ deps: h.deps, signal: ac.signal, taskTimeoutMs: 10 * 60_000 });
    await flush();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(h.deps.fail).toHaveBeenCalledTimes(1);
    const calls = (h.deps.heartbeat as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect((h.deps.heartbeat as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    ac.abort();
    await done;
  });

  it("on shutdown stops claiming and waits for running tasks to finish", async () => {
    const a = task("generate");
    const b = task("generate");
    const h = harness([a]);
    const ac = new AbortController();
    const done = runWorker({ deps: h.deps, signal: ac.signal });
    await flush();
    ac.abort();
    h.add(b);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.running.has(b.id)).toBe(false);
    let finished = false;
    void done.then(() => (finished = true));
    await flush();
    expect(finished).toBe(false);
    h.runs.get(a.id)!.resolve();
    const res = await done;
    expect(res).toMatchObject({ completed: 1, released: [] });
    expect(h.deps.release).not.toHaveBeenCalled();
    expect(h.queue).toEqual([b]);
  });

  it("hands unfinished tasks back after the 60 s grace period", async () => {
    const a = task("render");
    const h = harness([a]);
    const ac = new AbortController();
    const done = runWorker({ deps: h.deps, signal: ac.signal });
    await flush();
    ac.abort();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(h.deps.release).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_500);
    const res = await done;
    expect(res.released).toEqual([a.id]);
    expect(h.deps.release).toHaveBeenCalledTimes(1);
    // No heartbeats after the release (the next worker owns it now).
    const calls = (h.deps.heartbeat as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect((h.deps.heartbeat as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });

  it("keeps polling when a claim fails", async () => {
    const h = harness([]);
    let n = 0;
    h.deps.claim = vi.fn(async () => {
      n++;
      if (n <= 2) throw new Error("db down");
      return null;
    });
    const ac = new AbortController();
    const done = runWorker({ deps: h.deps, signal: ac.signal, kinds: ["generate"], pollMs: 1000 });
    await vi.advanceTimersByTimeAsync(3_500);
    expect(n).toBeGreaterThanOrEqual(3);
    ac.abort();
    await done;
  });

  it("sweeps exhausted tasks periodically", async () => {
    const h = harness([]);
    const ac = new AbortController();
    const done = runWorker({ deps: h.deps, signal: ac.signal, sweepEveryMs: 30_000 });
    await flush();
    expect(h.deps.sweep).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(h.deps.sweep).toHaveBeenCalledTimes(2);
    ac.abort();
    await done;
  });
});

describe("runStudioTask", () => {
  beforeEach(() => {
    vi.mocked(runStudioJob).mockReset();
    vi.mocked(runStudioRender).mockReset();
    vi.mocked(applyChatEdit).mockReset();
    vi.mocked(getStudioJob).mockReset();
  });

  it("dispatches each kind with the task id as the resume key", async () => {
    await runStudioTask(task("generate", { id: "g1", job_id: "j1", attempts: 1 }));
    expect(runStudioJob).toHaveBeenCalledWith("j1", { kind: "initial", runId: "g1" });

    await runStudioTask(
      task("regenerate", { id: "r1", job_id: "j2", attempts: 1, payload: { restoreStage: "done", expectedRevision: 4 } as never }),
    );
    expect(runStudioJob).toHaveBeenLastCalledWith("j2", { kind: "regenerate", restoreStage: "done", runId: "r1", expectedRevision: 4 });

    await runStudioTask(
      task("edit", {
        job_id: "j3",
        attempts: 1,
        payload: { instruction: "bigger", baseRevision: null, restoreStage: "preview_ready", expectedRevision: 3 } as never,
      }),
    );
    expect(applyChatEdit).toHaveBeenCalledWith("j3", "bigger", undefined, "preview_ready", { expectedRevision: 3 });

    const options = { revision: 2, resolution: "1080p", quality: "high", includeSubtitles: false, includeVoiceover: true, watermark: false };
    await runStudioTask(task("render", { job_id: "j4", attempts: 1, payload: { options, restoreStage: "done" } as never }));
    expect(runStudioRender).toHaveBeenCalledWith("j4", options, "done");
    expect(getStudioJob).not.toHaveBeenCalled(); // first attempts never look
  });

  it("does not re-run an operation that concluded before the crash", async () => {
    vi.mocked(getStudioJob).mockResolvedValue({ stage_label: "Preview ready", status: "scenes_ready" } as never);
    await runStudioTask(task("edit", { attempts: 2, payload: { instruction: "x", baseRevision: null, restoreStage: "preview_ready", expectedRevision: 2 } as never }));
    expect(applyChatEdit).not.toHaveBeenCalled();

    // A first generation at preview_ready still has its render to do.
    await runStudioTask(task("generate", { attempts: 2 }));
    expect(runStudioJob).toHaveBeenCalledTimes(1);

    vi.mocked(getStudioJob).mockResolvedValue({ stage_label: "Failed", status: "failed" } as never);
    await runStudioTask(task("generate", { attempts: 2 }));
    expect(runStudioJob).toHaveBeenCalledTimes(1);

    vi.mocked(getStudioJob).mockResolvedValue({ stage_label: "Designing the motion", status: "generating_scenes" } as never);
    await runStudioTask(task("regenerate", { attempts: 3, payload: { restoreStage: "done", expectedRevision: 2 } as never }));
    expect(runStudioJob).toHaveBeenCalledTimes(2);
  });
});
