// Studio task worker: claims studio_tasks rows and runs them.
//
//   runWorker({ concurrency, kinds, signal })  the loop (scripts/studio-worker.ts
//                                              in production, or in-process with
//                                              STUDIO_INLINE_WORKER=1)
//   runStudioTask(task)                        dispatch one task to the pipeline
//
// Two lanes: generate / regenerate / edit are network- and LLM-bound, so up to
// `concurrency` (3) run at once; exports (render) drive headless Chrome + x264
// and run one at a time (`renderConcurrency`). Full MP4 renders inside a
// generate also queue behind the process-wide render slot (browser.ts).
//
// Each running task heartbeats every 15 s (studio_tasks.heartbeat_at and
// jobs.updated_at). If the process dies, the heartbeat goes stale and the next
// worker re-claims the task; the pipeline resumes from its checkpoints. A task
// that throws is retried with a backoff until max_attempts, then failed and
// its job settled (settleFailedTask). On abort (SIGTERM) the worker stops
// claiming, lets running tasks finish for up to 60 s, then hands the rest back.

import * as os from "node:os";
import { getStudioJob, IDLE_STAGES, stageOf } from "./db";
import { applyChatEdit } from "./edit";
import { runStudioJob, runStudioRender } from "./generate";
import {
  claimStudioTask,
  completeStudioTask,
  failExhaustedStudioTasks,
  failStudioTask,
  HEARTBEAT_MS,
  heartbeatStudioTask,
  onStudioTaskEnqueued,
  releaseStudioTask,
  retryStudioTask,
  settleFailedTask,
  STALE_SECONDS,
  STUDIO_TASK_KINDS,
  type StudioTaskKind,
  type StudioTaskPayloads,
  type StudioTaskRow,
} from "./queue";
import { writeWorkerStatus, type WorkerStatus } from "./worker-status";

export type { WorkerStatus } from "./worker-status";

const LLM_KINDS: StudioTaskKind[] = ["generate", "regenerate", "edit"];
const RENDER_KINDS: StudioTaskKind[] = ["render"];

export type WorkerDeps = {
  claim: (workerId: string, kinds: StudioTaskKind[], staleSeconds: number) => Promise<StudioTaskRow | null>;
  heartbeat: (taskId: string, workerId: string) => Promise<boolean>;
  run: (task: StudioTaskRow) => Promise<void>;
  complete: (taskId: string, workerId: string) => Promise<unknown>;
  retry: (task: StudioTaskRow, workerId: string, error: string, delayMs: number) => Promise<unknown>;
  /** Mark failed for good and settle the job. */
  fail: (task: StudioTaskRow, workerId: string, error: string) => Promise<unknown>;
  release: (task: StudioTaskRow, workerId: string) => Promise<unknown>;
  /** Fail + settle tasks nobody can claim any more; returns how many. */
  sweep: (staleSeconds: number) => Promise<number>;
  subscribe: (listener: () => void) => () => void;
  writeStatus: (status: WorkerStatus) => void;
  log: (event: string, fields?: Record<string, unknown>) => void;
};


export type RunWorkerOptions = {
  /** Parallel generate / regenerate / edit tasks. Default 3. */
  concurrency?: number;
  /** Parallel render tasks. Default 1 (headless Chrome). */
  renderConcurrency?: number;
  kinds?: StudioTaskKind[];
  signal?: AbortSignal;
  workerId?: string;
  pollMs?: number;
  idlePollMs?: number;
  heartbeatMs?: number;
  staleSeconds?: number;
  shutdownGraceMs?: number;
  sweepEveryMs?: number;
  /** A task still running after this long is failed for good (it would keep the container awake forever). */
  taskTimeoutMs?: number;
  deps?: Partial<WorkerDeps>;
};

export type WorkerResult = { completed: number; failed: number; retried: number; released: string[] };

export function defaultWorkerId(): string {
  return `${os.hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
}

export function retryDelayMs(attempts: number): number {
  return Math.min(5 * 60_000, 30_000 * Math.max(1, attempts));
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), scope: "studio-worker", event, ...fields });
  if (event.endsWith("_failed") || event === "task_error" || event === "task_lost") console.error(line);
  else console.log(line);
}


export const defaultWorkerDeps: WorkerDeps = {
  claim: claimStudioTask,
  heartbeat: heartbeatStudioTask,
  run: runStudioTask,
  complete: completeStudioTask,
  retry: retryStudioTask,
  fail: async (task, workerId, error) => {
    await failStudioTask(task.id, workerId, error);
    await settleFailedTask(task, error);
  },
  release: releaseStudioTask,
  sweep: async (staleSeconds) => {
    const dead = await failExhaustedStudioTasks(staleSeconds);
    for (const t of dead) {
      log("task_exhausted", { task: t.id, job: t.job_id, kind: t.kind, attempts: t.attempts });
      await settleFailedTask(t, "The worker running this video stopped responding. Try again — unused credits were returned.");
    }
    return dead.length;
  },
  subscribe: (listener) => onStudioTaskEnqueued(() => listener()),
  writeStatus: writeWorkerStatus,
  log,
};

// ─── Dispatch ──────────────────────────────────────────────────────────────

/**
 * Run one task. Operations handle their own failures (restore / fail the
 * stage, settle credits); a throw here means infrastructure trouble and is
 * retried. On a re-claim (attempts > 1) an operation that already concluded
 * — the crash came after it wrote its final stage — is not run again.
 */
export async function runStudioTask(task: StudioTaskRow): Promise<void> {
  if (task.attempts > 1) {
    const row = await getStudioJob(task.job_id);
    if (!row) return;
    const stage = stageOf(row);
    const concluded = task.kind === "generate" ? stage === "done" || stage === "failed" : IDLE_STAGES.includes(stage);
    if (concluded) {
      log("task_already_concluded", { task: task.id, job: task.job_id, kind: task.kind, stage });
      return;
    }
  }
  switch (task.kind) {
    case "generate":
      return runStudioJob(task.job_id, { kind: "initial", runId: task.id });
    case "regenerate": {
      const p = task.payload as StudioTaskPayloads["regenerate"];
      return runStudioJob(task.job_id, {
        kind: "regenerate",
        restoreStage: p.restoreStage,
        runId: task.id,
        expectedRevision: p.expectedRevision,
      });
    }
    case "edit": {
      const p = task.payload as StudioTaskPayloads["edit"];
      await applyChatEdit(task.job_id, p.instruction, p.baseRevision ?? undefined, p.restoreStage, {
        expectedRevision: p.expectedRevision,
      });
      return;
    }
    case "render": {
      const p = task.payload as StudioTaskPayloads["render"];
      return runStudioRender(task.job_id, p.options, p.restoreStage);
    }
    default:
      throw new Error(`Unknown studio task kind: ${String(task.kind)}`);
  }
}

// ─── Loop ──────────────────────────────────────────────────────────────────

type Lane = { name: "llm" | "render"; kinds: StudioTaskKind[]; max: number; active: number };
type Running = { task: StudioTaskRow; lane: Lane; startedAt: number; done: Promise<void>; stop: () => void };

export async function runWorker(opts: RunWorkerOptions = {}): Promise<WorkerResult> {
  const deps: WorkerDeps = { ...defaultWorkerDeps, ...opts.deps };
  const workerId = opts.workerId ?? defaultWorkerId();
  const kinds = opts.kinds ?? STUDIO_TASK_KINDS;
  const pollMs = opts.pollMs ?? 2_000;
  const idlePollMs = opts.idlePollMs ?? 5_000;
  const heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS;
  const staleSeconds = opts.staleSeconds ?? STALE_SECONDS;
  const graceMs = opts.shutdownGraceMs ?? 60_000;
  const sweepEveryMs = opts.sweepEveryMs ?? 30_000;
  const taskTimeoutMs = opts.taskTimeoutMs ?? 60 * 60_000;
  const signal = opts.signal;

  const lanes: Lane[] = [
    { name: "llm" as const, kinds: kinds.filter((k) => LLM_KINDS.includes(k)), max: Math.max(1, opts.concurrency ?? 3), active: 0 },
    { name: "render" as const, kinds: kinds.filter((k) => RENDER_KINDS.includes(k)), max: Math.max(1, opts.renderConcurrency ?? 1), active: 0 },
  ].filter((l) => l.kinds.length > 0);

  const result: WorkerResult = { completed: 0, failed: 0, retried: 0, released: [] };
  const running = new Map<string, Running>();
  const startedAt = new Date().toISOString();
  let lastPollAt = startedAt;
  let lastSweep = 0;
  let idleSince = Date.now();
  const lastClaimError = new Map<string, { error: string; at: number }>();

  // Wakeable sleep: a finished task, an in-process enqueue or abort cuts it short.
  let wakeUp: (() => void) | null = null;
  const wake = () => {
    const w = wakeUp;
    wakeUp = null;
    w?.();
  };
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        if (wakeUp === done) wakeUp = null;
        resolve();
      }
      wakeUp = done;
    });
  const unsubscribe = deps.subscribe(wake);
  signal?.addEventListener("abort", wake, { once: true });

  const status = (): WorkerStatus => ({
    workerId,
    pid: process.pid,
    startedAt,
    lastPollAt,
    shuttingDown: !!signal?.aborted,
    running: [...running.values()].map((r) => ({
      id: r.task.id,
      kind: r.task.kind,
      jobId: r.task.job_id,
      attempt: r.task.attempts,
      startedAt: new Date(r.startedAt).toISOString(),
    })),
  });

  const start = (task: StudioTaskRow, lane: Lane) => {
    lane.active++;
    const t0 = Date.now();
    const fields = { task: task.id, job: task.job_id, kind: task.kind, attempt: task.attempts, maxAttempts: task.max_attempts };
    deps.log("task_started", fields);

    let stopped = false;
    const hb = setInterval(() => {
      deps
        .heartbeat(task.id, workerId)
        .then((ok) => {
          if (!ok && !stopped) deps.log("task_lost", { ...fields, reason: "heartbeat rejected (re-claimed or finished elsewhere)" });
        })
        .catch((err) => deps.log("heartbeat_failed", { ...fields, error: errMsg(err) }));
    }, heartbeatMs);
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      stopped = true;
      clearInterval(hb);
      if (timeout) clearTimeout(timeout);
    };

    const timedOut = new Promise<"timeout">((resolve) => {
      timeout = setTimeout(() => resolve("timeout"), taskTimeoutMs);
    });
    const done = (async () => {
      try {
        const outcome = await Promise.race([deps.run(task).then(() => "ok" as const), timedOut]);
        stop();
        if (outcome === "timeout") {
          const error = `Timed out after ${Math.round(taskTimeoutMs / 60_000)} minutes`;
          deps.log("task_error", { ...fields, error, final: true });
          await deps.fail(task, workerId, error);
          result.failed++;
        } else {
          await deps.complete(task.id, workerId);
          result.completed++;
          deps.log("task_done", { ...fields, ms: Date.now() - t0 });
        }
      } catch (err) {
        stop();
        const error = errMsg(err);
        const final = task.attempts >= task.max_attempts;
        deps.log("task_error", { ...fields, error, final, ms: Date.now() - t0 });
        try {
          if (final) {
            await deps.fail(task, workerId, error);
            result.failed++;
          } else {
            await deps.retry(task, workerId, error, retryDelayMs(task.attempts));
            result.retried++;
          }
        } catch (e) {
          deps.log("task_settle_failed", { ...fields, error: errMsg(e) });
        }
      } finally {
        stop();
        lane.active--;
        running.delete(task.id);
        idleSince = Date.now();
        wake();
      }
    })().catch((err) => deps.log("task_settle_failed", { ...fields, error: errMsg(err) }));
    running.set(task.id, { task, lane, startedAt: t0, done, stop });
  };

  deps.log("worker_started", { workerId, lanes: lanes.map((l) => ({ lane: l.name, kinds: l.kinds, max: l.max })) });

  while (!signal?.aborted) {
    lastPollAt = new Date().toISOString();
    for (const lane of lanes) {
      while (lane.active < lane.max && !signal?.aborted) {
        let task: StudioTaskRow | null;
        try {
          task = await deps.claim(workerId, lane.kinds, staleSeconds);
        } catch (err) {
          // The same failure every poll (DB down, migration not applied) is logged once a minute.
          const error = errMsg(err);
          const last = lastClaimError.get(lane.name);
          if (!last || last.error !== error || Date.now() - last.at > 60_000) {
            deps.log("claim_failed", { lane: lane.name, error });
            lastClaimError.set(lane.name, { error, at: Date.now() });
          }
          break;
        }
        if (!task) break;
        start(task, lane);
      }
    }
    if (Date.now() - lastSweep >= sweepEveryMs) {
      lastSweep = Date.now();
      try {
        const n = await deps.sweep(staleSeconds);
        if (n) deps.log("swept_exhausted", { count: n });
      } catch (err) {
        deps.log("sweep_failed", { error: errMsg(err) });
      }
    }
    deps.writeStatus(status());
    if (signal?.aborted) break;
    const idle = running.size === 0 && Date.now() - idleSince > 60_000;
    await sleep(idle ? idlePollMs : pollMs);
  }

  // ─── Graceful shutdown ─────────────────────────────────────────────────
  unsubscribe();
  deps.log("worker_stopping", { running: running.size, graceMs });
  deps.writeStatus(status());
  if (running.size > 0) {
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([...running.values()].map((r) => r.done)),
      new Promise<void>((resolve) => {
        graceTimer = setTimeout(resolve, graceMs);
      }),
    ]);
    clearTimeout(graceTimer);
  }
  for (const r of [...running.values()]) {
    r.stop();
    result.released.push(r.task.id);
    deps.log("task_released", { task: r.task.id, job: r.task.job_id, kind: r.task.kind });
    await deps.release(r.task, workerId).catch((err) => deps.log("release_failed", { task: r.task.id, error: errMsg(err) }));
  }
  deps.log("worker_stopped", { ...result, released: result.released.length });
  return result;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
